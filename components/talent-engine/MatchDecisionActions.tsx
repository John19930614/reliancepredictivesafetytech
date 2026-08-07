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

import { useEffect, useId, useRef, useState, useTransition, type CSSProperties } from "react";
import { createRoot, type Root } from "react-dom/client";
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

/**
 * Where an approved-but-unsubmitted match goes to be finished. Referenced by
 * href only — nothing here imports from that route, so the two can ship
 * independently.
 */
const placementDeskHref = "/employee/talent-engine/desk";

/** A Server Action that throws tells us nothing about whether it was applied. */
const unreachableMessage =
  "The server did not answer, so this decision may or may not have been recorded. Reload the queue before trying again.";
const submitUnreachableMessage =
  "the server did not answer, so it is not known whether the submittal went out. Check the Placement Desk before retrying.";
const submitRefusedMessage = "the submittal gate refused it.";

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

/* -------------------------------------------------------------------------- */
/* The "approved, not submitted" banner                                       */
/*                                                                            */
/* WHY THIS IS NOT PART OF THE CARD.                                          */
/*                                                                            */
/* `approveMatch()` ends with `revalidatePath("/employee/talent-engine")`.    */
/* Next applies the resulting RSC payload to the open page as soon as the      */
/* action resolves — we do not call `router.refresh()` on a failure and never  */
/* did, so withholding it changes nothing. The moment the approval lands, the  */
/* match is `approved`, the queue query selects only `pending_approval` and    */
/* `counter_proposed`, and THIS COMPONENT UNMOUNTS. That is true of a clean    */
/* success and of a refused submittal alike.                                   */
/*                                                                            */
/* So a message about what happened after the approval cannot live in this     */
/* component's state, in a portal it owns, or in a dialog it renders: all      */
/* three die with it. Production proved that — the operator saw a card vanish  */
/* and nothing else, and believed a candidate had gone to a client.            */
/*                                                                            */
/* It therefore lives in its own React root, hung off <body>, owned by this    */
/* module rather than by any card. Nothing the queue re-render does can reach  */
/* it, and it clears only when a human presses Dismiss.                        */
/*                                                                            */
/* Rejected alternatives:                                                      */
/*   * Hold the transition open until the operator acknowledges. Under React   */
/*     19 an update scheduled after an `await` inside `startTransition` is     */
/*     part of that transition, so the acknowledge button would not render     */
/*     until the transition it is meant to end had already ended. Deadlock.    */
/*   * Don't refresh on partial success and re-render the card as "approved,   */
/*     not submitted". The refresh is not ours to withhold (see above).        */
/*   * Lift the message into the page or a provider above the queue. Correct   */
/*     in principle, but that surface is owned by other work in flight; this   */
/*     is reachable from the one file that has the outcome in its hands.       */
/* -------------------------------------------------------------------------- */

interface PartialOutcome {
  candidateName: string;
  /** The server's own words for why the submittal was refused. */
  reason: string;
}

/** Positioning only — every colour comes from `.talent-action-error`. */
const bannerFrame: CSSProperties = {
  position: "fixed",
  zIndex: 90,
  left: 16,
  right: 16,
  bottom: 16,
  display: "grid",
  gap: 8,
  marginInline: "auto",
  maxWidth: 560,
  padding: "12px 14px",
  boxShadow: "0 12px 32px rgba(15, 23, 42, 0.22)",
};

const bannerHostId = "talent-partial-outcome-banner";

let bannerHost: HTMLElement | null = null;
let bannerRoot: Root | null = null;

function ensureBannerRoot(): Root | null {
  if (typeof document === "undefined") return null;
  // A host that has been torn out from under us (a hard navigation, a test
  // resetting the document) must not be reused — its root is dead.
  if (bannerHost && !bannerHost.isConnected) {
    bannerHost = null;
    bannerRoot = null;
  }
  if (!bannerRoot) {
    bannerHost = document.createElement("div");
    bannerHost.id = bannerHostId;
    document.body.appendChild(bannerHost);
    bannerRoot = createRoot(bannerHost);
  }
  return bannerRoot;
}

