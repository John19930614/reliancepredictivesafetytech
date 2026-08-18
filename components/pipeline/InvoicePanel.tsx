"use client";

// Raising, editing and settling the invoices behind the Invoicing step.
//
// Before this existed, winning a deal filed "expected income" rows into the
// finance ledger and that was the whole of billing — "invoiced" was a status
// somebody picked from a dropdown, with no document, no number, and nothing to
// send. This panel is where a real numbered invoice gets raised from the
// accepted proposal, corrected, and then issued.
//
// Raising and issuing are deliberately two acts. A draft is a document nobody
// has seen; issuing is the moment a client is asked for money, which is why the
// gate on the Invoicing step counts issued invoices and not drafts.
//
// WHY THE LINES ARE EDITABLE HERE. A class quoted at 12 seats x $105 = $1,260
// and attended by ten people has to bill $1,050. The generated invoice is a
// starting point, not a verdict: reality arrives after the quote. Until this
// panel showed the lines it showed only a number, so the only ways to correct
// one were to void a numbered record over a headcount or to edit the exported
// document — putting a figure on a client's desk that nothing in this system
// agrees with.
//
// The arithmetic on screen is a PREVIEW. Every amount that gets stored is
// recomputed by the server from the quantity, the price and the basis
// (lib/invoices/draft.ts, lineTotalFor); nothing here posts a total.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil, Receipt } from "lucide-react";
import {
  createInvoiceFromProposal,
  loadInvoiceLines,
  settleInvoice,
  updateDraftInvoiceLines,
  updateInvoiceDetails,
  type InvoiceDetailsView,
  type InvoiceLineView,
} from "@/app/employee/clients/[id]/workflow/actions";
import {
  isQuantityBasis,
  lineTotalFor,
  quantityBases,
  type InvoiceLineEdit,
  type QuantityBasis,
} from "@/lib/invoices/draft";

export interface InvoiceView {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  currency: string;
  issue_date: string | null;
  due_date: string | null;
}

export interface InvoiceableProposal {
  id: string;
  label: string;
  hasDeposit: boolean;
}

interface InvoicePanelProps {
  clientId: string;
  invoices: InvoiceView[];
  proposals: InvoiceableProposal[];
  canDraftInvoice: boolean;
  canSettleInvoice: boolean;
  /** True when the invoices migration has not been applied yet. */
  unavailable: boolean;
}

const statusTone: Record<string, string> = {
  draft: "record-badge-neutral",
  issued: "record-badge-gold",
  paid: "badge-green",
  void: "record-badge-danger",
};

/** How each basis reads in a dropdown an operator has to choose from quickly. */
const basisLabels: Record<QuantityBasis, string> = {
  attendee: "Per attendee",
  session: "Per session",
  hour: "Per hour",
  flat: "Flat fee",
};

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    // An unexpected currency code must not take the panel down.
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** The edit buffer for one line. Strings, because that is what an input holds. */
interface LineDraft {
  quantity: string;
  unit: string;
  qtyBasis: string;
  serviceDate: string;
}

interface DetailsDraft {
  consultantName: string;
  jobName: string;
  paymentTerms: string;
  clientAgreementRef: string;
  preparedBy: string;
  taxAmount: string;
}

interface LoadedLines {
  lines: InvoiceLineView[];
  taxAmount: number;
  editable: boolean;
  /** What is stored on the invoice header, so the details form opens on it. */
  details: InvoiceDetailsView;
}

const emptyDetails: InvoiceDetailsView = {
  consultantName: "",
  jobName: "",
  paymentTerms: "",
  clientAgreementRef: "",
  preparedBy: "",
};

function toDraft(line: InvoiceLineView): LineDraft {
  return {
    quantity: String(line.quantity),
    unit: line.unit,
    qtyBasis: line.qtyBasis,
    serviceDate: line.serviceDate ?? "",
  };
}

/**
 * What this line would come to, for the operator to see before saving.
 *
 * An unreadable quantity shows the STORED amount rather than zero: a box being
 * retyped is empty for a moment, and flashing $0.00 into a total reads as the
 * edit having wiped the line.
 */
