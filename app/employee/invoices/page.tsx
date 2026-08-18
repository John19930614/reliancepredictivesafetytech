/**
 * The invoice ledger — every invoice this company has raised, in one place.
 *
 * MODULE_ID: finance (the catalog entry already covers /employee/invoices by
 *   prefix, alongside /employee/finance — so this page gates on exactly the
 *   permission the Finance Center gates on, through the same helper.)
 *
 * WHY THIS PAGE EXISTS. Invoices were only ever visible one client at a time,
 * inside the workflow page of the company they belong to. Nobody could answer
 * "what is outstanding" without opening every client in the pipeline, which is
 * the question a finance function exists to answer. This page answers it, and
 * it is also where an invoice can be raised against a client with no proposal
 * behind it — until now the only creation path ran through an accepted
 * proposal, so billing a callout meant inventing a contract to hang it on.
 *
 * An async SERVER component. Every read happens here; the only client code is
 * the new-invoice form and its action (CLAUDE.md: no client-side Supabase).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CalendarClock, FileText, Hourglass, ReceiptText, TriangleAlert } from "lucide-react";
import { ManualInvoiceForm } from "@/components/invoices/ManualInvoiceForm";
import { resolvePipelineRoleFlags } from "@/lib/pipeline/policy";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { canAccessEmployeePath, hasFullPortalVisibility } from "@/lib/user-management";

export const metadata: Metadata = {
  title: "Invoices",
  description: "Every invoice raised, what it is worth, and how long it has been outstanding.",
};

/** Same convention as app/employee/clients/[id]/page.tsx, for tables absent from the types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/**
 * Bounded so a busy year cannot turn the ledger into an unbounded read. Newest
 * first, so the cut falls on the oldest rows — which is also the only place it
 * could fall without hiding something an operator is actively chasing.
 */
const invoiceLimit = 500;

/** Clients offered in the new-invoice dropdown. */
const clientLimit = 500;

/**
 * Proposals offered in the "billing against" dropdown, across ALL clients.
 *
 * Read in one query and filtered by client in the browser rather than fetched
 * per selection: this page is a server component, so a per-client read would
 * mean a round trip through a server action every time the operator changes the
 * client — for a list that is a few hundred rows in total. Newest first, so the
 * cut falls on proposals nobody is likely to be raising a first invoice against.
 */
const proposalLimit = 600;

interface InvoiceRow {
  id: string;
  client_id: string;
  invoice_number: string;
  status: string;
  currency: string | null;
  total: number | string | null;
  issue_date: string | null;
  due_date: string | null;
  created_at: string;
}

interface ClientOption {
  id: string;
  name: string;
  /**
   * The company slug (WONDFOUSA); null until someone assigns it. Carried into
   * the form because a manual invoice is numbered {SLUG}-{YYYY}-INV-{NN} off
   * it, so a client without one cannot be invoiced until it is set — and the
   * form has to know that before the operator fills the whole thing in.
   */
  company_slug?: string | null;
}

/**
 * One proposal an invoice may be billed against.
 *
 * `proposal_number` is what the invoice number is built from
 * ({PROPOSAL}-{NN}), and `proposal_value` is the ceiling
 * guard_client_invoice_total() will start enforcing once this proposal is
 * named — both are shown in the option so the choice is made with the two
 * consequences visible rather than after the fact.
 */
interface ProposalOption {
  id: string;
  client_id: string;
  title: string;
  proposal_number: string | null;
  proposal_value: number | string | null;
}

