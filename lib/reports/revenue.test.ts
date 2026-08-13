import { describe, expect, it } from "vitest";
import {
  buildRevenueByMonth,
  buildSentAging,
  summarizePipeline,
  summarizeReceivables,
  type RevenueIncomeRow,
  type RevenueProposalRow,
} from "./revenue";

const NOW = new Date("2026-08-13T12:00:00.000Z");

function p(overrides: Partial<RevenueProposalRow>): RevenueProposalRow {
  return {
    id: crypto.randomUUID(),
    status: "draft",
    proposal_value: null,
    accepted_at: null,
    declined_at: null,
    updated_at: null,
    ...overrides,
  };
}

function income(overrides: Partial<RevenueIncomeRow>): RevenueIncomeRow {
  return { amount: null, status: "expected", transaction_date: null, ...overrides };
}

describe("summarizePipeline", () => {
  it("is empty for no proposals, with no win rate to report", () => {
    const summary = summarizePipeline([]);
    expect(summary.openValue).toBe(0);
    expect(summary.winRate).toBeNull();
  });

  it("separates open, awaiting-decision, won and lost", () => {
    const summary = summarizePipeline([
      p({ status: "draft", proposal_value: 1000 }),
      p({ status: "in_review", proposal_value: 2000 }),
      p({ status: "sent", proposal_value: 4000 }),
      p({ status: "accepted", proposal_value: 8000 }),
      p({ status: "declined", proposal_value: 16000 }),
      p({ status: "archived", proposal_value: 32000 }),
    ]);

    expect(summary.openCount).toBe(3);
    expect(summary.openValue).toBe(7000);
    // Only "sent" is with the client and worth chasing.
    expect(summary.awaitingDecisionCount).toBe(1);
    expect(summary.awaitingDecisionValue).toBe(4000);
    expect(summary.wonValue).toBe(8000);
    expect(summary.lostValue).toBe(16000);
    // Archived counts toward nothing.
    expect(summary.openValue + summary.wonValue + summary.lostValue).toBe(31000);
  });

  it("computes win rate over decided proposals only", () => {
    const summary = summarizePipeline([
      p({ status: "accepted", proposal_value: 1 }),
      p({ status: "accepted", proposal_value: 1 }),
      p({ status: "accepted", proposal_value: 1 }),
      p({ status: "declined", proposal_value: 1 }),
      // Ten open proposals must not drag the win rate down.
      ...Array.from({ length: 10 }, () => p({ status: "draft", proposal_value: 1 })),
    ]);

    expect(summary.winRate).toBeCloseTo(0.75);
  });

  it("ignores malformed values rather than deflating a total", () => {
    const summary = summarizePipeline([
      p({ status: "sent", proposal_value: -5000 }),
      p({ status: "sent", proposal_value: "3000" }),
      p({ status: "sent", proposal_value: "junk" }),
    ]);

    expect(summary.openCount).toBe(3);
    expect(summary.openValue).toBe(3000);
  });
});

describe("buildRevenueByMonth", () => {
  it("buckets a deal in the month it closed, oldest first", () => {
    const months = buildRevenueByMonth([
      p({ status: "accepted", proposal_value: 5000, accepted_at: "2026-07-20T00:00:00.000Z" }),
      p({ status: "accepted", proposal_value: 3000, accepted_at: "2026-06-02T00:00:00.000Z" }),
      p({ status: "declined", proposal_value: 9000, declined_at: "2026-07-28T00:00:00.000Z" }),
    ]);

    expect(months.map((m) => m.month)).toEqual(["2026-06", "2026-07"]);
    expect(months[1]).toMatchObject({ wonValue: 5000, wonCount: 1, lostValue: 9000, lostCount: 1 });
  });

  it("keeps only the most recent buckets", () => {
    const proposals = Array.from({ length: 9 }, (_, index) =>
      p({
        status: "accepted",
        proposal_value: 100,
        accepted_at: `2026-0${index + 1}-15T00:00:00.000Z`.replace("2026-010", "2026-10"),
      }),
    );

    expect(buildRevenueByMonth(proposals, 3)).toHaveLength(3);
  });

  it("skips a decision with no usable timestamp", () => {
    const months = buildRevenueByMonth([
      p({ status: "accepted", proposal_value: 5000, accepted_at: null }),
      p({ status: "accepted", proposal_value: 5000, accepted_at: "nonsense" }),
    ]);
    expect(months).toEqual([]);
  });
});

describe("buildSentAging", () => {
  it("bands sent proposals by how long they have waited", () => {
    const bands = buildSentAging(
      [
        p({ status: "sent", proposal_value: 100, updated_at: "2026-08-11T12:00:00.000Z" }),
        p({ status: "sent", proposal_value: 200, updated_at: "2026-08-01T12:00:00.000Z" }),
        p({ status: "sent", proposal_value: 400, updated_at: "2026-07-05T12:00:00.000Z" }),
        p({ status: "sent", proposal_value: 800, updated_at: "2026-05-01T12:00:00.000Z" }),
      ],
      NOW,
    );

    expect(bands.map((b) => b.count)).toEqual([1, 1, 1, 1]);
    expect(bands[3]).toMatchObject({ label: "60+ days", value: 800 });
  });

  it("counts only sent proposals", () => {
    const bands = buildSentAging(
      [
        p({ status: "draft", proposal_value: 100, updated_at: "2026-05-01T12:00:00.000Z" }),
        p({ status: "accepted", proposal_value: 100, updated_at: "2026-05-01T12:00:00.000Z" }),
      ],
      NOW,
    );
    expect(bands.reduce((total, band) => total + band.count, 0)).toBe(0);
  });

  it("keeps a proposal with no usable timestamp in the count", () => {
    // Dropping it would make the bands disagree with the pipeline total.
    const bands = buildSentAging([p({ status: "sent", proposal_value: 100, updated_at: null })], NOW);
    expect(bands.reduce((total, band) => total + band.count, 0)).toBe(1);
  });
});

describe("summarizeReceivables", () => {
  it("totals each stage of the money", () => {
    const summary = summarizeReceivables(
      [
        income({ amount: 1000, status: "expected", transaction_date: "2026-09-01" }),
        income({ amount: 2000, status: "invoiced", transaction_date: "2026-09-01" }),
        income({ amount: 4000, status: "received", transaction_date: "2026-07-01" }),
        income({ amount: 8000, status: "cancelled", transaction_date: "2026-07-01" }),
      ],
      NOW,
    );

    expect(summary).toMatchObject({
      expectedValue: 1000,
      invoicedValue: 2000,
      receivedValue: 4000,
      overdueValue: 0,
    });
  });

  it("flags expected and invoiced money whose date has passed", () => {
    const summary = summarizeReceivables(
      [
        income({ amount: 1000, status: "expected", transaction_date: "2026-08-01" }),
        income({ amount: 2000, status: "invoiced", transaction_date: "2026-07-15" }),
      ],
      NOW,
    );

    expect(summary.overdueCount).toBe(2);
    expect(summary.overdueValue).toBe(3000);
  });

  it("never counts collected money as overdue", () => {
    const summary = summarizeReceivables(
      [income({ amount: 5000, status: "received", transaction_date: "2020-01-01" })],
      NOW,
    );
    expect(summary.overdueCount).toBe(0);
  });

  it("does not treat money due today as late", () => {
    const summary = summarizeReceivables(
      [income({ amount: 100, status: "expected", transaction_date: "2026-08-13" })],
      NOW,
    );
    expect(summary.overdueCount).toBe(0);
  });
});
