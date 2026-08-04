"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";
import { createProposal } from "@/app/employee/proposals/actions";
import { createProposalFromTemplate } from "@/app/employee/proposals/templates/actions";
import { ProposalTemplatePicker } from "./ProposalTemplatePicker";

interface ClientOption {
  id: string;
  name: string;
}

export function ProposalCreateForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [templateId, setTemplateId] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const valueRaw = String(formData.get("proposal_value") ?? "").trim();
    const parsedValue = valueRaw ? Number(valueRaw) : null;
    if (valueRaw && Number.isNaN(parsedValue)) {
      setSubmitting(false);
      setError("Proposal value must be a number.");
      return;
    }

    const shared = {
      title: String(formData.get("title") ?? "").trim(),
      clientId: String(formData.get("client_id") ?? "") || null,
      owner: String(formData.get("owner") ?? "").trim() || null,
      proposalValue: parsedValue,
      validUntil: String(formData.get("valid_until") ?? "") || null,
    };

    // Two distinct create paths. The blank path still calls createProposal(),
    // which seeds its own default pilot state and is deliberately unchanged; the
    // template path uses the Proposal Templates module's own action, which
    // scrubs the captured client's identity out and layers this company's in.
    const result = templateId
      ? await createProposalFromTemplate({ ...shared, templateId })
      : await createProposal(shared);

    if (!result.ok || !result.proposalId) {
      setError(result.error ?? "Failed to create the proposal.");
      setSubmitting(false);
      return;
    }

    // A brand-new proposal is always a draft with nothing in it, so the useful
    // landing place is the generator, not the empty document view.
    router.push(`/employee/proposals/${result.proposalId}/edit`);
    router.refresh();
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit}>
      <h2>New proposal</h2>
      <p style={{ color: "var(--portal-muted)", marginTop: 4, fontSize: "0.9rem" }}>
        Start a proposal and assign it to a company — then build it out in the Proposal &amp; Billing Generator, revision
        by revision.
      </p>
      {error ? <div className="success-box portal-alert portal-alert-error" style={{ marginTop: 12 }}>{error}</div> : null}

      <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" placeholder="e.g. SafetyIQ Platform Rollout — Acme Construction" required />
        </div>
        <ProposalTemplatePicker value={templateId} onChange={setTemplateId} disabled={submitting} />
        <div className="field">
          <label htmlFor="client_id">Company</label>
          <select id="client_id" name="client_id" defaultValue="">
            <option value="">Unassigned</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="owner">Owner</label>
          <input id="owner" name="owner" placeholder="Who owns this deal?" />
        </div>
        <div className="field">
          <label htmlFor="proposal_value">Value (USD)</label>
          <input id="proposal_value" name="proposal_value" inputMode="decimal" placeholder="e.g. 25000" />
        </div>
        <div className="field">
          <label htmlFor="valid_until">Valid until</label>
          <input id="valid_until" name="valid_until" type="date" />
        </div>

        <button className="button button-primary" disabled={submitting} type="submit" style={{ justifySelf: "start" }}>
          {submitting ? <Loader2 size={18} className="spin" /> : <FilePlus2 size={18} />}
          {submitting ? "Creating…" : "Create Proposal"}
        </button>
      </div>
    </form>
  );
}
