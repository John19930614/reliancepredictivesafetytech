"use client";

import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Receipt, X } from "lucide-react";
import { generateInvoiceFromProposal } from "@/app/employee/invoices/actions";

export interface ProposalInvoiceLine {
  lineKey: string;
  description: string;
  unit: string;
  proposedQuantity: number;
  committedQuantity: number;
  remainingQuantity: number;
  unitAmount: number;
}

export interface ProposalInvoiceTotals {
  proposedSubtotal: number;
  proposedTax: number;
  remainingTax: number;
}

interface BillingRowState {
  selected: boolean;
  quantity: string;
}

function initialRows(lines: ProposalInvoiceLine[]): Record<string, BillingRowState> {
  return Object.fromEntries(
    lines.map((line) => [
      line.lineKey,
      {
        selected: false,
        quantity: line.remainingQuantity > 0 ? String(line.remainingQuantity) : "0",
      },
    ]),
  );
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Selects the still-unbilled portion of proposal lines and creates one draft
 * invoice. Values passed from the Server Component are plain JSON values,
 * keeping the server/client boundary explicit and safe.
 */
export function GenerateInvoiceButton({
  proposalId,
  lines,
  totals,
}: {
  proposalId: string;
  lines: ProposalInvoiceLine[];
  totals?: ProposalInvoiceTotals;
}) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const generationKey = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, BillingRowState>>(() => initialRows(lines));
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function closePanel() {
    if (submitting.current) return;
    setOpen(false);
    setError("");
    generationKey.current = null;
    triggerRef.current?.focus();
  }

  function openPanel() {
    setRows(initialRows(lines));
    setError("");
    generationKey.current = null;
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    const firstAvailableLine = dialog?.querySelector<HTMLInputElement>('input[type="checkbox"]:not(:disabled)');
    (firstAvailableLine ?? dialog)?.focus();
  }, [open]);

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !submitting.current) {
      event.preventDefault();
      closePanel();
      return;
    }

    if (event.key === "Tab") {
      const focusable = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !("disabled" in element && element.disabled) && element.tabIndex >= 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function updateRow(lineKey: string, patch: Partial<BillingRowState>) {
    generationKey.current = null;
    setError("");
    setRows((current) => ({
      ...current,
      [lineKey]: { ...current[lineKey], ...patch },
    }));
  }

  function updateQuantity(line: ProposalInvoiceLine, rawValue: string) {
    if (rawValue === "") {
      updateRow(line.lineKey, { quantity: "" });
      return;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    const capped = Math.min(Math.max(parsed, 0), line.remainingQuantity);
    updateRow(line.lineKey, { quantity: String(capped) });
  }

  const selectedLines = lines.flatMap((line) => {
    const row = rows[line.lineKey];
    if (!row?.selected) return [];
    return [{ lineKey: line.lineKey, quantity: Number(row.quantity) }];
  });
  const hasInvalidQuantity = selectedLines.some(({ lineKey, quantity }) => {
    const line = lines.find((candidate) => candidate.lineKey === lineKey);
    return !line || !Number.isFinite(quantity) || quantity <= 0 || quantity > line.remainingQuantity;
  });
  const subtotal = roundMoney(
    lines.reduce((sum, line) => {
      const row = rows[line.lineKey];
      return row?.selected ? sum + (Number(row.quantity) || 0) * line.unitAmount : sum;
    }, 0),
  );
  const tax = totals && totals.proposedSubtotal > 0
    ? Math.min(totals.remainingTax, roundMoney((totals.proposedTax * subtotal) / totals.proposedSubtotal))
    : 0;
  const total = roundMoney(subtotal + tax);
  const canSubmit = selectedLines.length > 0 && !hasInvalidQuantity && !isPending;

  function submit() {
    if (submitting.current || !canSubmit) return;
    submitting.current = true;
    setError("");
    const key = generationKey.current ?? crypto.randomUUID();
    generationKey.current = key;

    startTransition(async () => {
      try {
        const result = await generateInvoiceFromProposal(proposalId, key, selectedLines);
        if (!result.ok || !result.invoiceId) {
          setError(result.error ?? "Could not generate the invoice.");
          return;
        }

        generationKey.current = null;
        setOpen(false);
        router.push(`/employee/invoices/${result.invoiceId}`);
      } catch {
        setError("Could not generate the invoice. Please try again.");
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <div style={{ display: "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        className="button button-light"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPanel}
      >
        <Receipt size={16} aria-hidden="true" /> Generate invoice
      </button>

      {open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "var(--portal-modal-backdrop, rgba(0, 0, 0, 0.35))",
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            className="form-panel"
            onKeyDown={handleDialogKeyDown}
            style={{
              width: "min(760px, 100%)",
              maxHeight: "min(85vh, 760px)",
              overflowY: "auto",
              background: "var(--portal-card, white)",
              boxShadow: "var(--portal-shadow, 0 12px 36px rgba(0, 0, 0, 0.2))",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
              <div>
                <h2 id={titleId} style={{ marginTop: 0 }}>
                  Select work to invoice
                </h2>
                <p id={descriptionId} style={{ color: "var(--portal-muted)", marginBottom: 0 }}>
                  Check each line to bill now, then confirm its quantity. Prices and limits come from the accepted revision.
                </p>
              </div>
              <button
                type="button"
                className="button button-light"
                aria-label="Close invoice panel"
                disabled={isPending}
                onClick={closePanel}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {lines.length === 0 ? (
              <p style={{ marginTop: 16 }}>This proposal has no billable lines.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 10 }}>
                {lines.map((line, index) => {
                  const row = rows[line.lineKey] ?? { selected: false, quantity: "0" };
                  const fullyBilled = line.remainingQuantity <= 0;
                  const rowTotal = row.selected ? roundMoney((Number(row.quantity) || 0) * line.unitAmount) : 0;
                  const checkboxId = `${titleId}-line-${index}`;
                  const quantityId = `${checkboxId}-quantity`;
                  const detailId = `${checkboxId}-detail`;

                  return (
                    <li
                      key={line.lineKey}
                      style={{
                        border: "1px solid var(--portal-line)",
                        borderRadius: 8,
                        padding: 12,
                        opacity: fullyBilled ? 0.65 : 1,
                      }}
                    >
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={row.selected}
                          disabled={fullyBilled || isPending}
                          aria-describedby={detailId}
                          onChange={(event) => updateRow(line.lineKey, { selected: event.target.checked })}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label htmlFor={checkboxId} style={{ display: "block", fontWeight: 600 }}>
                            {line.description || `Proposal line ${index + 1}`}
                          </label>
                          <div id={detailId} style={{ color: "var(--portal-muted)", fontSize: "0.88rem", marginTop: 3 }}>
                            Proposed {formatQuantity(line.proposedQuantity)} · Already committed{" "}
                            {formatQuantity(line.committedQuantity)} · Remaining {formatQuantity(line.remainingQuantity)}{" "}
                            {line.unit || "units"} at {formatMoney(line.unitAmount)} each
                            {fullyBilled ? " · Fully billed" : ""}
                          </div>
                        </div>
                        <strong style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatMoney(rowTotal)}</strong>
                      </div>

                      {!fullyBilled ? (
                        <div className="field" style={{ width: 180, marginTop: 10, marginLeft: 28 }}>
                          <label htmlFor={quantityId}>Invoice quantity</label>
                          <input
                            id={quantityId}
                            type="number"
                            min="0.01"
                            max={line.remainingQuantity}
                            step="0.01"
                            inputMode="decimal"
                            value={row.quantity}
                            disabled={!row.selected || isPending}
                            aria-label={`Invoice quantity for ${line.description || `proposal line ${index + 1}`}`}
                            aria-invalid={row.selected && (Number(row.quantity) <= 0 || row.quantity === "")}
                            onChange={(event) => updateQuantity(line, event.target.value)}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            <div
              aria-live="polite"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 16,
                marginTop: 16,
                paddingTop: 12,
                borderTop: "1px solid var(--portal-line)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span>Selected subtotal</span>
              <strong>{formatMoney(subtotal)}</strong>
              {tax > 0 ? (
                <>
                  <span>Tax</span>
                  <strong>{formatMoney(tax)}</strong>
                </>
              ) : null}
              <span>Total</span>
              <strong>{formatMoney(total)}</strong>
            </div>

            {hasInvalidQuantity ? (
              <p role="alert" style={{ color: "var(--portal-danger)", marginBottom: 0 }}>
                Each selected line needs an invoice quantity greater than zero.
              </p>
            ) : null}
            {error ? (
              <div role="alert" className="success-box portal-alert portal-alert-error" style={{ marginTop: 12 }}>
                {error}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
              <button type="button" className="button button-light" disabled={isPending} onClick={closePanel}>
                Cancel
              </button>
              <button type="button" className="button button-primary" disabled={!canSubmit} onClick={submit}>
                {isPending ? "Generating…" : "Generate draft invoice"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
