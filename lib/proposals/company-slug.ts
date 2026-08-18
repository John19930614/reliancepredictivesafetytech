// Document numbers built from the client's company slug: WONDFOUSA-2026-001,
// and the invoices raised against it, WONDFOUSA-2026-001-01.
//
// Pure functions only — no Supabase, no I/O, no module state — importable from
// both the client forms and the server actions. The database side is
// supabase/migrations/20260815140000_company_slug_document_numbering.sql: the
// CHECK constraint there (company_clients_company_slug_format) and
// `companySlugPattern` here must agree, and the two allocators' lpad/greatest
// padding and the formatters here must agree.
//
// Decision of record (call 2026-08-14, John Haldemann / Steven Sladky): the
// full company name, uppercased, spaces and punctuation removed, NO
// abbreviations — WONDFOUSA, not WFU. This REVERSES the 2026-08-07 build review
// that produced ./client-codes.ts, and SUPERSEDES that module: a human reading
// an invoice can tell whose it is without a lookup table. client-codes.ts stays
// exactly as it is, because the numbers it minted are printed on documents
// clients already hold and must remain explicable.
//
//   PROPOSAL         {SLUG}-{YYYY}-{NNN}      WONDFOUSA-2026-001
//   INVOICE          {PROPOSAL}-{NN}          WONDFOUSA-2026-001-01
//   MANUAL INVOICE   {SLUG}-{YYYY}-INV-{NN}   WONDFOUSA-2026-INV-01
//
// One proposal carries many invoices, so an invoice number is its parent's
// number plus a suffix — the parent is always readable off the child.
//
// A MANUAL invoice has no parent to hang off — it bills a callout, not a
// contract — so it is numbered off the client's slug directly, on its own
// per-client, per-year sequence. The literal INV field is what keeps it apart:
// it occupies exactly the position a proposal's sequence occupies, and a
// sequence is always digits, so the two shapes can never meet. That is also why
// a manual invoice is NOT numbered {SLUG}-{YYYY}-{NNN} off some shared counter:
// the first person to read WONDFOUSA-2026-004 off an invoice would go looking
// for a proposal of that number, and there would never be one.
//
// The parsers refuse every legacy shape (HUN-01, RPS-2026-0007,
// RPS-INV-2026-0001) on purpose; see parseProposalNumber.

/** Mirrors company_clients_company_slug_format in the migration. */
export const companySlugPattern = /^[A-Z0-9]{2,40}$/;

export const companySlugRule =
  "The full company name in capitals — no spaces, no punctuation, no abbreviations, 2–40 characters, e.g. WONDFOUSA for Wondfo USA, Inc.";

/**
 * The number shapes, and the one detail that keeps the schemes apart.
 *
 * The sequence field is either exactly its padded width (001, 01) or WIDER with
 * no leading zero (1000, 100) — because the formatters below grow rather than
 * truncate. A legacy RPS-2026-0007 is therefore not a slug number with sequence
 * 7: four digits starting with a zero is a shape this scheme never emits. That
 * leading zero is the whole discriminator, so do not "tidy" these patterns.
 *
 * The year is 1000–9999. A four-digit field that starts with 0 is not a year
 * anyone issued a document in — it is a formatter that was handed garbage, and
 * it must not round-trip as if it were real.
 */
/**
 * The prefix the legacy global allocator mints (RPS-YYYY-NNNN), refused as a
 * company slug by company_clients_company_slug_format so the two schemes can
 * never produce the same string. Mirrors that CHECK constraint.
 */
export const reservedSlug = "RPS";

const proposalNumberPattern = /^([A-Z0-9]{2,40})-([1-9]\d{3})-(\d{3}|[1-9]\d{3,})$/;
const invoiceSequencePattern = /^(\d{2}|[1-9]\d{2,})$/;

