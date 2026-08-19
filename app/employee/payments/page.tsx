/**
 * The payments ledger — every Stripe payment attempt against a client
 * invoice, in one place, across every client and proposal.
 *
 * MODULE_ID: finance (the catalog entry already covers /employee/payments by
 *   prefix, alongside /employee/finance and /employee/invoices — so this page
 *   gates on exactly the permission the Finance Center and Invoices ledger
 *   gate on, through the same helper.)
 *
 * WHY THIS PAGE EXISTS. client_invoice_payments is an append-heavy evidence
 * trail written by app/api/stripe/checkout (a fresh 'pending' row) and
 * app/api/stripe/webhook (settling it to succeeded/failed/refunded) — but
 * until now nothing surfaced it. An operator could see an invoice flip to
 * "paid" without any way to see the payment attempt(s) behind that flip, or
 * to tell a card decline from a payment nobody has ever attempted. This page
 * is the reconciliation view: what Stripe actually did, ledgered.
 *
 * An async SERVER component. Every read happens here — there is no mutation
 * on this page at all, so unlike the Invoices ledger there is no client
 * component and no Server Action to pair it with.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, CreditCard, Hourglass, RotateCcw, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { canAccessEmployeePath, hasFullPortalVisibility } from "@/lib/user-management";

export const metadata: Metadata = {
  title: "Payments",
  description: "Every Stripe payment attempt collected across clients, invoices and proposals.",
};

/**
 * Same convention as app/employee/invoices/page.tsx and lib/stripe/customers.ts:
 * client_invoice_payments postdates the last Supabase types regen (added by
 * supabase/migrations/20260819100000_stripe_payments.sql), so it is read
 * through an untyped handle rather than by hand-editing the generated file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/**
 * Bounded so a busy year cannot turn the ledger into an unbounded read.
 * Newest first, so the cut falls on the oldest attempts — the same posture
 * invoiceLimit takes on the Invoices ledger, and for the same reason: the cut
 * only ever hides history nobody is actively chasing.
 */
const paymentLimit = 500;

interface PaymentRow {
  id: string;
  invoice_id: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  amount: number | string;
  currency: string;
  status: string;
  payment_method_type: string | null;
  failure_reason: string | null;
  initiated_at: string;
  succeeded_at: string | null;
  created_at: string;
}

interface InvoiceLookup {
  id: string;
  invoice_number: string;
  client_id: string;
  proposal_id: string | null;
}

interface ClientLookup {
  id: string;
  name: string;
}

interface ProposalLookup {
  id: string;
  title: string;
  proposal_number: string | null;
}

