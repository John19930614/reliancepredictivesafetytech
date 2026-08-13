// Turns an accepted proposal's fee table into the money the company expects to
// receive, and when.
//
// Until now acceptance ended at a filed PDF: the pipeline stage never moved and
// Finance Center never heard about the deal. Getting paid depended on someone
// remembering to hand-type income rows that mirror payment terms the platform
// itself generated — deposit percentage, engagement term, monthly subscription.
// A forgotten deposit invoice is revenue leakage with no system backstop.
//
// Pure and side-effect free so the schedule can be tested without a database.
// The writer lives in acceptance-income.ts.

import type { ProposalTotals } from "./pricing";
import type { ProposalTerm } from "./term";

export interface ScheduledIncomeRow {
  title: string;
  amount: number;
  /** YYYY-MM-DD. */
  dueDate: string;
  /** What this row represents, for the ledger and for tests. */
  kind: "deposit" | "installment" | "balance";
}

export interface IncomeScheduleInput {
  totals: ProposalTotals;
  term: ProposalTerm;
  /** ISO timestamp of the acceptance; the deposit is due then. */
  acceptedAt: string;
}

/** Cents, to keep a schedule from drifting a penny off the accepted total. */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

function isoDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

/** First of the given month, which is when a commercial term starts. */
function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const zeroBased = month - 1 + offset;
  return { year: year + Math.floor(zeroBased / 12), month: (((zeroBased % 12) + 12) % 12) + 1 };
}

/**
 * Derives the expected-income rows for an accepted proposal.
 *
 * The shape, in order:
 *
 *   1. A deposit row dated at the acceptance, when the fee table carries one.
 *   2. The remainder. A subscription sold over a multi-month term (a package
 *      line plus a term of two months or more) is spread evenly across the
 *      term's months, starting at the term's first month. Anything else — a
 *      fixed-price engagement, a single month, or a term the seller never
 *      filled in — is one balance row at the term start, falling back to the
 *      acceptance date.
 *
 * Everything is computed in cents and the final installment absorbs the
 * rounding, so the rows always sum to exactly the accepted total. A schedule
 * that is a penny off the contract is a schedule someone has to reconcile by
 * hand, which defeats the point of generating it.
 *
 * Returns an empty schedule for a proposal with no priced total: an accepted
 * proposal whose fee table was never filled in should file no receivable at
 * all rather than a row for zero dollars that looks like free work.
 */
export function buildIncomeSchedule(input: IncomeScheduleInput): ScheduledIncomeRow[] {
  const totalCents = toCents(input.totals?.total ?? 0);
  if (!Number.isFinite(totalCents) || totalCents <= 0) return [];

  const acceptedDate = isoDate(input.acceptedAt);
  const rows: ScheduledIncomeRow[] = [];

  const depositCents = Math.min(Math.max(toCents(input.totals?.deposit ?? 0), 0), totalCents);
  if (depositCents > 0) {
    rows.push({
      title: "Deposit due on acceptance",
      amount: fromCents(depositCents),
      dueDate: acceptedDate,
      kind: "deposit",
    });
  }

  const remainderCents = totalCents - depositCents;
  if (remainderCents <= 0) return rows;

  const start = input.term?.start ?? null;
  const months = input.term?.months ?? null;
  const hasSubscription = (input.totals?.lineItems ?? []).some((item) => item.source === "package");
  const startDate = start ? monthStart(start.year, start.month) : acceptedDate;

  // A recurring engagement: even monthly installments across the term.
  if (hasSubscription && start && typeof months === "number" && months >= 2) {
    const per = Math.floor(remainderCents / months);
    let allocated = 0;

    for (let index = 0; index < months; index += 1) {
      // The last installment takes the remainder so the rows sum exactly.
      const cents = index === months - 1 ? remainderCents - allocated : per;
      allocated += cents;
      if (cents <= 0) continue;

      const { year, month } = addMonths(start.year, start.month, index);
      rows.push({
        title: `Month ${index + 1} of ${months}`,
        amount: fromCents(cents),
        dueDate: monthStart(year, month),
        kind: "installment",
      });
    }

    return rows;
  }

  rows.push({
    title: depositCents > 0 ? "Balance due" : "Engagement fee",
    amount: fromCents(remainderCents),
    dueDate: startDate,
    kind: "balance",
  });

  return rows;
}
