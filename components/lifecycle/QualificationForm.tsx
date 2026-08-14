"use client";

// Steps 5 and 6 — the discovery notes and the four qualification tests.
//
// One component for both because they are one record: Discovery is where the
// answers get written down, Qualified is where somebody judges whether they add
// up. Splitting them into two forms over the same row is how half-saved
// qualification records happen.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Circle, Save, ShieldCheck } from "lucide-react";
import {
  markOpportunityQualified,
  saveOpportunityQualification,
} from "@/app/employee/lifecycle/actions";
import { bantTests } from "@/lib/lifecycle/qualification";

export interface QualificationDraft {
  discoveryCallAt: string;
  primaryNeed: string;
  painPoints: string;
  decisionMakers: string;
  budgetRange: string;
  timeline: string;
  competition: string;
  hasBudget: boolean;
  hasAuthority: boolean;
  hasNeed: boolean;
  hasTimeline: boolean;
}

interface QualificationFormProps {
  opportunityId: string;
  initial: QualificationDraft;
  /** 'discovery' shows the notes, 'qualify' shows the BANT tests. */
  mode: "discovery" | "qualify";
  canManage: boolean;
  alreadyQualified: boolean;
  suggested: number;
}

const bantField = {
  has_budget: "hasBudget",
  has_authority: "hasAuthority",
  has_need: "hasNeed",
  has_timeline: "hasTimeline",
} as const;

export function QualificationForm({
  opportunityId,
  initial,
  mode,
  canManage,
  alreadyQualified,
  suggested,
}: QualificationFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState(initial);
  const [applyProbability, setApplyProbability] = useState(true);

  function set<K extends keyof QualificationDraft>(key: K, value: QualificationDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setNotice(success);
          router.refresh();
        } else {
          setError(result.error ?? "Could not save.");
        }
      } catch {
        setError("Something went wrong reaching the server. Try again in a moment.");
      }
    });
  }

  const met = bantTests.filter((test) => draft[bantField[test.key]]).length;

  // The server re-reads the SAVED row before qualifying, so a tick that is only
  // in the draft does not count. Comparing the two is what stops the trap:
  // four boxes visibly ticked, "Mark qualified" enabled, and the server
  // answering "Budget, Authority, Need, Timeline not yet established".
  const unsaved = bantTests.some((test) => draft[bantField[test.key]] !== initial[bantField[test.key]]);
  const savedMet = bantTests.filter((test) => initial[bantField[test.key]]).length;

  return (
    <div>
      {error ? (
        <p className="lc-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="lc-meta">{notice}</p> : null}

      {mode === "discovery" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () =>
                saveOpportunityQualification(opportunityId, {
                  discoveryCallAt: draft.discoveryCallAt || null,
                  primaryNeed: draft.primaryNeed,
                  painPoints: draft.painPoints,
                  decisionMakers: draft.decisionMakers,
                  budgetRange: draft.budgetRange,
                  timeline: draft.timeline,
                }),
              "Discovery saved.",
            );
          }}
        >
          <label className="lc-field">
            <span>Discovery call held</span>
            <input
              disabled={pending || !canManage}
              onChange={(event) => set("discoveryCallAt", event.target.value)}
              type="date"
              value={draft.discoveryCallAt}
            />
          </label>

          <label className="lc-field">
            <span>Primary need</span>
            <textarea
              disabled={pending || !canManage}
              onChange={(event) => set("primaryNeed", event.target.value)}
              placeholder="In their words, not ours."
              rows={2}
              value={draft.primaryNeed}
            />
          </label>

          <label className="lc-field">
            <span>Pain points</span>
            <textarea
              disabled={pending || !canManage}
              onChange={(event) => set("painPoints", event.target.value)}
              rows={3}
              value={draft.painPoints}
            />
          </label>

          <label className="lc-field">
            <span>Decision makers</span>
            <textarea
              disabled={pending || !canManage}
              onChange={(event) => set("decisionMakers", event.target.value)}
              placeholder="Who signs, who blocks, who champions."
              rows={2}
              value={draft.decisionMakers}
            />
          </label>

          <div className="lc-field-row">
            <label className="lc-field">
              <span>Budget</span>
              <input
                disabled={pending || !canManage}
                onChange={(event) => set("budgetRange", event.target.value)}
                placeholder="$200k–$300k"
                type="text"
                value={draft.budgetRange}
              />
            </label>
            <label className="lc-field">
              <span>Timeline</span>
              <input
                disabled={pending || !canManage}
                onChange={(event) => set("timeline", event.target.value)}
                placeholder="Live by Q1"
                type="text"
                value={draft.timeline}
              />
            </label>
          </div>

          <div className="lc-form-actions">
            <button className="lc-btn lc-btn-primary" disabled={pending || !canManage} type="submit">
              <Save size={15} /> Save discovery
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () =>
                saveOpportunityQualification(opportunityId, {
                  hasBudget: draft.hasBudget,
                  hasAuthority: draft.hasAuthority,
                  hasNeed: draft.hasNeed,
                  hasTimeline: draft.hasTimeline,
                  competition: draft.competition,
                }),
              "Qualification saved.",
            );
          }}
        >
          <ul className="lc-bant">
            {bantTests.map((test) => {
              const field = bantField[test.key];
              const on = draft[field];
              return (
                <li className={`lc-bant-row${on ? " lc-bant-on" : ""}`} key={test.key}>
                  <label>
                    <input
                      checked={on}
                      disabled={pending || !canManage || alreadyQualified}
                      onChange={(event) => set(field, event.target.checked)}
                      type="checkbox"
                    />
                    <span aria-hidden="true" className="lc-bant-icon">
                      {on ? <CircleCheck size={16} /> : <Circle size={16} />}
                    </span>
                    <span>
                      <strong>{test.label}</strong>
                      <span>{test.question}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <label className="lc-field">
            <span>Competition</span>
            <textarea
              disabled={pending || !canManage || alreadyQualified}
              onChange={(event) => set("competition", event.target.value)}
              placeholder="Who else is being looked at, and how we compare."
              rows={2}
              value={draft.competition}
            />
          </label>

          <div className="lc-form-actions">
            <button
              className="lc-btn"
              disabled={pending || !canManage || alreadyQualified}
              type="submit"
            >
              <Save size={15} /> Save
            </button>
          </div>

          {!alreadyQualified ? (
            <div className="lc-qualify">
              <label className="lc-check">
                <input
                  checked={applyProbability}
                  disabled={pending || !canManage}
                  onChange={(event) => setApplyProbability(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  Also set probability to {suggested}%
                  {/* Stated, not silent: probability drives the weighted
                      pipeline, so it should never move without a decision. */}
                  <span className="lc-meta"> — suggested from {met} of 4 established</span>
                </span>
              </label>

              {unsaved && met === bantTests.length ? (
                <p className="lc-meta">
                  Save these answers first — qualifying reads what is stored, not what is on screen.
                </p>
              ) : null}

              <button
                className="lc-btn lc-btn-primary"
                disabled={pending || !canManage || savedMet < bantTests.length || unsaved}
                onClick={() =>
                  run(() => markOpportunityQualified(opportunityId, applyProbability), "Opportunity qualified.")
                }
                title={
                  unsaved
                    ? "Save the discovery answers before qualifying."
                    : savedMet < bantTests.length
                      ? "All four have to be established and saved first."
                      : undefined
                }
                type="button"
              >
                <ShieldCheck size={15} /> Mark qualified
              </button>
            </div>
          ) : (
            <p className="lc-meta">
              This opportunity has been qualified. The record is now history — reopen it through Skip to Step if the
              picture has genuinely changed.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
