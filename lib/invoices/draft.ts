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

/**
 * Whether a line's quantity multiplies its price.
 *
 * The whole reason this exists: a class quoted at 12 seats x $105 bills $1,260,
 * and when 10 people turn up it has to bill $1,050 — so the quantity is a
 * multiplier. A $2,500 site retainer with a quantity of 1 must NOT become
 * $5,000 because somebody typed 2 into the same box — so there the quantity is
 * a label. One column, `client_invoice_line_items.qty_basis`, tells the two
 * apart; without it the editor would have to guess, and it would guess wrong in
 * the direction that overcharges a client.
 */
export const quantityBases = ["session", "attendee", "hour", "flat"] as const;

export type QuantityBasis = (typeof quantityBases)[number];

/**
 * The safe default, matching the column default.
 *
 * 'flat' is safe precisely because it refuses to multiply: a line whose basis is
 * unknown or unreadable keeps the amount it already had rather than scaling by a
 * number nobody meant as a multiplier.
 */
export const defaultQuantityBasis: QuantityBasis = "flat";

export function isQuantityBasis(value: unknown): value is QuantityBasis {
  return typeof value === "string" && (quantityBases as readonly string[]).includes(value);
}

export interface DraftInvoiceLine {
  description: string;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
  sortOrder: number;
  /** What one of this line is, as printed: "Seat", "Session", "Hour". */
  unit: string;
  /** Whether `quantity` multiplies `unitAmount`. */
  qtyBasis: QuantityBasis;
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

/** Words that name a basis, longest first so "half day" cannot match "hour". */
const basisWords: Array<[RegExp, QuantityBasis]> = [
  [/attend|seat|person|people|particip|student|delegate|head|employee|worker|learner/i, "attendee"],
  [/hour|hr\b/i, "hour"],
  [/session|class|course|day|visit|workshop|training|audit|inspection|module/i, "session"],
];

/**
 * Decides a line's quantity basis when the invoice is generated.
 *
 * THE ROW'S OWN BASIS WINS. lib/proposals/qty-basis.ts stores what the quantity
 * meant when the client agreed to it, and re-deriving that here could only
 * disagree with the document they signed. It is read through this module's own
 * guard rather than trusted wholesale, because the value that matters here is
 * the one the `qty_basis` CHECK constraint will accept — if the proposal
 * vocabulary ever grows a fifth member, an invoice write must fail this check in
 * TypeScript rather than fail a 23514 in production.
 *
 * The rest is for rows saved before that column existed, which carry a null
 * basis. A fee-table row that genuinely multiplies — amount == qty x price with
 * a quantity that is not 1 — must not be filed as 'flat', or the first person to
 * correct a headcount would find the total refusing to move. Equally, a row that
 * does not multiply must not be filed as a scaling basis, or correcting a typo
 * in the quantity would silently re-price a fixed fee.
 *
 * So the unit word decides where it can, and the arithmetic decides where it
 * cannot: a row whose stored amount is the product of its own quantity and price
 * is a scaling row whatever it calls its unit, and everything else is flat.
 * 'session' is the fallback bucket for an unrecognised scaling unit ("Mile",
 * "Report") because the four permitted values carry no generic "each" — the
 * PRINTED label comes from `unit`, which keeps the real word, so the bucket only
 * has to get the arithmetic right.
 */
export function quantityBasisFor(row: {
  unit?: string;
  qty?: number;
  price?: number;
  amount?: number;
  qtyBasis?: unknown;
}): QuantityBasis {
  if (isQuantityBasis(row.qtyBasis)) return row.qtyBasis;

  const unit = typeof row.unit === "string" ? row.unit : "";
  for (const [pattern, basis] of basisWords) {
    if (pattern.test(unit)) return basis;
  }

  const qty = round2(typeof row.qty === "number" ? row.qty : 0);
  const price = round2(typeof row.price === "number" ? row.price : 0);
  const amount = round2(typeof row.amount === "number" ? row.amount : 0);

  // A quantity of exactly 1 tells us nothing — 1 x price == price for a flat fee
  // and a scaling row alike — so it stays flat, which is the choice that cannot
  // re-price anything on its own.
  if (qty > 0 && qty !== 1 && price > 0 && Math.abs(round2(qty * price) - amount) < 0.01) {
    return "session";
  }

  return defaultQuantityBasis;
}

/**
 * What one line is worth. THE definition, used by the builder above and by the
 * server action that applies an edit, so a repriced line and a freshly generated
 * one cannot disagree about arithmetic.
 *
 * `flat` returns the unit amount untouched: the quantity on a fixed fee is a
 * label ("1 project"), and multiplying by it would double a retainer the moment
 * someone typed 2 into a box that does not price anything.
 *
 * Quantity is rounded BEFORE multiplying, because numeric(12,2) is what the
 * database stores — computing against an unrounded 10.004 would produce a total
 * the stored quantity cannot reproduce, and the client adds the line up.
 */
export function lineTotalFor(input: { quantity: number; unitAmount: number; qtyBasis: QuantityBasis }): number {
  const unitAmount = round2(input.unitAmount);
  if (input.qtyBasis === "flat") return unitAmount;
  return round2(round2(input.quantity) * unitAmount);
}

/**
 * The invoice-level arithmetic: subtotal is the sum of the stored lines, and the
 * total is that plus tax.
 *
 * THIS IS THE INVARIANT — total = subtotal + tax_amount — and it is recomputed
 * from the lines every time one changes rather than adjusted in place, so a
 * dropped update or a rounding drift cannot leave an invoice asking for a number
 * its own lines do not add up to.
 */
export function invoiceTotalsFrom(
  lines: Array<{ lineTotal: number }>,
  taxAmount: number,
): { subtotal: number; tax: number; total: number } {
  const subtotal = round2(lines.reduce((sum, line) => sum + round2(line.lineTotal), 0));
  const tax = round2(Math.max(0, Number.isFinite(taxAmount) ? taxAmount : 0));
  return { subtotal, tax, total: round2(subtotal + tax) };
}

/* -------------------------------------------------------------------------- */
/* Editing a draft line                                                       */
/* -------------------------------------------------------------------------- */

/** Largest quantity anyone will bill on one line. A class is not 100,000 seats. */
export const maxLineQuantity = 100_000;

/** Largest unit price, well inside numeric(14,2) and well past any real rate. */
export const maxLineUnitAmount = 1_000_000;

/** Largest subtotal, tax or total. Above this it is a typo, not an invoice. */
export const maxInvoiceAmount = 100_000_000;

/** Matches the column CHECK: char_length(btrim(description)) between 1 and 500. */
export const maxLineDescriptionLength = 500;

/**
 * How many printed lines one description may carry.
 *
 * A description now holds a heading and its detail —
 *
 *   Training
 *   Biosafety Training: Classroom and Practical.
 *
 * — which is what the operator types and what both document writers render.
 * The COUNT is capped as well as the length because the two bound different
 * failures: 500 characters spread over 400 newlines satisfies the column CHECK
 * and still prints a row half a page tall, which shoves the totals block off
 * the sheet and turns a one-page bill into three. Eight is generous for a
 * heading plus detail and keeps the tallest possible row inside the geometry
 * lib/invoices/pdf.ts is sized for.
 *
 * There is deliberately no matching column CHECK: the database bounds the TEXT,
 * and how tall that text prints is a layout fact this codebase owns.
 */
export const maxLineDescriptionLines = 8;

/** Matches the column CHECK on client_invoice_line_items.unit. */
export const maxLineUnitLength = 60;

/** A line as stored, in the shape the editor works in. */
export interface EditableInvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number;
  unit: string;
  qtyBasis: QuantityBasis;
  serviceDate: string | null;
  lineTotal: number;
}

