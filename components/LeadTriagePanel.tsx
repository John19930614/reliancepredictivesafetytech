"use client";

import { useState, useTransition } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { actOnLeadSuggestion } from "@/app/employee/inbox/triage-actions";

export interface LeadSuggestion {
  id: string;
  leadId: string;
  leadName: string;
  leadCompany: string | null;
  priorityRank: number;
  priorityScore: number;
  segment: string | null;
  nextStep: string;
  rationale: string | null;
  confidence: string;
  humanReviewRequired: boolean;
  status: string;
}

interface LeadTriagePanelProps {
  /** Compact styling for the mobile shell. */
  compact?: boolean;
  runDate: string | null;
  suggestions: LeadSuggestion[];
}

const confidenceTone: Record<string, string> = {
  high: "record-badge-gold",
  medium: "record-badge-neutral",
  low: "record-badge-neutral",
};

export function LeadTriagePanel({ compact = false, runDate, suggestions }: LeadTriagePanelProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [handled, setHandled] = useState<Record<string, string>>({});

  function act(resultId: string, decision: "accepted" | "dismissed") {
    setError(null);
    startTransition(async () => {
      const result = await actOnLeadSuggestion(resultId, decision);
      if (result.ok) {
        setHandled((prev) => ({ ...prev, [resultId]: decision }));
      } else {
        setError(result.error ?? "Could not record that decision.");
      }
    });
  }

  const open = suggestions.filter((s) => s.status === "suggested" && !handled[s.id]);

  if (suggestions.length === 0) {
    return (
      <section className={compact ? "m-card" : "portal-card"}>
        <div className="record-badge-row">
          <Sparkles size={15} />
          <strong>AI next steps</strong>
        </div>
        <p>No triage has run yet. The daily job organizes new leads each morning.</p>
      </section>
    );
  }

  return (
    <section className={compact ? "m-card" : "portal-card"}>
      <div className="portal-topline">
        <div>
          <div className="record-badge-row">
            <Sparkles size={15} />
            <strong>AI next steps</strong>
          </div>
          <p>
            {open.length} open suggestion{open.length === 1 ? "" : "s"}
            {runDate ? ` · triaged ${runDate}` : ""}
          </p>
        </div>
      </div>

      {error && <div className="empty-state">{error}</div>}

      <div className="doc-list">
        {open.map((suggestion) => (
          <article className="doc-card" key={suggestion.id}>
            <div className="record-badge-row">
              <span className="record-badge record-badge-gold">#{suggestion.priorityRank}</span>
              <strong>
                {suggestion.leadName}
                {suggestion.leadCompany ? ` · ${suggestion.leadCompany}` : ""}
              </strong>
              <span className={`record-badge ${confidenceTone[suggestion.confidence] ?? "record-badge-neutral"}`}>
                {suggestion.confidence} confidence
              </span>
            </div>

            {suggestion.segment && <p>{suggestion.segment}</p>}
            <p>
              <strong>Next step:</strong> {suggestion.nextStep}
            </p>
            {suggestion.rationale && <p>{suggestion.rationale}</p>}
            {suggestion.humanReviewRequired && (
              <p>
                <em>Review before acting — this suggestion is not auto-approved.</em>
              </p>
            )}

            <div className="record-badge-row">
              <button
                className="button button-primary"
                disabled={pending}
                onClick={() => act(suggestion.id, "accepted")}
                type="button"
              >
                <Check size={14} />
                Accept
              </button>
              <button
                className="button button-secondary button-neutral"
                disabled={pending}
                onClick={() => act(suggestion.id, "dismissed")}
                type="button"
              >
                <X size={14} />
                Dismiss
              </button>
            </div>
          </article>
        ))}

        {open.length === 0 && <div className="empty-state">Every suggestion from this run has been actioned.</div>}
      </div>
    </section>
  );
}
