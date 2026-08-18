"use client";

// Raising an invoice by hand, with or without a proposal behind it.
//
// The counterpart to InvoicePanel, which can only bill an accepted proposal.
// Here the operator types the lines, which is why every figure on screen is a
// PREVIEW: nothing in this component posts a total. The server recomputes each
// line from the quantity, the price and the basis (lib/invoices/manual.ts,
// which uses the same lineTotalFor as every other invoice in the system), so a
// tampered or merely stale browser cannot decide what a client is billed.
//
// NAMING A PROPOSAL IS OPTIONAL and it is a real decision, not a label: it
// changes the number the database will mint ({PROPOSAL}-{NN} rather than
// {SLUG}-{YYYY}-INV-{NN}) and it turns on the contract-value ceiling. The
// preview under the client field therefore tracks the choice, and the picker
// only ever lists the SELECTED client's proposals — the server checks that
// pairing again anyway, because a list rendered here is not a permission.
//
// Styling is the repo's existing form vocabulary — .form-panel, .form-grid,
// .field, .data-table, .button — the same set GrantCreateForm and InvoicePanel
// use. No new CSS.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react";
import { createManualInvoice } from "@/app/employee/invoices/actions";
import { assignCompanySlug } from "@/app/employee/clients/[id]/actions";
import {
  lineTotalFor,
  maxLineDescriptionLength,
  maxLineDescriptionLines,
  quantityBases,
  isQuantityBasis,
  type QuantityBasis,
} from "@/lib/invoices/draft";
import { maxManualInvoiceLines } from "@/lib/invoices/manual";
import {
  companySlugPattern,
  companySlugRule,
  formatInvoiceNumber,
  formatManualInvoiceNumber,
  normalizeCompanySlug,
  suggestCompanySlug,
} from "@/lib/proposals/company-slug";

/** How each basis reads in a dropdown, matching InvoicePanel's wording. */
const basisLabels: Record<QuantityBasis, string> = {
  attendee: "Per attendee",
  session: "Per session",
  hour: "Per hour",
  flat: "Flat fee",
};

interface ClientOption {
  id: string;
  name: string;
  /** The company slug (WONDFOUSA); null until someone assigns it. */
  company_slug?: string | null;
}

/** One proposal this invoice could be billed against. */
interface ProposalOption {
  id: string;
  client_id: string;
  title: string;
  /** What the invoice number is built from. The page filters out the nulls. */
  proposal_number: string | null;
  /** The ceiling the database guard will enforce once this one is named. */
  proposal_value?: number | string | null;
}

/**
 * The proposal's value as it reads in the option, or "" when none is recorded.
 *
 * Grouped digits with NO currency symbol, deliberately: client_proposals
 * carries a value but not a currency, and this form lets the operator choose
 * the invoice's currency separately. Printing "$12,000" beside a proposal
 * against a GBP invoice would state something nobody recorded.
 */
function proposalValueLabel(value: number | string | null | undefined): string {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(parsed);
}

/** One line's edit buffer. Strings, because that is what an input holds. */
interface LineDraft {
  key: number;
  description: string;
  quantity: string;
  unit: string;
  qtyBasis: string;
  unitAmount: string;
  serviceDate: string;
}

let nextLineKey = 0;

function blankLine(): LineDraft {
  nextLineKey += 1;
  return {
    key: nextLineKey,
    description: "",
    quantity: "1",
    unit: "",
    // 'flat' is the safe default for the same reason it is the column default:
    // it refuses to multiply, so a line whose basis nobody has chosen yet cannot
    // scale by a number the operator did not mean as a multiplier.
    qtyBasis: "flat",
    unitAmount: "",
    serviceDate: "",
  };
}

/** Empty reads as zero here so the preview stays a number; the server rejects it. */
function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function previewLineTotal(line: LineDraft): number {
  return lineTotalFor({
    quantity: toNumber(line.quantity),
    unitAmount: toNumber(line.unitAmount),
    qtyBasis: isQuantityBasis(line.qtyBasis) ? line.qtyBasis : "flat",
  });
}

