"use client";

/**
 * Logging a week of hours against an active placement — the write that turns a
 * spread on paper into margin in the ledger.
 *
 * Server Actions only; no Supabase client and no rate ever leaves this form.
 * `logTimesheet()` takes a placement id, a week and hours, and computes what is
 * billed and paid from the PLACEMENT's stored rates — a browser cannot inflate
 * either side of the spread, and there is deliberately no rate field here.
 *
 * ONE TIMESHEET PER WEEK. The database has `unique (placement_id,
 * week_starting)` and the action treats a repeat as a correction: it overwrites
 * that week rather than adding to it. So the weeks already logged are passed in,
 * and choosing one of them raises a warning BEFORE the click, in the same words
 * as what will actually happen. Anything the action still refuses comes back as
 * an inline error rather than a blank screen.
 */

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Loader2 } from "lucide-react";
import { logTimesheet } from "@/app/employee/talent-engine/actions";
import { validateHoursInput } from "@/lib/talent-engine/pricing";
import { formatNumber } from "./format";

const noProposeReason =
  "Logging hours writes to the margin ledger — your role can see the desk but not record a timesheet.";

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function firstFieldError(result: ActionResult | null | undefined): string {
  const values = Object.values(result?.fieldErrors ?? {});
  return values.length > 0 ? values[0] : "";
}

/** Same shape check the Server Action applies, run early as a courtesy. */
function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === `${year}-${month}-${day}`;
}

export function DeskTimesheetForm({
  placementId,
  candidateName,
  defaultWeekStarting,
  hoursPlaceholder,
  loggedWeeks,
  canPropose,
}: {
  placementId: string;
  /** Used to keep the control labels distinct for screen readers. */
  candidateName: string;
  /** The current ISO Monday, from the server, so the input never hydrates differently. */
  defaultWeekStarting: string;
  /** talent_settings.default_hours_per_week — shown as the placeholder, never pre-filled. */
  hoursPlaceholder: number;
  /** Weeks that already have a timesheet, so a re-entry announces itself as a correction. */
  loggedWeeks: Array<{ weekStarting: string; hours: number }>;
  canPropose: boolean;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [week, setWeek] = useState(defaultWeekStarting);
  const [hours, setHours] = useState("");

  const existing = useMemo(
    () => loggedWeeks.find((entry) => entry.weekStarting === week.trim()) ?? null,
    [loggedWeeks, week],
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved("");

    const chosenWeek = week.trim();
    if (!isCalendarDate(chosenWeek)) {
      setError("Week starting must be a real date (YYYY-MM-DD).");
      return;
    }

    const check = validateHoursInput(hours);
    if (!check.ok) {
      setError(check.reason ?? "Enter the hours worked.");
      return;
    }

    startTransition(async () => {
      const result: ActionResult = await logTimesheet(placementId, chosenWeek, Number(hours));
      if (!result?.ok) {
        setError(result?.error || firstFieldError(result) || "That timesheet could not be logged.");
        return;
      }
      setHours("");
      setSaved(`Logged ${formatNumber(Number(hours))} hrs for the week of ${chosenWeek}.`);
      router.refresh();
    });
  }

  return (
    <form className="talent-intake-form talent-desk-form" onSubmit={handleSubmit}>
      <label className="talent-field" htmlFor={`${fieldId}-week`}>
        <span>Week starting</span>
        <input
          disabled={isPending || !canPropose}
          id={`${fieldId}-week`}
          onChange={(event) => {
            setSaved("");
            setWeek(event.target.value);
          }}
          title={canPropose ? undefined : noProposeReason}
          type="date"
          value={week}
        />
      </label>

      <label className="talent-field" htmlFor={`${fieldId}-hours`}>
        <span>Hours worked</span>
        <input
          autoComplete="off"
          disabled={isPending || !canPropose}
          id={`${fieldId}-hours`}
          inputMode="decimal"
          onChange={(event) => {
            setSaved("");
            setHours(event.target.value);
          }}
          placeholder={`e.g. ${formatNumber(hoursPlaceholder)}`}
          title={canPropose ? undefined : noProposeReason}
          value={hours}
        />
      </label>

      {existing ? (
        <p className="talent-desk-warn">
          The week of {existing.weekStarting} already has {formatNumber(existing.hours)} hrs logged. Saving
          <strong> replaces</strong> that entry — it does not add to it.
        </p>
      ) : null}

      <button
        aria-label={`Log hours for ${candidateName}`}
        className="talent-btn talent-btn-approve talent-intake-submit talent-desk-btn"
        disabled={isPending || !canPropose}
        title={canPropose ? undefined : noProposeReason}
        type="submit"
      >
        {isPending ? <Loader2 aria-hidden="true" className="spin" size={14} /> : <Clock3 aria-hidden="true" size={14} />}
        {isPending ? "Logging…" : existing ? "Correct this week" : "Log hours"}
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

      {!canPropose ? <p className="talent-action-hint talent-field-wide">{noProposeReason}</p> : null}
    </form>
  );
}