/**
 * SLUG-YYYY-INV-NN, the manual invoice — one with no proposal behind it.
 *
 * The sequence field carries the same two-digit-or-wider rule as
 * `invoiceSequencePattern` above and for the same reason, and the year field the
 * same 1000-9999 rule as `proposalNumberPattern`.
 *
 * The literal INV sits where a proposal number's sequence sits, and that field
 * is digits in every scheme this module reads. So no manual invoice number can
 * ever be read as a proposal number, and no proposal number — nor an invoice
 * raised against one, which is a proposal number plus a two-digit tail — can
 * ever be read as a manual one. Do not relax INV into an optional or
 * case-insensitive field; it is carrying the whole separation.
 */
const manualInvoiceNumberPattern = /^([A-Z0-9]{2,40})-([1-9]\d{3})-INV-(\d{2}|[1-9]\d{2,})$/;

/** Uppercases and strips everything outside A-Z0-9; "" for non-strings. Does NOT validate. */
export function normalizeCompanySlug(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
}

/**
 * Whether this value is storable in company_clients.company_slug as it stands.
 *
 * Deliberately stricter than isValidClientCode() in ./client-codes.ts, which
 * normalizes first: there, normalizing is trim + uppercase and the stored value
 * is the same string either way. Here normalizing DELETES characters, so a
 * lenient check would call "Wondfo USA" valid and the caller would then hand the
 * raw string to a column whose CHECK rejects it. Normalize, then validate.
 */
export function isValidCompanySlug(value: unknown): boolean {
  // The reserved-prefix half mirrors company_clients_company_slug_format. Both
  // halves have to be here: without it the form would accept RPS, offer to save
  // it, and the database would refuse with a raw constraint violation.
  return typeof value === "string" && companySlugPattern.test(value) && value !== reservedSlug;
}

/**
 * Sequence digits, zero-padded to `width` and GROWN past it — never truncated.
 *
 * greatest(3, length(…)) / greatest(2, length(…)) in SQL and this guard are the
 * same rule: past 999 (proposals) or 99 (invoices) the number simply gets
 * longer. A bare pad in SQL — lpad(seq, 3) — TRUNCATES sequence 1000 to "100"
 * and mints a duplicate financial identifier; the JS equivalent would be
 * slicing this string back to `width`. Do not add that slice.
 *
 * A non-finite or sub-1 sequence floors at 1 rather than emitting "NaN" or a
 * zeroth document.
 */
function sequenceDigits(seq: number, width: number): string {
  const truncated = Math.trunc(Number(seq));
  const n = Number.isFinite(truncated) ? Math.max(1, truncated) : 1;
  return String(n).padStart(width, "0");
}

/**
 * Year digits: four wide, and — same rule as the sequence — wider rather than
 * truncated, since a clipped year is a wrong year.
 *
 * A year that is not a positive whole number becomes "0000", which the parsers
 * reject. That is the intended outcome: a caller who loses the year gets a
 * number that visibly fails to resolve, not one that quietly resolves wrong.
 */
function yearDigits(year: number): string {
  const truncated = Math.trunc(Number(year));
  const n = Number.isFinite(truncated) && truncated > 0 ? truncated : 0;
  return String(n).padStart(4, "0");
}

