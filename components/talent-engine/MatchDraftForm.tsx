"use client";

/**
 * Drafts a match: pick an open order and a candidate, and createMatch() does
 * the rest server-side — scores fit, prices the spread against the floor,
 * drafts the AI recommendation and parks it in this queue as
 * pending_approval with requires_human_review set. The form commits nothing
 * to a client; it only ever ADDS a row to the human gate above.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { createMatch } from "@/app/employee/talent-engine/actions";

export interface MatchDraftOption {
  id: string;
  label: string;
}

export function MatchDraftForm({ orders, candidates }: { orders: MatchDraftOption[]; candidates: MatchDraftOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const disabled = orders.length === 0 || candidates.length === 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const jobOrderId = String(data.get("job_order_id") ?? "");
    const candidateId = String(data.get("candidate_id") ?? "");

    setError("");
    startTransition(async () => {
      const result = await createMatch(jobOrderId, candidateId);
      if (!result.ok) {
        setError(result.error ?? Object.values(result.fieldErrors ?? {})[0] ?? "The match could not be drafted.");
        return;
      }
      form.reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="talent-intake">
      <button
        aria-expanded={open}
        className="talent-intake-toggle"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        title={disabled ? "Drafting a match needs at least one open job order and one candidate in the pool." : undefined}
        type="button"
      >
        <Sparkles size={14} aria-hidden="true" />
        {open ? "Close" : "Draft a match"}
      </button>

      {open ? (
        <form className="talent-intake-form" onSubmit={handleSubmit}>
          {error ? <p className="talent-intake-error" role="alert">{error}</p> : null}
          <label className="talent-field talent-field-wide">
            <span>Job order</span>
            <select defaultValue="" name="job_order_id" required>
              <option disabled value="">
                Pick an open order…
              </option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.label}
                </option>
              ))}
            </select>
          </label>
          <label className="talent-field talent-field-wide">
            <span>Candidate</span>
            <select defaultValue="" name="candidate_id" required>
              <option disabled value="">
                Pick a candidate…
              </option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
          <button className="talent-btn talent-btn-approve talent-intake-submit" disabled={isPending} type="submit">
            {isPending ? <Loader2 className="spin" size={14} aria-hidden="true" /> : null}
            {isPending ? "Scoring & pricing…" : "Draft match for approval"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
