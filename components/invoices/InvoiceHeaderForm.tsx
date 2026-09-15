"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateInvoiceHeader } from "@/app/employee/invoices/actions";
import { invoiceKindLabel, invoiceKinds } from "@/lib/invoices/invoice";

export interface InvoiceHeaderFormValues {
  kind: string | null;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  tax_amount: number;
  notes: string | null;
  consultant_name: string | null;
  job_name: string | null;
  payment_terms: string | null;
  client_agreement_ref: string | null;
  prepared_by: string | null;
  variance_reason: string | null;
}

/** Only a portal admin's edits pass client_invoices RLS ("Admins can settle invoices"). */
export function InvoiceHeaderForm({
  invoiceId,
  initial,
  editable,
}: {
  invoiceId: string;
  initial: InvoiceHeaderFormValues;
  editable: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof InvoiceHeaderFormValues>(key: K, value: InvoiceHeaderFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await updateInvoiceHeader(invoiceId, values);
      if (!result.ok) {
        setError(result.error ?? "Could not save invoice details.");
        return;
      }
      setNotice("Saved.");
      router.refresh();
    });
  }

  return (
    <div className="form-panel">
      <h2>Invoice details</h2>
      {!editable ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem" }}>
          Only a portal admin can edit these details. Line items below are open to anyone who can raise invoices.
        </p>
      ) : null}
      {error ? <div className="success-box portal-alert portal-alert-error">{error}</div> : null}
      {notice ? <div className="success-box portal-alert">{notice}</div> : null}

      <div className="field">
        <label htmlFor="invoice-kind">Kind</label>
        <select
          id="invoice-kind"
          value={values.kind ?? ""}
          disabled={!editable || isPending}
          onChange={(event) => set("kind", event.target.value || null)}
        >
          <option value="">Proposal billing</option>
          {invoiceKinds.map((option) => (
            <option key={option} value={option}>
              {invoiceKindLabel(option)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="invoice-job-name">Job / site name</label>
        <input
          id="invoice-job-name"
          type="text"
          value={values.job_name ?? ""}
          disabled={!editable || isPending}
          maxLength={300}
          onChange={(event) => set("job_name", event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="invoice-consultant">Consultant</label>
        <input
          id="invoice-consultant"
          type="text"
          value={values.consultant_name ?? ""}
          disabled={!editable || isPending}
          maxLength={200}
          onChange={(event) => set("consultant_name", event.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="invoice-issue-date">Issue date</label>
          <input
            id="invoice-issue-date"
            type="date"
            value={values.issue_date ?? ""}
            disabled={!editable || isPending}
            onChange={(event) => set("issue_date", event.target.value || null)}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="invoice-due-date">Due date</label>
          <input
            id="invoice-due-date"
            type="date"
            value={values.due_date ?? ""}
            disabled={!editable || isPending}
            onChange={(event) => set("due_date", event.target.value || null)}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="invoice-currency">Currency</label>
          <input
            id="invoice-currency"
            type="text"
            value={values.currency}
            disabled={!editable || isPending}
            maxLength={3}
            onChange={(event) => set("currency", event.target.value.toUpperCase())}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="invoice-tax">Tax amount</label>
          <input
            id="invoice-tax"
            type="number"
            step="0.01"
            min={0}
            value={values.tax_amount}
            disabled={!editable || isPending}
            onChange={(event) => set("tax_amount", Number(event.target.value) || 0)}
          />
        </div>
      </div>

      {/*
        This guidance used to be auto-written into the invoice's Notes, where it
        printed on the client's copy — an instruction to the drafter, addressed
        to the client. It belongs here, next to the field it is about.
      */}
      <p style={{ color: "var(--portal-muted)", fontSize: "0.82rem", marginTop: -4 }}>
        An invoice raised from a proposal already has any tax folded into the proposal&apos;s total. Add an amount here
        only if this invoice needs its own tax treatment — and adjust the line items to match.
      </p>

      <div className="field">
        <label htmlFor="invoice-payment-terms">Payment terms</label>
        <input
          id="invoice-payment-terms"
          type="text"
          value={values.payment_terms ?? ""}
          disabled={!editable || isPending}
          maxLength={1000}
          placeholder="Net 30 from invoice date"
          onChange={(event) => set("payment_terms", event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="invoice-agreement-ref">Client's PO / agreement reference</label>
        <input
          id="invoice-agreement-ref"
          type="text"
          value={values.client_agreement_ref ?? ""}
          disabled={!editable || isPending}
          maxLength={120}
          onChange={(event) => set("client_agreement_ref", event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="invoice-prepared-by">Prepared by</label>
        <input
          id="invoice-prepared-by"
          type="text"
          value={values.prepared_by ?? ""}
          disabled={!editable || isPending}
          maxLength={200}
          onChange={(event) => set("prepared_by", event.target.value)}
        />
      </div>

      {/*
        The signed proposal is never edited to fit an invoice (Steve Sladky /
        Custin, 2026-08-31). When the money moves, this is where the reason
        goes — and the database requires it before invoices against a proposal
        may exceed its signed value.
      */}
      <div className="field">
        <label htmlFor="invoice-variance">Why this differs from the proposal</label>
        <textarea
          id="invoice-variance"
          rows={2}
          value={values.variance_reason ?? ""}
          disabled={!editable || isPending}
          maxLength={2000}
          placeholder="e.g. Six attendees on the day, not twelve. Leave blank when the invoice matches the proposal."
          onChange={(event) => set("variance_reason", event.target.value)}
        />
        <p style={{ color: "var(--portal-muted)", fontSize: "0.82rem", marginTop: 4 }}>
          Kept with the invoice as the internal record of the change. The signed proposal stays exactly as the client
          accepted it.
        </p>
      </div>

      <div className="field">
        <label htmlFor="invoice-notes">Notes</label>
        <textarea
          id="invoice-notes"
          rows={4}
          value={values.notes ?? ""}
          disabled={!editable || isPending}
          maxLength={4000}
          placeholder="Printed at the foot of the invoice — payment instructions, a thank-you, anything the client should read."
          onChange={(event) => set("notes", event.target.value)}
        />
      </div>

      {editable ? (
        <button type="button" className="button button-primary" disabled={isPending} onClick={save}>
          {isPending ? "Saving…" : "Save details"}
        </button>
      ) : null}
    </div>
  );
}
