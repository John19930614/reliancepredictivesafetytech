"use client";

/**
 * The agency money floor — admin-only, and the most consequential form in the
 * module.
 *
 * `min_spread_per_hour` is the number every floor check, every drafted
 * counter-offer and every submittal block in the EHS Talent Engine is measured
 * against. Lowering it does not re-price anything already approved — the spread
 * on an approved match is the record of what a human signed off — but it
 * changes the verdict on every match priced from here on. The panel says so in
 * as many words, because a field that quietly re-prices a pipeline is a field
 * that gets changed casually.
 *
 * Server Actions only (CLAUDE.md: no client-side data mutation).
 * `updateTalentSettings()` re-checks `isAdmin` on the server and re-validates
 * every field; the checks below exist to answer the operator faster, not to be
 * the gate. The panel is rendered only for an admin, so nothing here is
 * disabled — the enforcement that matters is on the other side of the call.
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { updateTalentSettings } from "@/app/employee/talent-engine/actions";
import { validateHoursInput, validateRateInput } from "@/lib/talent-engine/pricing";
import {
  talentAutonomyTierLabels,
  talentAutonomyTiers,
  type TalentAutonomyTier,
} from "@/lib/talent-engine/types";
import { formatRate } from "./format";

/** Matches the `maxMarkupPct` bound the Server Action validates against. */
const maxMarkupPct = 1000;

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function firstFieldError(result: ActionResult | null | undefined): string {
  const values = Object.values(result?.fieldErrors ?? {});
  return values.length > 0 ? values[0] : "";
}

function toTier(value: string): TalentAutonomyTier {
  const tier = Number(value);
  return (talentAutonomyTiers as readonly number[]).includes(tier) ? (tier as TalentAutonomyTier) : 2;
}

export function DeskSettingsPanel({
  minSpreadPerHour,
  targetMarkupPct,
  defaultHoursPerWeek,
  payRateAutonomyTier,
}: {
  minSpreadPerHour: number;
  targetMarkupPct: number;
  defaultHoursPerWeek: number;
  payRateAutonomyTier: TalentAutonomyTier;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [minSpread, setMinSpread] = useState(String(minSpreadPerHour));
  const [markup, setMarkup] = useState(String(targetMarkupPct));
  const [hours, setHours] = useState(String(defaultHoursPerWeek));
  const [tier, setTier] = useState<TalentAutonomyTier>(payRateAutonomyTier);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved("");

    const spreadCheck = validateRateInput(minSpread);
    if (!spreadCheck.ok) {
      setError(spreadCheck.reason ?? "Enter a valid spread floor.");
      return;
    }

    const markupValue = Number(markup.trim());
    if (!Number.isFinite(markupValue) || markupValue < 0 || markupValue > maxMarkupPct) {
      setError(`Target markup must be between 0 and ${maxMarkupPct}%.`);
      return;
    }

    const hoursCheck = validateHoursInput(hours);
    if (!hoursCheck.ok) {
      setError(hoursCheck.reason ?? "Enter valid weekly hours.");
      return;
    }
    if (Number(hours.trim()) <= 0) {
      setError("Default weekly hours must be greater than zero.");
      return;
    }

    startTransition(async () => {
      const result: ActionResult = await updateTalentSettings({
        minSpreadPerHour: Number(minSpread.trim()),
        targetMarkupPct: markupValue,
        defaultHoursPerWeek: Number(hours.trim()),
        payRateAutonomyTier: tier,
      });
      if (!result?.ok) {
        setError(result?.error || firstFieldError(result) || "The settings could not be saved.");
        return;
      }
      setSaved(`Saved. Every match priced from now on is measured against a ${formatRate(minSpread)}/hr floor.`);
      router.refresh();
    });
  }

  return (
    <div className="talent-desk-settings">
      <p className="talent-desk-settings-note">
        This is the agency floor. From the moment you save it, every match the engine prices, every counter-offer the
        Margin Agent drafts and every submittal check is measured against these numbers. Matches already approved keep
        the spread they were signed off at — an approval is a record of a decision, not a live calculation.
      </p>

      <form className="talent-intake-form talent-desk-form" onSubmit={handleSubmit}>
        <label className="talent-field" htmlFor={`${fieldId}-spread`}>
          <span>Min spread $/hr</span>
          <input
            autoComplete="off"
            disabled={isPending}
            id={`${fieldId}-spread`}
            inputMode="decimal"
            onChange={(event) => setMinSpread(event.target.value)}
            placeholder="e.g. 20"
            value={minSpread}
          />
        </label>

        <label className="talent-field" htmlFor={`${fieldId}-markup`}>
          <span>Target markup %</span>
          <input
            autoComplete="off"
            disabled={isPending}
            id={`${fieldId}-markup`}
            inputMode="decimal"
            onChange={(event) => setMarkup(event.target.value)}
            placeholder="e.g. 33"
            value={markup}
          />
        </label>

        <label className="talent-field" htmlFor={`${fieldId}-hours`}>
          <span>Default hrs / week</span>
          <input
            autoComplete="off"
            disabled={isPending}
            id={`${fieldId}-hours`}
            inputMode="decimal"
            onChange={(event) => setHours(event.target.value)}
            placeholder="e.g. 40"
            value={hours}
          />
        </label>

        <label className="talent-field" htmlFor={`${fieldId}-tier`}>
          <span>Pay-rate autonomy</span>
          <select
            disabled={isPending}
            id={`${fieldId}-tier`}
            onChange={(event) => setTier(toTier(event.target.value))}
            value={String(tier)}
          >
            {talentAutonomyTiers.map((value) => (
              <option key={value} value={String(value)}>
                Tier {value} · {talentAutonomyTierLabels[value]}
              </option>
            ))}
          </select>
        </label>

        <button
          className="talent-btn talent-btn-approve talent-intake-submit talent-desk-btn"
          disabled={isPending}
          type="submit"
        >
          {isPending ? <Loader2 aria-hidden="true" className="spin" size={14} /> : <Save aria-hidden="true" size={14} />}
          {isPending ? "Saving…" : "Save the floor"}
        </button>

        {error ? (
          <p className="talent-intake-error" role="alert">
            {error}
          </p>
        ) : null}

        {saved && !error ? (
          <p className="talent-desk-saved" role="status">
            {saved}
          </p>
        ) : null}
      </form>
    </div>
  );
}
