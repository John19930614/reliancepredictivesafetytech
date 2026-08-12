// How long a proposal stays open for acceptance.
//
// Pure and I/O-free so the same answer is given in three places that must never
// disagree: the readiness checks in the editor, the public share page's
// acceptance panel, and the server action that records an acceptance. Before
// this module the date was PRINTED on the client's document and then ignored by
// the acceptance gate — a client could accept in month four at month-one
// pricing, and nobody was told.
//
// DATES ARE COMPARED AS CALENDAR DAYS, NEVER AS INSTANTS. `client_proposals
// .valid_until` is a Postgres `date`, and the caller supplies today as a
// `YYYY-MM-DD` string resolved in the company's own timezone (the same clock
// proposal creation stamps with). Parsing either side into a Date would
// reintroduce the UTC shift that makes a proposal expire an evening early for a
// seller in US Central.

/** A calendar date in `YYYY-MM-DD` form, and nothing else. */
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: unknown): value is string {
  return typeof value === "string" && datePattern.test(value.trim());
}

/**
 * True when `validUntil` is in the past relative to `today`.
 *
 * A proposal is open THROUGH its validity date, so expiry begins the day after:
 * "valid until the 30th" accepted on the 30th is on time. An absent or
 * unparseable date means no expiry was set — deliberately open, not expired,
 * because refusing acceptance on a proposal that never claimed a deadline would
 * invent a rule the client was never shown.
 */
export function isProposalExpired(validUntil: unknown, today: unknown): boolean {
  if (!isCalendarDate(validUntil) || !isCalendarDate(today)) return false;
  return validUntil.trim() < today.trim();
}

/**
 * Whole days from `today` until `validUntil` — 0 on the last valid day,
 * negative once past. Null when either date is missing or malformed.
 *
 * Built from the date PARTS via Date.UTC so both sides are measured on the same
 * absolute grid; no local timezone is ever consulted.
 */
export function daysUntilProposalExpiry(validUntil: unknown, today: unknown): number | null {
  if (!isCalendarDate(validUntil) || !isCalendarDate(today)) return null;
  const toUtc = (value: string) => {
    const [year, month, day] = value.trim().split("-").map(Number);
    // Date.UTC maps years 0-99 onto 1900-1999, so "0026-08-12" — what a date
    // input produces when a seller types a two-digit year and tabs away — was
    // measured as 1926 and reported as 36,525 days out instead of 730,485.
    // setUTCFullYear takes the year literally.
    const stamp = new Date(Date.UTC(year, month - 1, day));
    stamp.setUTCFullYear(year);
    return stamp.getTime();
  };
  return Math.round((toUtc(validUntil) - toUtc(today)) / 86_400_000);
}

/** Statuses where an expiry date still governs anything. */
export const expiryRelevantStatuses = Object.freeze(["draft", "in_review", "sent"] as const);

/**
 * Days out at which the readiness checks start warning. A week is enough notice
 * to extend the date or chase the client before the price the document quotes
 * stops being one we are offering.
 */
export const expiringSoonDays = 7;
