import { TimerOff } from "lucide-react";
import type { DeadTimeFlag } from "@/lib/talent-engine/utilization";
import { TalentCard, TalentEmpty } from "./TalentCard";
import { formatNumber, formatPercent } from "./format";

/**
 * Owner-side dead-time watchlist (build review, 2026-08-07): active placements
 * whose settled ledger week is missing hours. "The team cannot afford to pay
 * people to sit idle" — so an active placement with no billable hours is a
 * flag, not a quiet zero inside the margin rollup.
 */
export function UtilizationCard({
  flags,
  pct,
  weekLabel,
}: {
  flags: DeadTimeFlag[];
  /** Overall logged/expected utilization for the settled week; null = nothing to measure. */
  pct: number | null;
  weekLabel: string;
}) {
  return (
    <TalentCard
      count={pct === null ? null : `${formatPercent(pct)} utilized`}
      icon={<TimerOff size={15} />}
      title={`Dead Time — ${weekLabel}`}
    >
      {flags.length === 0 ? (
        <TalentEmpty
          hint="Every active placement has a full week of logged hours. A placement running under its expected hours will be flagged here."
          title="No unbilled time"
        />
      ) : (
        <ul className="talent-list">
          {flags.map((flag) => (
            <li className="talent-row" key={flag.placement_id}>
              <span className="talent-row-main">
                <span className="talent-row-title">{flag.candidate_name}</span>
                <span className="talent-row-sub">
                  {flag.client_name} ·{" "}
                  {flag.kind === "no_hours"
                    ? "no hours logged"
                    : `${formatNumber(flag.logged_hours)} of ${formatNumber(flag.expected_hours)} hrs`}
                </span>
              </span>
              <span className="talent-row-rate">
                <span className="talent-rate-value">−{formatNumber(flag.deficit_hours)}</span>
                <span className="talent-rate-unit">unbilled hrs</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="talent-action-hint">
        Hours are logged on the Placement Desk. Dead time is measured against the agency&apos;s default week — a
        placement legitimately part-time can have its hours logged as such and will read short here by design.
      </p>
    </TalentCard>
  );
}
