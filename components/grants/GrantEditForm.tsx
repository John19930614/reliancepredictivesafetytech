"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { updateGrantOpportunity } from "@/app/employee/grants/actions";
import { grantFeeKinds } from "@/lib/grants/validation";

const feeKindLabels: Record<string, string> = {
  application: "Application fee",
  membership: "Membership required to apply",
  other: "Other",
};

interface GrantEditableRow {
  id: string;
  name: string;
  agency: string | null;
  sub_agency: string | null;
  contact: string | null;
  requirements: string | null;
  fee_amount: number | string | null;
  fee_kind: string | null;
  award_amount: number | string | null;
  website_url: string | null;
  website_label: string | null;
  opens_on: string | null;
  deadline: string | null;
  next_action: string | null;
  next_action_due: string | null;
  notes: string | null;
}

/** Every editable field as the string a text input would hold, so a diff against edited state is a plain string compare. */
function toFormValues(grant: GrantEditableRow) {
  return {
    name: grant.name,
    agency: grant.agency ?? "",
    subAgency: grant.sub_agency ?? "",
    contact: grant.contact ?? "",
    requirements: grant.requirements ?? "",
    feeAmount: grant.fee_amount === null ? "" : String(grant.fee_amount),
    feeKind: grant.fee_kind ?? "",
    awardAmount: grant.award_amount === null ? "" : String(grant.award_amount),
    websiteUrl: grant.website_url ?? "",
    websiteLabel: grant.website_label ?? "",
    opensOn: grant.opens_on ?? "",
    deadline: grant.deadline ?? "",
    nextAction: grant.next_action ?? "",
    nextActionDue: grant.next_action_due ?? "",
    notes: grant.notes ?? "",
  };
}

type FormValues = ReturnType<typeof toFormValues>;

/**
 * Full-field editor for a single grant. status and fee_paid are deliberately
 * absent — they have their own dedicated, audited controls
 * (GrantStatusEditor, GrantFeePaidToggle) elsewhere on the detail page, so
 * this form only ever touches field facts, matching what
 * updateGrantOpportunity accepts.
 */
export function GrantEditForm({ grant, readOnly }: { grant: GrantEditableRow; readOnly: boolean }) {
  const router = useRouter();
  const initial = toFormValues(grant);
  const [values, setValues] = useState<FormValues>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  const dirty = Object.keys(values).some((key) => values[key as keyof FormValues] !== initial[key as keyof FormValues]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;

    // Only the fields that actually changed are sent, so an edit to one field
    // cannot rewrite the audit trail's before/after for every other field.
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(values) as Array<keyof FormValues>) {
      if (values[key] !== initial[key]) {
        patch[key] = values[key];
      }
    }

    setSubmitting(true);
    setError(null);

    const result = await updateGrantOpportunity(grant.id, patch);

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? "Could not save this grant.");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit}>
      <h2>Grant details</h2>

      {readOnly ? (
        <p style={{ color: "var(--portal-muted)", marginTop: 4, fontSize: "0.9rem" }}>
          This grant has already been decided. Admin role required to edit it further.
        </p>
      ) : null}

      {error ? (
        <div className="success-box portal-alert portal-alert-error" style={{ marginTop: 12 }} role="alert">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="success-box" style={{ marginTop: 12 }} role="status">
          Saved.
        </div>
      ) : null}

      <fieldset disabled={readOnly || submitting} style={{ border: "none", padding: 0, margin: 0 }}>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
          <label className="field">
            <span>Program name</span>
            <input value={values.name} maxLength={200} required onChange={(event) => set("name", event.target.value)} />
          </label>

          <label className="field">
            <span>Agency</span>
            <input value={values.agency} maxLength={200} onChange={(event) => set("agency", event.target.value)} />
          </label>

          <label className="field">
            <span>Sub-agency or office</span>
            <input value={values.subAgency} maxLength={200} onChange={(event) => set("subAgency", event.target.value)} />
          </label>

          <label className="field">
            <span>Contact</span>
            <input value={values.contact} maxLength={200} onChange={(event) => set("contact", event.target.value)} />
          </label>

          <label className="field">
            <span>What is needed</span>
            <textarea
              rows={3}
              maxLength={4000}
              value={values.requirements}
              onChange={(event) => set("requirements", event.target.value)}
            />
          </label>

          <label className="field">
            <span>Next action</span>
            <input
              maxLength={500}
              value={values.nextAction}
              onChange={(event) => set("nextAction", event.target.value)}
            />
          </label>

          <label className="field">
            <span>Next action due</span>
            <input type="date" value={values.nextActionDue} onChange={(event) => set("nextActionDue", event.target.value)} />
          </label>

          <label className="field">
            <span>Applications open</span>
            <input type="date" value={values.opensOn} onChange={(event) => set("opensOn", event.target.value)} />
          </label>

          <label className="field">
            <span>Deadline</span>
            <input type="date" value={values.deadline} onChange={(event) => set("deadline", event.target.value)} />
          </label>

          <label className="field">
            <span>Fee (USD)</span>
            <input inputMode="decimal" value={values.feeAmount} onChange={(event) => set("feeAmount", event.target.value)} />
          </label>

          <label className="field">
            <span>Fee type</span>
            <select value={values.feeKind} onChange={(event) => set("feeKind", event.target.value)}>
              <option value="">No fee</option>
              {grantFeeKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {feeKindLabels[kind]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Award value (USD)</span>
            <input
              inputMode="decimal"
              value={values.awardAmount}
              onChange={(event) => set("awardAmount", event.target.value)}
            />
          </label>

          <label className="field">
            <span>Website</span>
            <input
              type="url"
              inputMode="url"
              value={values.websiteUrl}
              onChange={(event) => set("websiteUrl", event.target.value)}
            />
          </label>

          <label className="field">
            <span>Website label</span>
            <input
              maxLength={300}
              value={values.websiteLabel}
              placeholder="Use when there is no working link"
              onChange={(event) => set("websiteLabel", event.target.value)}
            />
          </label>

          <label className="field">
            <span>Notes</span>
            <textarea rows={4} maxLength={8000} value={values.notes} onChange={(event) => set("notes", event.target.value)} />
          </label>

          {!readOnly ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="button button-primary" type="submit" disabled={submitting || !dirty}>
                {submitting ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
                {submitting ? "Saving…" : "Save changes"}
              </button>
              {dirty ? (
                <button
                  className="button button-light"
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setValues(initial);
                    setError(null);
                    setSaved(false);
                  }}
                >
                  Discard changes
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}
