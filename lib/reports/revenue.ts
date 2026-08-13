// Revenue and pipeline aggregation for the Reports page.
//
// Reports covered headcount, payroll, expenses, hiring and compliance — and no
// revenue at all. proposal_value is recomputed server-side on every proposal
// save and was then only ever displayed one row at a time, so the owners had no
// answer anywhere in the platform to "how much is in the pipeline, what did we
// win this quarter, what is outstanding".
//
// Pure so the arithmetic is testable without a database.

export interface RevenueProposalRow {
  id: string;
  status: string | null;
  proposal_value: number | string | null;
  accepted_at: string | null;
  declined_at: string | null;
  /** When it was last touched — used to age a proposal sitting at "sent". */
  updated_at: string | null;
}

export interface RevenueIncomeRow {
  amount: number | string | null;
  status: string | null;
  transaction_date: string | null;
}

/** Quoted but undecided. Mirrors lib/clients/related.ts. */
const OPEN_STATUSES = new Set(["draft", "in_review", "sent"]);

function amountOf(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function monthKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 7);
}

function daysBetween(from: string | null | undefined, now: Date): number | null {
  if (!from) return null;
  const parsed = new Date(from);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((now.getTime() - parsed.getTime()) / 86_400_000);
}

export interface PipelineSummary {
  openCount: number;
  openValue: number;
  /** Sent and awaiting a client decision — the subset worth chasing. */
  awaitingDecisionCount: number;
  awaitingDecisionValue: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  lostValue: number;
  /** Won ÷ decided, 0–1. Null when nothing has been decided yet. */
  winRate: number | null;
}

export function summarizePipeline(
  proposals: readonly RevenueProposalRow[] | null | undefined,
): PipelineSummary {
  const summary: PipelineSummary = {
    openCount: 0,
    openValue: 0,
    awaitingDecisionCount: 0,
    awaitingDecisionValue: 0,
    wonCount: 0,
    wonValue: 0,
    lostCount: 0,
    lostValue: 0,
    winRate: null,
  };

  for (const proposal of proposals ?? []) {
    const status = proposal.status ?? "";
    const value = amountOf(proposal.proposal_value);

    if (OPEN_STATUSES.has(status)) {
      summary.openCount += 1;
      summary.openValue += value;
      if (status === "sent") {
        summary.awaitingDecisionCount += 1;
        summary.awaitingDecisionValue += value;
      }
    } else if (status === "accepted") {
      summary.wonCount += 1;
      summary.wonValue += value;
    } else if (status === "declined") {
      summary.lostCount += 1;
      summary.lostValue += value;
    }
  }

  const decided = summary.wonCount + summary.lostCount;
  summary.winRate = decided > 0 ? summary.wonCount / decided : null;

  return summary;
}

export interface RevenueMonth {
  /** YYYY-MM. */
  month: string;
  wonValue: number;
  wonCount: number;
  lostValue: number;
  lostCount: number;
}

/**
 * Won and lost by the month the decision landed in, oldest first, limited to
 * the most recent `months` buckets that have activity.
 *
 * Bucketed on accepted_at / declined_at rather than created_at: a deal belongs
 * to the month it closed, which is the month the owners will compare against
 * their own memory of it.
 */
export function buildRevenueByMonth(
  proposals: readonly RevenueProposalRow[] | null | undefined,
  months = 6,
): RevenueMonth[] {
  const buckets = new Map<string, RevenueMonth>();

  const bucket = (key: string): RevenueMonth => {
    const existing = buckets.get(key);
    if (existing) return existing;
    const fresh: RevenueMonth = { month: key, wonValue: 0, wonCount: 0, lostValue: 0, lostCount: 0 };
    buckets.set(key, fresh);
    return fresh;
  };

  for (const proposal of proposals ?? []) {
    const value = amountOf(proposal.proposal_value);

    if (proposal.status === "accepted") {
      const key = monthKey(proposal.accepted_at);
      if (key) {
        const row = bucket(key);
        row.wonValue += value;
        row.wonCount += 1;
      }
    } else if (proposal.status === "declined") {
      const key = monthKey(proposal.declined_at);
      if (key) {
        const row = bucket(key);
        row.lostValue += value;
        row.lostCount += 1;
      }
    }
  }

  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-months);
}

export interface AgingBand {
  label: string;
  count: number;
  value: number;
}

/**
 * Sent proposals grouped by how long they have been waiting.
 *
 * The oldest band is the one that matters: a proposal sitting unanswered for
 * two months is either dead or needs a phone call, and nothing in the platform
 * used to say so.
 */
export function buildSentAging(
  proposals: readonly RevenueProposalRow[] | null | undefined,
  now: Date,
): AgingBand[] {
  const bands: AgingBand[] = [
    { label: "0-7 days", count: 0, value: 0 },
    { label: "8-30 days", count: 0, value: 0 },
    { label: "31-60 days", count: 0, value: 0 },
    { label: "60+ days", count: 0, value: 0 },
  ];

  for (const proposal of proposals ?? []) {
    if (proposal.status !== "sent") continue;
    const age = daysBetween(proposal.updated_at, now);
    const value = amountOf(proposal.proposal_value);
    // An unparseable or missing timestamp lands in the freshest band rather
    // than being dropped: the count must still equal the sent proposals.
    const index = age === null || age <= 7 ? 0 : age <= 30 ? 1 : age <= 60 ? 2 : 3;
    bands[index].count += 1;
    bands[index].value += value;
  }

  return bands;
}

export interface ReceivablesSummary {
  expectedValue: number;
  expectedCount: number;
  invoicedValue: number;
  invoicedCount: number;
  receivedValue: number;
  receivedCount: number;
  /** Expected or invoiced with a due date in the past. */
  overdueValue: number;
  overdueCount: number;
}

/**
 * The AR strip: what has been earned, billed, collected — and what is late.
 *
 * Fed by the income rows an accepted proposal now files automatically, so this
 * is only as good as that schedule; rows entered by hand count the same.
 */
export function summarizeReceivables(
  income: readonly RevenueIncomeRow[] | null | undefined,
  now: Date,
): ReceivablesSummary {
  const summary: ReceivablesSummary = {
    expectedValue: 0,
    expectedCount: 0,
    invoicedValue: 0,
    invoicedCount: 0,
    receivedValue: 0,
    receivedCount: 0,
    overdueValue: 0,
    overdueCount: 0,
  };

  const today = now.toISOString().slice(0, 10);

  for (const row of income ?? []) {
    const value = amountOf(row.amount);
    const status = row.status ?? "";

    if (status === "expected") {
      summary.expectedValue += value;
      summary.expectedCount += 1;
    } else if (status === "invoiced") {
      summary.invoicedValue += value;
      summary.invoicedCount += 1;
    } else if (status === "received") {
      summary.receivedValue += value;
      summary.receivedCount += 1;
      // Money in the bank is never overdue, whatever its date says.
      continue;
    } else {
      // 'cancelled' and anything unrecognised count toward nothing.
      continue;
    }

    const due = row.transaction_date ? row.transaction_date.slice(0, 10) : null;
    if (due && due < today) {
      summary.overdueValue += value;
      summary.overdueCount += 1;
    }
  }

  return summary;
}
