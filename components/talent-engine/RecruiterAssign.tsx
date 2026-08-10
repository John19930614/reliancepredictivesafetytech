"use client";

/**
 * Small island that assigns (or clears) the recruiter credited with a
 * placement's commission. Rendered only for the oversight tier;
 * setPlacementRecruiter() re-checks `canManagePlacements` server-side.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserCheck } from "lucide-react";
import { setPlacementRecruiter } from "@/app/employee/talent-engine/actions";

export interface RecruiterOption {
  userId: string;
  name: string;
}

export function RecruiterAssign({
  placementId,
  current,
  options,
}: {
  placementId: string;
  current: string | null;
  options: RecruiterOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState("");

  function handleSave() {
    setError("");
    startTransition(async () => {
      const result = await setPlacementRecruiter(placementId, value === "" ? null : value);
      if (!result?.ok) {
        setError(result?.error ?? "The recruiter could not be assigned.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="talent-recruiter-assign">
      <label>
        <span>Commission credited to</span>
        <select disabled={isPending} onChange={(event) => setValue(event.target.value)} value={value}>
          <option value="">Nobody (house placement)</option>
          {options.map((option) => (
            <option key={option.userId} value={option.userId}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="talent-btn"
        disabled={isPending || value === (current ?? "")}
        onClick={handleSave}
        type="button"
      >
        {isPending ? <Loader2 aria-hidden="true" className="spin" size={14} /> : <UserCheck aria-hidden="true" size={14} />}
        {isPending ? "Saving…" : "Assign"}
      </button>
      {error ? (
        <p className="talent-intake-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
