// Raising an invoice that no proposal sits behind.
//
// WHY THIS EXISTS. Until now the only way to bill a client was
// createInvoiceFromProposal: every figure was recomputed from an accepted
// proposal, and no proposal meant no invoice. Real billing does not work that
// way — a callout, a reissued certificate, an hour of advice, a client who
// agreed the work by email — and the workaround was to raise a fake proposal
// just to get a number out of the system, which puts a document in the client's
// contract history that nobody ever agreed to.
//
// So the operator types the lines here instead. That inverts the trust model of
// draft.ts, where the browser proposed nothing: here the browser proposes
// everything, which is precisely why this module exists and why the server
// action does no arithmetic of its own. Every amount that reaches the database
// is computed HERE, from the quantity, the price and the basis, by the same
// lineTotalFor/invoiceTotalsFrom that price a proposal-derived invoice — so a
// manual invoice and a generated one cannot disagree about what a line is worth.
//
// PURE and side-effect free, in the same spirit as draft.ts: no Supabase, no
// clock. `now` is a parameter so the due-date derivation is testable.

import {
  addDays,
  invoiceTotalsFrom,
  isQuantityBasis,
  lineTotalFor,
  maxInvoiceAmount,
  maxLineDescriptionLength,
  maxLineQuantity,
  maxLineUnitAmount,
  maxLineUnitLength,
  netDaysFromPaymentTerms,
  quantityBases,
  type QuantityBasis,
} from "./draft";

/** One line as the form sends it: unvalidated, and not to be trusted. */
export interface NewManualInvoiceLine {
  description: string;
  quantity: number;
  unitAmount: number;
  /** What one of this line is, as printed: "Seat", "Hour". Optional. */
  unit?: string | null;
  /** Whether `quantity` multiplies `unitAmount`. See draft.ts, quantityBases. */
  qtyBasis: string;
  /** YYYY-MM-DD, or null when the work has no single date. */
  serviceDate?: string | null;
}

export interface NewManualInvoiceInput {
  clientId: string;
  /** ISO 4217, three characters — the column CHECK is char_length = 3. */
  currency: string;
  /** YYYY-MM-DD. Empty means "today", resolved from the `now` argument. */
  issueDate?: string | null;
  /** Free text, printed verbatim on the document; also derives the due date. */
  paymentTerms?: string | null;
  /** YYYY-MM-DD. Omitted means "derive it from the payment terms". */
  dueDate?: string | null;
  taxAmount: number;
  consultantName?: string | null;
  jobName?: string | null;
  clientAgreementRef?: string | null;
  preparedBy?: string | null;
  notes?: string | null;
  lines: NewManualInvoiceLine[];
}

/** A line as it will be stored, with its total computed rather than accepted. */
export interface NormalisedManualInvoiceLine {
  description: string;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
  unit: string;
  qtyBasis: QuantityBasis;
  serviceDate: string | null;
  sortOrder: number;
}

/** The invoice as it will be written. Every money figure is derived here. */
export interface NormalisedManualInvoice {
  clientId: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string | null;
  taxAmount: number;
  subtotal: number;
  total: number;
  consultantName: string | null;
  jobName: string | null;
  clientAgreementRef: string | null;
  preparedBy: string | null;
  notes: string | null;
  lines: NormalisedManualInvoiceLine[];
}

export type ManualInvoiceCheck =
  | { ok: true; value: NormalisedManualInvoice }
  | { ok: false; errors: string[] };

/**
 * The same ceiling readInvoiceLines pages to. A hand-typed invoice reaching it
 * is a spreadsheet paste, not an invoice, and a 200-line document that half
 * writes is worse than one that is refused.
 */
export const maxManualInvoiceLines = 200;

/**
 * Column CHECK bounds for the header text fields, repeated from
 * 20260815120000_invoice_document_fields.sql so an over-long value comes back as
 * a sentence rather than a 23514 the operator cannot act on. Mirrors
 * `detailLimits` in the workflow actions.
 */
const headerLimits = {
  consultantName: { max: 200, label: "Consultant name" },
  jobName: { max: 300, label: "Job name" },
  paymentTerms: { max: 1000, label: "Payment terms" },
  clientAgreementRef: { max: 120, label: "Client agreement number" },
  preparedBy: { max: 200, label: "Prepared by" },
  notes: { max: 4000, label: "Notes" },
} as const;

