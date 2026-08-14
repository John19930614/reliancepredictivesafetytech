"use client";

// Step 11 — the act of calling a deal won.
//
// Separate from Next Step on purpose. Reaching step 11 says the paperwork is in
// motion; marking the deal won says it landed, and that number goes into other
// people's reports. Reversing it needs an admin reopen, so the button asks once
// rather than firing on a stray click.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { markOpportunityWon } from "@/app/employee/lifecycle/actions";

interface CloseWonActionProps {
  opportunityId: string;
  /** True once the deal is already won — the button becomes a statement. */
  won: boolean;
  /** Null until the deal is attached to a company. */
  clientId: string | null;
  canAdvance: boolean;
}

export function CloseWonAction({ opportunityId, won, clientId, canAdvance }: CloseWonActionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (won) {
    return (
      <p className="lc-meta">
        <Trophy aria-hidden="true" size={14} /> This deal is closed won. Reversing it is an admin reopen, so the number
        other people report on cannot quietly change.
      </p>
    );
  }

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await markOpportunityWon(opportunityId);
        if (result.ok) {
          setConfirming(false);
          router.refresh();
        } else {
          setError(result.error ?? "Could not close this deal.");
        }
      } catch {
        setError("Something went wrong reaching the server. Try again in a moment.");
      }
    });
  }

  return (
    <div>
      {error ? (
        <p className="lc-error" role="alert">
          {error}
        </p>
      ) : null}

      {!clientId ? (
        <p className="lc-body">
          This opportunity is not attached to a company, so there is nothing to onboard. Attach one before closing it
          won.
        </p>
      ) : null}

      {confirming ? (
        <>
          <p className="lc-body">
            Closing this won marks the deal as revenue and hands it to onboarding. Reopening it afterwards takes an
            admin.
          </p>
          <div className="lc-form-actions">
            <button
              className="lc-btn lc-btn-primary"
              disabled={pending || !canAdvance || !clientId}
              onClick={run}
              type="button"
            >
              <Trophy size={15} /> {pending ? "Closing…" : "Yes, close it won"}
            </button>
            <button className="lc-btn" disabled={pending} onClick={() => setConfirming(false)} type="button">
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="lc-form-actions">
          <button
            className="lc-btn lc-btn-primary"
            disabled={pending || !canAdvance || !clientId}
            onClick={() => setConfirming(true)}
            type="button"
          >
            <Trophy size={15} /> Close Won
          </button>
        </div>
      )}
    </div>
  );
}
