import type { MatchQueueRow } from "@/lib/talent-engine/types";
import { computeMarkupPct, computeSpread, computeWeeklyMargin, meetsSpreadFloor } from "@/lib/talent-engine/pricing";
import { DeskPlacementActions } from "./DeskPlacementActions";
import { MatchRateStrip } from "./MatchRateStrip";
import { formatRate, joinMeta, toNumber } from "./format";

/**
 * One match that a human has already cleared — `approved` or `submitted` — and
 * that is not a placement yet.
 *
 * Server component: it renders markup and hands the two buttons to the small
 * client island at the bottom.
 *
 * THIS CARD IS THE MISSING VISIBILITY. Before the desk existed, approving a
 * match removed it from the console's queue and put it on no other screen, so
 * an approved candidate simply vanished — including one whose submittal had
 * been refused by the certification gate. Both states are shown here, the
 * blocker is named in words rather than implied by a greyed-out button, and the
 * submittal stays retryable.
 *
 * The money is recomputed from bill_rate and pay_rate rather than read out of
 * the denormalised `spread` / `markup_pct` columns, for the same reason
 * MatchCard does it: those columns are a sort key, not the truth.
 */
export function DeskClearedMatch({
  match,
  minSpread,
  hoursPerWeek,
  missingCerts,
  canApprove,
  canManagePlacements,
  today,
}: {
  match: MatchQueueRow;
  /** talent_settings.min_spread_per_hour — the agency default floor. */
  minSpread: number;
  /** talent_settings.default_hours_per_week — what a weekly margin is projected over. */
  hoursPerWeek: number;
  /**
   * Required certifications with no verified counterpart, from
   * missingRequiredCerts() in lib/talent-engine/policy.ts. Non-empty means the
   * submittal gate in the Server Action will refuse this match.
   */
  missingCerts: string[];
  canApprove: boolean;
  canManagePlacements: boolean;
  /** Today as YYYY-MM-DD, computed once on the server so every card agrees. */
  today: string;
}) {
  const billRate = toNumber(match.bill_rate);
  const payRate = toNumber(match.pay_rate);

  // A job order may override the agency floor for a specific client.
  const floor =
    match.job_order?.min_spread === null || match.job_order?.min_spread === undefined
      ? minSpread
      : toNumber(match.job_order.min_spread);

  const spread = computeSpread(billRate, payRate);
  const markupPct = computeMarkupPct(billRate, payRate);
  const weeklyMargin = computeWeeklyMargin(spread, hoursPerWeek);
  const belowFloor = !meetsSpreadFloor(billRate, payRate, floor);

  const candidateName = match.candidate?.full_name ?? "Unnamed candidate";
  const clientName = match.job_order?.client?.name ?? "Unassigned client";
  const jobLabel = joinMeta([match.job_order?.title, clientName]);
  const isApproved = match.status === "approved";
  const blocked = isApproved && missingCerts.length > 0;

  return (
    <article className={blocked ? "talent-desk-row talent-desk-row-blocked" : "talent-desk-row"}>
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
        <span className="talent-desk-badge talent-desk-badge-status">
          {isApproved ? "Approved · not yet submitted" : "Submitted · awaiting placement"}
        </span>
        {belowFloor ? (
          <span className="talent-desk-badge talent-desk-badge-flag">
            Below the {formatRate(floor)} floor · approved as an exception
          </span>
        ) : null}
      </p>

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

      {blocked ? (
        <p className="talent-desk-block">
          <strong>Submittal blocked.</strong> {missingCerts.join(", ")}{" "}
          {missingCerts.length === 1 ? "is" : "are"} required by &ldquo;{match.job_order?.title ?? "this job order"}
          &rdquo; and {missingCerts.length === 1 ? "has" : "have"} not been verified on {candidateName}. Verify the
          certification from the console&apos;s talent pool and the submittal will go through — an approval does not
          override the certification gate.
        </p>
      ) : null}

      <DeskPlacementActions
        blockedReason={
          blocked
            ? `Submittal is blocked: ${missingCerts.join(", ")} ${missingCerts.length === 1 ? "is" : "are"} required by this job order and has not been verified.`
            : null
        }
        canApprove={canApprove}
        canManagePlacements={canManagePlacements}
        candidateName={candidateName}
        defaultStartDate={today}
        matchId={match.id}
        status={isApproved ? "approved" : "submitted"}
      />
    </article>
  );
}
