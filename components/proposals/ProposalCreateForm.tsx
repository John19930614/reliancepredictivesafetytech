"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";
import { createProposal } from "@/app/employee/proposals/actions";

interface ClientOption {
  id: string;
  name: string;
}

export function ProposalCreateForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

    const result = await createProposal({
      title: String(formData.get("title") ?? "").trim(),
      clientId: String(formData.get("client_id") ?? "") || null,
      owner: String(formData.get("owner") ?? "").trim() || null,
      proposalValue: parsedValue,
      validUntil: String(formData.get("valid_until") ?? "") || null,
      summary: String(formData.get("summary") ?? "").trim() || null,
      bodyMarkdown: String(formData.get("body_markdown") ?? "") || null,
    });

    if (!result.ok || !result.proposalId) {
      setError(result.error ?? "Failed to create the proposal.");
      setSubmitting(false);
      return;
    }

    router.push(`/employee/proposals/${result.proposalId}`);
    router.refresh();
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit}>
      <h2>New proposal</h2>
      <p style={{ color: "var(--portal-muted)", marginTop: 4, fontSize: "0.9rem" }}>
        Start a proposal, assign it to a company, and refine it revision by revision.
      </p>
      {error ? <div className="error-box" style={{ marginTop: 12 }}>{error}</div> : null}

      <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" placeholder="e.g. SafetyIQ Platform Rollout — Acme Construction" required />
        </div>
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
        <div className="field">
          <label htmlFor="summary">Summary</label>
          <textarea id="summary" name="summary" rows={2} placeholder="One-paragraph overview of what is being proposed." />
        </div>
        <div className="field">
          <label htmlFor="body_markdown">Proposal body</label>
          <textarea id="body_markdown" name="body_markdown" rows={6} placeholder="Scope, deliverables, pricing, terms…" />
        </div>

        <button className="button button-primary" disabled={submitting} type="submit" style={{ justifySelf: "start" }}>
          {submitting ? <Loader2 size={18} className="spin" /> : <FilePlus2 size={18} />}
          {submitting ? "Creating…" : "Create Proposal"}
        </button>
      </div>
    </form>
  );
}
