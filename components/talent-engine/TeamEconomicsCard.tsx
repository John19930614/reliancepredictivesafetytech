import { Users2 } from "lucide-react";
import { recruiterWeekEconomics } from "@/lib/talent-engine/commission";
import type { CommissionPlanRow } from "@/lib/talent-engine/types";
import { TalentCard, TalentEmpty } from "./TalentCard";
import { formatCurrency, formatNumber } from "./format";

export interface TeamEconomicsEntry {
  plan: CommissionPlanRow;
  /** Display name resolved from employee_profiles; falls back upstream. */
  name: string;
  /** Active placements credited to this person. */
  activePlacements: number;
  /** Sum of their placements' weekly margin for the settled ledger week. */
  weeklyMargin: number;
}

/**
 * Owner-only per-person economics (build review, 2026-08-07): what each
 * compensated desk produced this week against what it costs — the number
 * behind "new hires must be revenue-generating" and the utilization warning
 * that the team cannot afford paying people to sit idle.
 */
export function TeamEconomicsCard({ entries }: { entries: TeamEconomicsEntry[] }) {
  return (
    <TalentCard
      count={entries.length > 0 ? `${entries.length} on plan` : null}
      icon={<Users2 size={15} />}
      title="Team Economics"
    >
      {entries.length === 0 ? (
        <TalentEmpty
          hint="Set up a commission plan on the Placement Desk (Money floor card) and each person's margin-vs-cost line appears here."
          title="No commission plans yet"
        />
      ) : (
        <ul className="talent-list">
          {entries.map((entry) => {
            const week = recruiterWeekEconomics(entry.weeklyMargin, entry.plan);
            const covered = week.coverageRatio !== null && week.coverageRatio >= 1;
            return (
              <li className="talent-row talent-row-managed" key={entry.plan.id}>
                <span className="talent-row-line">
                  <span className="talent-row-main">
                    <span className="talent-row-title">
                      {entry.name}
                      {entry.plan.active ? "" : " (inactive)"}
                    </span>
                    <span className="talent-row-sub">
                      {formatNumber(entry.activePlacements)} active · margin {formatCurrency(week.weeklyMargin)}/wk ·
                      commission {formatCurrency(week.commission)} · base {formatCurrency(week.weeklyBase)}/wk
                    </span>
                  </span>
                  <span className="talent-row-rate">
                    <span className="talent-rate-value">{formatCurrency(week.ownerNet)}</span>
                    <span className="talent-rate-unit">
                      {week.coverageRatio === null
                        ? "owner net / wk"
                        : covered
                          ? `covers ${week.coverageRatio}× cost`
                          : `covers ${week.coverageRatio}× — under water`}
                    </span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="talent-action-hint">
        Owner net = the week&apos;s margin minus that person&apos;s commission and one week of base salary. Under 1×
        coverage, the desk is not yet paying for itself.
      </p>
    </TalentCard>
  );
}
