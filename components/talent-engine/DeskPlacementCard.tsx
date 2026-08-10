import { computeMarkupPct, computeSpread, computeWeeklyMargin, meetsSpreadFloor } from "@/lib/talent-engine/pricing";
import { DeskTimesheetForm } from "./DeskTimesheetForm";
import { MatchRateStrip } from "./MatchRateStrip";
import { RecruiterAssign, type RecruiterOption } from "./RecruiterAssign";
import { formatCurrency, formatDay, formatNumber, joinMeta, toNumber } from "./format";

/**
 * One active placement, with the timesheet form that is the only way margin
 * ever reaches the ledger.
 *
 * Server component — it renders markup and hands the write to the small client
 * island at the bottom.
 *
 * The weeks already logged are listed above the form on purpose. One timesheet
 * exists per (placement, week) — the database enforces it — and the Server
 * Action treats a repeat of the same week as a CORRECTION that overwrites in
 * place, not as a second entry. An operator has to be able to see that before
 * they type, or a re-entry silently rewrites a week they meant to add to.
 */

export interface DeskPlacementRow {
  id: string;
  bill_rate: number | null;
  pay_rate: number | null;
  start_date: string | null;
  status: string;
  recruiter_id: string | null;
  candidate: { id: string; full_name: string } | null;
  job_order: {
    id: string;
    title: string;
    min_spread: number | null;
    client: { id: string; name: string } | null;
  } | null;
}

export interface DeskTimesheetRow {
  id: string;
  placement_id: string;
  week_starting: string;
  hours: number | null;
  bill_rate: number | null;
  pay_rate: number | null;
  status: string;
}

/** `2026-08-03` → `Aug 3, 2026`, without letting a bad key render as "Invalid Date". */
function weekLabel(weekStarting: string): string {
  const parsed = new Date(`${weekStarting}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? weekStarting : formatDay(parsed);
}

export function DeskPlacementCard({
  placement,
  weeks,
  minSpread,
  hoursPerWeek,
  canPropose,
  weekStarting,
  canManagePlacements = false,
  recruiterOptions = [],
  recruiterName = null,
}: {
  placement: DeskPlacementRow;
  /** Recent timesheets for this placement, newest week first. */
  weeks: DeskTimesheetRow[];
  /** talent_settings.min_spread_per_hour — the agency default floor. */
  minSpread: number;
  /** talent_settings.default_hours_per_week — what a weekly margin is projected over. */
  hoursPerWeek: number;
  canPropose: boolean;
  /** The current ISO Monday, computed on the server so the form never hydrates differently. */
  weekStarting: string;
  /** Gates the recruiter-assignment control. */
  canManagePlacements?: boolean;
  /** People with commission plans, assignable as this placement's recruiter. */
  recruiterOptions?: RecruiterOption[];
  /** Resolved display name of the current recruiter, for the read-only line. */
  recruiterName?: string | null;
}) {
  const billRate = toNumber(placement.bill_rate);
  const payRate = toNumber(placement.pay_rate);

  const floor =
    placement.job_order?.min_spread === null || placement.job_order?.min_spread === undefined
      ? minSpread
      : toNumber(placement.job_order.min_spread);

  const spread = computeSpread(billRate, payRate);
  const markupPct = computeMarkupPct(billRate, payRate);
  const weeklyMargin = computeWeeklyMargin(spread, hoursPerWeek);
  const belowFloor = !meetsSpreadFloor(billRate, payRate, floor);

  const candidateName = placement.candidate?.full_name ?? "Unnamed placement";
  const clientName = placement.job_order?.client?.name ?? "Unassigned client";
  const jobLabel = joinMeta([placement.job_order?.title, clientName]);

  // Same derivation the console's ledger uses: the sheet's own rate snapshot
  // wins, the placement's rates are the fallback, and the margin is computed —
  // never read out of the denormalised amount_billed / amount_paid columns.
  const loggedWeeks = weeks.map((sheet) => {
    const sheetBill = toNumber(sheet.bill_rate) || billRate;
    const sheetPay = toNumber(sheet.pay_rate) || payRate;
    const hours = toNumber(sheet.hours);
    const sheetSpread = computeSpread(sheetBill, sheetPay);
    return {
      weekStarting: sheet.week_starting,
      hours,
      margin: computeWeeklyMargin(sheetSpread, hours),
      status: sheet.status,
    };
  });

  return (
    <article className="talent-desk-row">
      <div className="talent-desk-row-top">
        <h3 className="talent-desk-pair">
          <span className="talent-desk-name">{candidateName}</span>
          <span aria-hidden="true" className="talent-desk-arrow">
            →
          </span>
          <span className="talent-desk-job">{jobLabel || "Untitled job order"}</span>
        </h3>
      </div>

      <p className="talent-desk-badges">
        <span className="talent-desk-badge">Started {placement.start_date ? weekLabel(placement.start_date) : "—"}</span>
        <span className="talent-desk-badge talent-desk-badge-live">Active</span>
        {belowFloor ? (
          <span className="talent-desk-badge talent-desk-badge-flag">Placed below the agency floor</span>
        ) : null}
        {/* Dead-time flag (build review, 2026-08-07): an active placement with
            no hours for the current week is being paid for without billing. */}
        {weeks.some((sheet) => sheet.week_starting === weekStarting) ? null : (
          <span className="talent-desk-badge talent-desk-badge-flag">No hours this week — dead time</span>
        )}
        {recruiterName ? <span className="talent-desk-badge">Recruiter: {recruiterName}</span> : null}
      </p>

      {canManagePlacements ? (
        <RecruiterAssign current={placement.recruiter_id} options={recruiterOptions} placementId={placement.id} />
      ) : null}

      <MatchRateStrip
        belowFloor={belowFloor}
        billRate={billRate}
        hoursPerWeek={hoursPerWeek}
        markupPct={markupPct}
        minSpread={floor}
        payRate={payRate}
        spread={spread}
        weeklyMargin={weeklyMargin}
      />

      <div className="talent-desk-weeks">
        <p className="talent-desk-weeks-head">Recent weeks logged</p>
        {loggedWeeks.length === 0 ? (
          <p className="talent-desk-weeks-none">
            No recent hours have been logged against this placement, so it is contributing nothing to the ledger.
          </p>
        ) : (
          <ul aria-label={`Timesheets logged for ${candidateName}`} className="talent-desk-weeklist">
            {loggedWeeks.map((week) => (
              <li className="talent-desk-week" key={week.weekStarting}>
                <span className="talent-desk-week-key">Week of {weekLabel(week.weekStarting)}</span>
                <span className="talent-desk-week-hours">{formatNumber(week.hours)} hrs</span>
                <span className="talent-desk-week-margin">{formatCurrency(week.margin)} margin</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DeskTimesheetForm
        canPropose={canPropose}
        candidateName={candidateName}
        defaultWeekStarting={weekStarting}
        hoursPlaceholder={hoursPerWeek}
        loggedWeeks={loggedWeeks.map((week) => ({ weekStarting: week.weekStarting, hours: week.hours }))}
        placementId={placement.id}
      />
    </article>
  );
}
