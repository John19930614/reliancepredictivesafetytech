import { describe, expect, it } from "vitest";
import { buildIncomeSchedule } from "./income-schedule";
import type { ProposalLineItem, ProposalTotals } from "./pricing";
import type { ProposalTerm } from "./term";

function line(source: ProposalLineItem["source"], amount: number): ProposalLineItem {
  return { source, key: "", name: "Line", desc: "", unit: "", qty: 1, price: amount, amount } as ProposalLineItem;
}

function totals(overrides: Partial<ProposalTotals> = {}): ProposalTotals {
  return {
    lineItems: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
    deposit: 0,
    ...overrides,
  };
}

const noTerm: ProposalTerm = {
  start: null,
  end: null,
  months: null,
  rangeLabel: null,
  durationLabel: null,
  reversed: false,
};

function term(startMonth: number, startYear: number, months: number): ProposalTerm {
  return {
    start: { month: startMonth, year: startYear, label: "start" },
    end: { month: startMonth, year: startYear, label: "end" },
    months,
    rangeLabel: "range",
    durationLabel: `${months}-month`,
    reversed: false,
  };
}

const acceptedAt = "2026-08-13T15:30:00.000Z";

function sum(rows: { amount: number }[]): number {
  return Math.round(rows.reduce((total, row) => total + row.amount, 0) * 100) / 100;
}

describe("buildIncomeSchedule", () => {
  it("files nothing for a proposal with no priced total", () => {
    // An accepted proposal whose fee table was never filled in must not create
    // a $0 receivable that reads as free work.
    expect(buildIncomeSchedule({ totals: totals(), term: noTerm, acceptedAt })).toEqual([]);
    expect(buildIncomeSchedule({ totals: totals({ total: -100 }), term: noTerm, acceptedAt })).toEqual([]);
  });

  it("bills a fixed-price engagement as one row dated at acceptance", () => {
    const rows = buildIncomeSchedule({
      totals: totals({ total: 24000, lineItems: [line("phase", 24000)] }),
      term: noTerm,
      acceptedAt,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "balance", amount: 24000, dueDate: "2026-08-13" });
  });

  it("splits a deposit from the balance", () => {
    const rows = buildIncomeSchedule({
      totals: totals({ total: 24000, deposit: 6000, lineItems: [line("phase", 24000)] }),
      term: noTerm,
      acceptedAt,
    });

    expect(rows.map((r) => r.kind)).toEqual(["deposit", "balance"]);
    expect(rows[0].amount).toBe(6000);
    expect(rows[1].amount).toBe(18000);
    expect(sum(rows)).toBe(24000);
  });

  it("dates the deposit at acceptance and the balance at the term start", () => {
    const rows = buildIncomeSchedule({
      totals: totals({ total: 10000, deposit: 2500, lineItems: [line("phase", 10000)] }),
      term: term(10, 2026, 1),
      acceptedAt,
    });

    expect(rows[0].dueDate).toBe("2026-08-13");
    expect(rows[1].dueDate).toBe("2026-10-01");
  });

  it("spreads a subscription evenly across the term, month by month", () => {
    const rows = buildIncomeSchedule({
      totals: totals({ total: 12000, lineItems: [line("package", 12000)] }),
      term: term(11, 2026, 6),
      acceptedAt,
    });

    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.kind === "installment")).toBe(true);
    expect(rows.map((row) => row.dueDate)).toEqual([
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
      "2027-02-01",
      "2027-03-01",
      "2027-04-01",
    ]);
    expect(rows.every((row) => row.amount === 2000)).toBe(true);
  });

  it("keeps a deposit alongside the installments and still sums to the total", () => {
    const rows = buildIncomeSchedule({
      totals: totals({ total: 12000, deposit: 3000, lineItems: [line("package", 12000)] }),
      term: term(1, 2027, 3),
      acceptedAt,
    });

    expect(rows.map((r) => r.kind)).toEqual(["deposit", "installment", "installment", "installment"]);
    expect(sum(rows)).toBe(12000);
  });

  it("absorbs rounding in the final installment so the schedule matches the contract exactly", () => {
    // 10000 / 3 does not divide evenly; a naive split loses a cent.
    const rows = buildIncomeSchedule({
      totals: totals({ total: 10000, lineItems: [line("package", 10000)] }),
      term: term(1, 2027, 3),
      acceptedAt,
    });

    expect(sum(rows)).toBe(10000);
    expect(rows[0].amount).toBe(3333.33);
    expect(rows[2].amount).toBe(3333.34);
  });

  it("does not spread a fixed-price engagement even over a long term", () => {
    // No package line means nothing recurring was sold, whatever the term says.
    const rows = buildIncomeSchedule({
      totals: totals({ total: 30000, lineItems: [line("phase", 20000), line("service", 10000)] }),
      term: term(3, 2027, 12),
      acceptedAt,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "balance", dueDate: "2027-03-01" });
  });

  it("does not spread a single-month subscription", () => {
    const rows = buildIncomeSchedule({
      totals: totals({ total: 2000, lineItems: [line("package", 2000)] }),
      term: term(5, 2027, 1),
      acceptedAt,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("balance");
  });

  it("falls back to a single row when the seller left the term blank", () => {
    const rows = buildIncomeSchedule({
      totals: totals({ total: 9000, lineItems: [line("package", 9000)] }),
      term: noTerm,
      acceptedAt,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].dueDate).toBe("2026-08-13");
  });

  it("treats a deposit at or above the total as the whole schedule", () => {
    const rows = buildIncomeSchedule({
      totals: totals({ total: 5000, deposit: 5000, lineItems: [line("phase", 5000)] }),
      term: noTerm,
      acceptedAt,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "deposit", amount: 5000 });
  });

  it("survives an unparseable acceptance timestamp", () => {
    const rows = buildIncomeSchedule({
      totals: totals({ total: 1000, lineItems: [line("phase", 1000)] }),
      term: noTerm,
      acceptedAt: "not a date",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
