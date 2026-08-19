// POST /api/stripe/webhook — Stripe Connect-style event delivery.
//
// Shaped exactly like app/api/docusign/connect/route.ts and
// app/api/training/webhook/route.ts: read the RAW body via request.text()
// BEFORE any JSON parsing (Stripe's signature is computed over the exact
// bytes it sent — parsing first and re-serializing would not reproduce them),
// verify the signature, and only then look at the payload. There is no
// Supabase session behind a webhook delivery, so every database write below
// goes through the ADMIN/service-role client, which bypasses RLS entirely —
// the same posture the training webhook takes for the same reason.
//
// Idempotency: Stripe retries a webhook delivery until it gets a 2xx, so the
// same event can (and will, eventually) arrive twice. Before applying an
// event this handler reads the target client_invoice_payments row back and
// compares its stored stripe_event_id — if it already matches this event's
// id, the delivery is a redelivery of one already applied, and the handler
// acknowledges it without writing anything a second time.

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStripeWebhookSignature } from "@/lib/stripe/client";
import { buildDataAuditEvent, recordAuditEvent } from "@/lib/audit/events";

export const runtime = "nodejs";

// client_invoice_payments and company_clients.stripe_customer_id come from
// supabase/migrations/20260819100000_stripe_payments.sql and are not yet in
// lib/supabase/types.ts, which is regenerated from the live project after a
// migration is applied there. Untyped admin handle, same LooseClient pattern
// lib/proposals/docusign.ts uses for the same reason (see that file's own
// comment) — not a hand-edit of the generated types file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

async function handleCheckoutSessionCompleted(admin: LooseClient | null, event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (!admin) return;

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

  // Matched on whichever id we have. The row was created by
  // app/api/stripe/checkout carrying the checkout session id, so that is the
  // reliable match key; the payment intent id is saved onto the row here for
  // the payment_intent.payment_failed handler (which only ever sees the
  // payment intent, not the session) to match against later.
  const { data: payment } = await admin
    .from("client_invoice_payments")
    .select("id, invoice_id, status, stripe_event_id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (!payment) {
    console.error("stripe webhook: checkout.session.completed for an unknown session", session.id);
    return;
  }

  // Idempotent redelivery: this exact event already moved this row.
  if (payment.stripe_event_id === event.id) return;
  // Already settled by an earlier delivery of a different (but equivalent)
  // event — do not re-run the invoice flip below.
  if (payment.status === "succeeded") return;

  const { error: paymentUpdateError } = await admin
    .from("client_invoice_payments")
    .update({
      status: "succeeded",
      succeeded_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      payment_method_type:
        Array.isArray(session.payment_method_types) && session.payment_method_types.length > 0
          ? session.payment_method_types[0]
          : null,
      stripe_event_id: event.id,
    })
    .eq("id", payment.id);

  if (paymentUpdateError) {
    console.error("stripe webhook: could not mark payment succeeded", paymentUpdateError.message);
    return;
  }

  // Only flip the invoice when it is not already paid — a compare-and-set the
  // same shape deleteInvoice uses, so two deliveries racing (or a human
  // settling it by hand in between) cannot both "win" the transition.
  const { data: updatedInvoice, error: invoiceUpdateError } = await admin
    .from("client_invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      // paid_by stays null: client_invoices.paid_by references auth.users and
      // has no "system" sentinel row to point at, and the CHECK constraint on
      // this table only requires paid_at (not paid_by) when status = 'paid'.
      // The Stripe event id in client_invoice_payments.stripe_event_id is the
      // durable record of what actually authorised this — the audit event
      // below points a reader at it.
    })
    .eq("id", payment.invoice_id)
    .neq("status", "paid")
    .select("id, invoice_number, client_id, total, currency")
    .maybeSingle();

  if (invoiceUpdateError) {
    console.error("stripe webhook: could not mark invoice paid", invoiceUpdateError.message);
    return;
  }

  // updatedInvoice is null when the invoice was already 'paid' (the .neq
  // filter matched zero rows) — nothing further to record.
  if (!updatedInvoice) return;

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "client_invoice",
      updatedInvoice.id,
      null,
      `Stripe confirmed payment of ${Number(updatedInvoice.total).toFixed(2)} ${(updatedInvoice.currency ?? "usd").toUpperCase()} ` +
        `for invoice ${updatedInvoice.invoice_number ?? updatedInvoice.id} (Stripe event ${event.id}); marked paid.`,
      { status: "issued" },
      { status: "paid", stripe_event_id: event.id, stripe_checkout_session_id: session.id, client_id: updatedInvoice.client_id },
    ),
    event_category: "billing",
    actor_role: "system",
  });
}

async function handlePaymentIntentFailed(admin: LooseClient | null, event: Stripe.Event): Promise<void> {
  const intent = event.data.object as Stripe.PaymentIntent;
  if (!admin) return;

  const { data: payment } = await admin
    .from("client_invoice_payments")
    .select("id, status, stripe_event_id")
    .eq("stripe_payment_intent_id", intent.id)
    .maybeSingle();

  if (!payment) {
    // Not every failed PaymentIntent in the account belongs to an invoice
    // payment this table knows about (e.g. it never got past creation before
    // failing, so no session/intent id was ever saved). Nothing to update.
    return;
  }
  if (payment.stripe_event_id === event.id) return;
  if (payment.status === "succeeded") return;

  const failureReason =
    intent.last_payment_error?.message ?? intent.last_payment_error?.code ?? "Payment failed at Stripe.";

  const { error: updateError } = await admin
    .from("client_invoice_payments")
    .update({
      status: "failed",
      failure_reason: failureReason.slice(0, 1000),
      stripe_event_id: event.id,
    })
    .eq("id", payment.id);

  if (updateError) {
    console.error("stripe webhook: could not mark payment failed", updateError.message);
    return;
  }

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "client_invoice_payment",
      payment.id,
      null,
      `Stripe reported a failed payment (event ${event.id}): ${failureReason}`,
      { status: payment.status },
      { status: "failed", failure_reason: failureReason, stripe_event_id: event.id },
    ),
    event_category: "billing",
    severity: "warn",
    actor_role: "system",
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = verifyStripeWebhookSignature(rawBody, signature);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Invalid Stripe signature.";
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    // Configuration error, not a signature/parsing failure — Stripe should
    // retry this, so it is NOT a 400/401.
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(admin, event);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(admin, event);
        break;
      default:
        // Every other event type is acknowledged and ignored — Stripe expects
        // a fast 2xx from every subscribed event, not only the ones this
        // handler acts on.
        break;
    }
  } catch (caught) {
    // An unexpected failure while applying an already-verified event. Logged,
    // and still acknowledged with 200: Stripe would otherwise retry an event
    // whose failure is on this side and not transient, and the payment row
    // (if any was found) is left in whatever state it was in for a human to
    // reconcile rather than silently retried into duplication.
    console.error("stripe webhook: handler error", event.type, caught instanceof Error ? caught.message : caught);
  }

  return NextResponse.json({ ok: true });
}