/**
 * Clears the banner. Exported because it is the Dismiss handler and because a
 * test that renders one has to be able to put the document back.
 */
export function dismissPartialSubmittalBanner(): void {
  bannerRoot?.render(null);
}

/**
 * Announces an approval that was NOT submitted, outside this card's tree so
 * the queue re-render that removes the card cannot destroy it.
 */
export function announcePartialSubmittal(outcome: PartialOutcome): void {
  ensureBannerRoot()?.render(<PartialSubmittalBanner outcome={outcome} />);
}

function PartialSubmittalBanner({ outcome }: { outcome: PartialOutcome }) {
  const frame = useRef<HTMLDivElement | null>(null);

  // The card that had focus is on its way out of the DOM, so focus would
  // otherwise fall to <body> and a keyboard operator would have nothing to
  // read. `role="alert"` announces it; this puts the caret on it as well.
  useEffect(() => {
    frame.current?.focus();
  }, []);

  return (
    <div className="talent-action-error" ref={frame} role="alert" style={bannerFrame} tabIndex={-1}>
      <p>
        <strong>Approved — but NOT submitted.</strong> The approval for {outcome.candidateName} is on the
        record. The submittal to the client was refused, so nothing has been sent: {outcome.reason}
      </p>
      <p>
        The match is now on the Placement Desk as approved, not submitted. Clear what is missing there and
        retry the submittal — until you do, the client has not seen this candidate.
      </p>
      <div className="talent-actions">
        <a className="talent-btn" href={placementDeskHref}>
          Open the Placement Desk
        </a>
        <button className="talent-btn" onClick={dismissPartialSubmittalBanner} type="button">
          Dismiss
        </button>
      </div>
    </div>
  );
}

/** The same news, inline, for the case where this card does outlive the action. */
function inlinePartialMessage(candidateName: string, reason: string): string {
  return `Approved — but NOT submitted. The approval for ${candidateName} is on the record; the submittal to the client was refused, so nothing has been sent: ${reason} Finish it on the Placement Desk (${placementDeskHref}).`;
}

/* -------------------------------------------------------------------------- */

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
      let result: ActionResult | null;
      try {
        result = await action();
      } catch {
        // A Server Action that THROWS rejects this transition's promise. Without
        // this catch React swallows it, the spinner stops and the operator is
        // told nothing at all — the same silent shape as the bug above.
        setError(unreachableMessage);
        return;
      }
      if (!result?.ok) {
        setError(messageFor(result, "That decision could not be recorded."));
        return;
      }
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  const trimmedNote = () => (note.trim() ? note.trim() : undefined);

  /**
   * Two gates, in order — and two different kinds of bad news.
   *
   * If the APPROVAL is refused nothing happened, the card survives (the action
   * returns before it revalidates) and the inline error is the right place.
   *
   * If the approval lands and the SUBMITTAL is refused — an unverified required
   * cert is the usual reason — the match really is approved and this card is
   * already being removed from the queue. The operator has to be told, in words
   * that separate the two steps, somewhere the removal cannot reach: see the
   * banner note above. It is never reported as a success and never auto-clears.
   */
  function approveAndSubmit() {
    setError("");
    startTransition(async () => {
      let approved: ActionResult | null;
      try {
        approved = await approveMatch(matchId, trimmedNote());
      } catch {
        setError(unreachableMessage);
        return;
      }
      if (!approved?.ok) {
        setError(messageFor(approved, "That approval could not be recorded."));
        return;
      }

      // Past this line the approval is committed and revalidated. Whatever
      // happens next, this component is on its way out.
      let submitted: ActionResult | null = null;
      let threw = false;
      try {
        submitted = await submitMatch(matchId);
      } catch {
        threw = true;
      }

      if (submitted?.ok) {
        setOpen(false);
        setNote("");
        router.refresh();
        return;
      }

      const reason = threw ? submitUnreachableMessage : messageFor(submitted, submitRefusedMessage);
      announcePartialSubmittal({ candidateName, reason });
      setError(inlinePartialMessage(candidateName, reason));
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
