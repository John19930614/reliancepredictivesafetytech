// The engagement term — when the pilot or subscription starts and ends.
//
// Before this module the term existed only as prose: the package was NAMED
// "… (6-Month)", its description said "a 6-month pilot", and the document
// headline said "6-Month Pilot & Platform Access Proposal". All three were
// frozen strings with no input behind them, so a seller quoting a 3-month or a
// 12-month engagement had no way to correct the document.
//
// The term is now four fields — start month/year and end month/year — chosen
// from dropdowns, and every duration the document prints is derived from them.
// Month/year selects rather than a date picker on purpose: a commercial term
// starts on the 1st and ends on the last day of a month, and asking for exact
// calendar days invites a mismatch between the two dates the seller types.

/** Field ids the generator's four term selects write into `state.fields`. */
export const termFieldIds = Object.freeze({
  startMonth: "termStartMonth",
  startYear: "termStartYear",
  endMonth: "termEndMonth",
  endYear: "termEndYear",
} as const);

export const monthNames = Object.freeze([
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const);

export interface MonthOption {
  /** 1-12, stored as a string because every generator field value is scalar. */
  value: string;
  label: string;
}

export const monthOptions: readonly MonthOption[] = Object.freeze(
  monthNames.map((label, index) => ({ value: String(index + 1), label })),
);

/**
 * Selectable years, as a window around `anchorYear`.
 *
 * One year back so a term that already started can still be recorded, and five
 * forward to cover a multi-year agreement quoted in advance. The anchor is
 * passed in rather than read from the clock: this module is imported by the
 * server-rendered document, and a Date.now() here would make the option list
 * differ between the server render and the client hydration.
 */
export function buildYearOptions(anchorYear: number, back = 1, forward = 5): string[] {
  const years: string[] = [];
  for (let year = anchorYear - back; year <= anchorYear + forward; year += 1) {
    years.push(String(year));
  }
  return years;
}

export interface TermEndpoint {
  /** 1-12. */
  month: number;
  year: number;
  /** "March 2027". */
  label: string;
}

export interface ProposalTerm {
  start: TermEndpoint | null;
  end: TermEndpoint | null;
  /**
   * Inclusive month count: March 2026 through August 2026 is 6, not 5 — a
   * "6-month pilot" starting in March runs through the end of August.
   * Null unless BOTH endpoints parsed and the end is not before the start.
   */
  months: number | null;
  /** "March 2026 – August 2026", or null when an endpoint is missing. */
  rangeLabel: string | null;
  /** "6-month", or null when the duration is unknown. Lowercase, for prose. */
  durationLabel: string | null;
  /** True when both endpoints parsed but the end lands before the start. */
  reversed: boolean;
}

function readNumber(fields: Record<string, unknown>, id: string): number | null {
  const raw = fields[id];
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function readEndpoint(
  fields: Record<string, unknown>,
  monthId: string,
  yearId: string,
): TermEndpoint | null {
  const month = readNumber(fields, monthId);
  const year = readNumber(fields, yearId);
  if (month === null || year === null) return null;
  if (month < 1 || month > 12) return null;
  // A four-digit year keeps a typo ("226") from printing on a client document.
  if (year < 1000 || year > 9999) return null;
  return { month, year, label: `${monthNames[month - 1]} ${year}` };
}

/**
 * Derives the term from a generator state's fields.
 *
 * Every member degrades to null independently, so a half-filled term still
 * renders the half that is known rather than blanking the whole block. A
 * reversed range (end before start) yields `months: null` and `reversed: true`
 * — the document then prints the two dates without claiming a duration, which
 * is the honest output for a range that cannot be measured.
 */
export function parseProposalTerm(fields: Record<string, unknown> | null | undefined): ProposalTerm {
  const source = fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
  const start = readEndpoint(source, termFieldIds.startMonth, termFieldIds.startYear);
  const end = readEndpoint(source, termFieldIds.endMonth, termFieldIds.endYear);

  let months: number | null = null;
  let reversed = false;
  if (start && end) {
    const span = (end.year - start.year) * 12 + (end.month - start.month) + 1;
    if (span >= 1) months = span;
    else reversed = true;
  }

  return {
    start,
    end,
    months,
    rangeLabel: start && end ? `${start.label} – ${end.label}` : null,
    durationLabel: months === null ? null : `${months}-month`,
    reversed,
  };
}