type HeaderField = keyof typeof headerLimits;

function round2(value: number): number {
  // Via cents, so 0.1 + 0.2 style drift cannot reach a stored money column.
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/** True for a real YYYY-MM-DD calendar date, false for "2026-02-31". */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Empty is a cleared field, not an empty string: the columns are nullable. */
function orNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

/**
 * Validates one operator's hand-typed invoice and returns it in the shape the
 * writer stores.
 *
 * COLLECTS every problem rather than stopping at the first. A form with eight
 * lines on it fixed one error per submit would be eight round trips; the
 * operator gets the whole list at once. Errors name the line number because
 * "Quantity must be more than zero" against a screen of rows is not actionable.
 *
 * Deliberately silent about the invoice number: the allocate_client_invoice_number()
 * trigger mints RPS-INV-{YYYY}-{NNNN} for a row with no proposal, and a number
 * chosen anywhere else would collide with the counter that owns it.
 */
export function validateManualInvoice(input: NewManualInvoiceInput, now: Date): ManualInvoiceCheck {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["Nothing to save."] };
  }

  const clientId = text(input.clientId);
  if (clientId.length === 0) errors.push("Choose the client this invoice is for.");

  /* --- Currency ---------------------------------------------------------- */

  const currency = text(input.currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    errors.push("Currency must be a three-letter code, such as USD.");
  }

  /* --- Dates ------------------------------------------------------------- */

  // `now` is an argument so this stays pure and the derivation is testable; a
  // new Date() in here would make every due-date test a clock test.
  const today = Number.isNaN(now.getTime()) ? "" : now.toISOString().slice(0, 10);
  const requestedIssueDate = text(input.issueDate);
  let issueDate = requestedIssueDate.length === 0 ? today : requestedIssueDate;

  if (issueDate.length === 0 || !isCalendarDate(issueDate)) {
    errors.push("Give the issue date as YYYY-MM-DD.");
    issueDate = "";
  }

  const paymentTerms = text(input.paymentTerms);
  const requestedDueDate = text(input.dueDate);
  let dueDate = "";

  if (requestedDueDate.length > 0) {
    if (!isCalendarDate(requestedDueDate)) {
      errors.push("Give the due date as YYYY-MM-DD.");
    } else if (issueDate.length > 0 && requestedDueDate < issueDate) {
      // An invoice that fell due before it was raised is overdue the moment it
      // is issued, and the ageing report on /employee/invoices would report it
      // as debt on day one.
      errors.push("The due date cannot be before the issue date.");
    } else {
      dueDate = requestedDueDate;
    }
  } else if (issueDate.length > 0) {
    // The terms clause is what the printed document says, so it is what decides
    // when the money is due — the same rule createInvoiceFromProposal follows.
    dueDate = addDays(issueDate, netDaysFromPaymentTerms(paymentTerms.length > 0 ? paymentTerms : null));
  }

  /* --- Header text ------------------------------------------------------- */

  const header: Record<HeaderField, string> = {
    consultantName: text(input.consultantName),
    jobName: text(input.jobName),
    paymentTerms,
    clientAgreementRef: text(input.clientAgreementRef),
    preparedBy: text(input.preparedBy),
    notes: text(input.notes),
  };

  for (const field of Object.keys(headerLimits) as HeaderField[]) {
    const limit = headerLimits[field];
    if (header[field].length > limit.max) {
      errors.push(`Keep ${limit.label.toLowerCase()} under ${limit.max} characters.`);
    }
  }

  /* --- Tax --------------------------------------------------------------- */

  let taxAmount = 0;
  if (typeof input.taxAmount !== "number" || !Number.isFinite(input.taxAmount)) {
    errors.push("Tax must be a number.");
  } else {
    taxAmount = round2(input.taxAmount);
    if (taxAmount < 0) errors.push("Tax cannot be negative.");
  }

  /* --- Lines ------------------------------------------------------------- */

  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  if (rawLines.length === 0) {
    // A zero-line invoice still spends a number off the yearly counter and asks
    // the client for a total nothing explains.
    errors.push("An invoice needs at least one line.");
  }
  if (rawLines.length > maxManualInvoiceLines) {
    errors.push(`An invoice can carry at most ${maxManualInvoiceLines} lines.`);
  }

  const lines: NormalisedManualInvoiceLine[] = [];

  rawLines.slice(0, maxManualInvoiceLines).forEach((raw, index) => {
    const at = `Line ${index + 1}`;
    const line = raw && typeof raw === "object" ? raw : ({} as NewManualInvoiceLine);

    const description = text(line.description);
    if (description.length === 0) errors.push(`${at}: add a description.`);
    if (description.length > maxLineDescriptionLength) {
      errors.push(`${at}: keep the description under ${maxLineDescriptionLength} characters.`);
    }

    // Rounded BEFORE the bounds are tested, because the rounded value is what
    // numeric(12,2) stores: 0.004 passes `> 0` and then stores as zero, which
    // violates the quantity CHECK and fails the whole write.
    let quantity = 0;
    if (typeof line.quantity !== "number" || !Number.isFinite(line.quantity)) {
      errors.push(`${at}: quantity must be a number.`);
    } else {
      quantity = round2(line.quantity);
      if (quantity <= 0) errors.push(`${at}: quantity must be more than zero.`);
      else if (quantity > maxLineQuantity) {
        errors.push(`${at}: quantity looks wrong — keep it under ${maxLineQuantity.toLocaleString("en-US")}.`);
      }
    }

    let unitAmount = 0;
    if (typeof line.unitAmount !== "number" || !Number.isFinite(line.unitAmount)) {
      errors.push(`${at}: unit price must be a number.`);
    } else {
      unitAmount = round2(line.unitAmount);
      if (unitAmount < 0) errors.push(`${at}: unit price cannot be negative.`);
      else if (unitAmount > maxLineUnitAmount) {
        errors.push(`${at}: that unit price looks wrong. Check it before billing it.`);
      }
    }

    const unit = text(line.unit);
    if (unit.length > maxLineUnitLength) {
      errors.push(`${at}: keep the unit under ${maxLineUnitLength} characters.`);
    }

    if (!isQuantityBasis(line.qtyBasis)) {
      errors.push(`${at}: choose how the quantity is counted (${quantityBases.join(", ")}).`);
    }

    let serviceDate: string | null = null;
    const rawServiceDate = text(line.serviceDate);
    if (rawServiceDate.length > 0) {
      if (!isCalendarDate(rawServiceDate)) errors.push(`${at}: give the service date as YYYY-MM-DD.`);
      else serviceDate = rawServiceDate;
    }

    const qtyBasis: QuantityBasis = isQuantityBasis(line.qtyBasis) ? line.qtyBasis : "flat";

    lines.push({
      description: description.slice(0, maxLineDescriptionLength),
      quantity: quantity > 0 ? quantity : 1,
      unitAmount,
      // THE amount, computed from the three fields above. A total sent by the
      // browser is not read, not merged, and has nowhere to enter.
      lineTotal: lineTotalFor({ quantity: quantity > 0 ? quantity : 1, unitAmount, qtyBasis }),
      unit: unit.slice(0, maxLineUnitLength),
      qtyBasis,
      serviceDate,
      // Tens, matching buildDraftInvoice, so a line can be inserted between two
      // existing ones later without renumbering the rest.
      sortOrder: (index + 1) * 10,
    });
  });

  /* --- Totals ------------------------------------------------------------ */

  // THE INVARIANT — total = subtotal + tax — recomputed from the lines by the
  // same helper the proposal path and the line editor use.
  const { subtotal, tax, total } = invoiceTotalsFrom(lines, taxAmount);

  if (total > maxInvoiceAmount) {
    errors.push("These lines come to more than this system will invoice. Split it or check the figures.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      clientId,
      currency,
      issueDate,
      dueDate,
      paymentTerms: orNull(header.paymentTerms),
      taxAmount: tax,
      subtotal,
      total,
      consultantName: orNull(header.consultantName),
      jobName: orNull(header.jobName),
      clientAgreementRef: orNull(header.clientAgreementRef),
      preparedBy: orNull(header.preparedBy),
      notes: orNull(header.notes),
      lines,
    },
  };
}
