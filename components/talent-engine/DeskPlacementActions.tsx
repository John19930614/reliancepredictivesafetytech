"use client";

/**
 * The post-approval decision island: submit an approved match to the client, or
 * turn a submitted one into a placement.
 *
 * Like every other interactive part of this module it imports Server Actions and
 * nothing else — no Supabase client and no write path reaches the browser bundle
 * (CLAUDE.md: no client-side data mutation).
 *
 * TWO GATES, DELIBERATELY SEPARATE. `createPlacement()` will accept an approved
 * match and walk it through `submitted` itself, but the desk does not offer that
 * shortcut: submitting is telling a client about a person, placing is committing
 * them to the work, and they are different decisions taken by different roles
 * (`canApprove` vs `canManagePlacements`). Splitting them keeps each button
 * honest about what it commits and who may press it.
 *
 * A control the viewer may not use is DISABLED and says why in its title — never
 * hidden. Hiding it would leave an operator staring at a match that seems to
 * have no next step at all, which is the exact failure this page exists to fix.
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, UserCheck } from "lucide-react";
import { createPlacement, submitMatch } from "@/app/employee/talent-engine/actions";

const noApprovalReason =
  "Submitting a candidate to a client is the human gate — your role can see the cleared queue but not commit a submittal.";
const noPlacementReason =
  "Opening a placement is a Tier-3 commitment — it needs placement-management permission, which your role does not carry.";

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function firstFieldError(result: ActionResult | null | undefined): string {
  const values = Object.values(result?.fieldErrors ?? {});
  return values.length > 0 ? values[0] : "";
}

function messageFor(result: ActionResult | null | undefined, fallback: string): string {
  return result?.error || firstFieldError(result) || fallback;
}

/**
 * Rejects a malformed or impossible date before it costs a round trip. The
 * Server Action re-checks with the same rule — this is a courtesy, not the gate.
 */
function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === `${year}-${month}-${day}`;
}

export function DeskPlacementActions({
  matchId,
  candidateName,
  status,
  blockedReason,
  canApprove,
  canManagePlacements,
  defaultStartDate,
}: {
  matchId: string;
  /** Used to keep every button label distinct for screen readers. */
  candidateName: string;
  /** `approved` gets the submittal; `submitted` gets the placement. */
  status: "approved" | "submitted";
  /** Set when the certification gate will refuse the submittal, spelled out. */
  blockedReason: string | null;
  canApprove: boolean;
  canManagePlacements: boolean;
  /** Today as YYYY-MM-DD, from the server, so the input never hydrates differently. */
  defaultStartDate: string;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState(defaultStartDate);

  function run(action: () => Promise<ActionResult>, fallback: string) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (!result?.ok) {
        setError(messageFor(result, fallback));
        return;
      }
      router.refresh();
    });
  }

  if (status === "approved") {
    const blocked = Boolean(blockedReason);
    const submitTitle = !canApprove ? noApprovalReason : (blockedReason ?? undefined);

    return (
      <div className="talent-actions-shell">
        <div className="talent-actions">
          <button
            aria-label={`Submit ${candidateName} to the client`}
            className="talent-btn talent-btn-approve talent-desk-btn"
            disabled={isPending || !canApprove || blocked}
            onClick={() => run(() => submitMatch(matchId), "That submittal could not be recorded.")}
            title={submitTitle}
            type="button"
          >
            {isPending ? (
              <Loader2 aria-hidden="true" className="spin" size={14} />
            ) : (
              <Send aria-hidden="true" size={14} />
            )}
            {isPending ? "Submitting…" : "Submit to client"}
          </button>
        </div>

        {error ? (
          <p className="talent-action-error" role="alert">
            {error}
          </p>
        ) : null}

        {!canApprove ? <p className="talent-action-hint">{noApprovalReason}</p> : null}
        {canApprove && !blocked ? (
          <p className="talent-action-hint">
            Submitting records that this candidate was put in front of the client. The placement is the next step,
            and it is a separate decision.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="talent-actions-shell">
      <div className="talent-desk-startrow">
        <label className="talent-field" htmlFor={`${fieldId}-start`}>
          <span>Start date</span>
          <input
            disabled={isPending || !canManagePlacements}
            id={`${fieldId}-start`}
            onChange={(event) => setStartDate(event.target.value)}
            title={canManagePlacements ? undefined : noPlacementReason}
            type="date"
            value={startDate}
          />
        </label>

        <button
          aria-label={`Open a placement for ${candidateName}`}
          className="talent-btn talent-btn-approve talent-desk-btn"
          disabled={isPending || !canManagePlacements}
          onClick={() => {
            if (!isCalendarDate(startDate)) {
              setError("Start date must be a real date (YYYY-MM-DD).");
              return;
            }
            run(() => createPlacement(matchId, startDate.trim()), "That placement could not be opened.");
          }}
          title={canManagePlacements ? undefined : noPlacementReason}
          type="button"
        >
          {isPending ? (
            <Loader2 aria-hidden="true" className="spin" size={14} />
          ) : (
            <UserCheck aria-hidden="true" size={14} />
          )}
          {isPending ? "Opening…" : "Create placement"}
        </button>
      </div>

      {error ? (
        <p className="talent-action-error" role="alert">
          {error}
        </p>
      ) : null}

      {canManagePlacements ? (
        <p className="talent-action-hint">
          Opening the placement freezes today&apos;s bill and pay rates onto it and moves the match to placed. From
          there the spread is realised one timesheet at a time.
        </p>
      ) : (
        <p className="talent-action-hint">{noPlacementReason}</p>
      )}
    </div>
  );
}
