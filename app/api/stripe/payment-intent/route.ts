// POST /api/stripe/payment-intent — start an embedded Stripe payment (Payment
// Element) against a client invoice.
//
// The sibling of app/api/stripe/checkout/route.ts, built the same way and for
// the same reason it is not reused directly: that route builds a hosted
// Checkout Session (redirect flow), and the proposal detail page's "Make a
// Payment" card embeds the card form in place via Stripe's Payment Element,
// which needs a PaymentIntent client secret rather than a Checkout Session
// url. Everything else about the trust boundary is identical and copied
// verbatim: the client-supplied body carries ONLY invoiceId, the amount and
// currency come from a server-side re-read of client_invoices, and access is
// the same getPipelineAccess() gate every other invoice write in this
// codebase uses.

import { NextResponse } from "next/server";
import { getPipelineAccess } from "@/lib/pipeline/access";
import { buildDataAuditEvent, recordAuditEvent } from "@/lib/audit/events";
import { getStripeConfigStatus } from "@/lib/stripe/config";
import { createInvoicePaymentIntent } from "@/lib/stripe/payment-intents";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSchemaBehindError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (isMissingSchemaRelationError(error)) return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (message.includes("could not find the") && message.includes("column"))
  );
}

export async function POST(request: Request) {
  const { supabase, userId, role, canRead } = await getPipelineAccess();

  if (!supabase || !userId) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!canRead) {
    return NextResponse.json({ error: "You do not have access to invoices." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const invoiceId = (body as { invoiceId?: unknown } | null)?.invoiceId;
  if (typeof invoiceId !== "string" || !UUID.test(invoiceId)) {
    return NextResponse.json({ error: "A valid invoiceId is required." }, { status: 400 });
  }

  const stripeStatus = getStripeConfigStatus();
  if (!stripeStatus.configured) {
    return NextResponse.json(
      { error: "Stripe payments are not configured for this environment." },
      { status: 503 },
    );
  }

  // Re-read server-side, through the caller's own session client — RLS
  // decides visibility, so an invoice this user cannot read comes back null,
  // never trusted from the request body. THE AUTHORITATIVE AMOUNT: never the
  // one a form field might carry.
  const { data: invoice, error: invoiceError } = await supabase
    .from("client_invoices")
    .select("id, client_id, invoice_number, status, total, currency")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError && isSchemaBehindError(invoiceError)) {
    return NextResponse.json(
      { error: "Invoicing is not set up in Supabase yet. Apply the latest database migrations and try again." },
      { status: 503 },
    );
  }
  if (!invoice) {
    return NextResponse.json(
      { error: "That invoice could not be found, or you do not have permission to see it." },
      { status: 404 },
    );
  }
  if (invoice.status === "paid") {
    return NextResponse.json({ error: "This invoice has already been paid." }, { status: 409 });
  }
  if (invoice.status === "void") {
    return NextResponse.json({ error: "This invoice has been voided and cannot be paid." }, { status: 409 });
  }
  if (invoice.status !== "issued") {
    return NextResponse.json({ error: "Only an issued invoice can be paid." }, { status: 409 });
  }

  const total = Number(invoice.total);
  if (!Number.isFinite(total) || total <= 0) {
    return NextResponse.json({ error: "This invoice has no payable amount." }, { status: 409 });
  }

  const { data: client, error: clientError } = await supabase
    .from("company_clients")
    .select("id, name, email")
    .eq("id", invoice.client_id)
    .maybeSingle();

  if (clientError && isSchemaBehindError(clientError)) {
    return NextResponse.json(
      { error: "Invoicing is not set up in Supabase yet. Apply the latest database migrations and try again." },
      { status: 503 },
    );
  }
  if (!client) {
    return NextResponse.json({ error: "The client on this invoice could not be found." }, { status: 404 });
  }

  try {
    const { paymentIntentId, clientSecret, customerId } = await createInvoicePaymentIntent({
      invoiceId: invoice.id,
      amount: total,
      currency: (invoice.currency ?? "usd").toLowerCase(),
      clientId: invoice.client_id,
      clientEmail: (client as { email?: string | null }).email ?? null,
    });

    // Inserted 'pending', naming this employee as the initiator — the same
    // shape "Employees can start invoice payments" requires (RLS: status =
    // 'pending', initiated_by = auth.uid()). The webhook, through the
    // admin/service-role client, is what ever moves this row to 'succeeded' or
    // 'failed'; this insert never does.
    const { data: payment, error: insertError } = await supabase
      .from("client_invoice_payments")
      .insert({
        invoice_id: invoice.id,
        amount: total,
        currency: (invoice.currency ?? "usd").toLowerCase(),
        status: "pending",
        initiated_by: userId,
        stripe_payment_intent_id: paymentIntentId,
        stripe_customer_id: customerId,
      })
      .select("id")
      .single();

    if (insertError || !payment) {
      if (isSchemaBehindError(insertError)) {
        return NextResponse.json(
          { error: "Invoicing is not set up in Supabase yet. Apply the latest database migrations and try again." },
          { status: 503 },
        );
      }
      // The PaymentIntent already exists at Stripe at this point. Failing to
      // record it here means a successful confirmation would have no row for
      // the webhook to find — logged so the intent id can be traced by hand.
      console.error("stripe payment-intent: intent created but payment row insert failed", {
        paymentIntentId,
        invoiceId: invoice.id,
        error: insertError?.message,
      });
      return NextResponse.json({ error: "Could not record the payment attempt." }, { status: 500 });
    }

    await recordAuditEvent({
      ...buildDataAuditEvent(
        "create",
        "client_invoice_payment",
        payment.id,
        userId,
        `Started an embedded Stripe payment of ${total.toFixed(2)} ${(invoice.currency ?? "usd").toUpperCase()} ` +
          `against invoice ${invoice.invoice_number ?? invoice.id} for ${client.name ?? "a client"}`,
        null,
        {
          invoice_id: invoice.id,
          client_id: invoice.client_id,
          amount: total,
          currency: invoice.currency,
          stripe_payment_intent_id: paymentIntentId,
        },
      ),
      event_category: "billing",
      actor_role: role,
    });

    return NextResponse.json({ clientSecret, paymentId: payment.id });
  } catch (caught) {
    // Nothing was written: Stripe rejected the request before any
    // client_invoice_payments row was ever inserted, so there is no row to
    // mark failed here — unlike a failure between insert and Stripe
    // confirmation, this path never had a row to begin with.
    const message = caught instanceof Error ? caught.message : "Stripe PaymentIntent creation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
