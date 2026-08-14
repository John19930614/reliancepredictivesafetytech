"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { createGrantOpportunity } from "@/app/employee/grants/actions";
import { grantFeeKinds } from "@/lib/grants/validation";
import { firstGrantStatusKey, grantStatuses, isGrantTerminalStatus } from "@/lib/grants/statuses";

const feeKindLabels: Record<string, string> = {
  application: "Application fee",
  membership: "Membership required to apply",
  other: "Other",
};

/**
 * Single column on purpose: the panel is roughly 380px inside .document-grid,
 * the same reason ProposalCreateForm and EmployeeExpensesManager force 1fr.
 */
export function GrantCreateForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      setError("Program name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSaved(false);

    const result = await createGrantOpportunity({
      name,
      agency: data.get("agency"),
      subAgency: data.get("sub_agency"),
      contact: data.get("contact"),
      status: data.get("status"),
      requirements: data.get("requirements"),
      feeAmount: data.get("fee_amount"),
      feeKind: data.get("fee_kind"),
      feePaid: data.get("fee_paid"),
      awardAmount: data.get("award_amount"),
      websiteUrl: data.get("website_url"),
      websiteLabel: data.get("website_label"),
      opensOn: data.get("opens_on"),
      deadline: data.get("deadline"),
      nextAction: data.get("next_action"),
      nextActionDue: data.get("next_action_due"),
      notes: data.get("notes"),
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? "The grant could not be saved.");
      return;
    }

    form.reset();
    setSaved(true);
    router.refresh();
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit}>
      <h2>Track a grant</h2>
      <p style={{ color: "var(--portal-muted)", marginTop: 4, fontSize: "0.9rem" }}>
        Anything we might apply for. Outcomes are recorded from the grant itself once it is in the list.
      </p>

      {error ? (
        <div className="success-box portal-alert portal-alert-error" style={{ marginTop: 12 }} role="alert">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="success-box" style={{ marginTop: 12 }} role="status">
          Grant tracked.
        </div>
      ) : null}

      <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
        <label className="field">
          <span>Program name</span>
          <input name="name" maxLength={200} placeholder="e.g. SBIR Phase I" required />
        </label>

        <label className="field">
          <span>Agency</span>
          <input name="agency" maxLength={200} placeholder="e.g. NASE" />
        </label>

        <label className="field">
          <span>Sub-agency or office</span>
          <input name="sub_agency" maxLength={200} placeholder="e.g. NOAA" />
        </label>

        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue={firstGrantStatusKey}>
            {grantStatuses
              // Terminal statuses are deliberately absent: an outcome is
              // recorded on an existing row so the transition gets audited.
              .filter((status) => !isGrantTerminalStatus(status.key))
              .map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
          </select>
        </label>

        <label className="field">
          <span>Contact</span>
          <input name="contact" maxLength={200} placeholder="Email or phone" />
        </label>

        <label className="field">
          <span>What is needed</span>
          <textarea name="requirements" rows={3} maxLength={4000} placeholder="Documents, prerequisites, fees" />
        </label>

        <label className="field">
          <span>Next action</span>
          <input name="next_action" maxLength={500} placeholder="e.g. Pay the $19 filing fee" />
        </label>

        <label className="field">
          <span>Next action due</span>
          <input name="next_action_due" type="date" />
        </label>

        <label className="field">
          <span>Applications open</span>
          <input name="opens_on" type="date" />
        </label>

        <label className="field">
          <span>Deadline</span>
          <input name="deadline" type="date" />
        </label>

        <label className="field">
          <span>Fee (USD)</span>
          <input name="fee_amount" inputMode="decimal" placeholder="0.00" />
        </label>

        <label className="field">
          <span>Fee type</span>
          <select name="fee_kind" defaultValue="">
            <option value="">No fee</option>
            {grantFeeKinds.map((kind) => (
              <option key={kind} value={kind}>
                {feeKindLabels[kind]}
              </option>
            ))}
          </select>
        </label>

        <label className="checkbox-pill">
          <input name="fee_paid" type="checkbox" value="true" />
          <span>Fee already paid</span>
        </label>

        <label className="field">
          <span>Award value (USD)</span>
          <input name="award_amount" inputMode="decimal" placeholder="What it is worth if we win" />
        </label>

        <label className="field">
          <span>Website</span>
          <input name="website_url" type="url" inputMode="url" placeholder="https://…" />
        </label>

        <label className="field">
          <span>Website label</span>
          <input name="website_label" maxLength={300} placeholder="Use when there is no working link" />
        </label>

        <label className="field">
          <span>Notes</span>
          <textarea name="notes" rows={3} maxLength={8000} />
        </label>

        <button className="button button-primary" disabled={submitting} type="submit" style={{ justifySelf: "start" }}>
          {submitting ? <Loader2 size={18} className="spin" /> : <Plus size={18} />}
          {submitting ? "Saving…" : "Track grant"}
        </button>
      </div>
    </form>
  );
}
