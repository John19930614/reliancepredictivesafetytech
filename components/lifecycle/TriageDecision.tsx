"use client";

// Accept or dismiss the AI's triage — the human gate at Sales Review.
//
// The model's score does not reach the opportunity until this is pressed. That
// is the Human Authority Rule, and the same shape LeadTriagePanel already uses
// on the inbox: the suggestion is inert, and the human's decision is the only
// write. Both controls stay visible after a decision so the screen shows what
// was decided rather than quietly emptying.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { applyTriageDecision } from "@/app/employee/lifecycle/actions";

interface TriageDecisionProps {
  opportunityId: string;
  /** 'suggested' while it still needs a person. */
  triageStatus: string;
  humanReviewRequired: boolean;
  canManage: boolean;
}

export function TriageDecision({
  opportunityId,
  triageStatus,
  humanReviewRequired,
  canManage,
}: TriageDecisionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: "accepted" | "dismissed") {
    setError(null);
    startTransition(async () => {
      try {
        const result = await applyTriageDecision(opportunityId, decision);
        if (result.ok) {
          router.refresh();
        } else {
          setError(result.error ?? "Could not record that decision.");
        }
      } catch {
        setError("Something went wrong reaching the server. Try again in a moment.");
      }
    });
  }

  if (triageStatus !== "suggested") {
    return (
      <p className="lc-meta">
        This suggestion was {triageStatus}
        {triageStatus === "accepted" ? " — the score is on the opportunity." : " — the opportunity is unscored."}
      </p>
    );
  }

  return (
    <div>
      {humanReviewRequired ? (
        <p className="lc-meta" style={{ marginTop: 0 }}>
          Flagged for review — this suggestion is not auto-approved.
        </p>
      ) : null}

      {error ? (
        <p className="lc-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="lc-form-actions">
        <button
          className="lc-btn lc-btn-primary"
          disabled={pending || !canManage}
          onClick={() => decide("accepted")}
          title={canManage ? undefined : "Your role cannot review lead scoring."}
          type="button"
        >
          <Check size={15} /> Accept and score
        </button>
        <button
          className="lc-btn"
          disabled={pending || !canManage}
          onClick={() => decide("dismissed")}
          type="button"
        >
          <X size={15} /> Dismiss
        </button>
      </div>
    </div>
  );
}
