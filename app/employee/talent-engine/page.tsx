/**
 * EHS Talent Engine — Live Console.
 *
 * MODULE_ID: ehs_talent_engine
 * PATH_PREFIX: /employee/talent-engine
 *
 * An async SERVER component. Every read below happens here, against Supabase,
 * on the server; the only client code on the page is the small decision-button
 * island inside each match card (CLAUDE.md: no client-side data mutation, no
 * client-side Supabase reads). Every list query is bounded with .limit() and
 * ordered deterministically so two renders of the same data agree.
 *
 * The money on this page is never recomputed ad hoc: the KPI strip, the ledger
 * footer and the revenue donut all come out of buildConsoleSummary() /
 * summariseLedger() in lib/talent-engine/pricing.ts, so they cannot disagree
 * with each other or with what a Server Action wrote.
 */

import Link from "next/link";
import { ClipboardCheck, Radar } from "lucide-react";
import { buildConsoleSummary, computeSpread, computeWeeklyMargin, summariseLedger } from "@/lib/talent-engine/pricing";
import { getTalentAccess, type TalentAccess } from "@/lib/talent-engine/access";
import { defaultVerticalOptions, normalizeVerticalOptions } from "@/lib/talent-engine/verticals";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import {
  certExpiryWarningDays,
  defaultHoursPerWeek,
  defaultMinSpreadPerHour,
  type CandidateRow,
  type CertificationCoverage,
  type JobOrderWithClient,
  type LedgerRow,
  type MatchQueueRow,
  type TalentActivityRow,
} from "@/lib/talent-engine/types";
import { AgentActivityFeed } from "@/components/talent-engine/AgentActivityFeed";
import { CertificationTracker } from "@/components/talent-engine/CertificationTracker";
import { JobOrdersCard } from "@/components/talent-engine/JobOrdersCard";
import { MarginLedgerCard, type MarginLedgerOverflow } from "@/components/talent-engine/MarginLedgerCard";
import { MatchQueueCard } from "@/components/talent-engine/MatchQueueCard";
import { RevenueMarginCard } from "@/components/talent-engine/RevenueMarginCard";
import { TalentConsoleHeader } from "@/components/talent-engine/TalentConsoleHeader";
import { TalentKpiRow } from "@/components/talent-engine/TalentKpiRow";
import { TalentPoolCard } from "@/components/talent-engine/TalentPoolCard";
import { formatDay, toNumber } from "@/components/talent-engine/format";

/* -------------------------------------------------------------------------- */
/* Query bounds                                                               */
/* -------------------------------------------------------------------------- */

const jobOrderLimit = 6;
const candidateLimit = 6;
/** Bounds for the intake-form dropdowns (client list, order/candidate pickers). */
const optionLimit = 300;
const matchQueueLimit = 8;
const placementLimit = 60;
const activityLimit = 8;
/** Ledger rows shown before the remainder is rolled into a "+N more" line. */
const ledgerDisplayLimit = 6;
/** Candidates scanned for certification coverage. */
const certScanLimit = 500;
const certTrackerRows = 4;

/** Statuses that make up the "active pool" the console counts and screens. */
const activePoolStatuses = ["sourced", "screening", "available"] as const;
/** Match statuses that are sitting on a human. */
const pendingStatuses = ["pending_approval", "counter_proposed"] as const;
/** Past the gate, not yet billing — the Placement Desk's workload. */
const deskWaitingStatuses = ["approved", "submitted"] as const;

/* -------------------------------------------------------------------------- */
/* Read helpers                                                               */
/* -------------------------------------------------------------------------- */

/** The shape isMissingSchemaRelationError() inspects. */
type QueryError = { code?: string; message?: string } | null;

interface ListResult<T> {
  rows: T[];
  count: number;
  error: QueryError;
}

