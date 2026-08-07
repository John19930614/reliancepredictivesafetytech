import type { MatchQueueRow } from "@/lib/talent-engine/types";
import { computeMarkupPct, computeSpread, computeWeeklyMargin, meetsSpreadFloor } from "@/lib/talent-engine/pricing";
import { MatchDecisionActions } from "./MatchDecisionActions";
import { MatchRateStrip } from "./MatchRateStrip";
import { MatchScoreRing } from "./MatchScoreRing";
import { formatRate, joinMeta, toNumber } from "./format";

/**
 * One row of the approval queue: who, for what, how well they fit, what the
 * money looks like, what the AI thinks, and the decision.
 *
 * The money is recomputed here from bill_rate and pay_rate rather than read out
 * of the denormalised `spread` / `markup_pct` columns. Those columns exist so
 * SQL can sort on them; if a rate were ever edited without them being rewritten,
 * the operator must see the truth, not the stale copy.
 */
export function MatchCard({
  match,
  minSpread,
  hoursPerWeek,
  canApprove,
  canSetRate,
}: {
  match: MatchQueueRow;
  /** talent_settings.min_spread_per_hour — the agency default floor. */
  minSpread: number;
  /** talent_settings.default_hours_per_week — what a weekly margin is projected over. */
  hoursPerWeek: number;
  canApprove: boolean;
  canSetRate: boolean;
}) {
  const billRate = toNumber(match.bill_rate);
  const payRate = toNumber(match.pay_rate);

  // A job order may override the agency floor for a specific client.
  const floor = match.job_order?.min_spread === null || match.job_order?.min_spread === undefined
    ? minSpread
    : toNumber(match.job_order.min_spread);

  const spread = computeSpread(billRate, payRate);
  const markupPct = computeMarkupPct(billRate, payRate);
  const weeklyMargin = computeWeeklyMargin(spread, hoursPerWeek);
  const belowFloor = !meetsSpreadFloor(billRate, payRate, floor);

  const clientName = match.job_order?.client?.name ?? "Unassigned client";
  const jobLabel = joinMeta([match.job_order?.title, clientName]);

  return (
    <article className={belowFloor ? "talent-match talent-match-flagged" : "talent-match"}>
      <div className="talent-match-top">
        <h3 className="talent-match-pair">
          <span className="talent-match-name">{match.candidate?.full_name ?? "Unnamed candidate"}</span>
          <span aria-hidden="true" className="talent-match-arrow">
            →
          </span>
          <span className="talent-match-job">{jobLabel || "Untitled job order"}</span>
        </h3>
        <MatchScoreRing score={toNumber(match.fit_score)} />
      </div>

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

      <p className={match.ai_recommendation ? "talent-ai-note" : "talent-ai-note talent-ai-note-empty"}>
        <strong>AI recommends:</strong>{" "}
        {match.ai_recommendation
          ? match.ai_recommendation
          : belowFloor
            ? `Spread is ${formatRate(spread)}/hr against a ${formatRate(floor)}/hr floor. No recommendation has been drafted yet.`
            : "No recommendation has been drafted for this match yet."}
      </p>

      <MatchDecisionActions
        aiDraft={match.ai_recommendation}
        belowFloor={belowFloor}
        canApprove={canApprove}
        canSetRate={canSetRate}
        candidateName={match.candidate?.full_name ?? "this candidate"}
        matchId={match.id}
        proposedPayRate={match.proposed_pay_rate === null ? null : toNumber(match.proposed_pay_rate)}
      />
    </article>
  );
}
