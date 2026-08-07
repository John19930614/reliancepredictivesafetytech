import { clampPercent } from "./format";

/**
 * The fit-score ring.
 *
 * The arc is decoration: the percentage is also printed beside it as text, and
 * the <svg> carries role="img" with a full-sentence label, so the score is
 * never conveyed by the length of a stroke alone.
 *
 * The circle's circumference is normalised to 100 units (r = 15.9155), which is
 * why `stroke-dasharray="{score} 100"` draws exactly that percentage.
 */
export function MatchScoreRing({ score }: { score: number }) {
  const pct = clampPercent(score);
  const band = pct >= 85 ? "strong" : pct >= 70 ? "mid" : "low";

  return (
    <div className="talent-score">
      <svg
        aria-label={`Fit score ${Math.round(pct)} percent`}
        className="talent-score-ring"
        role="img"
        viewBox="0 0 36 36"
      >
        <circle className="talent-score-track" cx="18" cy="18" fill="none" r="15.9155" strokeWidth="4" />
        <circle
          className={`talent-score-arc-${band}`}
          cx="18"
          cy="18"
          fill="none"
          r="15.9155"
          strokeDasharray={`${pct} 100`}
          strokeLinecap="round"
          strokeWidth="4"
          transform="rotate(-90 18 18)"
        />
      </svg>
      <div>
        <div className="talent-score-pct">{Math.round(pct)}%</div>
        <div className="talent-score-label">match</div>
      </div>
    </div>
  );
}
