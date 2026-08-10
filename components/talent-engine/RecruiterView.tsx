import { BadgeDollarSign } from "lucide-react";
import type { CommissionPlanRow, LedgerRow } from "@/lib/talent-engine/types";
import {
  projectedAnnualComp,
  weeklyCommission,
} from "@/lib/talent-engine/commission";
import { TalentCard, TalentEmpty } from "./TalentCard";
import { formatCompactMoney, formatCurrency, formatNumber } from "./format";

/**
 * The recruiter/doer-seller dashboard pieces (build review, 2026-08-07): the
 * recruiter sees THEIR placements, hours and commission — and none of the
 * company's revenue, spread or margin rollups. Those live on the owner
 * console, which the page renders instead for the oversight tier.
 *
 * The inputs here are already scoped: `rows` is the ledger filtered to
 * placements where recruiter_id = the viewer. Company-wide numbers never
 * reach these components as props, so a markup bug cannot leak them.
 */

interface RecruiterPlanView {
  base_salary: number;
  commission_pct: number;
}

/** Commission on one scoped ledger row. */
function rowCommission(row: LedgerRow, plan: RecruiterPlanView | null): number {
  return weeklyCommission(row.weekly_margin, plan?.commission_pct ?? 0);
}

export function RecruiterKpiRow({
  rows,
  plan,
}: {
  /** The viewer's OWN placements' ledger rows for the settled week. */
  rows: LedgerRow[];
  /** The viewer's own commission plan; null when none is set up yet. */
  plan: Pick<CommissionPlanRow, "base_salary" | "commission_pct"> | null;
}) {
  const hours = rows.reduce((sum, row) => sum + row.hours, 0);
  const commission = rows.reduce((sum, row) => sum + rowCommission(row, plan), 0);

  const tiles: Array<{ key: string; label: string; value: string; note: string; tone?: "money" }> = [
    {
      key: "placements",
      label: "My Placements",
      value: formatNumber(rows.length),
      note: "billing this week",
    },
    {
      key: "hours",
      label: "My Billable Hrs / wk",
      value: formatNumber(hours),
      note: "from this week's timesheets",
    },
    {
      key: "commission",
      label: "My Commission / wk",
      value: formatCurrency(commission),
      note: plan ? `${plan.commission_pct}% of each placement's weekly margin` : "no commission plan yet",
      tone: "money",
    },
    {
      key: "annual",
      label: "Projected Year",
      value: plan ? formatCompactMoney(projectedAnnualComp(plan.base_salary, commission)) : "—",
      note: plan ? "base + this pace of commission" : "ask an owner to set up your plan",
      tone: "money",
    },
  ];

  return (
    <div className="talent-kpis talent-kpis-recruiter">
      {tiles.map((tile) => (
        <article className={tile.tone === "money" ? "talent-kpi talent-kpi-money" : "talent-kpi"} key={tile.key}>
          <h2 className="talent-kpi-label">{tile.label}</h2>
          <p className="talent-kpi-value">{tile.value}</p>
          <p className="talent-kpi-note">{tile.note}</p>
        </article>
      ))}
    </div>
  );
}

export function RecruiterPlacementsCard({
  rows,
  plan,
  weekLabel,
}: {
  rows: LedgerRow[];
  plan: Pick<CommissionPlanRow, "base_salary" | "commission_pct"> | null;
  weekLabel: string;
}) {
  return (
    <TalentCard
      count={rows.length > 0 ? `${rows.length} billing` : null}
      icon={<BadgeDollarSign size={15} />}
      title={`My Desk — ${weekLabel}`}
    >
      {rows.length === 0 ? (
        <TalentEmpty
          hint="Placements credited to you appear here with the hours logged and the commission they add. Log hours on the Placement Desk and this fills in."
          title="No hours on your placements yet"
        />
      ) : (
        <ul className="talent-list">
          {rows.map((row) => (
            <li className="talent-row" key={row.placement_id}>
              <span className="talent-row-main">
                <span className="talent-row-title">{row.candidate_name}</span>
                <span className="talent-row-sub">
                  {row.client_name} · {formatNumber(row.hours)} hrs
                </span>
              </span>
              <span className="talent-row-rate">
                <span className="talent-rate-value">{formatCurrency(rowCommission(row, plan))}</span>
                <span className="talent-rate-unit">my commission</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="talent-action-hint">
        Commission is {plan ? `${plan.commission_pct}%` : "a configurable share"} of each placement&apos;s weekly
        margin, credited as hours are logged. Company revenue and margin live on the owner console.
      </p>
    </TalentCard>
  );
}
