"use client";

/**
 * The ONLY interactive part of the Talent Engine console.
 *
 * Everything else on /employee/talent-engine is a server component; this island
 * exists so the approval buttons can hold pending state and show an inline
 * error. It imports Server Actions and pure pricing helpers only — no Supabase
 * client ever reaches the browser bundle (CLAUDE.md, security standards).
 *
 * The gate is the point of the module: an operator who cannot approve still
 * SEES the whole card — the bill rate, the pay rate and the spread — because
 * hiding the money from a reviewer would make the review meaningless. What they
 * lose is the ability to commit, and the button says why.
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveMatch,
  counterMatch,
  holdMatch,
  rejectMatch,
  submitMatch,
} from "@/app/employee/talent-engine/actions";
import { validateRateInput } from "@/lib/talent-engine/pricing";
import { formatRate } from "./format";

const noApprovalReason =
  "Approving, rejecting or holding a match is the human gate — your role can review the queue but not commit a decision.";
const noRateReason = "Proposing a pay rate requires rate-setting permission.";

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function firstFieldError(result: ActionResult): string {
  const values = Object.values(result.fieldErrors ?? {});
  return values.length > 0 ? values[0] : "";
}

export function MatchDecisionActions({
  matchId,
  candidateName,
  belowFloor,
  proposedPayRate,
  aiDraft,
  canApprove,
  canSetRate,
}: {
  matchId: string;
  /** Used to keep the button labels distinct for screen readers. */
  candidateName: string;
  /** True when the spread is under the floor — swaps in the counter-offer actions. */
  belowFloor: boolean;
  /** talent_matches.proposed_pay_rate — the counter the Margin Agent drafted. */
  proposedPayRate: number | null;
  /** talent_matches.ai_recommendation, shown in full inside the review panel. */
  aiDraft: string | null;
  canApprove: boolean;
  canSetRate: boolean;
}) {
  const router = useRouter();
  const panelId = useId();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [payRate, setPayRate] = useState(proposedPayRate === null ? "" : String(proposedPayRate));

  function run(action: () => Promise<ActionResult>) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (!result?.ok) {
        setError(result?.error || firstFieldError(result ?? { ok: false }) || "That decision could not be recorded.");
        return;
      }
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  const trimmedNote = () => (note.trim() ? note.trim() : undefined);

  /**
   * Two gates, in order. If the approval lands but the submittal is refused —
   * an unverified required cert is the usual reason — the match really is
   * approved, so the message has to say so rather than reading as a total
   * failure the operator would retry.
   */
  function approveAndSubmit() {
    run(async () => {
      const approved = await approveMatch(matchId, trimmedNote());
      if (!approved.ok) return approved;

      const submitted = await submitMatch(matchId);
      if (submitted.ok) return submitted;
      return {
        ...submitted,
        error: `Approved, but not submitted: ${submitted.error || firstFieldError(submitted) || "the submittal gate refused it."}`,
      };
    });
  }

  function sendCounter(rate: number) {
    run(() => counterMatch(matchId, rate, trimmedNote()));
  }

  function submitEditedTerms() {
    const validation = validateRateInput(payRate);
    if (!validation.ok) {
      setError(validation.reason ?? "Enter a valid pay rate.");
      return;
    }
    sendCounter(Number(payRate));
  }

  const approveTitle = canApprove ? undefined : noApprovalReason;
  const rateTitle = canSetRate ? undefined : noRateReason;
  const counterTitle = !canSetRate
    ? noRateReason
    : proposedPayRate === null
      ? "No counter-offer has been drafted for this match yet."
      : undefined;

  return (
    <div className="talent-actions-shell">
      <div className="talent-actions">
        {belowFloor ? (
          <>
            <button
              aria-label={`Approve the drafted counter-offer for ${candidateName}`}
              className="talent-btn talent-btn-approve"
              disabled={isPending || !canSetRate || proposedPayRate === null}
              onClick={() => sendCounter(proposedPayRate ?? 0)}
              title={counterTitle}
              type="button"
            >
              {proposedPayRate === null ? "Approve counter" : `Approve counter · ${formatRate(proposedPayRate)}`}
            </button>
            <button
              aria-controls={panelId}
              aria-expanded={open}
              aria-label={`Edit the terms proposed for ${candidateName}`}
              className="talent-btn"
              disabled={isPending || !canSetRate}
              onClick={() => setOpen((value) => !value)}
              title={rateTitle}
              type="button"
            >
              Edit terms
            </button>
            <button
              aria-label={`Hold the match for ${candidateName}`}
              className="talent-btn talent-btn-reject"
              disabled={isPending || !canApprove}
              onClick={() => run(() => holdMatch(matchId, trimmedNote()))}
              title={approveTitle}
              type="button"
            >
              Hold
            </button>
          </>
        ) : (
          <>
            <button
              aria-label={`Approve and submit ${candidateName}`}
              className="talent-btn talent-btn-approve"
              disabled={isPending || !canApprove}
              onClick={approveAndSubmit}
              title={approveTitle}
              type="button"
            >
              Approve &amp; Submit
            </button>
            <button
              aria-controls={panelId}
              aria-expanded={open}
              aria-label={`Review the AI draft for ${candidateName}`}
              className="talent-btn"
              disabled={isPending}
              onClick={() => setOpen((value) => !value)}
              type="button"
            >
              Review draft
            </button>
            <button
              aria-label={`Reject ${candidateName}`}
              className="talent-btn talent-btn-reject"
              disabled={isPending || !canApprove}
              onClick={() => run(() => rejectMatch(matchId, trimmedNote()))}
              title={approveTitle}
              type="button"
            >
              Reject
            </button>
          </>
        )}
      </div>

      {open ? (
        <div className="talent-review-panel" id={panelId}>
          <p className="talent-review-heading">AI-drafted submittal</p>
          <p className="talent-review-draft">
            {aiDraft?.trim() ? aiDraft : "The agent has not written a draft for this match yet."}
          </p>

          {belowFloor && canSetRate ? (
            <div className="talent-review-field">
              <label htmlFor={`${panelId}-pay`}>Counter pay rate ($/hr)</label>
              <input
                autoComplete="off"
                disabled={isPending}
                id={`${panelId}-pay`}
                inputMode="decimal"
                onChange={(event) => setPayRate(event.target.value)}
                placeholder="e.g. 66"
                value={payRate}
              />
            </div>
          ) : null}

          <div className="talent-review-field">
            <label htmlFor={`${panelId}-note`}>Reviewer note (optional)</label>
            <textarea
              disabled={isPending}
              id={`${panelId}-note`}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Recorded against this decision in the approval log."
              rows={2}
              value={note}
            />
          </div>

          {belowFloor && canSetRate ? (
            <button
              className="talent-btn talent-btn-approve"
              disabled={isPending}
              onClick={submitEditedTerms}
              type="button"
            >
              {isPending ? "Sending…" : "Send counter"}
            </button>
          ) : (
            <p className="talent-action-hint">
              The note is attached to whichever decision you take above.
            </p>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="talent-action-error" role="alert">
          {error}
        </p>
      ) : null}

      {!canApprove ? <p className="talent-action-hint">{noApprovalReason}</p> : null}
    </div>
  );
}