/** Trims and uppercases a whole document number; "" for non-strings. Keeps the hyphens. */
function normalizeDocumentNumber(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/**
 * SLUG-YYYY-NNN, the sequence zero-padded to three digits.
 *
 * The slug is normalized, not validated — call isValidCompanySlug() first. A
 * caller that formats an invalid slug gets a number parseProposalNumber()
 * refuses, which is the point: a malformed reference must never round-trip as
 * though it were a real one.
 */
export function formatProposalNumber(slug: string, year: number, seq: number): string {
  return `${normalizeCompanySlug(slug)}-${yearDigits(year)}-${sequenceDigits(seq, 3)}`;
}

/**
 * PROPOSAL-NN, the sequence zero-padded to two digits.
 *
 * The parent number is trimmed and uppercased only — its hyphens are structure,
 * not punctuation to strip. It is not validated here for the same reason the
 * slug is not: the parser is the gate.
 */
export function formatInvoiceNumber(proposalNumber: string, seq: number): string {
  return `${normalizeDocumentNumber(proposalNumber)}-${sequenceDigits(seq, 2)}`;
}

/**
 * SLUG-YYYY-INV-NN, the sequence zero-padded to two digits — a manual invoice,
 * raised against a client with no proposal behind it.
 *
 * Same padding rule as formatInvoiceNumber (two wide, GROWN past it, never
 * truncated) because it is allocated by the same
 * lpad(…, greatest(2, length(…)), '0') in allocate_client_invoice_number().
 * Same year rule as formatProposalNumber, for the same reason: a clipped year
 * is a wrong year, and a year the caller lost must produce a number that
 * visibly fails to resolve.
 *
 * The slug is normalized, not validated. A client with no slug has no manual
 * invoice number — the caller must obtain one first, which is what
 * allocate_client_invoice_number() now raises rather than falling back to the
 * global RPS-INV scheme, whose numbers say nothing about whose invoice it is.
 */
export function formatManualInvoiceNumber(slug: string, year: number, seq: number): string {
  return `${normalizeCompanySlug(slug)}-${yearDigits(year)}-INV-${sequenceDigits(seq, 2)}`;
}

/**
 * The trailing words that name a legal form rather than the business.
 *
 * THE RULE (documented because it is a judgement call): strip words off the END
 * of the name, repeatedly, for as long as the last one is on this list. Only
 * legal/entity forms are listed — never a trade word. "Construction" and
 * "Electric" tell two clients apart and stay; "Company" and "Incorporated" tell
 * you nothing about which client this is and go. That is why "Hunzinger
 * Construction Company" keeps CONSTRUCTION while "Staff Electric Company
 * Incorporated" drops both of its trailing words.
 *
 * Stripping is unconditional — there is no "keep the last word standing" guard.
 * A name that is nothing but legal forms ("LLC", "Inc, LLC") therefore yields no
 * slug at all, which is the right answer: LLC is not an identity, and minting it
 * would hand one client a prefix every other unnamed client would also want.
 *
 * The spelled-out forms sit beside their abbreviations (Corporation/Corp,
 * Limited/Ltd) exactly as Incorporated sits beside Inc. Punctuated variants need
 * no entry: "L.L.C." normalizes to LLC before it is looked up.
 *
 * Only whole words match, so Costco keeps its CO and 3M keeps its M.
 */
const legalSuffixes = new Set([
  "INC",
  "INCORPORATED",
  "LLC",
  "LLP",
  "PLLC",
  "LP",
  "LTD",
  "LIMITED",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
]);

/**
 * The name split into slug-safe words.
 *
 * Splits on runs of anything that is not a letter, digit or period; the period
 * survives the split so "L.L.C." stays one word, then normalizing removes it.
 */
function nameWords(name: string): string[] {
  return name
    .split(/[^A-Za-z0-9.]+/)
    .map((word) => normalizeCompanySlug(word))
    .filter((word) => word !== "");
}

/**
 * A suggested slug for a company name — a starting point whoever writes the
 * first proposal can overtype, never an automatic assignment. (The migration
 * locks the slug once a number has been issued against it, so the human check
 * happens while it is still free.)
 *
 * Trailing legal-form words are dropped per `legalSuffixes` above; everything
 * else is concatenated, uppercased and capped at 40 characters — the pattern's
 * ceiling, and the one place this function alters the name, so a very long name
 * should be shortened by a human rather than accepted as suggested.
 *
 * A name that yields fewer than two usable characters returns "": the caller
 * must ask a human. A slug is never invented and never padded out to fit.
 */
export function suggestCompanySlug(name: string): string {
  if (typeof name !== "string") return "";

  const words = nameWords(name);
  while (words.length > 0 && legalSuffixes.has(words[words.length - 1])) {
    words.pop();
  }

  const slug = words.join("").slice(0, 40);
  return isValidCompanySlug(slug) ? slug : "";
}

/**
 * SLUG-YYYY-NNN back into its parts, or null.
 *
 * Refuses every legacy shape, so the two schemes can never be read as one:
 *   HUN-01              — the 2026-08-07 per-client code, no year field
 *   RPS-2026-0007       — the global scheme; four sequence digits with a
 *                         leading zero, which this scheme never emits
 *   RPS-INV-2026-0001   — a legacy invoice; the second field is not a year
 * A rejected number is not a broken number. It is a number belonging to a
 * scheme this module does not own, and the caller should say so.
 */
export function parseProposalNumber(
  value: unknown,
): { slug: string; year: number; seq: number } | null {
  if (typeof value !== "string") return null;

  const match = proposalNumberPattern.exec(value.trim().toUpperCase());
  if (!match) return null;

  const seq = Number(match[3]);
  // "000" satisfies the three-digit field but no document is ever the zeroth.
  if (seq < 1) return null;

  // The leading-zero rule separates the schemes only below sequence 1000: the
  // legacy global allocator pads to four, so RPS-2026-0007 is refused above but
  // RPS-2026-1000 is shape-identical to a current-scheme number and would parse
  // as slug "RPS". No client can hold that slug — the CHECK constraint in
  // 20260815140000 reserves it, for this exact reason — so a number wearing it
  // belongs to the legacy scheme however it is shaped.
  if (match[1] === reservedSlug) return null;

  return { slug: match[1], year: Number(match[2]), seq };
}

/**
 * PROPOSAL-NN back into its parts, or null.
 *
 * The parent must itself parse as a current-scheme proposal number, which is
 * what rejects RPS-INV-2026-0001 and HUN-01-01. It also means an invoice raised
 * against a proposal that still carries a legacy number — the migration's
 * allocator will happily produce RPS-2026-0007-01 — parses as null. That is
 * correct rather than convenient: the parent is a legacy reference, and callers
 * must handle null instead of being told the wrong thing about it.
 *
 * A proposal number and an invoice number can never be confused for each other:
 * a slug contains no hyphen, so a proposal number is exactly three
 * hyphen-separated fields and an invoice number is exactly four.
 */
export function parseInvoiceNumber(
  value: unknown,
): { proposalNumber: string; seq: number } | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();
  const split = normalized.lastIndexOf("-");
  if (split <= 0) return null;

  const proposalNumber = normalized.slice(0, split);
  const sequence = normalized.slice(split + 1);

  if (!invoiceSequencePattern.test(sequence)) return null;
  if (!parseProposalNumber(proposalNumber)) return null;

  const seq = Number(sequence);
  if (seq < 1) return null;

  return { proposalNumber, seq };
}