function toNumber(value: number | string | null): number {
  // PostgREST returns numeric columns as strings often enough that reading
  // them as numbers without this is a silent NaN in a money total.
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount);
  } catch {
    // An unexpected currency code must not take the ledger down.
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

/** initiated_at/succeeded_at/created_at are real timestamps, so no UTC-date shim is needed. */
function dateTimeLabel(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "us_bank_account" -> "Us bank account"; null -> "—". */
function methodLabel(value: string | null): string {
  if (!value) return "—";
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const statusTone: Record<string, string> = {
  succeeded: "badge-green",
  pending: "record-badge-neutral",
  processing: "record-badge-gold",
  failed: "record-badge-danger",
  canceled: "record-badge-neutral",
  refunded: "record-badge-neutral",
};

export default async function PaymentsLedgerPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <span className="eyebrow">Payments</span>
            <h1>Payments ledger</h1>
            <p>Supabase is required before payments can be listed.</p>
          </div>
          <span className="badge">
            <CreditCard size={14} />
            Setup required
          </span>
        </div>
      </>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employee-login");
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: moduleAccess } = hasFullPortalVisibility(role?.role, role?.account_status)
    ? { data: [] }
    : await supabase.from("portal_user_module_access").select("module_key").eq("user_id", user.id);

  // THE SAME GATE THE FINANCE CENTER AND INVOICES LEDGER USE. /employee/payments
  // is a path prefix on the `finance` catalog entry, so this resolves to the
  // finance module and cannot drift away from either: widening one widens all
  // three.
  const canViewFinanceModule = canAccessEmployeePath(
    role?.role,
    role?.account_status,
    "/employee/payments",
    (moduleAccess ?? []).map((access) => access.module_key),
  );

  // Said in as many words, and deliberately not phrased like an empty ledger:
  // "you cannot see this" and "there is nothing to see" are different facts,
  // and conflating them sends someone looking for payments that are right
  // there.
  if (!canViewFinanceModule) {
    return (
      <section className="portal-card empty-state">
        The payments ledger is not visible for this account. Finance Center access is required.
      </section>
    );
  }

  const { data: paymentData, error: paymentError } = await (supabase as LooseClient)
    .from("client_invoice_payments")
    .select(
      "id, invoice_id, stripe_payment_intent_id, stripe_checkout_session_id, amount, currency, status, payment_method_type, failure_reason, initiated_at, succeeded_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(paymentLimit);

  // A missing table degrades the page rather than throwing, the same posture
  // the Invoices ledger takes for client_invoices.
  if (paymentError && isMissingSchemaRelationError(paymentError)) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <span className="eyebrow">Payments</span>
            <h1>Payments ledger</h1>
          </div>
        </div>
        <section className="portal-card empty-state">
          Payments are not set up in Supabase yet. Apply the latest database migrations and try again.
        </section>
      </>
    );
  }

  // Any OTHER error would fall through to `rows = []` and render as "no
  // payments collected yet" — a full ledger reported as an empty one. A read
  // that failed has to say so rather than answer the question wrongly.
  if (paymentError) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <span className="eyebrow">Payments</span>
            <h1>Payments ledger</h1>
          </div>
        </div>
        <section className="portal-card empty-state" role="alert">
          The payments list could not be read just now. Reload the page — if it keeps happening, send the time of
          day to support.
        </section>
      </>
    );
  }

  const rows: PaymentRow[] = Array.isArray(paymentData) ? paymentData : [];

  // Invoices, clients and proposals are looked up only for the invoice_ids
  // this batch of payments actually references — not read in bulk the way
  // the Invoices ledger reads all clients/proposals up front — because a
  // payment's invoice_id is a hard FK and the referenced set is already
  // bounded by paymentLimit, so a targeted .in() lookup is both cheaper and
  // cannot go stale the way a separately-capped bulk list could.
  const invoiceIds = [...new Set(rows.map((row) => row.invoice_id))];

  const { data: invoiceData } = invoiceIds.length
    ? await (supabase as LooseClient)
        .from("client_invoices")
        .select("id, invoice_number, client_id, proposal_id")
        .in("id", invoiceIds)
    : { data: [] };

  const invoices: InvoiceLookup[] = Array.isArray(invoiceData) ? invoiceData : [];
  const invoicesById = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  const clientIds = [...new Set(invoices.map((invoice) => invoice.client_id).filter(Boolean))];
  const proposalIds = [...new Set(invoices.map((invoice) => invoice.proposal_id).filter((id): id is string => Boolean(id)))];

  const [{ data: clientData }, { data: proposalData }] = await Promise.all([
    clientIds.length
      ? supabase.from("company_clients").select("id, name").in("id", clientIds)
      : Promise.resolve({ data: [] }),
    proposalIds.length
      ? (supabase as LooseClient).from("client_proposals").select("id, title, proposal_number").in("id", proposalIds)
      : Promise.resolve({ data: [] }),
  ]);

  const clients: ClientLookup[] = Array.isArray(clientData) ? (clientData as unknown as ClientLookup[]) : [];
  const proposals: ProposalLookup[] = Array.isArray(proposalData) ? proposalData : [];
  const clientNamesById = new Map(clients.map((client) => [client.id, client.name]));
  const proposalsById = new Map(proposals.map((proposal) => [proposal.id, proposal]));

  const currencyCounts = new Map<string, number>();
  for (const row of rows) {
    currencyCounts.set(row.currency, (currencyCounts.get(row.currency) ?? 0) + 1);
  }
  // The ledger sums one column of money, so it prints one symbol. Where more
  // than one currency is in play the strip says so rather than implying the
  // figures were converted — nothing here does foreign exchange, the same
  // posture the Invoices ledger takes.
  const displayCurrency = [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "usd";
  const mixedCurrencies = currencyCounts.size > 1;

  const succeeded = rows.filter((row) => row.status === "succeeded");
  const pending = rows.filter((row) => row.status === "pending" || row.status === "processing");
  const failed = rows.filter((row) => row.status === "failed");
  const refunded = rows.filter((row) => row.status === "refunded");

  const collectedTotal = succeeded.reduce((sum, row) => sum + toNumber(row.amount), 0);
  const pendingTotal = pending.reduce((sum, row) => sum + toNumber(row.amount), 0);
  const refundedTotal = refunded.reduce((sum, row) => sum + toNumber(row.amount), 0);

  return (
    <>
      <div className="portal-topline">
        <div>
          <span className="eyebrow">Payments</span>
          <h1>Payments ledger</h1>
          <p>Every Stripe payment attempt collected against an invoice, newest first, across every client.</p>
        </div>
        <span className="badge">
          <CreditCard size={14} />
          {rows.length} {rows.length === 1 ? "payment" : "payments"}
        </span>
      </div>

      <section className="kpi-strip" aria-label="Payment totals" style={{ marginBottom: 16 }}>
        <article className="kpi-card">
          <span className="kpi-icon">
            <CheckCircle2 size={18} />
          </span>
          <strong className="kpi-value">{money(collectedTotal, displayCurrency)}</strong>
          <span className="kpi-label">Collected</span>
          <span className="kpi-detail">
            {succeeded.length} {succeeded.length === 1 ? "payment" : "payments"}
          </span>
        </article>
        <article className="kpi-card">
          <span className="kpi-icon">
            <Hourglass size={18} />
          </span>
          <strong className="kpi-value">{money(pendingTotal, displayCurrency)}</strong>
          <span className="kpi-label">Pending</span>
          <span className="kpi-detail">
            {pending.length} {pending.length === 1 ? "payment" : "payments"}
          </span>
        </article>
        <article className="kpi-card">
          <span className="kpi-icon">
            <TriangleAlert size={18} />
          </span>
          <strong className="kpi-value">{failed.length}</strong>
          <span className="kpi-label">Failed</span>
          <span className="kpi-detail">{failed.length === 1 ? "attempt" : "attempts"}</span>
        </article>
        <article className="kpi-card">
          <span className="kpi-icon">
            <RotateCcw size={18} />
          </span>
          <strong className="kpi-value">{money(refundedTotal, displayCurrency)}</strong>
          <span className="kpi-label">Refunded</span>
          <span className="kpi-detail">
            {refunded.length} {refunded.length === 1 ? "payment" : "payments"}
          </span>
        </article>
      </section>

      <p className="table-subtext" style={{ marginBottom: 16 }}>
        Collected counts only payments Stripe has confirmed succeeded; pending covers attempts still in flight.
        {mixedCurrencies
          ? ` These payments are written in ${currencyCounts.size} currencies and nothing here converts between them — the totals are shown in ${displayCurrency.toUpperCase()}.`
          : ""}
      </p>

      <section>
        <h2 style={{ marginBottom: 12 }}>All payments</h2>

        {rows.length === 0 ? (
          <div className="empty-state">No payments have been collected yet.</div>
        ) : (
          <div className="table-card">
            <div className="data-table-wrapper">
              <table className="data-table">
                <caption className="table-subtext">
                  The {rows.length === paymentLimit ? `${paymentLimit} most recent` : rows.length} payment
                  {rows.length === 1 ? "" : "s"} on record.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Client</th>
                    <th scope="col">Invoice</th>
                    <th scope="col">Proposal</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Status</th>
                    <th scope="col">Method</th>
                    <th scope="col">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const invoice = invoicesById.get(row.invoice_id);
                    const clientName = invoice ? clientNamesById.get(invoice.client_id) : undefined;
                    const proposal = invoice?.proposal_id ? proposalsById.get(invoice.proposal_id) : undefined;
                    const dimmed = row.status === "canceled" || row.status === "failed";
                    const displayDate = row.succeeded_at ?? row.initiated_at ?? row.created_at;

                    return (
                      // Dimmed rows stay readable but stop competing for
                      // attention, the same treatment voided invoices get on
                      // the Invoices ledger.
                      <tr key={row.id} style={dimmed ? { opacity: 0.65 } : undefined}>
                        <td>{clientName ?? "Unknown client"}</td>
                        <td>
                          {invoice ? (
                            <Link href={`/employee/clients/${invoice.client_id}/workflow`}>
                              <strong>{invoice.invoice_number}</strong>
                            </Link>
                          ) : (
                            "Unknown invoice"
                          )}
                        </td>
                        <td>{proposal ? proposal.proposal_number ?? proposal.title : "—"}</td>
                        <td>{money(toNumber(row.amount), row.currency)}</td>
                        <td>
                          <span className={`record-badge ${statusTone[row.status] ?? "record-badge-neutral"}`}>
                            {row.status}
                          </span>
                          {row.status === "failed" && row.failure_reason ? (
                            <div className="table-subtext">{row.failure_reason}</div>
                          ) : null}
                        </td>
                        <td>{methodLabel(row.payment_method_type)}</td>
                        <td>{dateTimeLabel(displayDate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
