// Pure view-model for the client-facing invoice document.
//
// Modelled on components/proposals/proposal-document-model.ts, and for the same
// reason: an invoice now has more than one renderer (PDF and DOCX today, an
// on-screen preview next), and a renderer that reaches past the model for its
// wording is exactly how the proposal generator's preview drifted away from the
// platform's document. Every string a renderer prints is derived HERE. The
// renderers decide LAYOUT only.
//
// WHAT THIS REPLACES
//   Until now an invoice was a `client_invoices` row rendered as one line of
//   text in the workflow's billing panel. There was no document — nothing a
//   seller could attach to an email, and nothing that showed a client what they
//   were being billed for. The target layout is Steve Sladky's Word one-pager,
//   transcribed section by section below.
//
// NO I/O (INV-5)
//   The builder takes already-resolved header data. It does not read the
//   database, the company profile, or the proposal it references — the route
//   handlers do that and hand the result in. That keeps the layout decisions
//   unit-testable under the repo's node-environment vitest setup, which has no
//   database and no component harness.
//
// EVERY INPUT IS UNTRUSTED
//   The input round-trips through JSONB and a set of numeric columns, so every
//   value is coerced on the way in — the same discipline lib/proposals/pricing.ts
//   applies to a persisted generator state. Nothing reaches a renderer as NaN,
//   Infinity, undefined, or an object where a string was expected.

// The ONE import, and it is a bound rather than behaviour: how many lines a
// description may print is a fact about the field, and the form validator
// (lib/invoices/manual.ts) rejects against this same constant. Two numbers that
// had to agree and did not would mean this module silently truncating a
// description the operator had just been told was acceptable. draft.ts is pure
// and does no I/O, so importing it costs this module nothing it promised above.
import { maxLineDescriptionLines } from "./draft";

/* -------------------------------------------------------------------------- */
/* Input contract                                                              */
/*                                                                             */
/* These field names are shared with the migration that persists them. Do NOT   */
/* rename them without changing both sides.                                     */
/* -------------------------------------------------------------------------- */

/**
 * What a line's quantity counts.
 *
 * Drives the fourth column's HEADER (see quantityColumnHeader) rather than the
 * cell text, because the client reads the header once and every row under it in
 * that unit — which is how Steve's Word original is laid out.
 */
export type InvoiceQtyBasis = "session" | "attendee" | "hour" | "flat";

export interface InvoiceLineInput {
  /** YYYY-MM-DD the work was performed, or null for a line with no single date. */
  serviceDate: string | null;
  description: string;
  unitPrice: number;
  quantity: number;
  /** Free-text unit as billed ("hour", "session", "each"). Not printed as a column. */
  unit: string;
  qtyBasis: InvoiceQtyBasis;
  lineTotal: number;
}

/** Our letterhead block. */
export interface InvoiceFirmInput {
  name: string;
  addressLines: string[];
  phone: string;
  email: string;
}

/** The "TO" block — who is being billed. */
export interface InvoiceBillToInput {
  name: string;
  addressLines: string[];
  contactName: string;
  email: string;
}

