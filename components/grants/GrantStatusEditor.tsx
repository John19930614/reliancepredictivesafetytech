"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeGrantStatus } from "@/app/employee/grants/actions";
import { grantStatuses, isGrantTerminalStatus } from "@/lib/grants/statuses";

/**
 * Inline status control for a table row. A non-terminal target commits as soon
 * as it is picked — it is reversible and low-stakes. A terminal target
 * (awarded / declined / not_eligible) opens a reason field instead of
 * committing on change, mirroring the server's own rule that an outcome needs
 * a written reason.
 */
export function GrantStatusEditor({ grantId, status }: { grantId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draftStatus, setDraftStatus] = useState(status);
  const [reason, setReason] = useState("");
  const [awardAmount, setAwardAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const awaitingReason = draftStatus !== status && isGrantTerminalStatus(draftStatus);

  function commit(nextStatus: string, options?: { outcomeReason?: string; awardAmount?: string }) {
    setError(null);
    startTransition(async () => {
      const result = await changeGrantStatus(grantId, {
        status: nextStatus,
        outcomeReason: options?.outcomeReason,
        awardAmount: options?.awardAmount ? Number(options.awardAmount) : undefined,
      });

      if (!result.ok) {
        setError(result.error ?? "Could not update status.");
        // Back to the status the row ACTUALLY has. Leaving the select on the
        // rejected target showed a state the database never accepted, and
        // because a controlled <select> fires no change event when the value
        // it already holds is re-picked, the operator could not even retry
        // without reloading the page.
        setDraftStatus(status);
        return;
      }

      setReason("");
      setAwardAmount("");
      router.refresh();
    });
  }

  function handleSelect(next: string) {
    setDraftStatus(next);
    setError(null);
    if (!isGrantTerminalStatus(next)) {
      commit(next);
    }
  }

  return (
    <div>
      <select value={draftStatus} disabled={pending} onChange={(event) => handleSelect(event.target.value)}>
        {grantStatuses.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>

      {awaitingReason ? (
        <div style={{ marginTop: 6, display: "grid", gap: 4, minWidth: 200 }}>
          <textarea
            rows={2}
            placeholder="Why is this closing?"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {draftStatus === "awarded" ? (
            <input
              inputMode="decimal"
              placeholder="Award amount"
              value={awardAmount}
              onChange={(event) => setAwardAmount(event.target.value)}
            />
          ) : null}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="button button-primary button-sm"
              type="button"
              disabled={pending}
              onClick={() => commit(draftStatus, { outcomeReason: reason, awardAmount })}
            >
              Save
            </button>
            <button
              className="button button-light button-sm"
              type="button"
              disabled={pending}
              onClick={() => {
                setDraftStatus(status);
                setReason("");
                setAwardAmount("");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="table-subtext" style={{ color: "#ef4444" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
