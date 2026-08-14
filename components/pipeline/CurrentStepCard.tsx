"use client";

// The one card that says what step this client is on and offers the single
// action that leaves it.
//
// The whole point of the shape is that there is ONE primary action. The board
// this replaces let a card be dropped in any column, which meant the interface
// never had an opinion about what should happen next. Here the opinion is the
// button, and when the button is off the reason is written next to it rather
// than left for the operator to infer.
//
// A blocked step still SHOWS the button, disabled, with the reason — the
// convention the talent-engine panels established. Hiding it would leave
// someone hunting for a control that is simply not available to them yet.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, CircleAlert, CircleCheck, Circle, ShieldAlert } from "lucide-react";
import { advanceClientStage, overrideClientStage } from "@/app/employee/clients/[id]/workflow/actions";

export interface StepRequirementView {
  code: string;
  label: string;
  satisfied: boolean;
}

interface CurrentStepCardProps {
  clientId: string;
  clientName: string;
  stage: string;
  lane: string;
  /** 1-based, or null when the stored stage is not a known one. */
  stageNumber: number | null;
  stageCount: number;
  headline: string;
  body: string;
  requirements: StepRequirementView[];
  /** Gate verdict — is the step finished. */
  gateOpen: boolean;
  /** Where advancing goes, or null at the end of the journey. */
  nextStage: string | null;
  advanceLabel: string;
  /** Set when there is nowhere to advance to. */
  terminalReason?: string;
  /** Role flags. */
  canAdvance: boolean;
  canOverride: boolean;
}

export function CurrentStepCard({
  clientId,
  clientName,
  stage,
  lane,
  stageNumber,
  stageCount,
  headline,
  body,
  requirements,
  gateOpen,
  nextStage,
  advanceLabel,
  terminalReason,
  canAdvance,
  canOverride,
}: CurrentStepCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState("");

  const outstanding = requirements.filter((requirement) => !requirement.satisfied);
  const blocked = !gateOpen && Boolean(nextStage);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setOverrideOpen(false);
        setReason("");
        router.refresh();
      } else {
        setError(result.error ?? "Could not move this client.");
      }
    });
  }

  /** Why the primary button is off, for its title attribute. */
  const disabledReason = !canAdvance
    ? "Your role cannot move clients through the pipeline."
    : blocked
      ? `${outstanding.length} step${outstanding.length === 1 ? "" : "s"} outstanding on ${stage}.`
      : undefined;

  return (
    <section className={`wf-step-card${blocked ? " wf-step-card-blocked" : ""}`}>
      <p className="wf-step-eyebrow">
        {stageNumber ? `Step ${stageNumber} of ${stageCount}` : "Off-journey"} · {lane}
      </p>

      <h2 className="wf-step-headline">{headline}</h2>
      <p className="wf-step-body">{body}</p>

      {requirements.length > 0 ? (
        <ul className="wf-req-list">
          {requirements.map((requirement) => (
            <li
              className={`wf-req${requirement.satisfied ? " wf-req-done" : ""}`}
              key={requirement.code}
            >
              <span aria-hidden="true" className="wf-req-icon">
                {requirement.satisfied ? <CircleCheck size={16} /> : <Circle size={16} />}
              </span>
              <span>{requirement.label}</span>
              <span className="wf-visually-hidden">
                {requirement.satisfied ? " — done" : " — still outstanding"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {terminalReason ? <p className="wf-step-terminal">{terminalReason}</p> : null}

      {error ? (
        <p className="wf-step-error" role="alert">
          {error}
        </p>
      ) : null}

      {nextStage ? (
        <div className="wf-step-actions">
          <button
            className="button button-primary"
            disabled={pending || !canAdvance || blocked}
            onClick={() => run(() => advanceClientStage(clientId))}
            title={disabledReason}
            type="button"
          >
            {advanceLabel || `Move to ${nextStage}`} <ArrowDown size={16} />
          </button>

          {blocked && canOverride ? (
            <button
              className="button button-neutral button-sm"
              disabled={pending}
              onClick={() => setOverrideOpen((open) => !open)}
              type="button"
            >
              <ShieldAlert size={14} /> Move anyway
            </button>
          ) : null}
        </div>
      ) : null}

      {blocked && !canOverride ? (
        <p className="wf-step-note">
          <CircleAlert aria-hidden="true" size={14} /> Finish the outstanding steps above to move {clientName} on. An
          admin can move a client past an unfinished step if the situation calls for it.
        </p>
      ) : null}

      {overrideOpen && blocked && canOverride ? (
        <form
          className="wf-override"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => overrideClientStage(clientId, reason));
          }}
        >
          <label className="wf-override-label" htmlFor={`wf-override-${clientId}`}>
            Why is {clientName} moving on with {outstanding.length} step
            {outstanding.length === 1 ? "" : "s"} outstanding?
          </label>
          <textarea
            className="wf-override-input"
            disabled={pending}
            id={`wf-override-${clientId}`}
            minLength={10}
            name="reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder="This is recorded against the account permanently, alongside the steps that were skipped."
            required
            rows={3}
            value={reason}
          />
          <div className="wf-step-actions">
            <button className="button button-primary button-sm" disabled={pending} type="submit">
              Record and move to {nextStage}
            </button>
            <button
              className="button button-neutral button-sm"
              disabled={pending}
              onClick={() => setOverrideOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