export interface InvoiceDocumentInput {
  invoiceNumber: string;
  /** YYYY-MM-DD. Printed as MM/DD/YYYY. */
  issueDate: string;
  /**
   * The proposal this invoice bills against.
   *
   * Null is a real state (an invoice raised outside a proposal), and the
   * document still prints the ROW — see the layout note on headerRows. The whole
   * point of the numbering scheme is that an invoice and its proposal can be
   * reconciled from the face of the document.
   */
  referenceProposalNumber: string | null;
  firm: InvoiceFirmInput;
  billTo: InvoiceBillToInput;
  consultant: string;
  jobName: string;
  paymentTerms: string;
  /** YYYY-MM-DD, or null when the terms carry no dated due date. */
  dueDate: string | null;
  lines: InvoiceLineInput[];
  subtotal: number;
  salesTax: number;
  total: number;
  preparedBy: string;
  /**
   * THE CLIENT'S OWN agreement or purchase-order number.
   *
   * ------------------------------------------------------------------------
   * CRITICAL — READ BEFORE WIRING THIS FIELD TO ANYTHING.
   *
   * This is the reference the CLIENT issues: their service agreement number,
   * their PO number, their contract number. It is the string their accounts
   * payable department matches this invoice against, and if it is wrong or
   * missing the invoice sits unpaid in a queue.
   *
   * It is NOT our proposal number. It is NOT our invoice number. It is NOT any
   * identifier this platform mints. Our proposal number already has its own
   * labelled row in the header (`referenceProposalNumber`), and putting it here
   * as well would print our own reference back at the client in the one place
   * they look for theirs.
   * ------------------------------------------------------------------------
   */
  clientAgreementRef: string;
  /** ISO 4217 code. Anything else falls back to USD rather than throwing. */
  currency: string;
}

/* -------------------------------------------------------------------------- */
/* Coercion — a persisted invoice is untrusted input                           */
/*                                                                             */
/* Ported in spirit from lib/proposals/pricing.ts: a non-numeric string falls   */
/* back rather than producing NaN, and a numeric 0 is kept rather than treated  */
/* as falsy — a $0.00 line is DELIBERATE on this document (see INV-7 below).    */
/* -------------------------------------------------------------------------- */

/** Rendered wherever a value is genuinely missing. Never a fabricated default. */
export const missingValue = "—";

/**
 * Cap on the lines in a PARTY BLOCK — the letterhead and the TO block.
 *
 * The firm and TO blocks sit at the top of a one-page document. A malformed
 * JSONB array of a thousand strings would push the line-item table off the
 * sheet, so the block is bounded; a real postal address needs four lines.
 *
 * It has nothing to do with a line-item description and is never applied to
 * one: blockLines() below is called on addressLines and on nothing else. A
 * multi-line description is bounded by maxLineDescriptionLines, which is the
 * same cap the form validates against — see descriptionText().
 */
export const maxBlockLines = 8;

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return String(value);
  return "";
}

/**
 * Trimmed text with control characters stripped.
 *
 * Newlines and tabs are collapsed to spaces rather than escaped: every field
 * that goes through HERE occupies ONE cell or ONE line of a fixed layout, and a
 * stray newline in one of them would silently restructure the table.
 *
 * THE ONE EXCEPTION is a line-item description, which is deliberately allowed
 * to run to several lines and goes through descriptionText() instead. Nothing
 * else does — a two-line consultant name or payment-terms cell is a broken
 * value, not a layout choice.
 */
