"use client";

// Raising an invoice against a client with no proposal behind it.
//
// The counterpart to InvoicePanel, which can only bill an accepted proposal.
// Here the operator types the lines, which is why every figure on screen is a
// PREVIEW: nothing in this component posts a total. The server recomputes each
// line from the quantity, the price and the basis (lib/invoices/manual.ts,
// which uses the same lineTotalFor as every other invoice in the system), so a
// tampered or merely stale browser cannot decide what a client is billed.
//
// Styling is the repo's existing form vocabulary — .form-panel, .form-grid,
// .field, .data-table, .button — the same set GrantCreateForm and InvoicePanel
// use. No new CSS.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react";
import { createManualInvoice } from "@/app/employee/invoices/actions";
import { lineTotalFor, quantityBases, isQuantityBasis, type QuantityBasis } from "@/lib/invoices/draft";
import { maxManualInvoiceLines } from "@/lib/invoices/manual";

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

export function ManualInvoiceForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<LineDraft[]>([blankLine()]);
  const [taxAmount, setTaxAmount] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);

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

    const result = await createManualInvoice({
      clientId: String(data.get("client_id") ?? ""),
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
        For work that has no proposal behind it. Saved as a draft — issuing it is a separate act, done from the
        client&rsquo;s workflow page. The invoice number is allocated by the database.
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
          <select name="client_id" defaultValue="" required>
            <option value="" disabled>
              Choose a client
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Issue date</span>
          <input name="issue_date" type="date" />
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
              A flat fee ignores its quantity; every other basis multiplies. Amounts here are a preview — the server
              recomputes them.
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
                    <input
                      aria-label={`Description for line ${index + 1}`}
                      disabled={submitting}
                      maxLength={500}
                      onChange={(event) => setLineField(line.key, "description", event.target.value)}
                      placeholder="What is being billed"
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
