import Link from "next/link";
import { AlertTriangle, CircleDollarSign, ExternalLink, Hourglass, Layers } from "lucide-react";
import { GrantCreateForm } from "@/components/grants/GrantCreateForm";
import { GrantFeePaidToggle } from "@/components/grants/GrantFeePaidToggle";
import { GrantStatusBadge } from "@/components/grants/GrantStatusBadge";
import { GrantStatusEditor } from "@/components/grants/GrantStatusEditor";
import { getGrantTrackerAccess } from "@/lib/grants/access";
import { grantStatusRank, grantStatuses, isGrantTerminalStatus } from "@/lib/grants/statuses";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";

interface GrantRow {
  id: string;
  name: string;
  agency: string | null;
  sub_agency: string | null;
  contact: string | null;
  status: string;
  requirements: string | null;
  fee_amount: number | string | null;
  fee_kind: string | null;
  fee_paid: boolean;
  award_amount: number | string | null;
  website_url: string | null;
  website_label: string | null;
  opens_on: string | null;
  deadline: string | null;
  next_action: string | null;
  next_action_due: string | null;
  notes: string | null;
  outcome_reason: string | null;
  status_changed_at: string;
}

interface GrantsSearchParams {
  q?: string;
  status?: string;
  agency?: string;
  when?: string;
}

/** The sheet has a dozen rows; this bounds the read without paging complexity. */
const rowLimit = 300;
const maxSearchLength = 120;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * `%` and `_` are LIKE wildcards. Escaping them keeps the search literal, the
 * same helper app/employee/proposals/page.tsx uses.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function toNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Dates are stored as plain `date`, so they are formatted without a timezone shift. */
