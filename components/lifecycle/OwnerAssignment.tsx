"use client";

// Step 4 — assign one accountable owner.
//
// The roster is ordered lightest-load-first by the server, so the top of the
// list IS the routing suggestion. Each option carries how many open deals that
// person already holds, because "who is free" is the question this step actually
// asks and a bare name list cannot answer it.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserX } from "lucide-react";
import { updateOpportunity } from "@/app/employee/lifecycle/actions";

export interface OwnerChoice {
  userId: string;
  name: string;
  email: string | null;
  role: string | null;
  openDeals: number;
  openValue: number;
}

interface OwnerAssignmentProps {
  opportunityId: string;
  currentOwnerId: string | null;
  owners: OwnerChoice[];
  canManage: boolean;
  /** True when the roster could not be read at all. */
  rosterUnavailable: boolean;
}

function money(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

export function OwnerAssignment({
  opportunityId,
  currentOwnerId,
  owners,
  canManage,
  rosterUnavailable,
}: OwnerAssignmentProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState(currentOwnerId ?? "");

  function run(ownerUserId: string | null, message: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await updateOpportunity(opportunityId, { ownerUserId });
        if (result.ok) {
          setNotice(message);
          router.refresh();
        } else {
          setError(result.error ?? "Could not save the assignment.");
        }
      } catch {
        setError("Something went wrong reaching the server. Try again in a moment.");
      }
    });
  }

  if (rosterUnavailable) {
    return (
      <p className="lc-empty">
        <UserX aria-hidden="true" size={14} /> The team roster could not be read, so there is nobody to pick from. This
        needs service-role credentials configured on the server.
      </p>
    );
  }

  if (owners.length === 0) {
    return (
      <p className="lc-empty">
        <UserX aria-hidden="true" size={14} /> No active portal users are available to own a deal yet.
      </p>
    );
  }

  return (
    <div>
      {error ? (
        <p className="lc-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="lc-meta">{notice}</p> : null}

      <label className="lc-field">
        <span>Owner</span>
        <select
          disabled={pending || !canManage}
          onChange={(event) => setSelected(event.target.value)}
          value={selected}
          title={canManage ? undefined : "Your role cannot assign opportunities."}
        >
          <option value="">Unassigned</option>
          {owners.map((owner) => (
            <option key={owner.userId} value={owner.userId}>
              {owner.name} — {owner.openDeals} open
              {owner.openValue > 0 ? ` · ${money(owner.openValue)}` : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="lc-form-actions">
        <button
          className="lc-btn lc-btn-primary"
          disabled={pending || !canManage || selected === (currentOwnerId ?? "")}
          onClick={() =>
            run(
              selected || null,
              selected
                ? `Assigned to ${owners.find((owner) => owner.userId === selected)?.name ?? "the selected owner"}. The SLA clock starts now.`
                : "Owner cleared.",
            )
          }
          type="button"
        >
          <UserCheck size={15} /> {currentOwnerId ? "Reassign" : "Assign owner"}
        </button>

        {currentOwnerId ? (
          <button
            className="lc-btn"
            disabled={pending || !canManage}
            onClick={() => {
              setSelected("");
              run(null, "Owner cleared.");
            }}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