function previewLineTotal(line: InvoiceLineView, draft: LineDraft | undefined): number {
  if (!draft) return line.lineTotal;
  const quantity = Number.parseFloat(draft.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return line.lineTotal;
  return lineTotalFor({
    quantity,
    unitAmount: line.unitAmount,
    qtyBasis: isQuantityBasis(draft.qtyBasis) ? draft.qtyBasis : "flat",
  });
}

export function InvoicePanel({
  clientId,
  invoices,
  proposals,
  canDraftInvoice,
  canSettleInvoice,
  unavailable,
}: InvoicePanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState(proposals[0]?.id ?? "");
  const [kind, setKind] = useState("full");

  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Record<string, LoadedLines>>({});
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({});
  const [detailsDraft, setDetailsDraft] = useState<DetailsDraft | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);

  function run(
    action: () => Promise<{ ok: boolean; error?: string; notice?: string }>,
    success?: string,
    after?: () => Promise<void> | void,
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          // A server notice outranks the canned success line — it is the thing
          // the operator did not know, and it is about money.
          setNotice(result.notice ?? success ?? null);
          if (after) await after();
          router.refresh();
        } else {
          setError(result.error ?? "Could not complete that.");
        }
      } catch {
        // Never leave a money action looking like it silently did nothing.
        setError("Something went wrong reaching the server. Try again in a moment.");
      }
    });
  }

  async function fetchLines(invoiceId: string): Promise<void> {
    setLoadingLines(true);
    try {
      const result = await loadInvoiceLines(invoiceId);
      if (!result.ok || !result.lines) {
        setError(result.error ?? "Could not read the invoice lines.");
        return;
      }
      const lines = result.lines;
      setLoaded((current) => ({
        ...current,
        [invoiceId]: {
          lines,
          taxAmount: result.taxAmount ?? 0,
          editable: Boolean(result.editable),
          details: result.details ?? emptyDetails,
        },
      }));
      setLineDrafts((current) => {
        const next = { ...current };
        for (const line of lines) next[line.id] = toDraft(line);
        return next;
      });
    } catch {
      setError("Could not read the invoice lines. Try again in a moment.");
    } finally {
      setLoadingLines(false);
    }
  }

  function toggleInvoice(invoiceId: string): void {
    setError(null);
    setNotice(null);
    if (openInvoiceId === invoiceId) {
      setOpenInvoiceId(null);
      return;
    }
    setOpenInvoiceId(invoiceId);
    setDetailsDraft(null);
    if (!loaded[invoiceId]) void fetchLines(invoiceId);
  }

  function setLineField(lineId: string, field: keyof LineDraft, value: string): void {
    setLineDrafts((current) => ({
      ...current,
      [lineId]: { ...(current[lineId] ?? { quantity: "", unit: "", qtyBasis: "flat", serviceDate: "" }), [field]: value },
    }));
  }

  function saveLines(invoice: InvoiceView): void {
    const entry = loaded[invoice.id];
    if (!entry) return;

    // Only the fields this form actually offers. An omitted field is left as
    // stored, so a form with no price box cannot blank a price.
    const edits: InvoiceLineEdit[] = [];
    for (const line of entry.lines) {
      const draft = lineDrafts[line.id];
      if (!draft) continue;
      const quantity = Number.parseFloat(draft.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setError(`Give ${line.description || "every line"} a quantity above zero.`);
        return;
      }
      const unchanged =
        quantity === line.quantity &&
        draft.unit === line.unit &&
        draft.qtyBasis === line.qtyBasis &&
        (draft.serviceDate || null) === line.serviceDate;
      if (unchanged) continue;
      edits.push({
        id: line.id,
        quantity,
        unit: draft.unit,
        qtyBasis: draft.qtyBasis,
        serviceDate: draft.serviceDate === "" ? null : draft.serviceDate,
      });
    }

    if (edits.length === 0) {
      setError(null);
      setNotice("Nothing has changed on these lines.");
      return;
    }

    run(() => updateDraftInvoiceLines(invoice.id, edits), `${invoice.invoice_number} updated.`, () =>
      fetchLines(invoice.id),
    );
  }

  function saveDetails(invoice: InvoiceView): void {
    if (!detailsDraft) return;
    const taxText = detailsDraft.taxAmount.trim();
    const taxAmount = taxText === "" ? 0 : Number.parseFloat(taxText);
    if (!Number.isFinite(taxAmount) || taxAmount < 0) {
      setError("Tax has to be a number of zero or more.");
      return;
    }

    run(
      () =>
        updateInvoiceDetails(invoice.id, {
          consultantName: detailsDraft.consultantName,
          jobName: detailsDraft.jobName,
          paymentTerms: detailsDraft.paymentTerms,
          clientAgreementRef: detailsDraft.clientAgreementRef,
          preparedBy: detailsDraft.preparedBy,
          taxAmount,
        }),
      `${invoice.invoice_number} details saved.`,
      () => fetchLines(invoice.id),
    );
  }

  if (unavailable) {
    return (
      <section className="wf-panel">
        <h3 className="wf-panel-title">
          <Receipt aria-hidden="true" size={16} /> Invoices
        </h3>
        <p className="platform-empty">
          Invoicing is not set up in Supabase yet. Apply the latest database migrations and try again.
        </p>
      </section>
    );
  }

  const selected = proposals.find((proposal) => proposal.id === proposalId);

  return (
    <section className="wf-panel">
      <h3 className="wf-panel-title">
        <Receipt aria-hidden="true" size={16} /> Invoices
      </h3>

      {error ? (
        <p className="wf-step-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="wf-step-notice">{notice}</p> : null}

      {invoices.length === 0 ? (
        <p className="platform-empty">No invoice has been raised for this client yet.</p>
      ) : (
        <ul className="wf-invoice-list">
          {invoices.map((invoice) => {
            const entry = loaded[invoice.id];
            const isOpen = openInvoiceId === invoice.id;
            // Draft plus admin. The server decides the same thing again from its
            // own read; this only chooses between an input and a figure.
            const editable = invoice.status === "draft" && canSettleInvoice && (entry?.editable ?? true);
            const previewSubtotal = entry
              ? entry.lines.reduce((sum, line) => sum + previewLineTotal(line, lineDrafts[line.id]), 0)
              : 0;

            return (
              <li className="wf-invoice" key={invoice.id}>
                <div className="wf-invoice-head">
                  <FileText aria-hidden="true" size={15} />
                  <strong>{invoice.invoice_number}</strong>
                  <span className={`record-badge ${statusTone[invoice.status] ?? "record-badge-neutral"}`}>
                    {invoice.status}
                  </span>
                  <span className="wf-invoice-total">{money(invoice.total, invoice.currency)}</span>
                </div>
                <p className="wf-invoice-meta">
                  {invoice.issue_date ? `Issued ${invoice.issue_date}` : "Not issued"}
                  {invoice.due_date ? ` · due ${invoice.due_date}` : ""}
                </p>

                <div className="wf-step-actions">
                  <button
                    aria-expanded={isOpen}
                    className="button button-neutral button-sm"
                    onClick={() => toggleInvoice(invoice.id)}
                    type="button"
                  >
                    <Pencil aria-hidden="true" size={13} />{" "}
                    {isOpen ? "Hide lines" : editable ? "Lines & details" : "View lines"}
                  </button>
                  {/*
                    Plain links, not fetch + blob: the route handler already
                    verifies the session and sets Content-Disposition, and a link
                    lets the browser name the file from that header — which is
                    where the "Invoice <number> <date>" filing convention lives.
                  */}
                  <a
                    className="button button-neutral button-sm"
                    download
                    href={`/employee/clients/${clientId}/workflow/invoices/${invoice.id}/pdf`}
                  >
                    <FileText aria-hidden="true" size={13} /> PDF
                  </a>
                  <a
                    className="button button-neutral button-sm"
                    download
                    href={`/employee/clients/${clientId}/workflow/invoices/${invoice.id}/docx`}
                  >
                    <FileText aria-hidden="true" size={13} /> Word
                  </a>
                </div>

                {isOpen ? (
                  // .wf-invoice-form is the existing "panel section" rule — a
                  // grid with a rule above it. Reused rather than adding a class
                  // to globals.css for one container.
                  <div className="wf-invoice-form">
                    {!entry && loadingLines ? <p className="wf-step-note">Reading the lines…</p> : null}

                    {entry && entry.lines.length === 0 ? (
                      <p className="platform-empty">This invoice has no lines, which should not happen. Void it.</p>
                    ) : null}

                    {entry && entry.lines.length > 0 ? (
                      <>
                        <div className="data-table-wrapper">
                          <table className="data-table">
                            <caption className="table-subtext">
                              {editable
                                ? "Quantity, unit and basis are editable while this invoice is a draft. A flat fee ignores its quantity."
                                : `Lines on ${invoice.invoice_number}.`}
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
                              </tr>
                            </thead>
                            <tbody>
                              {entry.lines.map((line) => {
                                const draft = lineDrafts[line.id];
                                return (
                                  <tr key={line.id}>
                                    <td>{line.description}</td>
                                    <td>
                                      {editable ? (
                                        <input
                                          aria-label={`Service date for ${line.description}`}
                                          disabled={pending}
                                          onChange={(event) =>
                                            setLineField(line.id, "serviceDate", event.target.value)
                                          }
                                          type="date"
                                          value={draft?.serviceDate ?? ""}
                                        />
                                      ) : (
                                        (line.serviceDate ?? "—")
                                      )}
                                    </td>
                                    <td>
                                      {editable ? (
                                        <input
                                          aria-label={`Quantity for ${line.description}`}
                                          disabled={pending}
                                          inputMode="decimal"
                                          min="0"
                                          onChange={(event) => setLineField(line.id, "quantity", event.target.value)}
                                          step="0.01"
                                          type="number"
                                          value={draft?.quantity ?? String(line.quantity)}
                                        />
                                      ) : (
                                        line.quantity
                                      )}
                                    </td>
                                    <td>
                                      {editable ? (
                                        <select
                                          aria-label={`How the quantity is counted for ${line.description}`}
                                          disabled={pending}
                                          onChange={(event) => setLineField(line.id, "qtyBasis", event.target.value)}
                                          value={draft?.qtyBasis ?? line.qtyBasis}
                                        >
                                          {quantityBases.map((basis) => (
                                            <option key={basis} value={basis}>
                                              {basisLabels[basis]}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        basisLabels[isQuantityBasis(line.qtyBasis) ? line.qtyBasis : "flat"]
                                      )}
                                    </td>
                                    <td>
                                      {editable ? (
                                        <input
                                          aria-label={`Unit for ${line.description}`}
                                          disabled={pending}
                                          maxLength={60}
                                          onChange={(event) => setLineField(line.id, "unit", event.target.value)}
                                          placeholder="Seat"
                                          type="text"
                                          value={draft?.unit ?? line.unit}
                                        />
                                      ) : (
                                        line.unit || "—"
                                      )}
                                    </td>
                                    <td>{money(line.unitAmount, invoice.currency)}</td>
                                    <td>{money(previewLineTotal(line, draft), invoice.currency)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr>
                                <th colSpan={6} scope="row">
                                  Subtotal
                                </th>
                                <td>{money(previewSubtotal, invoice.currency)}</td>
                              </tr>
                              <tr>
                                <th colSpan={6} scope="row">
                                  Tax
                                </th>
                                <td>{money(entry.taxAmount, invoice.currency)}</td>
                              </tr>
                              <tr>
                                <th colSpan={6} scope="row">
                                  Total
                                </th>
                                <td>
                                  <strong>{money(previewSubtotal + entry.taxAmount, invoice.currency)}</strong>
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {editable ? (
                          <div className="wf-step-actions">
                            <button
                              className="button button-primary button-sm"
                              disabled={pending}
                              onClick={() => saveLines(invoice)}
                              type="button"
                            >
                              Save lines
                            </button>
                            <button
                              className="button button-neutral button-sm"
                              disabled={pending}
                              onClick={() => {
                                setLineDrafts((current) => {
                                  const next = { ...current };
                                  for (const line of entry.lines) next[line.id] = toDraft(line);
                                  return next;
                                });
                                setError(null);
                                setNotice(null);
                              }}
                              type="button"
                            >
                              Discard changes
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : null}

                    {entry && editable ? (
                      detailsDraft ? (
                        <form
                          className="wf-invoice-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            saveDetails(invoice);
                          }}
                        >
                          <label className="wf-field">
                            <span>Consultant</span>
                            <input
                              disabled={pending}
                              maxLength={200}
                              onChange={(event) =>
                                setDetailsDraft({ ...detailsDraft, consultantName: event.target.value })
                              }
                              type="text"
                              value={detailsDraft.consultantName}
                            />
                          </label>
                          <label className="wf-field">
                            <span>Job name</span>
                            <input
                              disabled={pending}
                              maxLength={300}
                              onChange={(event) => setDetailsDraft({ ...detailsDraft, jobName: event.target.value })}
                              type="text"
                              value={detailsDraft.jobName}
                            />
                          </label>
                          <label className="wf-field">
                            <span>Payment terms</span>
                            <input
                              disabled={pending}
                              maxLength={1000}
                              onChange={(event) =>
                                setDetailsDraft({ ...detailsDraft, paymentTerms: event.target.value })
                              }
                              placeholder="Net 30 from invoice date"
                              type="text"
                              value={detailsDraft.paymentTerms}
                            />
                          </label>
                          <label className="wf-field">
                            <span>Client agreement / PO no.</span>
                            <input
                              disabled={pending}
                              maxLength={120}
                              onChange={(event) =>
                                setDetailsDraft({ ...detailsDraft, clientAgreementRef: event.target.value })
                              }
                              type="text"
                              value={detailsDraft.clientAgreementRef}
                            />
                            <span className="table-subtext">
                              The client&rsquo;s own number, if they issue one — not ours.
                            </span>
                          </label>
                          <label className="wf-field">
                            <span>Prepared by</span>
                            <input
                              disabled={pending}
                              maxLength={200}
                              onChange={(event) => setDetailsDraft({ ...detailsDraft, preparedBy: event.target.value })}
                              type="text"
                              value={detailsDraft.preparedBy}
                            />
                          </label>
                          <label className="wf-field">
                            <span>Tax</span>
                            <input
                              disabled={pending}
                              inputMode="decimal"
                              min="0"
                              onChange={(event) => setDetailsDraft({ ...detailsDraft, taxAmount: event.target.value })}
                              step="0.01"
                              type="number"
                              value={detailsDraft.taxAmount}
                            />
                          </label>
                          <div className="wf-step-actions">
                            <button className="button button-primary button-sm" disabled={pending} type="submit">
                              Save details
                            </button>
                            <button
                              className="button button-neutral button-sm"
                              disabled={pending}
                              onClick={() => setDetailsDraft(null)}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="wf-step-actions">
                          <button
                            className="button button-neutral button-sm"
                            disabled={pending}
                            onClick={() =>
                              // Seeded from what is STORED. Opening this form
                              // on blanks and saving it cleared every one of
                              // these columns, because an empty box is read as
                              // "cleared" by updateInvoiceDetails.
                              setDetailsDraft({
                                ...entry.details,
                                taxAmount: String(entry.taxAmount),
                              })
                            }
                            type="button"
                          >
                            Edit invoice details
                          </button>
                        </div>
                      )
                    ) : null}
                  </div>
                ) : null}

                {canSettleInvoice && (invoice.status === "draft" || invoice.status === "issued") ? (
                  <div className="wf-step-actions">
                    {invoice.status === "draft" ? (
                      <button
                        className="button button-primary button-sm"
                        disabled={pending}
                        onClick={() =>
                          run(() => settleInvoice(invoice.id, "issued"), `${invoice.invoice_number} issued.`)
                        }
                        type="button"
                      >
                        Issue to client
                      </button>
                    ) : (
                      <button
                        className="button button-primary button-sm"
                        disabled={pending}
                        onClick={() =>
                          run(() => settleInvoice(invoice.id, "paid"), `${invoice.invoice_number} marked paid.`)
                        }
                        type="button"
                      >
                        Mark paid
                      </button>
                    )}
                    <button
                      className="button button-neutral button-sm"
                      disabled={pending}
                      onClick={() => {
                        const reason = window.prompt(`Why is ${invoice.invoice_number} being voided?`);
                        if (reason === null) return;
                        run(() => settleInvoice(invoice.id, "void", reason), `${invoice.invoice_number} voided.`);
                      }}
                      type="button"
                    >
                      Void
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {proposals.length === 0 ? (
        <p className="wf-step-note">
          An invoice is raised from an accepted proposal, so its figures match what the client agreed to. This client
          has no accepted proposal yet.
        </p>
      ) : (
        <form
          className="wf-invoice-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => createInvoiceFromProposal(clientId, proposalId, kind), "Draft invoice raised.");
          }}
        >
          <label className="wf-field">
            <span>Proposal</span>
            <select
              disabled={pending || !canDraftInvoice}
              onChange={(event) => setProposalId(event.target.value)}
              value={proposalId}
            >
              {proposals.map((proposal) => (
                <option key={proposal.id} value={proposal.id}>
                  {proposal.label}
                </option>
              ))}
            </select>
          </label>

          <label className="wf-field">
            <span>Invoice for</span>
            <select disabled={pending || !canDraftInvoice} onChange={(event) => setKind(event.target.value)} value={kind}>
              <option value="full">Full contract</option>
              <option value="deposit">Deposit only</option>
              <option value="balance">Balance after deposit</option>
            </select>
          </label>

          <button
            className="button button-primary button-sm"
            disabled={pending || !canDraftInvoice || !proposalId}
            title={canDraftInvoice ? undefined : "Your role cannot raise invoices."}
            type="submit"
          >
            Raise draft invoice
          </button>

          {kind === "deposit" && selected && !selected.hasDeposit ? (
            <p className="wf-step-note">This proposal has no deposit — raise the full invoice instead.</p>
          ) : null}
        </form>
      )}
    </section>
  );
}
