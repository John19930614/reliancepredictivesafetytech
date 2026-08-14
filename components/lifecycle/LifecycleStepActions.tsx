"use client";

// The three controls in the lifecycle header: Exit Path, Skip to Step, and the
// single primary Next Step.
//
// Next Step is the only primary action on the screen, deliberately. The board
// this replaces let a deal be dropped anywhere, which meant the interface never
// had an opinion about what should happen next. Here the opinion is the button,
// and everything else — jumping, reversing, leaving — is a named exception that
// has to be justified in writing.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, RotateCcw } from "lucide-react";
import {
  advanceOpportunity,
  exitOpportunity,
  reopenOpportunity,
  skipOpportunityToStep,
} from "@/app/employee/lifecycle/actions";
import { lifecycleExits } from "@/lib/lifecycle/exits";
import { lifecycleSteps } from "@/lib/lifecycle/steps";

interface LifecycleStepActionsProps {
  opportunityId: string;
  currentStepKey: string;
  status: string;
  /** Null at the final step. */
  nextStepLabel: string | null;
  advanceLabel: string;
  canAdvance: boolean;
  canSkip: boolean;
  canExit: boolean;
  canReopen: boolean;
  /** Where "View Client Record" points once the deal is onboarded. */
  clientHref: string | null;
}

type OpenPanel = "none" | "exit" | "skip" | "reopen";

