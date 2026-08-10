"use client";

/**
 * The owner's break-even model (build review, 2026-08-07): "a financial model
 * that solves salary vs. required placements/hours to break even, with
 * configurable base, spread, and hours."
 *
 * Pure client-side arithmetic through lib/talent-engine/commission.ts — no
 * Server Action, nothing stored. The defaults arrive from talent_settings so
 * the model opens on the agency's real floor numbers.
 */

import { useId, useState } from "react";
import { Calculator } from "lucide-react";
import { solveBreakEven, defaultCommissionPct } from "@/lib/talent-engine/commission";
import { TalentCard } from "./TalentCard";
import { formatCurrency, formatNumber } from "./format";

function toNumber(value: string, fallback = 0): number {
  const n = Number(value.trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function BreakEvenPanel({
  defaultSpread,
  defaultHours,
}: {
  /** talent_settings.min_spread_per_hour — the conservative spread to model on. */
  defaultSpread: number;
  /** talent_settings.default_hours_per_week. */
  defaultHours: number;
}) {
  const fieldId = useId();
  // The meeting's discussion range was $52K-$75K; open on the middle case.
  const [base, setBase] = useState("70000");
  const [spread, setSpread] = useState(String(defaultSpread));
  const [hours, setHours] = useState(String(defaultHours));
  const [pct, setPct] = useState(String(defaultCommissionPct));

  const result = solveBreakEven({
    baseSalary: toNumber(base),
    spreadPerHour: toNumber(spread),
    hoursPerWeek: toNumber(hours),
    commissionPct: toNumber(pct),
  });

  return (
    <TalentCard icon={<Calculator size={15} />} title="Break-Even Model">
      <form className="talent-intake-form talent-desk-form" onSubmit={(event) => event.preventDefault()}>
        <label className="talent-field" htmlFor={`${fieldId}-base`}>
          <span>Base salary $/yr</span>
          <input
            id={`${fieldId}-base`}
            inputMode="decimal"
            onChange={(event) => setBase(event.target.value)}
            value={base}
          />
        </label>
        <label className="talent-field" htmlFor={`${fieldId}-spread`}>
          <span>Spread $/hr</span>
          <input
            id={`${fieldId}-spread`}
            inputMode="decimal"
            onChange={(event) => setSpread(event.target.value)}
            value={spread}
          />
        </label>
        <label className="talent-field" htmlFor={`${fieldId}-hours`}>
          <span>Hours / wk</span>
          <input
            id={`${fieldId}-hours`}
            inputMode="decimal"
            onChange={(event) => setHours(event.target.value)}
            value={hours}
          />
        </label>
        <label className="talent-field" htmlFor={`${fieldId}-pct`}>
          <span>Commission %</span>
          <input
            id={`${fieldId}-pct`}
            inputMode="decimal"
            onChange={(event) => setPct(event.target.value)}
            value={pct}
          />
        </label>
      </form>

      <div className="talent-breakeven-result">
        <p>
          One week of that salary costs <strong>{formatCurrency(result.weeklyCost)}</strong>. A placement at this spread
          produces <strong>{formatCurrency(result.marginPerPlacement)}</strong>/wk, of which the house keeps{" "}
          <strong>{formatCurrency(result.ownerSharePerPlacement)}</strong> after commission.
        </p>
        <p className="talent-breakeven-answer">
          {result.placementsNeeded === null ? (
            <>These inputs never break even — there is no retained margin per placement.</>
          ) : result.placementsNeeded === 0 ? (
            <>No salary to cover — every placement is margin from the first hour.</>
          ) : (
            <>
              Break-even: <strong>{formatNumber(result.placementsNeeded)}</strong>{" "}
              {result.placementsNeeded === 1 ? "placement" : "placements"} at{" "}
              {formatNumber(toNumber(hours))} hrs/wk ({formatNumber(result.hoursNeeded ?? 0)} billable hours a week).
            </>
          )}
        </p>
      </div>
    </TalentCard>
  );
}
