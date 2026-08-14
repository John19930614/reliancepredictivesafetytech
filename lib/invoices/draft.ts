// Turns an accepted proposal into a draft invoice.
//
// PURE and side-effect free, in the same spirit as income-schedule.ts: the
// arithmetic is testable without a database, and the writer lives in the server
// action. Every figure is recomputed from the stored generator state rather
// than read off the proposal row, because proposal_value is a cached number and
// an invoice is the document that actually asks for money.
//
// WHY BOTH KINDS. The fee table produces one contract total, but the money
// arrives on the payment terms the proposal itself set. A deal with a deposit
// gets billed twice — the deposit now, the balance on the term — so the invoice
// step has to be able to raise either without an operator retyping the numbers.

import type { ProposalTotals } from "@/lib/proposals/pricing";

/** What this invoice is billing for. */
export type InvoiceKind = "deposit" | "full" | "balance";

export interface DraftInvoiceLine {
  description: string;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
  sortOrder: number;
}

export interface DraftInvoice {
  kind: InvoiceKind;
  lineItems: DraftInvoiceLine[];
  /** Sum of the line totals. */
  subtotal: number;
  /** What the client owes on this invoice, after any discount and tax. */
  total: number;
  /** YYYY-MM-DD. */
  issueDate: string;
  /** YYYY-MM-DD, issueDate + netDays. */
  dueDate: string;
  /** Set when discount or tax moved the total away from the subtotal. */
  notes: string | null;
}

export interface BuildDraftInvoiceInput {
  /**
   * Recomputed from the accepted revision by the caller, never read off the
   * cached proposal_value — an invoice is the document that actually asks for
   * money. Taking totals rather than raw state keeps this module pure and
   * testable, matching buildIncomeSchedule's signature.
   */
  totals: ProposalTotals;
  kind: InvoiceKind;
  /** YYYY-MM-DD. */
  issueDate: string;
  /** Payment terms in days. */
  netDays?: number;
}

/** Standard payment terms when the proposal does not say otherwise. */
export const defaultNetDays = 30;

function round2(value: number): number {
  // Via cents, so 0.1 + 0.2 style drift cannot reach a stored money column.
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/** YYYY-MM-DD `days` after `date`, calendar-correct across month and year ends. */
export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Human note describing how the total differs from the sum of the lines. */
function adjustmentNote(totals: ProposalTotals): string | null {
  const parts: string[] = [];
  if (totals.discount > 0) parts.push(`less ${round2(totals.discount).toFixed(2)} discount`);
  if (totals.tax > 0) parts.push(`plus ${round2(totals.tax).toFixed(2)} tax`);
  return parts.length > 0 ? `Contract total ${parts.join(", ")}.` : null;
}

/**
 * Builds the draft.
 *
 * `deposit` — one line for the deposit named in the proposal. Returns no lines
 * when the proposal has no deposit, so the caller can tell the operator there
 * is nothing to bill yet rather than raising an invoice for zero.
 *
 * `full` — every fee-table row, at the quantities and prices stored on the
 * accepted revision. The total carries the discount and tax; the note says so,
 * because a client comparing the line sum to the total deserves an explanation
 * on the document itself.
 *
 * `balance` — the contract total less the deposit already invoiced.
 */
export function buildDraftInvoice(input: BuildDraftInvoiceInput): DraftInvoice {
  const { totals } = input;
  const netDays = typeof input.netDays === "number" && input.netDays >= 0 ? Math.floor(input.netDays) : defaultNetDays;
  const issueDate = input.issueDate;
  const dueDate = addDays(issueDate, netDays);

  if (input.kind === "deposit") {
    const deposit = round2(totals.deposit);
    const lineItems: DraftInvoiceLine[] =
      deposit > 0
        ? [
            {
              description: "Deposit due on acceptance",
              quantity: 1,
              unitAmount: deposit,
              lineTotal: deposit,
              sortOrder: 10,
            },
          ]
        : [];

    return {
      kind: "deposit",
      lineItems,
      subtotal: deposit,
      total: deposit,
      issueDate,
      dueDate,
      notes: deposit > 0 ? `Deposit against a contract total of ${round2(totals.total).toFixed(2)}.` : null,
    };
  }

  if (input.kind === "balance") {
    const balance = round2(Math.max(0, totals.total - totals.deposit));
    const lineItems: DraftInvoiceLine[] =
      balance > 0
        ? [
            {
              description: "Balance due",
              quantity: 1,
              unitAmount: balance,
              lineTotal: balance,
              sortOrder: 10,
            },
          ]
        : [];

    return {
      kind: "balance",
      lineItems,
      subtotal: balance,
      total: balance,
      issueDate,
      dueDate,
      notes:
        balance > 0
          ? `Balance of a contract total of ${round2(totals.total).toFixed(2)} after a deposit of ${round2(totals.deposit).toFixed(2)}.`
          : null,
    };
  }

  const lineItems: DraftInvoiceLine[] = totals.lineItems.map((row, index) => {
    const quantity = row.qty > 0 ? round2(row.qty) : 1;
    const lineTotal = round2(row.amount);
    return {
      // The unit travels with the stored price, so a repriced catalog cannot
      // relabel an invoice already raised (same reasoning as ProposalLineItem).
      description: [row.name, row.unit ? `(per ${row.unit})` : ""].filter(Boolean).join(" "),
      quantity,
      // Derived from the stored amount rather than the catalog price, so the
      // line always multiplies back to the amount the client agreed to.
      unitAmount: round2(lineTotal / quantity),
      lineTotal,
      sortOrder: (index + 1) * 10,
    };
  });

  return {
    kind: "full",
    lineItems,
    subtotal: round2(totals.subtotal),
    total: round2(totals.total),
    issueDate,
    dueDate,
    notes: adjustmentNote(totals),
  };
}

/**
 * True when the draft has nothing to bill. The caller refuses to write an
 * invoice in this case — a zero invoice is a document that asks for nothing and
 * still spends an invoice number.
 */
export function isEmptyDraft(draft: DraftInvoice): boolean {
  return draft.lineItems.length === 0 || draft.total <= 0;
}
