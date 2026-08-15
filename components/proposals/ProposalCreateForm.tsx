"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";
import {
  createProposalFromTemplate,
  createProposalFromTransactionType,
} from "@/app/employee/proposals/templates/actions";
import { assignCompanySlug } from "@/app/employee/clients/[id]/actions";
import {
  companySlugPattern,
  companySlugRule,
  formatProposalNumber,
  normalizeCompanySlug,
  suggestCompanySlug,
} from "@/lib/proposals/company-slug";
import { ProposalTemplatePicker, transactionTypeOptionPrefix } from "./ProposalTemplatePicker";

interface ClientOption {
  id: string;
  name: string;
  /** Legacy 2–3 letter moniker (HUN). Read-only — kept so old numbers stay explicable. */
  client_code?: string | null;
  /** The company slug (WONDFOUSA); null until someone assigns it. */
  company_slug?: string | null;
}

export function ProposalCreateForm({ clients, year }: { clients: ClientOption[]; year: number }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [clientId, setClientId] = useState("");
  const [slugDraft, setSlugDraft] = useState("");

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId) ?? null,
    [clients, clientId],
  );
  const existingSlug = normalizeCompanySlug(selectedClient?.company_slug);
  const legacyCode = normalizeCompanySlug(selectedClient?.client_code);
  const needsSlug = selectedClient !== null && existingSlug === "";

  function handleClientChange(nextId: string) {
    setClientId(nextId);
    const next = clients.find((client) => client.id === nextId) ?? null;
    // A fresh suggestion per company; anything the user typed for the previous
    // company was about that company's name, not this one's.
    setSlugDraft(next && normalizeCompanySlug(next.company_slug) === "" ? suggestCompanySlug(next.name) : "");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    // The type gate, checked before anything is written.
    //
    // `required` on the <select> already stops a normal submit, but this form
    // submits through onSubmit rather than the browser's own validation path in
    // every case (a programmatic submit, or a stale value left in state after a
    // failed create, both reach here). A proposal created with no type falls
    // back to platform-era copy for its subtitle, its section 03 lead-in and
    // its deliverables — the defect that put "Configured platform subscription"
    // on a signed CPR/AED training proposal — so this is checked here too.
    const formData = new FormData(event.currentTarget);
    if (!templateId) {
      setSubmitting(false);
      setError(
        "Choose a proposal type. It decides what the client's document says about the deal — a subscription " +
          "document names a platform package and a services document does not.",
      );
      return;
    }

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

    // The company's first proposal must already be correctly numbered, so a
    // company without a slug gets one HERE, BEFORE the insert — the number is
    // allocated by a BEFORE INSERT trigger that reads company_clients.company_slug,
    // so a slug written after the insert arrives too late and that proposal
    // carries a global RPS number forever. Assignment failing (taken, malformed,
    // not an admin) stops the create: silently falling back to an RPS number
    // would defeat the decision of record (call 2026-08-14), and the fallback is
    // invisible at this point in the flow.
    //
    // Third argument omitted deliberately — that is the compare-and-set, and
    // omitting it means "assign only if this company still has none". This form
    // never changes an existing slug; the company record does that.
    if (shared.clientId && needsSlug) {
      const assigned = await assignCompanySlug(shared.clientId, slugDraft);
      if (!assigned.ok) {
        setError(assigned.error ?? "The company slug could not be assigned.");
        setSubmitting(false);
        return;
      }
    }

    // Two create paths, both landing in the same editor and both carrying a
    // type. The proposal-type path seeds from the built-in transaction-type
    // registry, which stamps `proposalType` into the state; the saved-template
    // path uses the Proposal Templates module's own action, and a template
    // captured from a typed proposal carries the stamp with it. Both scrub any
    // captured client identity out and layer this company's in.
    //
    // A template captured BEFORE types existed carries no stamp, and that
    // action refuses it rather than minting an untyped proposal. The refusal
    // surfaces through setError below, which asks for a type — so the seller
    // picks a built-in type instead. Failing closed is deliberate: an untyped
    // proposal renders the platform-era fallback copy.
    //
    // The third path — createProposal(), the untyped blank one — is no longer
    // reachable from this form. It is what produced the typeless proposals in
    // the first place, and it now refuses to create one without a type of its
    // own accord (app/employee/proposals/actions.ts).
    const result = templateId.startsWith(transactionTypeOptionPrefix)
      ? await createProposalFromTransactionType({
          ...shared,
          typeKey: templateId.slice(transactionTypeOptionPrefix.length),
        })
      : await createProposalFromTemplate({ ...shared, templateId });

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
                {c.company_slug ? ` (${c.company_slug})` : c.client_code ? ` (legacy ${c.client_code})` : ""}
              </option>
            ))}
          </select>
        </div>
        {needsSlug ? (
          <div className="field">
            <label htmlFor="company_slug">Company slug for {selectedClient?.name}</label>
            <input
              id="company_slug"
              value={slugDraft}
              // Normalized on the way in: normalizeCompanySlug DELETES spaces
              // and punctuation rather than trimming, so what is typed here and
              // what gets stored must be the same string.
              onChange={(event) => setSlugDraft(normalizeCompanySlug(event.target.value))}
              maxLength={40}
              pattern={companySlugPattern.source.replace(/^\^|\$$/g, "")}
              title={companySlugRule}
              placeholder="e.g. WONDFOUSA"
              style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
              required
            />
            <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 4 }}>
              First proposal for this company — {companySlugRule} This document becomes{" "}
              {formatProposalNumber(slugDraft || "WONDFOUSA", year, 1)}. The slug is checked for
              uniqueness, and once a number is issued under it, it is fixed for good.
              {legacyCode ? (
                <>
                  {" "}
                  This company&apos;s older proposals are numbered under the legacy code <strong>{legacyCode}</strong>;
                  those keep the numbers they were issued under.
                </>
              ) : null}
            </p>
          </div>
        ) : existingSlug !== "" ? (
          <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: -6 }}>
            Numbered under {existingSlug} — this document gets the next {existingSlug}-{year} number automatically.
            {legacyCode ? ` Legacy code ${legacyCode} still explains its older numbers.` : ""}
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
