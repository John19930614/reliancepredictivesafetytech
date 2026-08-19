"use client";

// Adding one payment-schedule line item without leaving the proposal page.
//
// A DELIBERATELY SMALL SUBSET of components/invoices/ManualInvoiceForm.tsx's
// fields — the client and proposal are already fixed by this page, so this
// form asks only for what a "deposit invoice for $2,500, due in two weeks"
// decision actually needs: one line description, one amount, a due date and
// (optionally) payment terms. It still posts through the very same
// createManualInvoice contract that form uses (via the proposal-scoped
// wrapper in ./payment-actions), so every server-side rule that form's
// operators rely on — the arithmetic recomputed from the line, the
// contract-value ceiling once a proposal is named, the audit event — applies
// here identically. What is NOT offered here: multiple lines, a currency
// override, billing against a DIFFERENT proposal. An operator who needs any
// of that already has the full form at /employee/invoices.
//
// Collapsed behind a toggle rather than always shown, matching
// ProposalSharePanel and ProposalDocusignPanel's own "start hidden, expand to
// act" shape on this same page.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { createProposalScheduleInvoice } from "@/app/employee/proposals/[id]/payment-actions";

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ProposalInvoiceForm({
  proposalId,
  clientId,
  currency,
}: {
  proposalId: string;
  clientId: string;
  /** The currency the OTHER invoices on this proposal already use, if any. */
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setSubmitting(true);
    setErrors([]);
    setNotice("");

    const description = String(data.get("description") ?? "");
    const amount = toNumber(String(data.get("amount") ?? ""));
    const dueDate = String(data.get("due_date") ?? "");
    const paymentTerms = String(data.get("payment_terms") ?? "");

    const result = await createProposalScheduleInvoice({
      clientId,
      proposalId,
      currency,
      dueDate,
      paymentTerms,
      taxAmount: 0,
      lines: [
        {
          description,
          quantity: 1,
          unitAmount: amount,
          qtyBasis: "flat",
        },
      ],
    });

    setSubmitting(false);

    if (!result.ok) {
      setErrors(result.errors ?? [result.error ?? "The invoice could not be raised."]);
      return;
    }

    form.reset();
    setNotice(`Draft ${result.invoiceNumber ?? "invoice"} added to the payment schedule.`);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="button button-light" type="button" onClick={() => setOpen(true)}>
        <Plus size={16} /> Create invoice
      </button>
    );
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit} style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>New payment schedule line</h3>
        <button
          aria-label="Cancel"
          className="button button-neutral button-sm"
          disabled={submitting}
          onClick={() => setOpen(false)}
          type="button"
        >
          <X size={14} />
        </button>
      </div>
      <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 6 }}>
        Saved as a draft against this proposal — {currency}, numbered off the proposal once issued. Issuing it (and
        anything past that) is done from this proposal or the invoice ledger, not here.
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
      {notice ? (
        <div className="success-box" style={{ marginTop: 12 }} role="status">
          {notice}
        </div>
      ) : null}

      <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 12 }}>
        <label className="field">
          <span>What this line is for</span>
          <input name="description" maxLength={500} placeholder="e.g. Deposit — Phase 1 kickoff" required />
        </label>

        <label className="field">
          <span>Amount ({currency})</span>
          <input inputMode="decimal" min="0" name="amount" required step="0.01" type="number" />
        </label>

        <label className="field">
          <span>Due date</span>
          <input name="due_date" required type="date" />
        </label>

        <label className="field">
          <span>Payment terms (optional)</span>
          <input maxLength={1000} name="payment_terms" placeholder="e.g. Net 30 from invoice date" />
        </label>

        <button className="button button-primary" disabled={submitting} style={{ justifySelf: "start" }} type="submit">
          {submitting ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
          {submitting ? "Saving…" : "Add to schedule"}
        </button>
      </div>
    </form>
  );
}
