import { formatCurrency, formatNumber, formatPercent, formatRate } from "./format";

/**
 * Bill / Pay / Spread / Wk Margin — the four numbers that decide whether a
 * match is worth submitting.
 *
 * When the spread clears the floor the last two cells are green (money kept).
 * When it does not, both switch to the amber margin-flag variant AND the fourth
 * cell replaces the margin figure with the word "Low" plus the floor it missed
 * — the state is never signalled by colour on its own.
 */
export function MatchRateStrip({
  billRate,
  payRate,
  spread,
  markupPct,
  weeklyMargin,
  hoursPerWeek,
  minSpread,
  belowFloor,
}: {
  billRate: number;
  payRate: number;
  spread: number;
  markupPct: number;
  weeklyMargin: number;
  hoursPerWeek: number;
  /** The floor this match was measured against — the order override or the agency default. */
  minSpread: number;
  belowFloor: boolean;
}) {
  const spreadCellClass = belowFloor ? "talent-rs talent-rs-flag" : "talent-rs talent-rs-spread";
  const marginCellClass = belowFloor ? "talent-rs talent-rs-flag" : "talent-rs talent-rs-spread";

  return (
    <div className={belowFloor ? "talent-ratestrip talent-ratestrip-flagged" : "talent-ratestrip"}>
      <div className="talent-rs">
        <span className="talent-rs-key">Bill</span>
        <span className="talent-rs-value">{formatRate(billRate)}</span>
        <span className="talent-rs-unit">/hr client</span>
      </div>
      <div className="talent-rs">
        <span className="talent-rs-key">Pay</span>
        <span className="talent-rs-value">{formatRate(payRate)}</span>
        <span className="talent-rs-unit">/hr worker</span>
      </div>
      <div className={spreadCellClass}>
        <span className="talent-rs-key">Spread</span>
        <span className="talent-rs-value">{formatRate(spread)}</span>
        <span className="talent-rs-unit">/hr · {formatPercent(markupPct)} mkup</span>
      </div>
      {belowFloor ? (
        <div className={marginCellClass}>
          <span className="talent-rs-key">Margin flag</span>
          <span className="talent-rs-value">Low</span>
          <span className="talent-rs-unit">below {formatRate(minSpread)} min</span>
        </div>
      ) : (
        <div className={marginCellClass}>
          <span className="talent-rs-key">Wk Margin</span>
          <span className="talent-rs-value">{formatCurrency(weeklyMargin)}</span>
          <span className="talent-rs-unit">{formatNumber(hoursPerWeek)} hrs</span>
        </div>
      )}
    </div>
  );
}