function clean(value: unknown): string {
  // eslint-disable-next-line no-control-regex
  return toText(value).replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Cleaned text, or `fallback` when the field is absent or blank. */
function text(value: unknown, fallback = ""): string {
  const cleaned = clean(value);
  return cleaned === "" ? fallback : cleaned;
}

/**
 * A line-item description, with its LINE BREAKS INTACT.
 *
 * The one multi-line field on the document. An operator bills
 *
 *   Training
 *   Biosafety Training: Classroom and Practical.
 *
 * as one line item, and the heading is what the client's eye lands on. Both
 * renderers know how to draw the break (lib/invoices/pdf.ts wraps each
 * paragraph in the DESCRIPTION column; lib/invoices/docx.ts emits one run per
 * line with a <w:br/> between). Flattening it here — which is what clean() did
 * until descriptions became multi-line — would throw that shape away before
 * either of them saw it, and neither could get it back.
 *
 * Still fully coerced, because a persisted invoice is untrusted input: every
 * other control character goes, each line's internal whitespace collapses, and
 * blank lines are trimmed off both ends. The line COUNT is bounded at the same
 * maxLineDescriptionLines the form validates against, so a legitimate
 * description can never be truncated here — only one that got past the
 * validator, by hand or from an older row, and that would print as a row tall
 * enough to break the one-page layout.
 */
function descriptionText(value: unknown, fallback = ""): string {
  const lines = toText(value)
    .replace(/\r\n?/g, "\n")
    // Every control character EXCEPT the newline (\u000A). Written as two
    // ranges rather than a negated class so the intent is legible.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]+/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim());

  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const description = lines.slice(0, maxLineDescriptionLines).join("\n");
  return description === "" ? fallback : description;
}

/** Number coercion that can never yield NaN or Infinity. */
function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return fallback;
    // Money arrives from a numeric(14,2) column, which supabase-js may hand back
    // as a string. Strip the grouping and currency decoration a hand-edited
    // payload might carry rather than collapsing it to the fallback.
    const parsed = Number(trimmed.replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** Rounds to whole cents. Non-finite input (overflow) collapses to 0. */
function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * A money figure as it will be printed.
 *
 * NEGATIVES SURVIVE. A negative amount is a real if unusual figure — a credit —
 * and clamping it to zero would silently change what a client is billed. Only
 * NaN and Infinity are refused. (Same reasoning as formatLineAmount's comment in
 * the proposal model.)
 */
function money(value: unknown): number {
  return roundCents(toNumber(value, 0));
}

/** Quantities are counts. A negative count is meaningless, so it floors at 0. */
function quantity(value: unknown): number {
  const parsed = roundCents(toNumber(value, 0));
  return parsed < 0 ? 0 : parsed;
}

/** A bounded list of cleaned, non-blank lines from an untrusted array. */
function blockLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const entry of value) {
    const line = clean(entry);
    if (line === "") continue;
    lines.push(line);
    if (lines.length >= maxBlockLines) break;
  }
  return lines;
}

/* -------------------------------------------------------------------------- */
/* Money and dates                                                             */
/* -------------------------------------------------------------------------- */

const currencyPattern = /^[A-Za-z]{3}$/;

/** ISO 4217 code, uppercased. Anything else is USD — Intl THROWS on a bad code. */
export function normalizeCurrency(value: unknown): string {
  const code = clean(value).toUpperCase();
  return currencyPattern.test(code) ? code : "USD";
}

/**
 * Money as it appears on an invoice: ALWAYS two decimal places.
 *
 * Deliberately NOT formatMoney() from lib/proposals/pricing.ts, which prints a
 * whole-dollar figure with no cents ("$1,200") and — via formatLineAmount —
 * prints an exact zero as the words "No cost".
 *
 * INV-7. Steve bills $0.00 lines on purpose, to show goodwill work that was
 * performed and not charged for ("CERS Log-In Check List (No Charge)"). On an
 * invoice those two proposal behaviours are both wrong:
 *
 *   * "No cost" in the LINE TOTAL column is prose in a column of figures, and
 *     an AP clerk reconciling the column cannot add it up.
 *   * "$0" reads as a rounded or truncated number — the thing a client queries.
 *
 * An explicit $0.00 is a stated price of zero. That is the claim the document is
 * making, so that is what it prints.
 */
export function formatInvoiceMoney(value: unknown, currency = "USD"): string {
  const amount = money(value);
  const code = normalizeCurrency(currency);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unreachable for a code that passes normalizeCurrency, but a download that
    // 500s over a currency string is a worse outcome than an unsymbolled figure.
    return `${amount < 0 ? "-" : ""}${Math.abs(amount).toFixed(2)}`;
  }
}

/**
 * A quantity as it appears in the count column: "8", "7.5", "0".
 *
 * Trailing zeros are NOT padded on. A numeric(12,2) column hands back "8.00",
 * and a column headed HOURS reading "8" is what the client wrote on the
 * timesheet. A genuine half hour still prints as "7.5".
 */
export function formatQuantity(value: unknown): string {
  return String(quantity(value));
}