function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export default async function GrantsPage({ searchParams }: { searchParams: Promise<GrantsSearchParams> }) {
  const params = await searchParams;
  const { supabase, canRead, canManage, canEditClosed } = await getGrantTrackerAccess();

  if (!supabase) {
    return <section className="portal-card empty-state">Supabase is not configured yet.</section>;
  }

  if (!canRead) {
    return <section className="portal-card empty-state">Grant Tracker is not visible for this account.</section>;
  }

  const search = (params.q ?? "").trim().slice(0, maxSearchLength);
  const statusFilter = (params.status ?? "").trim();
  const agencyFilter = (params.agency ?? "").trim();
  const whenFilter = (params.when ?? "").trim();

  let query = supabase
    .from("company_grant_opportunities")
    .select(
      "id, name, agency, sub_agency, contact, status, requirements, fee_amount, fee_kind, fee_paid, award_amount, website_url, website_label, opens_on, deadline, next_action, next_action_due, notes, outcome_reason, status_changed_at",
    )
    .limit(rowLimit);

  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    query = query.or(`name.ilike.${pattern},agency.ilike.${pattern},sub_agency.ilike.${pattern}`);
  }
  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }
  if (agencyFilter) {
    query = query.eq("agency", agencyFilter);
  }

  const { data, error } = await query;

  // A missing table degrades the page rather than throwing, the same posture as
  // app/employee/lifecycle/page.tsx.
  if (error && isMissingSchemaRelationError(error)) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <span className="eyebrow">Grant Tracker</span>
            <h1>Funding pursuit tracker</h1>
          </div>
        </div>
        <section className="portal-card empty-state">
          The Grant Tracker is not set up in Supabase yet. Apply the latest database migrations and try again.
        </section>
      </>
    );
  }

  const rows = (Array.isArray(data) ? data : []) as GrantRow[];
  const today = todayIso();

  /* --- Ordering: pursuit urgency, not created_at ------------------------- */
  const band = (row: GrantRow): number => {
    if (isGrantTerminalStatus(row.status)) return 4;
    if (row.status === "on_hold") return 3;
    if (row.next_action_due || row.deadline) return 0;
    if (row.opens_on && row.opens_on >= today) return 1;
    return 2;
  };

  const sorted = [...rows].sort((a, b) => {
    const bandDiff = band(a) - band(b);
    if (bandDiff !== 0) return bandDiff;

    const aDate = a.next_action_due ?? a.deadline ?? a.opens_on;
    const bDate = b.next_action_due ?? b.deadline ?? b.opens_on;
    if (aDate && bDate && aDate !== bDate) return aDate < bDate ? -1 : 1;
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;

    const rankDiff = grantStatusRank(a.status) - grantStatusRank(b.status);
    if (rankDiff !== 0) return rankDiff;

    return a.name.localeCompare(b.name);
  });

  /* --- The `when` filter applies after the bands are known --------------- */
  const dueDate = (row: GrantRow) => row.next_action_due ?? row.deadline;
  const visible = sorted.filter((row) => {
    if (!whenFilter) return true;
    const due = dueDate(row);
    if (whenFilter === "overdue") return Boolean(due && due < today && !isGrantTerminalStatus(row.status));
    if (whenFilter === "soon") return Boolean(due && due >= today && daysBetween(today, due) <= 7);
    if (whenFilter === "opens") return Boolean(row.opens_on && row.opens_on >= today);
    if (whenFilter === "undated") return !due && !row.opens_on;
    return true;
  });

  /* --- KPIs are computed over every row, not the filtered view ----------- */
  const live = rows.filter((row) => !isGrantTerminalStatus(row.status));
  const needsAction = live.filter((row) => {
    const due = dueDate(row);
    if (due && daysBetween(today, due) <= 7) return true;
    return Boolean(row.opens_on && row.opens_on >= today && daysBetween(today, row.opens_on) <= 14);
  });
  const overdue = live.filter((row) => {
    const due = dueDate(row);
    return Boolean(due && due < today);
  });

  const feeRows = rows.filter((row) => !isGrantTerminalStatus(row.status) && toNumber(row.fee_amount) !== null);
  const feesTotal = feeRows.reduce((sum, row) => sum + (toNumber(row.fee_amount) ?? 0), 0);
  const feesPaid = feeRows
    .filter((row) => row.fee_paid)
    .reduce((sum, row) => sum + (toNumber(row.fee_amount) ?? 0), 0);

  const submitted = rows.filter((row) => row.status === "application_submitted");
  const oldestSubmittedDays = submitted.reduce((oldest, row) => {
    const changed = row.status_changed_at?.slice(0, 10);
    if (!changed) return oldest;
    const age = daysBetween(changed, today);
    return age > oldest ? age : oldest;
  }, 0);

  const agencies = [...new Set(rows.map((row) => row.agency).filter((value): value is string => Boolean(value)))].sort();
  const filtersApplied = Boolean(search || statusFilter || agencyFilter || whenFilter);

  return (
    <>
      <div className="portal-topline">
        <div>
          <span className="eyebrow">Grant Tracker</span>
          <h1>Funding pursuit tracker</h1>
          <p>Every grant and programme we are chasing — what it costs, what it needs next, and when it closes.</p>
        </div>
        <span className="badge">
          {live.length} live {live.length === 1 ? "pursuit" : "pursuits"}
        </span>
      </div>

      <section className="kpi-strip" aria-label="Grant pursuit KPIs" style={{ marginBottom: 16 }}>
        <article className="kpi-card">
          <span className="kpi-icon">
            <Layers size={18} />
          </span>
          <strong className="kpi-value">{live.length}</strong>
          <span className="kpi-label">Live Pursuits</span>
          <span className="kpi-detail">{rows.length} tracked in total</span>
        </article>

        <article className="kpi-card">
          <span className="kpi-icon">
            <AlertTriangle size={18} />
          </span>
          <strong className="kpi-value">{needsAction.length}</strong>
          <span className="kpi-label">Needs Action</span>
          <span className="kpi-detail">
            {overdue.length > 0 ? `${overdue.length} already overdue` : "Nothing overdue"}
          </span>
        </article>

        <article className="kpi-card">
          <span className="kpi-icon">
            <CircleDollarSign size={18} />
          </span>
          <strong className="kpi-value">{money.format(feesTotal)}</strong>
          <span className="kpi-label">Fees Committed</span>
          <span className="kpi-detail">
            {money2.format(feesPaid)} paid · {money2.format(Math.max(feesTotal - feesPaid, 0))} pending
          </span>
        </article>

        <article className="kpi-card">
          <span className="kpi-icon">
            <Hourglass size={18} />
          </span>
          <strong className="kpi-value">{submitted.length}</strong>
          <span className="kpi-label">Awaiting Decision</span>
          <span className="kpi-detail">
            {submitted.length > 0 ? `oldest submitted ${oldestSubmittedDays}d ago` : "Nothing submitted yet"}
          </span>
        </article>
      </section>

      <div className="document-grid">
        {canManage ? <GrantCreateForm /> : null}

        <section>
          <h2 style={{ marginBottom: 12 }}>All pursuits</h2>

          <form className="filters" method="get" action="/employee/grants">
            <label className="field">
              <span>Search program or agency</span>
              <input name="q" defaultValue={search} maxLength={maxSearchLength} placeholder="e.g. SBIR, NASE" />
            </label>

            <label className="field">
              <span>Status</span>
              <select name="status" defaultValue={statusFilter}>
                <option value="">All statuses</option>
                {grantStatuses.map((status) => (
                  <option key={status.key} value={status.key}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Agency</span>
              <select name="agency" defaultValue={agencyFilter}>
                <option value="">All agencies</option>
                {agencies.map((agency) => (
                  <option key={agency} value={agency}>
                    {agency}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Timing</span>
              <select name="when" defaultValue={whenFilter}>
                <option value="">All timing</option>
                <option value="overdue">Overdue</option>
                <option value="soon">Due in 7 days</option>
                <option value="opens">Opens soon</option>
                <option value="undated">No date set</option>
              </select>
            </label>

            <div className="field" style={{ alignSelf: "end", display: "flex", gap: 8 }}>
              <button className="button button-primary" type="submit">
                Apply
              </button>
              {filtersApplied ? (
                <Link className="button button-light" href="/employee/grants">
                  Clear
                </Link>
              ) : null}
            </div>
          </form>

          {visible.length === 0 ? (
            <div className="empty-state">
              {filtersApplied
                ? "No grants match these filters."
                : "No grants tracked yet. Add the first opportunity to get started."}
            </div>
          ) : (
            <div className="table-card">
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Program</th>
                      <th>Agency</th>
                      <th>Status</th>
                      <th>Needed next</th>
                      <th>Due / Opens</th>
                      <th>Fee</th>
                      <th>Contact</th>
                      <th aria-label="Links" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => {
                      const due = dueDate(row);
                      const fee = toNumber(row.fee_amount);
                      const closed = isGrantTerminalStatus(row.status);
                      const isOverdue = Boolean(due && due < today && !closed);

                      return (
                        // Terminal rows stay readable but stop competing for
                        // attention — the same treatment archived rows get in
                        // components/files/FileCenterManager.tsx.
                        <tr key={row.id} style={closed ? { opacity: 0.55 } : undefined}>
                          <td>
                            <Link href={`/employee/grants/${row.id}`}>
                              <strong>{row.name}</strong>
                            </Link>
                            {row.sub_agency ? <div className="table-subtext">{row.sub_agency}</div> : null}
                          </td>
                          <td>{row.agency ?? "—"}</td>
                          <td>
                            {canManage && (!closed || canEditClosed) ? (
                              <GrantStatusEditor grantId={row.id} status={row.status} />
                            ) : (
                              <GrantStatusBadge status={row.status} />
                            )}
                          </td>
                          <td>
                            {row.next_action ?? row.requirements ?? "—"}
                            {row.outcome_reason ? <div className="table-subtext">{row.outcome_reason}</div> : null}
                          </td>
                          <td>
                            {due ? (
                              <>
                                {dateLabel(due)}
                                {isOverdue ? <div className="table-subtext">Overdue</div> : null}
                              </>
                            ) : row.opens_on ? (
                              <span className="table-subtext">Opens {dateLabel(row.opens_on)}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {fee === null ? (
                              "—"
                            ) : (
                              <>
                                {money2.format(fee)}
                                {canManage ? (
                                  <GrantFeePaidToggle grantId={row.id} feePaid={row.fee_paid} />
                                ) : (
                                  <div className="table-subtext">{row.fee_paid ? "paid" : "unpaid"}</div>
                                )}
                              </>
                            )}
                          </td>
                          <td>
                            {row.contact ? (
                              row.contact.includes("@") ? (
                                <a href={`mailto:${row.contact}`}>{row.contact}</a>
                              ) : (
                                row.contact
                              )
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {row.website_url ? (
                              <a
                                className="button button-light button-sm"
                                href={row.website_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink size={14} /> Site
                              </a>
                            ) : row.website_label ? (
                              <span className="table-subtext">{row.website_label}</span>
                            ) : null}
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
