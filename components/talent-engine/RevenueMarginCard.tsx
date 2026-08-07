import { TrendingUp } from "lucide-react";
import type { TalentConsoleSummary } from "@/lib/talent-engine/types";
import { TalentCard } from "./TalentCard";
import { clampPercent, formatCompactMoney, formatPercent } from "./format";

/**
 * The week in three numbers: what the clients are billed, what the workers are
 * paid, and the difference — which is the business.
 *
 * The donut is an inline SVG ring (no chart library). Its arc is decorative:
 * the percentage it represents is printed in the middle of it and repeated in
 * the breakdown beside it, and the <svg> is aria-hidden precisely because the
 * text already carries the value.
 */
export function RevenueMarginCard({ summary }: { summary: TalentConsoleSummary }) {
  const marginPct = clampPercent(summary.grossMarginPct);
  const hasBillings = summary.clientBillings > 0;

  return (
    <TalentCard icon={<TrendingUp size={15} />} title="Revenue & Margin (weekly)">
      <div className="talent-rev">
        <div className="talent-donut">
          <svg aria-hidden="true" focusable="false" height="110" viewBox="0 0 36 36" width="110">
            <circle className="talent-donut-track" cx="18" cy="18" fill="none" r="15.9155" strokeWidth="4.2" />
            <circle
              className="talent-donut-arc"
              cx="18"
              cy="18"
              fill="none"
              r="15.9155"
              strokeDasharray={`${marginPct} 100`}
              strokeLinecap="round"
              strokeWidth="4.2"
              transform="rotate(-90 18 18)"
            />
          </svg>
          <p className="talent-donut-center">
            <strong>{formatPercent(summary.grossMarginPct)}</strong>
            <span>gross margin</span>
          </p>
        </div>

        <div className="talent-rev-list">
          <p className="talent-rev-row">
            <span>
              <span aria-hidden="true" className="talent-rev-swatch talent-rev-swatch-billings" />
              Client billings
            </span>
            <strong>{formatCompactMoney(summary.clientBillings)}</strong>
          </p>
          <p className="talent-rev-row">
            <span>
              <span aria-hidden="true" className="talent-rev-swatch talent-rev-swatch-pay" />
              Worker pay
            </span>
            <strong>{formatCompactMoney(summary.workerPay)}</strong>
          </p>
          <p className="talent-rev-row">
            <span>
              <span aria-hidden="true" className="talent-rev-swatch talent-rev-swatch-margin" />
              Your gross margin
            </span>
            <strong>{formatCompactMoney(summary.weeklyGrossMargin)}</strong>
          </p>
          <p className="talent-rev-row talent-rev-row-muted">
            <span>Avg markup on pay</span>
            <strong>{formatPercent(summary.avgMarkupPct)}</strong>
          </p>
        </div>
      </div>

      {hasBillings ? null : (
        <p className="talent-action-hint" style={{ marginTop: 12 }}>
          Nothing has been billed this week yet, so every figure above is zero rather than a projection.
        </p>
      )}
    </TalentCard>
  );
}