/**
 * One operator's change to one line. Every field is optional: an omitted field
 * is left exactly as stored, so a form that only offers a quantity box cannot
 * blank a description it never showed.
 */
export interface InvoiceLineEdit {
  id: string;
  quantity?: number | null;
  unitAmount?: number | null;
  unit?: string | null;
  qtyBasis?: string | null;
  serviceDate?: string | null;
  description?: string | null;
}

export interface CheckedInvoiceLineEdit {
  ok: boolean;
  error?: string;
  /** The line as it will be stored, with lineTotal recomputed. Set when ok. */
  line?: EditableInvoiceLine;
}

/** True for a real YYYY-MM-DD calendar date, false for "2026-02-31". */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Validates an edit and returns the line as it will be stored.
 *
 * PURE, and the only place the edited figures are computed. The line total is
 * derived here from the quantity, the price and the basis — a caller-supplied
 * total is not read, not merged, and has nowhere to enter. This is money: the
 * browser proposes quantities, the server decides amounts.
 *
 * Every bound below mirrors a CHECK constraint on the table, so a value that
 * would be rejected by the database comes back as a sentence an operator can act
 * on rather than a 23514 they cannot.
 */
export function checkInvoiceLineEdit(current: EditableInvoiceLine, edit: InvoiceLineEdit): CheckedInvoiceLineEdit {
  const next: EditableInvoiceLine = { ...current };

  if (edit.description !== undefined && edit.description !== null) {
    const description = edit.description.trim();
    if (description.length === 0) return { ok: false, error: "A line needs a description." };
    if (description.length > maxLineDescriptionLength) {
      return { ok: false, error: `Keep the description under ${maxLineDescriptionLength} characters.` };
    }
    next.description = description;
  }

  if (edit.quantity !== undefined && edit.quantity !== null) {
    if (typeof edit.quantity !== "number" || !Number.isFinite(edit.quantity)) {
      return { ok: false, error: "Quantity must be a number." };
    }
    // Rounded first, then tested: a quantity of 0.004 passes `> 0` and then
    // rounds to zero, which violates the `quantity > 0` CHECK and fails the
    // whole write with a message nobody can act on.
    const quantity = round2(edit.quantity);
    if (quantity <= 0) return { ok: false, error: "Quantity must be more than zero." };
    if (quantity > maxLineQuantity) {
      return { ok: false, error: `Quantity looks wrong — keep it under ${maxLineQuantity.toLocaleString("en-US")}.` };
    }
    next.quantity = quantity;
  }

  if (edit.unitAmount !== undefined && edit.unitAmount !== null) {
    if (typeof edit.unitAmount !== "number" || !Number.isFinite(edit.unitAmount)) {
      return { ok: false, error: "Unit price must be a number." };
    }
    const unitAmount = round2(edit.unitAmount);
    if (unitAmount < 0) return { ok: false, error: "Unit price cannot be negative." };
    if (unitAmount > maxLineUnitAmount) {
      return { ok: false, error: "That unit price looks wrong. Check it before billing it." };
    }
    next.unitAmount = unitAmount;
  }

  if (edit.unit !== undefined && edit.unit !== null) {
    const unit = edit.unit.trim();
    if (unit.length > maxLineUnitLength) {
      return { ok: false, error: `Keep the unit under ${maxLineUnitLength} characters.` };
    }
    next.unit = unit;
  }

  if (edit.qtyBasis !== undefined && edit.qtyBasis !== null) {
    if (!isQuantityBasis(edit.qtyBasis)) {
      return { ok: false, error: "Choose how the quantity is counted." };
    }
    next.qtyBasis = edit.qtyBasis;
  }

  if (edit.serviceDate !== undefined) {
    // Explicit null clears the date; that is a real edit, not an omission.
    if (edit.serviceDate === null || edit.serviceDate === "") {
      next.serviceDate = null;
    } else if (typeof edit.serviceDate !== "string" || !isCalendarDate(edit.serviceDate)) {
      return { ok: false, error: "Give the service date as YYYY-MM-DD." };
    } else {
      next.serviceDate = edit.serviceDate;
    }
  }

  next.lineTotal = lineTotalFor(next);

  if (next.lineTotal > maxInvoiceAmount) {
    return { ok: false, error: "That line comes to more than this system will invoice. Split it or check the figures." };
  }

  return { ok: true, line: next };
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
              unit: "",
              // A deposit is a fixed sum, not a rate. Marking it flat is what
              // stops an edited quantity from multiplying it.
              qtyBasis: "flat",
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
              unit: "",
              qtyBasis: "flat",
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
      // The unit is now a column of its own as well as part of the description,
      // because the printed document lays it out in its own column and a
      // renderer cannot pull it back out of a sentence.
      unit: (row.unit ?? "").trim().slice(0, maxLineUnitLength),
      qtyBasis: quantityBasisFor(row),
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
