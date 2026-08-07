import type { TalentConsoleSummary } from "@/lib/talent-engine/types";
import { formatCompactMoney, formatNumber, formatPercent, formatRate } from "./format";

/**
 * The six-tile KPI strip. The two money tiles (Avg Spread, Weekly Gross Margin)
 * and the Pending Approval tile carry accent treatments, because those are the
 * three numbers the operator is actually running the business on: what each
 * hour is worth, what the week is worth, and how much of it is sitting on their
 * desk unapproved.
 */
export function TalentKpiRow({
  summary,
  minSpread,
}: {
  summary: TalentConsoleSummary;
  /** talent_settings.min_spread_per_hour — the floor the avg spread is read against. */
  minSpread: number;
}) {
  const tiles: Array<{ key: string; label: string; value: string; note: string; tone?: "money" | "gate" }> = [
    {
      key: "placements",
      label: "Active Placements",
      value: formatNumber(summary.activePlacements),
      note: "billing this week",
    },
    {
      key: "hours",
      label: "Billable Hrs / wk",
      value: formatNumber(summary.billableHours),
      note: "from this week's timesheets",
    },
    {
      key: "spread",
      label: "Avg Spread / hr",
      value: formatRate(summary.avgSpreadPerHour),
      note: `${formatRate(minSpread)} minimum floor`,
      tone: "money",
    },
    {
      key: "margin",
      label: "Weekly Gross Margin",
      value: formatCompactMoney(summary.weeklyGrossMargin),
      note: `${formatPercent(summary.grossMarginPct)} gross margin`,
      tone: "money",
    },
    {
      key: "runrate",
      label: "Revenue Run-Rate",
      value: formatCompactMoney(summary.revenueRunRate),
      note: "annualized client billings",
    },
    {
      key: "pending",
      label: "Pending Approval",
      value: formatNumber(summary.pendingApprovals),
      note: "AI drafted · needs sign-off",
      tone: "gate",
    },
  ];

  return (
    <div className="talent-kpis">
      {tiles.map((tile) => (
        <article
          className={
            tile.tone === "money"
              ? "talent-kpi talent-kpi-money"
              : tile.tone === "gate"
                ? "talent-kpi talent-kpi-gate"
                : "talent-kpi"
          }
          key={tile.key}
        >
          <h2 className="talent-kpi-label">{tile.label}</h2>
          <p className="talent-kpi-value">{tile.value}</p>
          <p className="talent-kpi-note">{tile.note}</p>
        </article>
      ))}
    </div>
  );
}