export function ManualInvoiceForm({
  clients,
  proposals,
  year,
}: {
  clients: ClientOption[];
  proposals: ProposalOption[];
  year: number;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [taxAmount, setTaxAmount] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  // Controlled, unlike the rest of the form, because the slug field below and
  // the number preview both depend on WHICH client is chosen.
  const [clientId, setClientId] = useState("");
  const [slugDraft, setSlugDraft] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [proposalId, setProposalId] = useState("");

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId) ?? null,
    [clients, clientId],
  );
  const existingSlug = normalizeCompanySlug(selectedClient?.company_slug);

  // Recomputed from the CHOSEN client, which is what makes the picker
  // repopulate when the client changes rather than keeping the previous
  // company's contracts on offer.
  const clientProposals = useMemo(
    () => (clientId === "" ? [] : proposals.filter((proposal) => proposal.client_id === clientId)),
    [proposals, clientId],
  );
  const selectedProposal = useMemo(
    () => clientProposals.find((proposal) => proposal.id === proposalId) ?? null,
    [clientProposals, proposalId],
  );

  // Only when this invoice will be numbered off the slug. Billing a proposal
  // numbers it off the PARENT instead ({PROPOSAL}-{NN}), so demanding a slug
  // there would block a legitimate invoice — and the server agrees, gating the
  // same way round.
  const needsSlug = selectedClient !== null && existingSlug === "" && selectedProposal === null;

  // The year the counter will actually use: allocate_client_invoice_number()
  // takes it from coalesce(issue_date, current_date), so backdating an invoice
  // into last December moves it onto last year's sequence. The preview says so
  // rather than showing a number the database would not mint.
  const issueYear = /^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? Number(issueDate.slice(0, 4)) : year;

  /**
   * The number the database is about to mint, in whichever of the two shapes
   * the proposal choice above decides.
   *
   * Both come from lib/proposals/company-slug.ts rather than being assembled
   * here: those formatters carry the padding rules the SQL allocator uses
   * (two wide, GROWN past it, never truncated), and a preview that built its
   * own string would drift from the number the client actually receives.
   *
   * The sequence shown is 1 in both shapes — the real one comes off a counter
   * only the database can read, which is why the wording says "or the next
   * free number" rather than promising this exact string.
   */
  const numberPreview =
    selectedProposal !== null
      ? formatInvoiceNumber(selectedProposal.proposal_number ?? "", 1)
      : formatManualInvoiceNumber(existingSlug || slugDraft || "WONDFOUSA", issueYear, 1);

  function handleClientChange(nextId: string) {
    setClientId(nextId);
    // Cleared, never carried across: a proposal belongs to exactly one company,
    // so a selection left over from the previous one would post a pairing the
    // server is about to refuse — and would meanwhile show a number preview
    // built from another client's proposal.
    setProposalId("");
    const next = clients.find((client) => client.id === nextId) ?? null;
    // A fresh suggestion per company; anything typed for the previous company
    // was about that company's name, not this one's.
    setSlugDraft(next && normalizeCompanySlug(next.company_slug) === "" ? suggestCompanySlug(next.name) : "");
  }

  function setLineField(key: number, field: keyof Omit<LineDraft, "key">, value: string) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
  }

  function addLine() {
    setLines((current) => (current.length >= maxManualInvoiceLines ? current : [...current, blankLine()]));
  }

  function removeLine(key: number) {
    // Never down to zero: an invoice needs a line, and an empty table gives the
    // operator nothing to type into.
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.key !== key)));
  }

  const subtotal = lines.reduce((sum, line) => sum + previewLineTotal(line), 0);
  const total = subtotal + Math.max(0, toNumber(taxAmount));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setSubmitting(true);
    setErrors([]);
    setSaved(null);

    // The slug is assigned HERE, BEFORE the insert, for the same reason
    // ProposalCreateForm assigns it before creating a proposal: the number is
    // minted by a BEFORE INSERT trigger that reads company_clients.company_slug,
    // so a slug written afterwards arrives too late. Unlike proposals there is
    // no fallback left to land on — the allocator refuses a manual invoice for
    // an unslugged client outright — so a failed assignment simply stops here
    // with the reason it gave.
    //
    // Third argument omitted deliberately: that is the compare-and-set, and
    // omitting it means "assign only if this company still has none". This form
    // never changes an existing slug; the company record does that.
    const chosenClientId = String(data.get("client_id") ?? "");
    if (chosenClientId && needsSlug) {
      const assigned = await assignCompanySlug(chosenClientId, slugDraft);
      if (!assigned.ok) {
        setErrors([assigned.error ?? "The company slug could not be assigned."]);
        setSubmitting(false);
        return;
      }
    }

    const result = await createManualInvoice({
      clientId: String(data.get("client_id") ?? ""),
      // "" means no proposal, which is what the validator reads as null. The
      // server re-checks that this proposal belongs to that client; the filter
      // above is a convenience, not a permission.
      proposalId: String(data.get("proposal_id") ?? ""),
      currency: String(data.get("currency") ?? "USD"),
      issueDate: String(data.get("issue_date") ?? ""),
      dueDate: String(data.get("due_date") ?? ""),
      paymentTerms: String(data.get("payment_terms") ?? ""),
      taxAmount: toNumber(String(data.get("tax_amount") ?? "0")),
      consultantName: String(data.get("consultant_name") ?? ""),
      jobName: String(data.get("job_name") ?? ""),
      clientAgreementRef: String(data.get("client_agreement_ref") ?? ""),
      preparedBy: String(data.get("prepared_by") ?? ""),
      notes: String(data.get("notes") ?? ""),
      lines: lines.map((line) => ({
        description: line.description,
        quantity: toNumber(line.quantity),
        unitAmount: toNumber(line.unitAmount),
        unit: line.unit,
        qtyBasis: line.qtyBasis,
        serviceDate: line.serviceDate,
      })),
    });

    setSubmitting(false);

    if (!result.ok) {
      setErrors(result.errors ?? [result.error ?? "The invoice could not be raised."]);
      return;
    }

    form.reset();
    setLines([blankLine()]);
    setTaxAmount("0");
    // form.reset() cannot clear controlled state, and leaving the previous
    // client selected would offer its slug field against a blank invoice.
    setClientId("");
    setProposalId("");
    setSlugDraft("");
    setIssueDate("");
    setSaved(`Draft ${result.invoiceNumber ?? "invoice"} raised. Issue it from the client's workflow page.`);
    router.refresh();
  }

  if (clients.length === 0) {
    return (
      <section className="form-panel">
        <h2>Raise an invoice</h2>
        <p className="platform-empty">
          There are no clients to invoice yet. Add a company first, then come back.
        </p>
      </section>
    );
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit}>
      <h2>Raise an invoice</h2>
      <p style={{ color: "var(--portal-muted)", marginTop: 4, fontSize: "0.9rem" }}>
        Type the lines yourself — for work with no proposal behind it, or against a proposal you name below. Saved as
        a draft; issuing it is a separate act, done from the client&rsquo;s workflow page. The number is allocated by
        the database, never chosen here: {formatManualInvoiceNumber("WONDFOUSA", issueYear, 1)} for an invoice with no
        proposal behind it, {formatInvoiceNumber("WONDFOUSA-2026-001", 1)} for one billing a proposal.
      </p>

      {errors.length > 0 ? (
        <div className="success-box portal-alert portal-alert-error" style={{ marginTop: 12 }} role="alert">
          {errors.length === 1 ? (
            errors[0]
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {saved ? (
        <div className="success-box" style={{ marginTop: 12 }} role="status">
          {saved}
        </div>
      ) : null}

      <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
        <label className="field">
          <span>Client</span>
          <select
            name="client_id"
            onChange={(event) => handleClientChange(event.target.value)}
            required
            value={clientId}
          >
            <option value="" disabled>
              Choose a client
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
                {/* Marked in the list, not just after selection: a company with
                    no slug needs one decided before it can be invoiced at all,
                    and that is worth knowing while choosing. */}
                {client.company_slug ? ` (${client.company_slug})` : " — needs a company slug"}
              </option>
            ))}
          </select>
        </label>

        {needsSlug ? (
          <label className="field">
            <span>Company slug for {selectedClient?.name}</span>
            <input
              // Normalized on the way in: normalizeCompanySlug DELETES spaces
              // and punctuation rather than trimming, so what is typed here and
              // what gets stored must be the same string.
              onChange={(event) => setSlugDraft(normalizeCompanySlug(event.target.value))}
              maxLength={40}
              pattern={companySlugPattern.source.replace(/^\^|\$$/g, "")}
              placeholder="e.g. WONDFOUSA"
              required
              style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
              title={companySlugRule}
              value={slugDraft}
            />
            <span className="table-subtext">
              First document for this company — {companySlugRule} This invoice becomes{" "}
              {formatManualInvoiceNumber(slugDraft || "WONDFOUSA", issueYear, 1)}, or the next free number in that
              year. The slug is checked for uniqueness, and once a number is issued under it, it is fixed for good.
            </span>
          </label>
        ) : null}

        {/*
          Billing against a proposal — optional, and only ever offering THIS
          client's proposals. Choosing one is what moves the invoice onto the
          proposal's own numbering and under its contract-value ceiling; both
          are said out loud in the note below rather than discovered later.
        */}
        <label className="field">
          <span>Billing against</span>
          <select
            disabled={submitting || clientProposals.length === 0}
            name="proposal_id"
            onChange={(event) => setProposalId(event.target.value)}
            value={proposalId}
          >
            <option value="">
              {clientId === ""
                ? "Choose a client first"
                : clientProposals.length === 0
                  ? "This client has no proposals to bill against"
                  : "No proposal — bill this on its own"}
            </option>
            {clientProposals.map((proposal) => {
              const value = proposalValueLabel(proposal.proposal_value);
              return (
                <option key={proposal.id} value={proposal.id}>
                  {proposal.proposal_number} · {proposal.title}
                  {value === "" ? "" : ` · ${value}`}
                </option>
              );
            })}
          </select>
          <span className="table-subtext">
            Optional. Leave it alone for a callout, a reissued certificate, or anything else with no contract behind
            it.
          </span>
        </label>

        {/* The two consequences of the choice above, stated where it is made. */}
        {clientId !== "" ? (
          <p className="wf-step-note">
            {selectedProposal !== null ? (
              <>
                Numbered off {selectedProposal.proposal_number} — this invoice becomes {numberPreview}, or the next
                free number under that proposal. Live invoices against it cannot total more than its recorded value.
              </>
            ) : (
              <>
                No proposal behind it — numbered from the company slug, so this invoice becomes {numberPreview}, or
                the next free number in {issueYear}.
              </>
            )}
          </p>
        ) : null}

        <label className="field">
          <span>Issue date</span>
          <input name="issue_date" onChange={(event) => setIssueDate(event.target.value)} type="date" value={issueDate} />
        </label>

        <label className="field">
          <span>Payment terms</span>
          <input
            name="payment_terms"
            maxLength={1000}
            defaultValue="Net 30 from invoice date"
            placeholder="e.g. Net 30 from invoice date"
          />
        </label>

        <label className="field">
          <span>Due date</span>
          <input name="due_date" type="date" />
          {/* Left blank on purpose by most operators: the terms above decide it. */}
          <span className="table-subtext">Leave blank to derive it from the payment terms.</span>
        </label>

        <label className="field">
          <span>Currency</span>
          <input name="currency" defaultValue="USD" maxLength={3} minLength={3} required />
        </label>
      </div>

      <div className="wf-invoice-form">
        <div className="data-table-wrapper">
          <table className="data-table invoice-line-table">
            <colgroup>
              <col className="invoice-col-item" />
              <col className="invoice-col-date" />
              <col className="invoice-col-qty" />
              <col className="invoice-col-basis" />
              <col className="invoice-col-unit" />
              <col className="invoice-col-price" />
              <col className="invoice-col-amount" />
              <col className="invoice-col-remove" />
            </colgroup>
            <caption className="table-subtext">
              A flat fee ignores its quantity; every other basis multiplies. A description can run to{" "}
              {maxLineDescriptionLines} lines — press Enter for a heading and its detail. Amounts here are a preview
              — the server recomputes them.
            </caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Date</th>
                <th scope="col">Qty</th>
                <th scope="col">Basis</th>
                <th scope="col">Unit</th>
                <th scope="col">Price</th>
                <th scope="col">Amount</th>
                <th scope="col" aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key}>
                  <td>
                    {/*
                      A TEXTAREA, because a description carries a heading and
                      its detail —

                        Training
                        Biosafety Training: Classroom and Practical.

                      — and an <input> cannot hold the break. Both writers
                      render it (lib/invoices/pdf.ts wraps each paragraph in the
                      DESCRIPTION column, lib/invoices/docx.ts emits one run per
                      line), and lib/invoices/manual.ts bounds both the length
                      and the number of lines.

                      Styled inline rather than in CSS: the global rule gives
                      every textarea min-height 118px and the .invoice-line-table
                      block sizes `input, select` only. Left alone this control
                      would be a 118px-tall box in a table row of 40px inputs.
                      Two rows tall, growing on drag, inside the same fixed
                      .invoice-col-item column as before.
                    */}
                    <textarea
                      aria-label={`Description for line ${index + 1}`}
                      disabled={submitting}
                      maxLength={maxLineDescriptionLength}
                      onChange={(event) => setLineField(line.key, "description", event.target.value)}
                      placeholder={"What is being billed\nDetail on the next line, if it helps"}
                      rows={2}
                      style={{ width: "100%", minWidth: 0, minHeight: 0, resize: "vertical" }}
                      value={line.description}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Service date for line ${index + 1}`}
                      disabled={submitting}
                      onChange={(event) => setLineField(line.key, "serviceDate", event.target.value)}
                      type="date"
                      value={line.serviceDate}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Quantity for line ${index + 1}`}
                      disabled={submitting}
                      inputMode="decimal"
                      min="0"
                      onChange={(event) => setLineField(line.key, "quantity", event.target.value)}
                      step="0.01"
                      type="number"
                      value={line.quantity}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Quantity basis for line ${index + 1}`}
                      disabled={submitting}
                      onChange={(event) => setLineField(line.key, "qtyBasis", event.target.value)}
                      value={line.qtyBasis}
                    >
                      {quantityBases.map((basis) => (
                        <option key={basis} value={basis}>
                          {basisLabels[basis]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`Unit for line ${index + 1}`}
                      disabled={submitting}
                      maxLength={60}
                      onChange={(event) => setLineField(line.key, "unit", event.target.value)}
                      placeholder="Seat, Hour"
                      value={line.unit}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Unit price for line ${index + 1}`}
                      disabled={submitting}
                      inputMode="decimal"
                      min="0"
                      onChange={(event) => setLineField(line.key, "unitAmount", event.target.value)}
                      step="0.01"
                      type="number"
                      value={line.unitAmount}
                    />
                  </td>
                  <td>{previewLineTotal(line).toFixed(2)}</td>
                  <td>
                    <button
                      aria-label={`Remove line ${index + 1}`}
                      className="button button-neutral button-sm"
                      disabled={submitting || lines.length <= 1}
                      onClick={() => removeLine(line.key)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="wf-step-actions">
          <button
            className="button button-neutral button-sm"
            disabled={submitting || lines.length >= maxManualInvoiceLines}
            onClick={addLine}
            type="button"
          >
            <Plus aria-hidden="true" size={13} /> Add line
          </button>
        </div>
      </div>

      <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
        <label className="field">
          <span>Tax</span>
          <input
            inputMode="decimal"
            min="0"
            name="tax_amount"
            onChange={(event) => setTaxAmount(event.target.value)}
            step="0.01"
            type="number"
            value={taxAmount}
          />
        </label>

        <p className="wf-step-note">
          Subtotal {subtotal.toFixed(2)} · tax {Math.max(0, toNumber(taxAmount)).toFixed(2)} · total {total.toFixed(2)}
        </p>

        <label className="field">
          <span>Consultant</span>
          <input name="consultant_name" maxLength={200} placeholder="Who did the work" />
        </label>

        <label className="field">
          <span>Job name</span>
          <input name="job_name" maxLength={300} placeholder="What the client will recognise it as" />
        </label>

        <label className="field">
          <span>Client agreement reference</span>
          <input name="client_agreement_ref" maxLength={120} placeholder="If there is one" />
        </label>

        <label className="field">
          <span>Prepared by</span>
          <input name="prepared_by" maxLength={200} />
        </label>

        <label className="field">
          <span>Notes</span>
          <textarea name="notes" rows={3} maxLength={4000} placeholder="Anything the client should read on the document" />
        </label>

        <button className="button button-primary" disabled={submitting} type="submit" style={{ justifySelf: "start" }}>
          {submitting ? <Loader2 size={18} className="spin" /> : <Receipt size={18} />}
          {submitting ? "Raising…" : "Raise draft invoice"}
        </button>
      </div>
    </form>
  );
}