/**
 * Runs one PostgREST query and normalises the result.
 *
 * A missing table is tolerated on purpose: this module ships behind a migration
 * that has to be rehearsed on staging before it is applied, so a deploy can
 * legitimately land first. In that window every card shows its empty state and
 * a setup notice, instead of the whole page throwing. Any OTHER error is
 * re-thrown by the caller so error.tsx reports it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readList<T>(query: any): Promise<ListResult<T>> {
  const result = await query;
  const rows: T[] = Array.isArray(result?.data) ? (result.data as T[]) : [];
  const count = typeof result?.count === "number" ? result.count : rows.length;
  return { rows, count, error: (result?.error ?? null) as QueryError };
}

/** Monday (UTC) of the week containing `now`, as a `YYYY-MM-DD` date key. */
function currentWeekStarting(now: Date): string {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = day.getUTCDay();
  day.setUTCDate(day.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return day.toISOString().slice(0, 10);
}

/** `2026-08-03` → `week of Aug 3, 2026`. */
function weekLabelFor(weekStarting: string): string {
  const parsed = new Date(`${weekStarting}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "this week" : `week of ${formatDay(parsed)}`;
}

/**
 * The viewer's role, stated the way the blueprint's permission matrix states it.
 * Derived from the resolved capability flags rather than the raw role string, so
 * a Recruiter is never labelled "Oversight Manager" just because the design mock
 * hardcoded it.
 */
function viewerRoleLabel(access: TalentAccess): string {
  if (access.canApprove) return "Oversight Manager";
  if (access.canPropose) return "Recruiter / Reviewer";
  if (access.canRead) return "Account Manager";
  return "No access";
}

interface CertScanRow {
  id: string;
  certifications: string[] | null;
  verified_certifications: string[] | null;
  cert_expiry_date: string | null;
}

interface CertDatesRow {
  candidate_id: string;
  certification: string;
  issued_on: string | null;
  expires_on: string | null;
}

/**
 * Verified-cert coverage across the pool. `verified_certifications` is a subset
 * of `certifications` by contract, but it is intersected here anyway — a stray
 * verified cert the candidate does not claim must not push coverage over 100%.
 */
function buildCertificationCoverage(rows: CertScanRow[]): CertificationCoverage[] {
  const held = new Map<string, number>();
  const verified = new Map<string, number>();

  for (const row of rows) {
    const claimed = new Set((row.certifications ?? []).map((value) => String(value).trim()).filter(Boolean));
    const confirmed = new Set((row.verified_certifications ?? []).map((value) => String(value).trim()).filter(Boolean));
    for (const cert of claimed) held.set(cert, (held.get(cert) ?? 0) + 1);
    for (const cert of confirmed) {
      if (claimed.has(cert)) verified.set(cert, (verified.get(cert) ?? 0) + 1);
    }
  }

  return Array.from(held.entries())
    .map(([certification, heldCount]) => {
      const verifiedCount = verified.get(certification) ?? 0;
      return {
        certification,
        heldCount,
        verifiedCount,
        verifiedPct: heldCount === 0 ? 0 : Math.round((verifiedCount / heldCount) * 1000) / 10,
      };
    })
    .sort((a, b) => b.heldCount - a.heldCount || a.certification.localeCompare(b.certification))
    .slice(0, certTrackerRows);
}

/**
 * Candidates with ANY certification lapsing inside the warning window (or
 * already lapsed). Two sources, unioned by candidate: the per-cert dates
 * ledger (talent_candidate_certifications, the build-review upgrade) and the
 * legacy person-level cert_expiry_date still carried by older rows.
 */
function countExpiringSoon(rows: CertScanRow[], certDates: CertDatesRow[], today: Date): number {
  const cutoff = new Date(today.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() + certExpiryWarningDays);

  const lapsing = (value: string | null): boolean => {
    if (!value) return false;
    const expiry = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(expiry.getTime()) && expiry.getTime() <= cutoff.getTime();
  };

  const expiring = new Set<string>();
  for (const row of rows) {
    if (lapsing(row.cert_expiry_date)) expiring.add(row.id);
  }
  for (const row of certDates) {
    if (lapsing(row.expires_on)) expiring.add(row.candidate_id);
  }
  return expiring.size;
}

/* -------------------------------------------------------------------------- */
/* Row shapes returned by the joined queries                                  */
/* -------------------------------------------------------------------------- */

interface PlacementJoinRow {
  id: string;
  bill_rate: number | null;
  pay_rate: number | null;
  start_date: string | null;
  candidate: { id: string; full_name: string } | null;
  job_order: { id: string; title: string; client: { id: string; name: string } | null } | null;
}

interface TimesheetJoinRow {
  placement_id: string;
  week_starting: string;
  hours: number | null;
  bill_rate: number | null;
  pay_rate: number | null;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default async function TalentEnginePage() {
  const access = await getTalentAccess();
  const { supabase, userId, canRead, canApprove, canSetRate, canPropose } = access;

  if (!canRead) {
    return (
      <div className="talent-console">
        <p className="talent-no-access">You do not have access to the Talent Engine.</p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const now = new Date();
  const weekStarting = currentWeekStarting(now);

  const [
    settingsResult,
    jobOrdersResult,
    candidatesResult,
    matchesResult,
    placementsResult,
    activityResult,
    certScanResult,
    certDatesResult,
    poolCountResult,
    newLeadsResult,
    deskWaitingResult,
  ] = await Promise.all([
    readList<{
      min_spread_per_hour: number | null;
      target_markup_pct: number | null;
      default_hours_per_week: number | null;
      vertical_options: string[] | null;
    }>(
      db
        .from("talent_settings")
        .select("min_spread_per_hour, target_markup_pct, default_hours_per_week, vertical_options")
        .limit(1),
    ),

    readList<JobOrderWithClient>(
      db
        .from("talent_job_orders")
        .select("*, client:company_clients(id, name)", { count: "exact" })
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(jobOrderLimit),
    ),

    readList<CandidateRow>(
      db
        .from("talent_candidates")
        .select("*")
        .in("status", activePoolStatuses)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(candidateLimit),
    ),

    // Below-floor matches first (floor_ok = false sorts ahead of true), then
    // newest: the money problems rise to the top of the operator's queue.
    readList<MatchQueueRow>(
      db
        .from("talent_matches")
        .select(
          "*, job_order:talent_job_orders(id, title, bill_rate, min_spread, cert_requirements, location, client:company_clients(id, name)), candidate:talent_candidates(id, full_name, certifications, verified_certifications, years_experience, pay_expectation, location)",
          { count: "exact" },
        )
        .in("status", pendingStatuses)
        .order("floor_ok", { ascending: true })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(matchQueueLimit),
    ),

    readList<PlacementJoinRow>(
      db
        .from("talent_placements")
        .select(
          "id, bill_rate, pay_rate, start_date, candidate:talent_candidates(id, full_name), job_order:talent_job_orders(id, title, client:company_clients(id, name))",
          { count: "exact" },
        )
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .order("id", { ascending: true })
        .limit(placementLimit),
    ),

    readList<TalentActivityRow>(
      db
        .from("talent_activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(activityLimit),
    ),

    readList<CertScanRow>(
      db
        .from("talent_candidates")
        .select("id, certifications, verified_certifications, cert_expiry_date")
        .neq("status", "inactive")
        .order("id", { ascending: true })
        .limit(certScanLimit),
    ),

    // The per-cert dates ledger: feeds the manage panels' date fields and the
    // tracker's expiring-soon union. Bounded like the candidate scan.
    readList<CertDatesRow>(
      db
        .from("talent_candidate_certifications")
        .select("candidate_id, certification, issued_on, expires_on")
        .order("candidate_id", { ascending: true })
        .order("certification", { ascending: true })
        .limit(certScanLimit * 4),
    ),

    readList<{ id: string }>(
      db.from("talent_candidates").select("id", { count: "exact", head: true }).in("status", activePoolStatuses),
    ),

    // Web-sourced leads still waiting on a human. Counted, never listed here:
    // the console is the money surface, and the review gate has its own page.
    readList<{ id: string }>(
      db.from("talent_sourcing_leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    ),

    // Matches past the approval gate but not yet placed. Counted here only —
    // the desk route is where they are worked. Without this the console has no
    // hint that anything is sitting between "approved" and "billing".
    readList<{ id: string }>(
      db
        .from("talent_matches")
        .select("id", { count: "exact", head: true })
        .in("status", deskWaitingStatuses),
    ),
  ]);

  // Options for the intake forms, fetched only when the viewer can use them.
  // Bounded and name-ordered — these fill <select>s, not the dashboard cards.
  const [clientOptionsResult, orderOptionsResult, candidateOptionsResult] = canPropose
    ? await Promise.all([
        readList<{ id: string; name: string }>(
          db.from("company_clients").select("id, name").order("name", { ascending: true }).limit(optionLimit),
        ),
        readList<{ id: string; title: string; client: { name: string } | null }>(
          db
            .from("talent_job_orders")
            .select("id, title, client:company_clients(name)")
            .eq("status", "open")
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
            .limit(optionLimit),
        ),
        readList<{ id: string; full_name: string; pay_expectation: number | null }>(
          db
            .from("talent_candidates")
            .select("id, full_name, pay_expectation")
            .in("status", activePoolStatuses)
            .order("full_name", { ascending: true })
            .order("id", { ascending: true })
            .limit(optionLimit),
        ),
      ])
    : [
        { rows: [], count: 0, error: null } as ListResult<{ id: string; name: string }>,
        { rows: [], count: 0, error: null } as ListResult<{ id: string; title: string; client: { name: string } | null }>,
        { rows: [], count: 0, error: null } as ListResult<{ id: string; full_name: string; pay_expectation: number | null }>,
      ];

  const results = [
    settingsResult,
    jobOrdersResult,
    candidatesResult,
    matchesResult,
    placementsResult,
    activityResult,
    certScanResult,
    certDatesResult,
    poolCountResult,
    newLeadsResult,
    deskWaitingResult,
    clientOptionsResult,
    orderOptionsResult,
    candidateOptionsResult,
  ];

  // A table that is not in the schema cache yet means "migration not applied";
  // anything else is a real fault and belongs in error.tsx, not swallowed.
  const schemaMissing = results.some((result) => isMissingSchemaRelationError(result.error));
  const hardError = results.find((result) => result.error && !isMissingSchemaRelationError(result.error));
  if (hardError) {
    throw new Error("The Talent Engine console could not read its data.");
  }

  const settings = settingsResult.rows[0] ?? null;
  const minSpread = toNumber(settings?.min_spread_per_hour, defaultMinSpreadPerHour);
  const hoursPerWeek = toNumber(settings?.default_hours_per_week, defaultHoursPerWeek) || defaultHoursPerWeek;
  // The configured trade list for the vertical pickers; the seeded defaults
  // cover an environment where the 20260809210000 migration has not landed.
  const configuredVerticals = normalizeVerticalOptions(settings?.vertical_options ?? []);
  const verticalOptions = configuredVerticals.length > 0 ? configuredVerticals : [...defaultVerticalOptions];

  /* ---- Ledger: this week's timesheets against the active placements ------ */

  const placements = placementsResult.rows;
  const placementIds = placements.map((placement) => placement.id);

  // Ask for the recent weeks rather than exactly this one, then take the newest
  // week that actually has rows. A Monday-morning render, or a book that bills
  // a week in arrears, would otherwise show an empty ledger under a non-zero
  // placement count — and the card names the week it settled on.
  const timesheetsResult =
    placementIds.length > 0
      ? await readList<TimesheetJoinRow>(
          db
            .from("talent_timesheets")
            .select("placement_id, week_starting, hours, bill_rate, pay_rate")
            .in("placement_id", placementIds)
            .lte("week_starting", weekStarting)
            .order("week_starting", { ascending: false })
            .order("placement_id", { ascending: true })
            .limit(placementIds.length * 4),
        )
      : ({ rows: [], count: 0, error: null } as ListResult<TimesheetJoinRow>);

  if (timesheetsResult.error && !isMissingSchemaRelationError(timesheetsResult.error)) {
    throw new Error("The Talent Engine console could not read its timesheets.");
  }

  const ledgerWeek = timesheetsResult.rows[0]?.week_starting ?? weekStarting;
  const placementsById = new Map(placements.map((placement) => [placement.id, placement]));

  const ledgerRows: LedgerRow[] = timesheetsResult.rows
    .filter((sheet) => sheet.week_starting === ledgerWeek)
    .map((sheet) => {
      const placement = placementsById.get(sheet.placement_id);
      const billRate = toNumber(sheet.bill_rate) || toNumber(placement?.bill_rate);
      const payRate = toNumber(sheet.pay_rate) || toNumber(placement?.pay_rate);
      const hours = toNumber(sheet.hours);
      const spread = computeSpread(billRate, payRate);
      return {
        placement_id: sheet.placement_id,
        candidate_name: placement?.candidate?.full_name ?? "Unnamed placement",
        client_name: placement?.job_order?.client?.name ?? placement?.job_order?.title ?? "Unassigned client",
        bill_rate: billRate,
        pay_rate: payRate,
        spread,
        hours,
        weekly_margin: computeWeeklyMargin(spread, hours),
      };
    })
    .sort((a, b) => b.weekly_margin - a.weekly_margin || a.candidate_name.localeCompare(b.candidate_name));

  const ledgerTotals = summariseLedger(ledgerRows);
  const visibleLedger = ledgerRows.slice(0, ledgerDisplayLimit);
  const hiddenLedger = ledgerRows.slice(ledgerDisplayLimit);
  const hiddenTotals = summariseLedger(hiddenLedger);
  const overflow: MarginLedgerOverflow | null =
    hiddenLedger.length === 0
      ? null
      : {
          placements: hiddenLedger.length,
          clients: new Set(hiddenLedger.map((row) => row.client_name)).size,
          hours: hiddenTotals.totalHours,
          avgSpread: hiddenTotals.avgSpread,
          weeklyMargin: hiddenTotals.totalMargin,
        };

  const summary = buildConsoleSummary({
    ledger: ledgerRows,
    activePlacements: placementsResult.count,
    pendingApprovals: matchesResult.count,
  });

  /* ---- Certification coverage -------------------------------------------- */

  const certRows = certScanResult.rows;
  const coverage = buildCertificationCoverage(certRows);
  const expiringCount = countExpiringSoon(certRows, certDatesResult.rows, now);

  /** Dates-ledger rows for the manage panels, grouped by candidate. */
  const certDatesByCandidate: Record<string, CertDatesRow[]> = {};
  for (const row of certDatesResult.rows) {
    (certDatesByCandidate[row.candidate_id] ??= []).push(row);
  }

  /* ---- Viewer identity ---------------------------------------------------- */

  const clientOptions = clientOptionsResult.rows;
  const orderOptions = orderOptionsResult.rows.map((order) => ({
    id: order.id,
    label: order.client?.name ? `${order.title} — ${order.client.name}` : order.title,
  }));
  const candidateOptions = candidateOptionsResult.rows.map((candidate) => ({
    id: candidate.id,
    label:
      candidate.pay_expectation === null
        ? candidate.full_name
        : `${candidate.full_name} — asks $${toNumber(candidate.pay_expectation)}/hr`,
  }));

  const { data: profile } = userId
    ? await db.from("employee_chat_profiles").select("display_name").eq("user_id", userId).maybeSingle()
    : { data: null };
  const {
    data: { user },
  } = await db.auth.getUser();
  const viewerName = profile?.display_name || user?.email || "Signed-in user";

  return (
    <div className="talent-console">
      <TalentConsoleHeader roleLabel={viewerRoleLabel(access)} today={formatDay(now)} viewerName={viewerName} />

      {schemaMissing ? (
        <p className="success-box portal-alert">
          The EHS Talent Engine tables are not in this environment yet. Apply the latest database migrations and the
          console will fill in.
        </p>
      ) : null}

      <TalentKpiRow minSpread={minSpread} summary={summary} />

      <div className="talent-grid">
        <div className="talent-col">
          <JobOrdersCard
            canPropose={canPropose}
            canSetRate={canSetRate}
            clients={clientOptions}
            openCount={jobOrdersResult.count}
            orders={jobOrdersResult.rows}
            verticalOptions={verticalOptions}
          />
          <TalentPoolCard
            activeCount={poolCountResult.count}
            canApprove={canApprove}
            canPropose={canPropose}
            candidates={candidatesResult.rows}
            certDatesByCandidate={certDatesByCandidate}
            verticalOptions={verticalOptions}
          />
          <Link className="talent-leadlink" href="/employee/talent-engine/leads">
            <span aria-hidden="true" className="talent-leadlink-mark">
              <Radar size={16} />
            </span>
            <span className="talent-leadlink-main">
              <span className="talent-leadlink-title">Sourcing leads</span>
              <span className="talent-leadlink-sub">
                What the agent found on the public web, waiting on a human. Nothing joins the pool on its own.
              </span>
            </span>
            <span className="talent-leadlink-count">
              {newLeadsResult.count === 0 ? "None new" : `${newLeadsResult.count} new`}
            </span>
          </Link>
          {/*
            The desk is where an approved match becomes a placement and a
            placement becomes billable hours. It is a separate route because the
            console is the money DASHBOARD — the desk is the work. Same
            `/employee/talent-engine` prefix grant, so no new module key.
          */}
          <Link className="talent-leadlink" href="/employee/talent-engine/desk">
            <span aria-hidden="true" className="talent-leadlink-mark">
              <ClipboardCheck size={16} />
            </span>
            <span className="talent-leadlink-main">
              <span className="talent-leadlink-title">Placement desk</span>
              <span className="talent-leadlink-sub">
                Approved matches waiting to be submitted or placed, and the weekly hours that turn a placement into
                margin.
              </span>
            </span>
            <span className="talent-leadlink-count">
              {deskWaitingResult.count === 0 ? "Nothing waiting" : `${deskWaitingResult.count} waiting`}
            </span>
          </Link>
        </div>

        <div className="talent-col">
          <MatchQueueCard
            canApprove={canApprove}
            canPropose={canPropose}
            canSetRate={canSetRate}
            candidateOptions={candidateOptions}
            hoursPerWeek={hoursPerWeek}
            matches={matchesResult.rows}
            minSpread={minSpread}
            orderOptions={orderOptions}
            pendingCount={matchesResult.count}
          />
          <MarginLedgerCard
            overflow={overflow}
            rows={visibleLedger}
            totals={{
              placements: ledgerRows.length,
              hours: ledgerTotals.totalHours,
              avgSpread: ledgerTotals.avgSpread,
              weeklyMargin: ledgerTotals.totalMargin,
            }}
            weekLabel={weekLabelFor(ledgerWeek)}
          />
        </div>

        <div className="talent-col">
          <RevenueMarginCard summary={summary} />
          <AgentActivityFeed events={activityResult.rows} />
          <CertificationTracker coverage={coverage} expiringCount={expiringCount} poolSize={certRows.length} />
        </div>
      </div>

      <p className="talent-foot">
        EHS Talent Engine · AI-managed markup staffing. Every submittal, rate change and placement passes a human
        approval gate — nothing on this page leaves the building without one.
      </p>
    </div>
  );
}
