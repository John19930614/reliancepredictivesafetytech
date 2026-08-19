// POST /api/stripe/checkout — start a Stripe Checkout Session against a client
// invoice.
//
// The client-supplied body carries ONLY invoiceId. The amount, currency and
// client come from a server-side re-read of client_invoices — never from the
// request — for the same reason createManualInvoice never trusts a browser-
// posted total: a form field is a suggestion, not a source of truth for money.
//
// Access is the same gate app/employee/invoices/actions.ts uses for every
// other invoice write: getPipelineAccess(), which resolves the caller's role
// from user_roles and returns the same flags the RLS policies enforce
// underneath. canRead is what "Employees can read invoices" grants — any
// active portal role — because starting a payment is not a settlement
// decision (canSettleInvoice, admin-only); it is ordinary work available to
// whoever can already see the invoice, matching the INSERT policy on
// client_invoice_payments.

import { NextResponse } from "next/server";
import { getPipelineAccess } from "@/lib/pipeline/access";
import { buildDataAuditEvent, recordAuditEvent } from "@/lib/audit/events";
import { getStripeConfigStatus } from "@/lib/stripe/config";
import { buildInvoiceCheckoutReturnUrls, createInvoiceCheckoutSession } from "@/lib/stripe/client";
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

  // Re-read server-side. RLS decides visibility — an invoice this user cannot
  // read comes back null, same as every other route in this codebase that
  // reads through the session client rather than the admin client.
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

  // Stripe is called BEFORE any row is written, and the row is inserted
  // already carrying the Checkout Session id — deliberately, and different
  // from the naive "insert pending, call Stripe, then UPDATE with the session
  // id" sequence: the UPDATE policy on client_invoice_payments is admin-only
  // (mirroring "Admins can settle invoices"), so a non-admin employee's own
  // session client could insert the row but could never attach the session id
  // to it afterwards. Populating everything in the one INSERT the "Employees
  // can start invoice payments" policy already allows sidesteps that
  // entirely — there is no window where a 'pending' row exists without its
  // Stripe references, and no write here needs admin/service-role privilege.
  try {
    const { successUrl, cancelUrl } = buildInvoiceCheckoutReturnUrls(invoice.id);

    const session = await createInvoiceCheckoutSession({
      invoiceId: invoice.id,
      amount: total,
      currency: (invoice.currency ?? "usd").toLowerCase(),
      clientId: invoice.client_id,
      clientEmail: (client as { email?: string | null }).email ?? null,
      successUrl,
      cancelUrl,
      invoiceNumber: invoice.invoice_number,
    });

    const { data: payment, error: insertError } = await supabase
      .from("client_invoice_payments")
      .insert({
        invoice_id: invoice.id,
        amount: total,
        currency: (invoice.currency ?? "usd").toLowerCase(),
        status: "pending",
        initiated_by: userId,
        stripe_checkout_session_id: session.sessionId,
        stripe_customer_id: session.customerId,
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
      // The Checkout Session already exists at Stripe at this point. Failing
      // to record it here means it will not resolve via the webhook — the
      // failure is logged so the session id can be traced by hand.
      console.error("stripe checkout: session created but payment row insert failed", {
        sessionId: session.sessionId,
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
        `Started a Stripe Checkout payment of ${total.toFixed(2)} ${(invoice.currency ?? "usd").toUpperCase()} ` +
          `against invoice ${invoice.invoice_number ?? invoice.id} for ${client.name ?? "a client"}`,
        null,
        {
          invoice_id: invoice.id,
          client_id: invoice.client_id,
          amount: total,
          currency: invoice.currency,
          stripe_checkout_session_id: session.sessionId,
        },
      ),
      event_category: "billing",
      actor_role: role,
    });

    return NextResponse.json({ url: session.url, sessionId: session.sessionId, paymentId: payment.id });
  } catch (caught) {
    // Nothing was written: Stripe rejected the request (or NEXT_PUBLIC_SITE_URL
    // is unset) before any client_invoice_payments row was ever inserted, so
    // there is no row to mark failed here — unlike a failure between insert
    // and Stripe confirmation, this path never had a row to begin with.
    const message = caught instanceof Error ? caught.message : "Stripe checkout session creation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