function toNumber(value: number | string | null): number {
  // PostgREST returns numeric columns as strings often enough that reading them
  // as numbers without this is a silent NaN in a money total.
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    // An unexpected currency code must not take the ledger down.
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Dates are stored as plain `date`, so they are formatted without a timezone shift. */
function dateLabel(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

const statusTone: Record<string, string> = {
  draft: "record-badge-neutral",
  issued: "record-badge-gold",
  paid: "badge-green",
  void: "record-badge-danger",
};

type AgeBucketKey = "current" | "d30" | "d60" | "d90" | "d90plus";

const ageBuckets: Array<{ key: AgeBucketKey; label: string }> = [
  { key: "current", label: "Not yet due" },
  { key: "d30", label: "1–30 days" },
  { key: "d60", label: "31–60 days" },
  { key: "d90", label: "61–90 days" },
  { key: "d90plus", label: "90+ days" },
];

/**
 * Which ageing bucket an invoice falls in, by how far past its due date it is.
 *
 * An invoice with no due date counts as not yet due rather than as debt: the
 * date it falls due has not been set, so nothing about it is late, and filing
 * it under 90+ would report a clerical gap as an aged receivable.
 */
function bucketFor(row: InvoiceRow, today: string): AgeBucketKey {
  if (!row.due_date) return "current";
  const overdueBy = daysBetween(row.due_date, today);
  if (overdueBy <= 0) return "current";
  if (overdueBy <= 30) return "d30";
  if (overdueBy <= 60) return "d60";
  if (overdueBy <= 90) return "d90";
  return "d90plus";
}

export default async function InvoiceLedgerPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <span className="eyebrow">Invoices</span>
            <h1>Invoice ledger</h1>
            <p>Supabase is required before invoices can be listed.</p>
          </div>
          <span className="badge">
            <ReceiptText size={14} />
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

  // THE SAME GATE THE FINANCE CENTER USES. /employee/invoices is a path prefix
  // on the `finance` catalog entry, so this resolves to the finance module and
  // cannot drift away from it: widening one widens both.
  const canViewFinanceModule = canAccessEmployeePath(
    role?.role,
    role?.account_status,
    "/employee/invoices",
    (moduleAccess ?? []).map((access) => access.module_key),
  );

  // Said in as many words, and deliberately not phrased like an empty ledger:
  // "you cannot see this" and "there is nothing to see" are different facts, and
  // conflating them sends someone looking for invoices that are right there.
  if (!canViewFinanceModule) {
    return (
      <section className="portal-card empty-state">
        The invoice ledger is not visible for this account. Finance Center access is required.
      </section>
    );
  }

  const { canDraftInvoice } = resolvePipelineRoleFlags(role?.role, role?.account_status === "active");

  const [{ data: invoiceData, error: invoiceError }, { data: clientData }, { data: proposalData }] = await Promise.all([
    // Untyped handle: client_invoices postdates the last Supabase types regen,
    // the same escape hatch lib/pipeline/access.ts uses for every write to it.
    (supabase as LooseClient)
      .from("client_invoices")
      .select("id, client_id, invoice_number, status, currency, total, issue_date, due_date, created_at")
      .order("created_at", { ascending: false })
      .limit(invoiceLimit),
    supabase.from("company_clients").select("id, name, company_slug").order("name").limit(clientLimit),
    // Declined and archived proposals are left out: they are not contracts
    // anyone is billing against, and offering one is how an invoice ends up
    // filed under work the client turned down. A draft or in-review proposal
    // IS offered — the work sometimes starts before the paperwork lands, and
    // the contract-value guard still bounds what can be billed against it.
    supabase
      .from("client_proposals")
      .select("id, client_id, title, proposal_number, proposal_value")
      .in("status", ["draft", "in_review", "sent", "accepted"])
      .not("proposal_number", "is", null)
      .order("created_at", { ascending: false })
      .limit(proposalLimit),
  ]);

  // A missing table degrades the page rather than throwing, the same posture as
  // the workflow page's invoice panel.
  if (invoiceError && isMissingSchemaRelationError(invoiceError)) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <span className="eyebrow">Invoices</span>
            <h1>Invoice ledger</h1>
          </div>
        </div>
        <section className="portal-card empty-state">
          Invoicing is not set up in Supabase yet. Apply the latest database migrations and try again.
        </section>
      </>
    );
  }

  // Any OTHER error would fall through to `rows = []` and render as "no invoices
  // raised yet" — a full ledger reported as an empty one. A read that failed has
  // to say so rather than answer the question wrongly.
  if (invoiceError) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <span className="eyebrow">Invoices</span>
            <h1>Invoice ledger</h1>
          </div>
        </div>
        <section className="portal-card empty-state" role="alert">
          The invoice list could not be read just now. Reload the page — if it keeps happening, send the time of day to
          support.
        </section>
      </>
    );
  }

  const rows: InvoiceRow[] = Array.isArray(invoiceData) ? invoiceData : [];
  // Cast through unknown: company_slug postdates the last Supabase types regen,
  // so the generated row type does not know the column the select asks for. Same
  // escape hatch as LooseClient above, kept to this one value.
  const clients: ClientOption[] = Array.isArray(clientData) ? (clientData as unknown as ClientOption[]) : [];
  // A failed or missing proposal read degrades to "no proposals to bill
  // against", which is a state the form already handles — an invoice with no
  // proposal behind it is the normal case here, so it must not take the page
  // down or block billing.
  const proposals: ProposalOption[] = Array.isArray(proposalData)
    ? (proposalData as unknown as ProposalOption[])
    : [];
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));

  const today = new Date().toISOString().slice(0, 10);

  // A voided invoice is a retired record: it asks for nothing and must not
  // appear in any total, or the ledger reports money nobody is owed.
  const live = rows.filter((row) => row.status !== "void");

  const currencyCounts = new Map<string, number>();
  for (const row of live) {
    const currency = row.currency ?? "USD";
    currencyCounts.set(currency, (currencyCounts.get(currency) ?? 0) + 1);
  }
  // The ledger sums one column of money, so it prints one symbol. Where more
  // than one currency is in play the strip says so rather than implying the
  // figures were converted — nothing here does foreign exchange.
  const displayCurrency = [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  const mixedCurrencies = currencyCounts.size > 1;

  const ageing = new Map<AgeBucketKey, { count: number; total: number }>(
    ageBuckets.map((bucket) => [bucket.key, { count: 0, total: 0 }]),
  );
  // Ageing is a RECEIVABLES view: it answers "what am I owed, and how late is
  // it". A settled invoice is owed nothing, so counting it would inflate every
  // band and make the 90+ tile grow forever as the business succeeds. Paid and
  // void are both excluded; the two are excluded for different reasons, which
  // is why the filters are written separately rather than merged.
  const receivable = live.filter((row) => row.status !== "paid");

  for (const row of receivable) {
    const entry = ageing.get(bucketFor(row, today));
    if (!entry) continue;
    entry.count += 1;
    entry.total += toNumber(row.total);
  }

  const liveTotal = live.reduce((sum, row) => sum + toNumber(row.total), 0);
  const outstandingTotal = receivable.reduce((sum, row) => sum + toNumber(row.total), 0);
  const collectedTotal = liveTotal - outstandingTotal;

  return (
    <>
      <div className="portal-topline">
        <div>
          <span className="eyebrow">Invoices</span>
          <h1>Invoice ledger</h1>
          <p>
            Every invoice raised, newest first — including the ones raised here, against a client with no proposal
            behind them.
          </p>
        </div>
        <span className="badge">
          <ReceiptText size={14} />
          {live.length} live {live.length === 1 ? "invoice" : "invoices"}
        </span>
      </div>

      <section className="kpi-strip" aria-label="Invoice ageing" style={{ marginBottom: 16 }}>
        {ageBuckets.map((bucket, index) => {
          const entry = ageing.get(bucket.key) ?? { count: 0, total: 0 };
          const Icon = index === 0 ? CalendarClock : index === ageBuckets.length - 1 ? TriangleAlert : Hourglass;

          return (
            <article className="kpi-card" key={bucket.key}>
              <span className="kpi-icon">
                <Icon size={18} />
              </span>
              <strong className="kpi-value">{money(entry.total, displayCurrency)}</strong>
              <span className="kpi-label">{bucket.label}</span>
              <span className="kpi-detail">
                {entry.count} {entry.count === 1 ? "invoice" : "invoices"}
              </span>
            </article>
          );
        })}
      </section>

      <p className="table-subtext" style={{ marginBottom: 16 }}>
        Ageing counts only what is still owed, measured from each invoice&rsquo;s due date. Paid invoices are
        excluded because they are owed nothing, and voided invoices because they ask for nothing.{" "}
        {money(outstandingTotal, displayCurrency)} is outstanding across {receivable.length}{" "}
        {receivable.length === 1 ? "invoice" : "invoices"}; {money(collectedTotal, displayCurrency)} has been
        collected.
        {mixedCurrencies
          ? ` These invoices are written in ${currencyCounts.size} currencies and nothing here converts between them — the totals are shown in ${displayCurrency}.`
          : ""}
      </p>

      <div className="invoice-workspace">
        {/* The year the counter will use for a manual invoice raised today —
            the allocator takes it from coalesce(issue_date, current_date). Read
            on the server so the number preview cannot disagree with the number
            actually minted because a browser clock is wrong. */}
        {canDraftInvoice ? (
          <ManualInvoiceForm clients={clients} proposals={proposals} year={new Date().getFullYear()} />
        ) : null}

        <section>
          <h2 style={{ marginBottom: 12 }}>All invoices</h2>

          {rows.length === 0 ? (
            <div className="empty-state">
              No invoices have been raised yet. Raise one here, or from a client&rsquo;s workflow page once a proposal
              has been accepted.
            </div>
          ) : (
            <div className="table-card">
              <div className="data-table-wrapper">
                <table className="data-table">
                  <caption className="table-subtext">
                    The {rows.length === invoiceLimit ? `${invoiceLimit} most recent` : rows.length} invoice
                    {rows.length === 1 ? "" : "s"} on record.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Invoice</th>
                      <th scope="col">Client</th>
                      <th scope="col">Status</th>
                      <th scope="col">Issued</th>
                      <th scope="col">Due</th>
                      <th scope="col">Total</th>
                      <th scope="col" aria-label="Documents" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const voided = row.status === "void";
                      const overdueBy = row.due_date && !voided ? daysBetween(row.due_date, today) : 0;
                      const isOverdue = overdueBy > 0 && row.status !== "paid";

                      return (
                        // Voided rows stay readable but stop competing for
                        // attention, the same treatment closed rows get in the
                        // Grant Tracker.
                        <tr key={row.id} style={voided ? { opacity: 0.55 } : undefined}>
                          <td>
                            {/*
                              The workflow page is where an invoice is read,
                              corrected and settled — there is no standalone
                              invoice page to link to, only the PDF and Word
                              routes offered at the end of the row.
                            */}
                            <Link href={`/employee/clients/${row.client_id}/workflow`}>
                              <strong>{row.invoice_number}</strong>
                            </Link>
                          </td>
                          <td>{clientNames.get(row.client_id) ?? "Unknown client"}</td>
                          <td>
                            <span className={`record-badge ${statusTone[row.status] ?? "record-badge-neutral"}`}>
                              {row.status}
                            </span>
                          </td>
                          <td>{dateLabel(row.issue_date)}</td>
                          <td>
                            {dateLabel(row.due_date)}
                            {isOverdue ? (
                              <div className="table-subtext">
                                {overdueBy} {overdueBy === 1 ? "day" : "days"} overdue
                              </div>
                            ) : null}
                          </td>
                          <td>{money(toNumber(row.total), row.currency ?? "USD")}</td>
                          <td>
                            <a
                              className="button button-neutral button-sm"
                              download
                              href={`/employee/clients/${row.client_id}/workflow/invoices/${row.id}/pdf`}
                            >
                              <FileText aria-hidden="true" size={13} /> PDF
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
