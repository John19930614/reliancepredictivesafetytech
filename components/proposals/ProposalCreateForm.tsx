"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";
import { createProposal } from "@/app/employee/proposals/actions";
import { createProposalFromTemplate } from "@/app/employee/proposals/templates/actions";
import { assignClientCode } from "@/app/employee/clients/[id]/actions";
import {
  clientCodeRule,
  formatClientProposalNumber,
  suggestClientCode,
} from "@/lib/proposals/client-codes";
import { ProposalTemplatePicker } from "./ProposalTemplatePicker";

interface ClientOption {
  id: string;
  name: string;
  /** The proposal moniker (HUN); null until someone assigns it. */
  client_code?: string | null;
}

export function ProposalCreateForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [clientId, setClientId] = useState("");
  const [codeDraft, setCodeDraft] = useState("");

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId) ?? null,
    [clients, clientId],
  );
  const existingCode = (selectedClient?.client_code ?? "").trim().toUpperCase();
  const needsCode = selectedClient !== null && existingCode === "";

  const takenCodes = useMemo(
    () => clients.map((client) => (client.client_code ?? "").trim()).filter((code) => code !== ""),
    [clients],
  );

  function handleClientChange(nextId: string) {
    setClientId(nextId);
    const next = clients.find((client) => client.id === nextId) ?? null;
    const nextCode = (next?.client_code ?? "").trim();
    // A fresh suggestion per company; anything the user typed for the previous
    // company was about that company's name, not this one's.
    setCodeDraft(next && nextCode === "" ? suggestClientCode(next.name, takenCodes) : "");
  }

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

    // "Whoever writes proposal 01 assigns the moniker" (build review,
    // 2026-08-07): a company without a code gets one HERE, before the insert,
    // so the number this proposal is allocated is already CODE-01. Assignment
    // failing (taken, malformed) stops the create — silently falling back to an
    // RPS number would defeat the decision.
    if (shared.clientId && needsCode) {
      const assigned = await assignClientCode(shared.clientId, codeDraft);
      if (!assigned.ok) {
        setError(assigned.error ?? "The proposal code could not be assigned.");
        setSubmitting(false);
        return;
      }
    }

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
          <input
            autoFocus
            id="title"
            name="title"
            placeholder="e.g. SafetyIQ Platform Rollout — Acme Construction"
            required
            maxLength={200}
          />
        </div>
        <ProposalTemplatePicker value={templateId} onChange={setTemplateId} disabled={submitting} />
        <div className="field">
          <label htmlFor="client_id">Company</label>
          <select
            id="client_id"
            name="client_id"
            value={clientId}
            onChange={(event) => handleClientChange(event.target.value)}
          >
            <option value="">Unassigned</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.client_code ? ` (${c.client_code})` : ""}
              </option>
            ))}
          </select>
        </div>
        {needsCode ? (
          <div className="field">
            <label htmlFor="client_code">Proposal code for {selectedClient?.name}</label>
            <input
              id="client_code"
              value={codeDraft}
              onChange={(event) => setCodeDraft(event.target.value.toUpperCase())}
              maxLength={3}
              pattern="[A-Za-z]{2,3}"
              title={clientCodeRule}
              placeholder="e.g. HUN"
              style={{ textTransform: "uppercase", letterSpacing: "0.12em" }}
              required
            />
            <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 4 }}>
              First proposal for this company — you assign its code ({clientCodeRule}) and this document becomes{" "}
              {formatClientProposalNumber(codeDraft || "SE", 1)}. The code is checked for uniqueness and stays fixed.
            </p>
          </div>
        ) : existingCode !== "" ? (
          <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: -6 }}>
            Numbered under {existingCode} — this document gets the next {existingCode}-number automatically.
          </p>
        ) : null}
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
          {submitting ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <FilePlus2 size={18} aria-hidden="true" />}
          {submitting ? "Creating…" : "Create proposal"}
        </button>
      </div>
    </form>
  );
}
