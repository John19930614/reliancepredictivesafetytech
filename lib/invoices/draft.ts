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

/** Longest terms we will read out of free text, so a typo cannot date an invoice years out. */
const maxNetDays = 365;

/**
 * Reads payment terms off the proposal's own `paymentTerms` field.
 *
 * The generator offers "Net 15 from invoice date", "Net 30 from invoice date",
 * "Due upon receipt", "50% deposit / 50% at launch" and "Monthly subscription
 * billing", and the field is free text besides — real proposals carry things
 * like "Net 45 on invoice, 20% due at acceptance". The client-facing document
 * prints this clause verbatim, so an invoice that ignored it would contradict
 * the contract it was derived from, always in the direction that delays cash.
 *
 * Anything unrecognised falls back to the default rather than guessing.
 */
export function netDaysFromPaymentTerms(terms: string | null | undefined): number {
  if (typeof terms !== "string") return defaultNetDays;
  const text = terms.toLowerCase();

  // "Due upon receipt" is checked first: it carries no number, and a proposal
  // reading "Due upon receipt, Net 30 thereafter" means the former.
  if (text.includes("upon receipt") || text.includes("on receipt")) return 0;

  const match = /net\s*(\d{1,3})/.exec(text);
  if (match) {
    const days = Number.parseInt(match[1], 10);
    if (Number.isFinite(days) && days >= 0 && days <= maxNetDays) return days;
  }

  return defaultNetDays;
}

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
    // Guard on the ROUNDED value, which is what gets stored: a quantity between
    // 0 and 0.005 passes a `row.qty > 0` test and then rounds to zero, which
    // violates the `quantity > 0` CHECK and fails the whole line write.
    const rounded = round2(row.qty);
    const quantity = rounded > 0 ? rounded : 1;
    const lineTotal = round2(row.amount);

    // The AGREED unit price, not lineTotal/quantity. `amount` is already rounded
    // to cents by computeProposalTotals, so dividing it back out loses the true
    // price: three lines at the IRS $0.655 mileage rate store an amount of 1.97,
    // and 1.97/3 re-rounds to 0.66 — a unit price the client never agreed to
    // that multiplies back to 1.98. Falls back to the derived figure only when
    // the row carries no usable price.
    const agreed = round2(row.price);
    const unitAmount = agreed > 0 ? agreed : round2(lineTotal / quantity);

    return {
      // The unit travels with the stored price, so a repriced catalog cannot
      // relabel an invoice already raised (same reasoning as ProposalLineItem).
      description: [row.name, row.unit ? `(per ${row.unit})` : ""].filter(Boolean).join(" "),
      quantity,
      unitAmount,
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