const datePattern = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Formats a `YYYY-MM-DD` calendar date as MM/DD/YYYY — the format on Steve's
 * original ("10/31/2025").
 *
 * Deliberately NOT `new Date(...).toLocaleDateString()`, for the reason
 * formatDocumentDate documents in the proposal model: the document is
 * server-rendered, so a Date-based format shifts the day across the server's
 * timezone boundary and varies with the server locale. Parsing the string parts
 * keeps the printed date identical to the date that was stored.
 *
 * Anything that is not a calendar date is echoed back verbatim rather than
 * guessed at; a genuinely absent date renders as `missingValue`.
 */
export function formatInvoiceDate(value: unknown, fallback = missingValue): string {
  const trimmed = clean(value);
  if (trimmed === "") return fallback;
  const match = datePattern.exec(trimmed);
  if (!match) return trimmed;
  const [, year, month, day] = match;
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return trimmed;
  return `${month}/${day}/${year}`;
}

/** The same date as MM-DD-YYYY, for decision D-6's filename. "" when absent. */
export function formatInvoiceFileDate(value: unknown): string {
  const trimmed = clean(value);
  const match = datePattern.exec(trimmed);
  if (!match) return "";
  const [, year, month, day] = match;
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return "";
  return `${month}-${day}-${year}`;
}

/**
 * Strips what must never reach a Content-Disposition header or a file system.
 *
 * The invoice number comes from the database, but it reaches this function on
 * its way into a response HEADER, so a quote or a CR/LF in it would be a header
 * injection rather than a cosmetic problem. Windows' reserved characters go too,
 * so the download saves under the name we chose on every desktop.
 */
