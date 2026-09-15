"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { updateInvoiceLines } from "@/app/employee/invoices/actions";
import { lineQtyBases } from "@/lib/invoices/invoice";

export interface EditableLine {
  description: string;
  quantity: number;
  unit_amount: number;
  unit: string;
  qty_basis: string;
  service_date: string | null;
}

function emptyLine(): EditableLine {
  return { description: "", quantity: 1, unit_amount: 0, unit: "", qty_basis: "flat", service_date: null };
}

/** quantity × unit_amount, except flat — a fixed fee ignores quantity. */
function lineTotal(line: EditableLine): number {
  const multiplier = line.qty_basis === "flat" ? 1 : line.quantity;
  return Math.round(multiplier * line.unit_amount * 100) / 100;
}

function formatMoney(value: number, currency = "USD") {
  return value.toLocaleString("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 });
}

/**
 * Subtotal, tax and the grand total — the number the invoice will actually ask
 * the client for. Rendered identically whether or not the invoice is editable,
 * so the figure does not change shape when a draft is issued.
 */
function InvoiceRunningTotal({
  subtotal,
  tax,
  total,
  currency,
  inline = false,
}: {
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  inline?: boolean;
}) {
  return (
    <div
      style={{
        marginLeft: inline ? "auto" : undefined,
        marginTop: inline ? undefined : 12,
        display: "grid",
        gridTemplateColumns: "auto auto",
        gap: "2px 14px",
        justifyContent: inline ? "end" : "start",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ color: "var(--portal-muted)", fontSize: "0.9rem" }}>Subtotal</span>
      <span style={{ textAlign: "right", fontSize: "0.9rem" }}>{formatMoney(subtotal, currency)}</span>
      {tax > 0 ? (
        <>
          <span style={{ color: "var(--portal-muted)", fontSize: "0.9rem" }}>Tax</span>
          <span style={{ textAlign: "right", fontSize: "0.9rem" }}>{formatMoney(tax, currency)}</span>
        </>
      ) : null}
      <span style={{ fontWeight: 600 }}>Total</span>
      <span style={{ textAlign: "right", fontWeight: 600 }}>{formatMoney(total, currency)}</span>
    </div>
  );
}

export function InvoiceLineItemsEditor({
  invoiceId,
  initialLines,
  editable,
  lockedReason,
  taxAmount = 0,
  currency = "USD",
}: {
  invoiceId: string;
  initialLines: EditableLine[];
  editable: boolean;
  lockedReason?: string | null;
  /** From the invoice header, so the running figure is the one being committed to. */
  taxAmount?: number;
  currency?: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<EditableLine[]>(initialLines.length > 0 ? initialLines : [emptyLine()]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();

  function updateLine(index: number, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function save() {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await updateInvoiceLines(invoiceId, lines);
      if (!result.ok) {
        setError(result.error ?? "Could not save the line items.");
        return;
      }
      setNotice("Saved.");
      router.refresh();
    });
  }

  const subtotal = Math.round(lines.reduce((sum, line) => sum + lineTotal(line), 0) * 100) / 100;
  // Steve asked to "see the total price calculation before finalizing the
  // document" (2026-08-31). A subtotal alone is not that number: tax lives on
  // the header, so the figure actually being committed to is subtotal + tax.
  const tax = Math.round((Number(taxAmount) || 0) * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  return (
    <div className="form-panel">
      <h2>Line items</h2>
      {!editable ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem" }}>
          {lockedReason ?? "Line items can only be changed while this invoice is a draft."}
        </p>
      ) : null}
      {error ? <div className="success-box portal-alert portal-alert-error">{error}</div> : null}
      {notice ? <div className="success-box portal-alert">{notice}</div> : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
        {lines.map((line, index) => (
          <div
            key={index}
            style={{
              border: "1px solid var(--portal-line, #dbe2e9)",
              borderRadius: 8,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div className="field">
              <label htmlFor={`line-desc-${index}`}>Description</label>
              {/*
                Three rows, not one. This box sized itself to a single line
                unless the text already contained a newline, so a description
                scrolled out of sight while it was being typed — the first thing
                Steve asked for on 2026-08-31. It grows with the content up to a
                point, then scrolls, so a long line never pushes the qty and
                price controls off the row.
              */}
              <textarea
                id={`line-desc-${index}`}
                rows={Math.min(6, Math.max(3, line.description.split("\n").length))}
                style={{ resize: "vertical", minHeight: "4.5rem" }}
                value={line.description}
                disabled={!editable || isPending}
                maxLength={500}
                placeholder="A line above the name (e.g. &quot;Training&quot;) prints as its category heading."
                onChange={(event) => updateLine(index, { description: event.target.value })}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="field" style={{ width: 100 }}>
                <label htmlFor={`line-qty-${index}`}>Qty</label>
                <input
                  id={`line-qty-${index}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.quantity}
                  disabled={!editable || isPending}
                  onChange={(event) => updateLine(index, { quantity: Number(event.target.value) || 0 })}
                />
              </div>
              <div className="field" style={{ width: 130 }}>
                <label htmlFor={`line-unit-amount-${index}`}>Unit amount</label>
                <input
                  id={`line-unit-amount-${index}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.unit_amount}
                  disabled={!editable || isPending}
                  onChange={(event) => updateLine(index, { unit_amount: Number(event.target.value) || 0 })}
                />
              </div>
              <div className="field" style={{ width: 130 }}>
                <label htmlFor={`line-basis-${index}`}>Basis</label>
                <select
                  id={`line-basis-${index}`}
                  value={line.qty_basis}
                  disabled={!editable || isPending}
                  onChange={(event) => updateLine(index, { qty_basis: event.target.value })}
                >
                  {lineQtyBases.map((basis) => (
                    <option key={basis} value={basis}>
                      {basis}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ width: 110 }}>
                <label htmlFor={`line-unit-${index}`}>Unit</label>
                <input
                  id={`line-unit-${index}`}
                  type="text"
                  value={line.unit}
                  disabled={!editable || isPending}
                  maxLength={60}
                  placeholder="Session"
                  onChange={(event) => updateLine(index, { unit: event.target.value })}
                />
              </div>
              <div className="field" style={{ width: 150 }}>
                <label htmlFor={`line-service-date-${index}`}>Service date</label>
                <input
                  id={`line-service-date-${index}`}
                  type="date"
                  value={line.service_date ?? ""}
                  disabled={!editable || isPending}
                  onChange={(event) => updateLine(index, { service_date: event.target.value || null })}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 4 }}>
                <span style={{ fontSize: "0.85rem", color: "var(--portal-muted)" }}>{formatMoney(lineTotal(line), currency)}</span>
                {editable && lines.length > 1 ? (
                  <button
                    type="button"
                    className="button button-light"
                    disabled={isPending}
                    onClick={() => removeLine(index)}
                    aria-label="Remove line"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editable ? (
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="button button-light" disabled={isPending} onClick={addLine}>
            <Plus size={14} /> Add line
          </button>
          <button type="button" className="button button-primary" disabled={isPending} onClick={save}>
            {isPending ? "Saving…" : "Save line items"}
          </button>
          <InvoiceRunningTotal subtotal={subtotal} tax={tax} total={total} currency={currency} inline />
        </div>
      ) : (
        <InvoiceRunningTotal subtotal={subtotal} tax={tax} total={total} currency={currency} />
      )}
    </div>
  );
}
