"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordGrantFeePayment } from "@/app/employee/grants/actions";

/** Fee status is money leaving the company, so it gets its own toggle rather than living inside a bigger edit form. */
export function GrantFeePaidToggle({ grantId, feePaid }: { grantId: string; feePaid: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: pending ? "wait" : "pointer" }}>
        <input
          type="checkbox"
          checked={feePaid}
          disabled={pending}
          onChange={(event) => {
            const paid = event.target.checked;
            setError(null);
            startTransition(async () => {
              const result = await recordGrantFeePayment(grantId, paid);
              if (!result.ok) {
                setError(result.error ?? "Could not update the fee.");
                return;
              }
              router.refresh();
            });
          }}
        />
        <span className="table-subtext">{feePaid ? "paid" : "unpaid"}</span>
      </label>
      {error ? (
        <div className="table-subtext" style={{ color: "#ef4444" }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
