"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteGrantOpportunity } from "@/app/employee/grants/actions";

/**
 * Admin-only hard delete. Calls the action directly (rather than as a plain
 * form action) so a successful delete can navigate back to the list — there is
 * nothing left at this URL to show.
 */
export function GrantDeleteButton({ grantId, grantName }: { grantId: string; grantName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        className="button button-light"
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Permanently delete "${grantName}"? This cannot be undone.`)) return;

          setError(null);
          startTransition(async () => {
            const result = await deleteGrantOpportunity(grantId);
            if (!result.ok) {
              setError(result.error ?? "Could not delete this grant.");
              return;
            }
            router.push("/employee/grants");
          });
        }}
      >
        {pending ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
        {pending ? "Deleting…" : "Delete grant"}
      </button>
      {error ? (
        <div className="table-subtext" style={{ color: "#ef4444", marginTop: 6 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
