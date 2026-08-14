"use client";

// Raising and settling the invoices behind the Invoicing step.
//
// Before this existed, winning a deal filed "expected income" rows into the
// finance ledger and that was the whole of billing — "invoiced" was a status
// somebody picked from a dropdown, with no document, no number, and nothing to
// send. This panel is where a real numbered invoice gets raised from the
// accepted proposal and then issued.
//
// Raising and issuing are deliberately two acts. A draft is a document nobody
// has seen; issuing is the moment a client is asked for money, which is why the
// gate on the Invoicing step counts issued invoices and not drafts.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Receipt } from "lucide-react";
import { createInvoiceFromProposal, settleInvoice } from "@/app/employee/clients/[id]/workflow/actions";

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

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    // An unexpected currency code must not take the panel down.
    return `${currency} ${amount.toFixed(2)}`;
  }
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

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          if (success) setNotice(success);
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
          {invoices.map((invoice) => (
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
          ))}
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