/**
 * SLUG-YYYY-INV-NN back into its parts, or null.
 *
 * Refuses every legacy shape, exactly as the two parsers above do:
 *   HUN-01              — the 2026-08-07 per-client code, no year field
 *   RPS-2026-0007       — the global proposal scheme
 *   RPS-INV-2026-0001   — the RETIRED global manual-invoice allocator. Note how
 *                         close it sits: same four fields, same INV, and it is
 *                         refused because INV is in the wrong one. The year has
 *                         to be the SECOND field, which is the whole reason the
 *                         new shape puts the slug first — a manual invoice now
 *                         names its client where the old one named the vendor.
 * A rejected number is not a broken number; it belongs to a scheme this module
 * does not own, and the caller should say so.
 */
export function parseManualInvoiceNumber(
  value: unknown,
): { slug: string; year: number; seq: number } | null {
  if (typeof value !== "string") return null;

  const match = manualInvoiceNumberPattern.exec(value.trim().toUpperCase());
  if (!match) return null;

  const seq = Number(match[3]);
  // "00" satisfies the two-digit field but no invoice is ever the zeroth.
  if (seq < 1) return null;

  // Same reservation, same reason as parseProposalNumber: no client can hold
  // the slug RPS (company_clients_company_slug_format refuses it), so a number
  // wearing it was never minted by this scheme however it is shaped.
  if (match[1] === reservedSlug) return null;

  return { slug: match[1], year: Number(match[2]), seq };
}