function filenamePart(value: unknown): string {
  return clean(value)
    // eslint-disable-next-line no-useless-escape
    .replace(/["'`\\/:<>|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Decision D-6: `Invoice <full invoice number> <MM-DD-YYYY>.pdf`.
 *
 * Spaces and all — this is the name that shows up as an email attachment, and
 * "Invoice WONDFOUSA-2026-001-01 10-31-2025.pdf" is what a client's AP inbox
 * needs to read. (The proposal exports slugify instead; that is a download a
 * seller files, not one a client receives.)
 *
 * Each part is dropped rather than faked when it is missing, so a numberless
 * draft downloads as "Invoice 10-31-2025.pdf" instead of "Invoice undefined".
 */
export function invoiceDownloadFilename(
  invoiceNumber: unknown,
  issueDate: unknown,
  extension: "pdf" | "docx",
): string {
  const parts = ["Invoice", filenamePart(invoiceNumber), formatInvoiceFileDate(issueDate)].filter(
    (part) => part !== "",
  );
  return `${parts.join(" ")}.${extension}`;
}

/* -------------------------------------------------------------------------- */
/* The quantity column                                                         */
/* -------------------------------------------------------------------------- */

const qtyBases: readonly InvoiceQtyBasis[] = ["session", "attendee", "hour", "flat"];

/** Anything unrecognised is "flat" — a count of things, with no better name. */
export function normalizeQtyBasis(value: unknown): InvoiceQtyBasis {
  const basis = clean(value).toLowerCase();
  return (qtyBases as readonly string[]).includes(basis) ? (basis as InvoiceQtyBasis) : "flat";
}

/** Column header per basis. "QTY" is also the mixed/unknown fallback. */
const qtyBasisHeaders: Readonly<Record<InvoiceQtyBasis, string>> = Object.freeze({
  hour: "HOURS",
  session: "SESSIONS",
  attendee: "ATTENDEES",
  flat: "QTY",
});

/** How the subtotal row names the unit it summed. "" means print "SUBTOTAL". */
const qtyBasisSubtotalSuffix: Readonly<Record<InvoiceQtyBasis, string>> = Object.freeze({
  hour: "HRS",
  session: "SESSIONS",
  attendee: "ATTENDEES",
  flat: "",
});

/**
 * The single basis every line shares, or null when they disagree.
 *
 * $0.00 lines VOTE like any other line (INV-7 — they are real lines of the
 * invoice, not decoration). A no-charge line stored with a different basis to
 * the rest will therefore demote the header to "QTY", which is the honest
 * outcome: a column headed HOURS whose rows are not all hours is worse than a
 * generic header.
 */
export function resolveQtyBasis(lines: readonly { qtyBasis?: unknown }[]): InvoiceQtyBasis | null {
  const bases = new Set(lines.map((line) => normalizeQtyBasis(line?.qtyBasis)));
  return bases.size === 1 ? ([...bases][0] as InvoiceQtyBasis) : null;
}

/**
 * The fourth column's header — "HOURS" on Steve's original.
 *
 * Follows the lines' qty basis so a training invoice reads SESSIONS and a
 * per-head course reads ATTENDEES. Falls back to "QTY" when the lines disagree
 * or when there are none.
 */
export function quantityColumnHeader(lines: readonly { qtyBasis?: unknown }[]): string {
  const basis = resolveQtyBasis(lines);
  return basis === null ? qtyBasisHeaders.flat : qtyBasisHeaders[basis];
}

/** "SUBTOTAL (HRS)" for an hourly invoice, plain "SUBTOTAL" for a mixed one. */
export function subtotalLabel(lines: readonly { qtyBasis?: unknown }[]): string {
  const basis = resolveQtyBasis(lines);
  const suffix = basis === null ? "" : qtyBasisSubtotalSuffix[basis];
  return suffix === "" ? "SUBTOTAL" : `SUBTOTAL (${suffix})`;
}

/* -------------------------------------------------------------------------- */
/* Static document copy — transcribed from the Word original                   */
/* -------------------------------------------------------------------------- */

export const invoiceCopy = Object.freeze({
  /** The word in the top-right corner. */
  stamp: "INVOICE",
  toHeading: "TO",
  headerLabels: Object.freeze({
    number: "INVOICE #",
    date: "DATE",
    reference: "REFERENCE PROPOSAL NUMBER",
  }),
  barLabels: Object.freeze({
    consultant: "CONSULTANT",
    job: "JOB",
    paymentTerms: "PAYMENT TERMS",
    dueDate: "DUE DATE",
  }),
  columnLabels: Object.freeze({
    date: "DATE",
    description: "DESCRIPTION",
    unitPrice: "UNIT PRICE",
    lineTotal: "LINE TOTAL",
  }),
  salesTaxLabel: "SALES TAX",
  totalLabel: "TOTAL",
  preparedByLabel: "Invoice Prepared By:",
  /** Blank rule printed when nobody has been recorded as the preparer. */
  preparedByRule: "______________________________",
  /**
   * The closing sentence, verbatim from the Word original. The client's own
   * agreement / PO reference is appended to it — see clientAgreementRef.
   */
  agreementSentence: "Invoice for consulting services to client based on service agreement",
});

/* -------------------------------------------------------------------------- */
/* Model types                                                                 */
/* -------------------------------------------------------------------------- */

/** One labelled row of the header's right-hand stack. */
export interface InvoiceHeaderRow {
  label: string;
  value: string;
}

export interface InvoicePartyBlock {
  /** "" for the letterhead, "TO" for the bill-to block. */
  heading: string;
  /** `missingValue` when unknown. Never a fabricated name. */
  name: string;
  /** Address / contact lines, already trimmed and de-blanked. */
  lines: string[];
}

/** One cell of the CONSULTANT | JOB | PAYMENT TERMS | DUE DATE bar. */
export interface InvoiceBarCell {
  label: string;
  value: string;
}

export interface InvoiceDocumentLine {
  dateLabel: string;
  description: string;
  unitPriceLabel: string;
  quantityLabel: string;
  lineTotalLabel: string;
  /**
   * True for a deliberate no-charge line (INV-7).
   *
   * Carried so a renderer MAY style the row, never so it can skip it. Every
   * renderer prints this row with its explicit $0.00 like any other.
   */
  isNoCharge: boolean;
}

export interface InvoiceTotalRow {
  label: string;
  /** Total count, printed under the quantity column. "" when it does not apply. */
  quantityLabel: string;
  value: string;
  emphasis?: "total";
}

export interface InvoiceDocumentModel {
  /** "INVOICE" — the word in the top-right corner. */
  stamp: string;
  /** Firm name across the top left. */
  wordmark: string;
  /**
   * INVOICE # / DATE / REFERENCE PROPOSAL NUMBER, in that order, ALWAYS all
   * three.
   *
   * The reference row is not conditional. An invoice number and the proposal
   * number it bills against are the two halves of the numbering scheme
   * (WONDFOUSA-2026-001-01 against WONDFOUSA-2026-001), and a document that
   * printed the row only when the value happened to be set would leave the
   * reader unable to tell "no proposal" from "we forgot". An unknown reference
   * prints as `missingValue` under its own label.
   */
  headerRows: InvoiceHeaderRow[];
  firm: InvoicePartyBlock;
  billTo: InvoicePartyBlock;
  barCells: InvoiceBarCell[];
  /** "HOURS" / "SESSIONS" / "ATTENDEES" / "QTY". */
  quantityHeader: string;
  /** DATE | DESCRIPTION | UNIT PRICE | <quantityHeader> | LINE TOTAL. */
  columnHeaders: string[];
  /** Every line, in input order. NOTHING is filtered out — see INV-7. */
  lines: InvoiceDocumentLine[];
  totalRows: InvoiceTotalRow[];
  /** "Invoice Prepared By: Steve Sladky", or the blank rule when unknown. */
  preparedByLine: string;
  /** The closing sentence with the CLIENT's agreement reference appended. */
  agreementSentence: string;
  currency: string;
  /** Raw values the routes need for the filename and file metadata. */
  invoiceNumber: string;
  issueDate: string;
  documentTitle: string;
}

/* -------------------------------------------------------------------------- */
/* Builder                                                                     */
/* -------------------------------------------------------------------------- */

function party(heading: string, name: string, lines: string[]): InvoicePartyBlock {
  return { heading, name: name === "" ? missingValue : name, lines };
}

/**
 * Builds the whole invoice view-model.
 *
 * Degrades honestly rather than throwing: an invoice with no lines, no client
 * address and no reference still produces a complete document — every label, a
 * zeroed totals block, and dashes where a value is genuinely unknown. That
 * matters more here than on a proposal, because the caller is a download route
 * and a throw there is saved into the client's ".pdf" as an HTML error page.
 */
export function buildInvoiceDocumentModel(input: InvoiceDocumentInput): InvoiceDocumentModel {
  const currency = normalizeCurrency(input?.currency);
  const rawLines = Array.isArray(input?.lines) ? input.lines : [];

  const invoiceNumber = text(input?.invoiceNumber);
  const issueDate = clean(input?.issueDate);

  // INV-7. NO FILTER, NO `.filter(line => line.lineTotal > 0)`, NO collapsing of
  // repeated descriptions. A $0.00 line is work that was performed and given
  // away, and the client is meant to see it — that is the entire reason it is on
  // the invoice. If a future change needs to hide rows, it needs a new field on
  // the input, not a predicate here.
  const lines: InvoiceDocumentLine[] = rawLines.map((line) => {
    const lineTotal = money(line?.lineTotal);
    return {
      // A line with no single service date leaves the cell EMPTY rather than
      // printing a dash in every row of a flat-fee invoice.
      dateLabel: formatInvoiceDate(line?.serviceDate, ""),
      description: descriptionText(line?.description, missingValue),
      unitPriceLabel: formatInvoiceMoney(line?.unitPrice, currency),
      quantityLabel: formatQuantity(line?.quantity),
      lineTotalLabel: formatInvoiceMoney(lineTotal, currency),
      isNoCharge: lineTotal === 0,
    };
  });

  const quantityTotal = rawLines.reduce((sum, line) => sum + quantity(line?.quantity), 0);

  const firmName = text(input?.firm?.name);
  const firmLines = [
    ...blockLines(input?.firm?.addressLines),
    ...(clean(input?.firm?.phone) ? [clean(input?.firm?.phone)] : []),
    ...(clean(input?.firm?.email) ? [clean(input?.firm?.email)] : []),
  ];

  const billToLines = [
    ...blockLines(input?.billTo?.addressLines),
    ...(clean(input?.billTo?.contactName) ? [clean(input?.billTo?.contactName)] : []),
    ...(clean(input?.billTo?.email) ? [clean(input?.billTo?.email)] : []),
  ];

  const preparedBy = clean(input?.preparedBy);
  const agreementRef = clean(input?.clientAgreementRef);

  return {
    stamp: invoiceCopy.stamp,
    wordmark: firmName === "" ? missingValue : firmName,
    headerRows: [
      { label: invoiceCopy.headerLabels.number, value: invoiceNumber === "" ? missingValue : invoiceNumber },
      { label: invoiceCopy.headerLabels.date, value: formatInvoiceDate(issueDate) },
      {
        label: invoiceCopy.headerLabels.reference,
        // Always present. See the note on InvoiceDocumentModel.headerRows.
        value: text(input?.referenceProposalNumber, missingValue),
      },
    ],
    firm: party("", firmName, firmLines),
    billTo: party(invoiceCopy.toHeading, text(input?.billTo?.name), billToLines),
    barCells: [
      { label: invoiceCopy.barLabels.consultant, value: text(input?.consultant, missingValue) },
      { label: invoiceCopy.barLabels.job, value: text(input?.jobName, missingValue) },
      { label: invoiceCopy.barLabels.paymentTerms, value: text(input?.paymentTerms, missingValue) },
      { label: invoiceCopy.barLabels.dueDate, value: formatInvoiceDate(input?.dueDate) },
    ],
    quantityHeader: quantityColumnHeader(rawLines),
    columnHeaders: [
      invoiceCopy.columnLabels.date,
      invoiceCopy.columnLabels.description,
      invoiceCopy.columnLabels.unitPrice,
      quantityColumnHeader(rawLines),
      invoiceCopy.columnLabels.lineTotal,
    ],
    lines,
    totalRows: [
      {
        label: subtotalLabel(rawLines),
        // The count is printed beside the money on the subtotal row, which is
        // what makes "SUBTOTAL (HRS)" mean anything.
        quantityLabel: formatQuantity(quantityTotal),
        value: formatInvoiceMoney(input?.subtotal, currency),
      },
      { label: invoiceCopy.salesTaxLabel, quantityLabel: "", value: formatInvoiceMoney(input?.salesTax, currency) },
      {
        label: invoiceCopy.totalLabel,
        quantityLabel: "",
        value: formatInvoiceMoney(input?.total, currency),
        emphasis: "total",
      },
    ],
    preparedByLine: `${invoiceCopy.preparedByLabel} ${preparedBy === "" ? invoiceCopy.preparedByRule : preparedBy}`,
    // The reference is appended even when it is missing, as a dash. A client
    // whose AP process runs on PO numbers should see that the field exists and
    // is blank, rather than see a sentence that quietly stops early.
    agreementSentence: `${invoiceCopy.agreementSentence} ${agreementRef === "" ? missingValue : agreementRef}`,
    currency,
    invoiceNumber,
    issueDate,
    documentTitle: [invoiceCopy.stamp, invoiceNumber].filter((part) => part !== "").join(" "),
  };
}