export function LifecycleStepActions({
  opportunityId,
  currentStepKey,
  status,
  nextStepLabel,
  advanceLabel,
  canAdvance,
  canSkip,
  canExit,
  canReopen,
  clientHref,
}: LifecycleStepActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<OpenPanel>("none");

  const [exitStatus, setExitStatus] = useState(lifecycleExits[0].status as string);
  const [exitReason, setExitReason] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [holdUntil, setHoldUntil] = useState("");
  const [skipStep, setSkipStep] = useState(currentStepKey);
  const [skipReason, setSkipReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const closed = status !== "open";
  const chosenExit = lifecycleExits.find((exit) => exit.status === exitStatus) ?? lifecycleExits[0];

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setPanel("none");
          setExitReason("");
          setSkipReason("");
          setReopenReason("");
          router.refresh();
        } else {
          setError(result.error ?? "Could not complete that.");
        }
      } catch {
        setError("Something went wrong reaching the server. Try again in a moment.");
      }
    });
  }

  return (
    <div className="lc-actions-wrap">
      <div className="lc-head-actions">
        {closed ? (
          canReopen ? (
            <button
              className="lc-btn"
              disabled={pending}
              onClick={() => setPanel(panel === "reopen" ? "none" : "reopen")}
              type="button"
            >
              <RotateCcw size={14} /> Reopen
            </button>
          ) : null
        ) : (
          <>
            <button
              className="lc-btn"
              disabled={pending || !canExit}
              onClick={() => setPanel(panel === "exit" ? "none" : "exit")}
              title={canExit ? undefined : "Your role cannot close opportunities."}
              type="button"
            >
              Exit Path <ChevronDown size={14} />
            </button>

            <button
              className="lc-btn"
              disabled={pending || !canSkip}
              onClick={() => setPanel(panel === "skip" ? "none" : "skip")}
              title={canSkip ? undefined : "Admin role required to skip or reverse steps."}
              type="button"
            >
              Skip to Step <ChevronDown size={14} />
            </button>
          </>
        )}

        {/* At the final step the lifecycle is done, so the primary action stops
            being "move on" and becomes the handover to the client record. */}
        {!nextStepLabel && clientHref ? (
          <a className="lc-btn lc-btn-primary" href={clientHref}>
            View Client Record <ArrowRight size={15} />
          </a>
        ) : nextStepLabel ? (
          <button
            className="lc-btn lc-btn-primary"
            disabled={pending || closed || !canAdvance}
            onClick={() => run(() => advanceOpportunity(opportunityId))}
            title={
              closed
                ? "This opportunity has left the lifecycle."
                : canAdvance
                  ? undefined
                  : "Your role cannot move opportunities."
            }
            type="button"
          >
            {advanceLabel || `Move to ${nextStepLabel}`} <ArrowRight size={15} />
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="lc-error" role="alert">
          {error}
        </p>
      ) : null}

      {panel === "exit" ? (
        <form
          className="lc-panel-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(() =>
              exitOpportunity(opportunityId, {
                status: exitStatus,
                reason: exitReason,
                competitor: chosenExit.capturesCompetitor ? competitor : null,
                holdUntil: chosenExit.capturesHoldDate ? holdUntil : null,
              }),
            );
          }}
        >
          <p className="lc-form-title">Take this opportunity out of the lifecycle</p>

          <div className="lc-exit-choices">
            {lifecycleExits.map((exit) => (
              <label
                className={`lc-exit-choice${exitStatus === exit.status ? " lc-exit-choice-on" : ""}`}
                key={exit.status}
              >
                <input
                  checked={exitStatus === exit.status}
                  name="exit-status"
                  onChange={() => setExitStatus(exit.status)}
                  type="radio"
                  value={exit.status}
                />
                <span>
                  <strong>{exit.label}</strong>
                  <span>{exit.summary}</span>
                </span>
              </label>
            ))}
          </div>

          <label className="lc-field">
            <span>Reason</span>
            <textarea
              disabled={pending}
              minLength={10}
              onChange={(event) => setExitReason(event.target.value)}
              placeholder="What happened, in enough detail that this is still useful in six months."
              required
              rows={3}
              value={exitReason}
            />
          </label>

          {chosenExit.capturesCompetitor ? (
            <label className="lc-field">
              <span>Lost to (optional)</span>
              <input
                disabled={pending}
                onChange={(event) => setCompetitor(event.target.value)}
                placeholder="Competitor name"
                type="text"
                value={competitor}
              />
            </label>
          ) : null}

          {chosenExit.capturesHoldDate ? (
            <label className="lc-field">
              <span>Pick back up on</span>
              <input
                disabled={pending}
                onChange={(event) => setHoldUntil(event.target.value)}
                required
                type="date"
                value={holdUntil}
              />
            </label>
          ) : null}

          <div className="lc-form-actions">
            <button className="lc-btn lc-btn-primary" disabled={pending} type="submit">
              Mark {chosenExit.label}
            </button>
            <button className="lc-btn" disabled={pending} onClick={() => setPanel("none")} type="button">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {panel === "skip" ? (
        <form
          className="lc-panel-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => skipOpportunityToStep(opportunityId, skipStep, skipReason));
          }}
        >
          <p className="lc-form-title">Jump this opportunity to another step</p>

          <label className="lc-field">
            <span>Step</span>
            <select disabled={pending} onChange={(event) => setSkipStep(event.target.value)} value={skipStep}>
              {lifecycleSteps.map((step) => (
                <option disabled={step.key === currentStepKey} key={step.key} value={step.key}>
                  {step.number}. {step.label}
                  {step.key === currentStepKey ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="lc-field">
            <span>Why</span>
            <textarea
              disabled={pending}
              minLength={10}
              onChange={(event) => setSkipReason(event.target.value)}
              placeholder="Recorded against the opportunity permanently, with the steps that were jumped."
              required
              rows={3}
              value={skipReason}
            />
          </label>

          <div className="lc-form-actions">
            <button className="lc-btn lc-btn-primary" disabled={pending || skipStep === currentStepKey} type="submit">
              Record and move
            </button>
            <button className="lc-btn" disabled={pending} onClick={() => setPanel("none")} type="button">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {panel === "reopen" ? (
        <form
          className="lc-panel-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => reopenOpportunity(opportunityId, reopenReason));
          }}
        >
          <p className="lc-form-title">Bring this opportunity back into the lifecycle</p>
          <label className="lc-field">
            <span>Why</span>
            <textarea
              disabled={pending}
              minLength={10}
              onChange={(event) => setReopenReason(event.target.value)}
              placeholder="Numbers have already been reported off this closure — say what changed."
              required
              rows={3}
              value={reopenReason}
            />
          </label>
          <div className="lc-form-actions">
            <button className="lc-btn lc-btn-primary" disabled={pending} type="submit">
              Reopen at this step
            </button>
            <button className="lc-btn" disabled={pending} onClick={() => setPanel("none")} type="button">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
