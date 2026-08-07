// EHS Talent Engine money math — pure functions, no DOM, no I/O, no module
// state, and nothing imported from server code. Safe to call from a Server
// Action, a Server Component, or the client console.
//
// The whole model is one subtraction:
//
//     spread = bill_rate − pay_rate
//
// We bill the client `bill_rate`, pay the professional `pay_rate`, and keep the
// spread. Markup, gross margin, weekly margin, the run rate and the floor check
// are all derived from that. Nothing here reads the database: the caller passes
// the rates and the floor in, so every number the console shows can be
// recomputed and unit-tested without a connection.
//
// Every value that reaches these functions is untrusted — it arrives from a
// form post, a JSON column, or an AI proposal — so each one is coerced before
// it is used. No function in this file can return NaN or Infinity.

import {
  defaultHoursPerWeek,
  maxHourlyRate,
  maxWeeklyHours,
  minHourlyRate,
  type LedgerRow,
  type TalentConsoleSummary,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Coercion + rounding                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Number coercion that can never yield NaN or Infinity. Accepts the numeric
 * strings that `numeric` columns and form posts hand back.
 */
function toFinite(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * Rounds to whole cents — the ONE rounding helper in this module. Every
 * exported function returns through it, so a caller can never be handed
 * `24.900000000000002` (which is literally what `95 - 70.1` evaluates to in
 * IEEE-754 doubles).
 *
 * Two deliberate details:
 *   * `toPrecision(12)` collapses the float noise BEFORE rounding. Without it,
 *     `24.900000000000002 * 100` is `2490.0000000000005`, and `1.005 * 100` is
 *     `100.49999999999999` — which would silently round 1.005 down to 1.00.
 *   * Negative values round half away from zero, matching the positive case, so
 *     a negative spread (bill under pay — a loss) is not quietly shrunk.
 */
export function roundMoney(value: unknown): number {
  const n = toFinite(value);
  if (n === 0) return 0;
  const scaled = Number((n * 100).toPrecision(12));
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  // `-0` is a valid double but reads badly in a UI and fails `toBe(0)`.
  return rounded === 0 ? 0 : rounded / 100;
}

/* -------------------------------------------------------------------------- */
/* Per-match money                                                            */
/* -------------------------------------------------------------------------- */

/** bill − pay. May be negative: that is a match we would lose money on. */
export function computeSpread(billRate: number, payRate: number): number {
  return roundMoney(toFinite(billRate) - toFinite(payRate));
}

/**
 * Markup as the staffing industry states it: spread as a percentage of what we
 * PAY. A $95 bill on a $70 pay is a 35.71% markup.
 *
 * Returns 0 — not Infinity — when the pay rate is 0. An unpaid placement has no
 * meaningful markup, and `Infinity` would poison every average downstream of it.
 */
export function computeMarkupPct(billRate: number, payRate: number): number {
  const pay = toFinite(payRate);
  if (pay === 0) return 0;
  return roundMoney((computeSpread(billRate, payRate) / pay) * 100);
}

/**
 * Gross margin: spread as a percentage of what we BILL. Same $95/$70 match is a
 * 26.32% gross margin. Returns 0 when the bill rate is 0, for the same reason
 * computeMarkupPct() returns 0 on a zero pay rate.
 */
export function computeGrossMarginPct(billRate: number, payRate: number): number {
  const bill = toFinite(billRate);
  if (bill === 0) return 0;
  return roundMoney((computeSpread(billRate, payRate) / bill) * 100);
}

/** What the spread is worth over a week of hours. */
export function computeWeeklyMargin(spread: number, hours: number): number {
  return roundMoney(toFinite(spread) * toFinite(hours));
}

/**
 * The floor check. `floor` is talent_settings.min_spread_per_hour, or the job
 * order's `min_spread` override. Compared on the ROUNDED spread so the check
 * agrees with the number displayed next to it — a match showing exactly $20.00
 * against a $20 floor must pass.
 */
export function meetsSpreadFloor(billRate: number, payRate: number, floor: number): boolean {
  return computeSpread(billRate, payRate) >= roundMoney(floor);
}

/**
 * The pay rate that exactly restores the floor at the current bill rate — i.e.
 * the counter-offer the Margin Agent drafts into `proposed_pay_rate` when a
 * candidate's expectation puts the match underwater.
 *
 * Clamped at 0: a floor wider than the bill rate cannot be met by paying a
 * negative wage, and the caller should be raising the bill rate instead.
 */
export function counterPayRate(billRate: number, floor: number): number {
  const counter = toFinite(billRate) - toFinite(floor);
  return counter <= 0 ? 0 : roundMoney(counter);
}

export interface MatchMoney {
  spread: number;
  markupPct: number;
  grossMarginPct: number;
  weeklyMargin: number;
  floorOk: boolean;
}

/**
 * Everything the match queue needs about one row's economics, computed once so
 * the card, the approval payload and the `talent_matches` write cannot disagree.
 */
export function computeMatchMoney(
  billRate: number,
  payRate: number,
  floor: number,
  hours: number = defaultHoursPerWeek,
): MatchMoney {
  const spread = computeSpread(billRate, payRate);
  return {
    spread,
    markupPct: computeMarkupPct(billRate, payRate),
    grossMarginPct: computeGrossMarginPct(billRate, payRate),
    weeklyMargin: computeWeeklyMargin(spread, hours),
    floorOk: meetsSpreadFloor(billRate, payRate, floor),
  };
}

/* -------------------------------------------------------------------------- */
/* Ledger rollup                                                              */
/* -------------------------------------------------------------------------- */

export interface LedgerTotals {
  totalHours: number;
  totalBilled: number;
  totalPaid: number;
  totalMargin: number;
  avgSpread: number;
}

/**
 * Rolls the placement ledger up into one week's numbers.
 *
 * `avgSpread` is hours-weighted (total margin ÷ total hours), not the mean of
 * the per-row spreads. A 40-hour placement at a $25 spread and a 4-hour one at
 * $5 blends to $23.18/hr, not $15 — the unweighted mean would flatter or
 * damage the book depending on how many short placements are on it.
 *
 * Non-object rows are skipped rather than throwing: the ledger is assembled
 * from a join, and one malformed row must not blank the KPI strip.
 */
export function summariseLedger(rows: LedgerRow[]): LedgerTotals {
  const list = Array.isArray(rows) ? rows : [];

  let totalHours = 0;
  let totalBilled = 0;
  let totalPaid = 0;

  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const hours = toFinite(row.hours);
    if (hours <= 0) continue;
    totalHours += hours;
    totalBilled += toFinite(row.bill_rate) * hours;
    totalPaid += toFinite(row.pay_rate) * hours;
  }

  const billed = roundMoney(totalBilled);
  const paid = roundMoney(totalPaid);
  const margin = roundMoney(billed - paid);
  const hours = roundMoney(totalHours);

  return {
    totalHours: hours,
    totalBilled: billed,
    totalPaid: paid,
    totalMargin: margin,
    avgSpread: hours === 0 ? 0 : roundMoney(margin / hours),
  };
}

/* -------------------------------------------------------------------------- */
/* Console summary                                                            */
/* -------------------------------------------------------------------------- */

export interface ConsoleSummaryInput {
  /** One row per active placement for the week being summarised. */
  ledger?: LedgerRow[];
  /** Count of `talent_placements` rows in status 'active'. */
  activePlacements?: number;
  /** Count of `talent_matches` rows awaiting a human decision. */
  pendingApprovals?: number;
}

/**
 * Builds the KPI strip and right rail in one pass.
 *
 * revenueRunRate = clientBillings × 52.
 *
 * That choice is deliberate and worth stating, because two other readings were
 * available. It annualises the CURRENT week's client billings — the top-line
 * revenue that carries this week's gross margin — on the assumption the book as
 * it stands today runs for a year. It is NOT the annualised margin (that would
 * be weeklyGrossMargin × 52, a much smaller number that a reader would mistake
 * for revenue), and it is NOT a forecast: nothing here models placements
 * ending, starting, or repricing. Only hours that were actually billed
 * contribute, so an empty ledger yields a run rate of 0 rather than a
 * projection built on intent.
 */
export function buildConsoleSummary(input: ConsoleSummaryInput = {}): TalentConsoleSummary {
  const totals = summariseLedger(Array.isArray(input.ledger) ? input.ledger : []);

  const activePlacements = Math.max(0, Math.floor(toFinite(input.activePlacements)));
  const pendingApprovals = Math.max(0, Math.floor(toFinite(input.pendingApprovals)));

  return {
    activePlacements,
    billableHours: totals.totalHours,
    avgSpreadPerHour: totals.avgSpread,
    weeklyGrossMargin: totals.totalMargin,
    revenueRunRate: roundMoney(totals.totalBilled * 52),
    pendingApprovals,
    clientBillings: totals.totalBilled,
    workerPay: totals.totalPaid,
    grossMarginPct: totals.totalBilled === 0 ? 0 : roundMoney((totals.totalMargin / totals.totalBilled) * 100),
    avgMarkupPct: totals.totalPaid === 0 ? 0 : roundMoney((totals.totalMargin / totals.totalPaid) * 100),
  };
}

/* -------------------------------------------------------------------------- */
/* Input validation                                                           */
/* -------------------------------------------------------------------------- */

export interface RateValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Bounds a typed hourly rate before it reaches a numeric(10,2) column.
 *
 * Server Actions are public POST endpoints: whatever the browser can send, a
 * script can send with an arbitrary payload. Checking here means the caller
 * gets a clean sentence instead of a raw Postgres numeric-overflow message —
 * and, more importantly, means a NaN can never be written into a rate that the
 * spread and the floor check are computed from.
 */
export function validateRateInput(value: unknown): RateValidation {
  if (value === null || value === undefined || value === "") {
    return { ok: false, reason: "Enter an hourly rate." };
  }
  if (typeof value !== "number" && typeof value !== "string") {
    return { ok: false, reason: "Enter the rate as a number." };
  }
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(parsed)) {
    return { ok: false, reason: "Enter the rate as a number." };
  }
  if (parsed < minHourlyRate) {
    return { ok: false, reason: "An hourly rate cannot be negative." };
  }
  if (parsed > maxHourlyRate) {
    return { ok: false, reason: `An hourly rate cannot exceed $${maxHourlyRate}.` };
  }
  return { ok: true };
}

/** Bounds a weekly hours entry against the `hours <= 168` column check. */
export function validateHoursInput(value: unknown): RateValidation {
  if (value === null || value === undefined || value === "") {
    return { ok: false, reason: "Enter the hours worked." };
  }
  if (typeof value !== "number" && typeof value !== "string") {
    return { ok: false, reason: "Enter the hours as a number." };
  }
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(parsed)) {
    return { ok: false, reason: "Enter the hours as a number." };
  }
  if (parsed < 0) return { ok: false, reason: "Hours cannot be negative." };
  if (parsed > maxWeeklyHours) {
    return { ok: false, reason: `A week cannot hold more than ${maxWeeklyHours} hours.` };
  }
  return { ok: true };
}
