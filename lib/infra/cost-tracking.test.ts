import { describe, expect, it } from "vitest";
import { summarizeCosts, formatCostCents, getCurrentPeriod, getMonthLabel } from "./cost-tracking";

const sampleEntries = [
  { service: "Vercel", category: "compute", amount_cents: 2000, period_month: "2026-06" },
  { service: "Supabase", category: "database", amount_cents: 2500, period_month: "2026-06" },
  { service: "OpenAI", category: "ai", amount_cents: 1500, period_month: "2026-06" },
  { service: "Resend", category: "email", amount_cents: 0, period_month: "2026-06" },
];

describe("summarizeCosts", () => {
  it("totals all costs correctly", () => {
    const result = summarizeCosts(sampleEntries);
    expect(result.totalCents).toBe(6000);
  });

  it("groups by category", () => {
    const result = summarizeCosts(sampleEntries);
    expect(result.byCategory["compute"]).toBe(2000);
    expect(result.byCategory["database"]).toBe(2500);
    expect(result.byCategory["ai"]).toBe(1500);
    expect(result.byCategory["email"]).toBe(0);
  });

  it("groups by service", () => {
    const result = summarizeCosts(sampleEntries);
    expect(result.byService["Vercel"]).toBe(2000);
    expect(result.byService["Supabase"]).toBe(2500);
  });

  it("returns empty summary for no entries", () => {
    const result = summarizeCosts([]);
    expect(result.totalCents).toBe(0);
    expect(result.period).toBe("");
  });
});

describe("formatCostCents", () => {
  it("formats zero as $0.00", () => {
    expect(formatCostCents(0)).toBe("$0.00");
  });

  it("formats cents to dollars", () => {
    expect(formatCostCents(2500)).toBe("$25.00");
    expect(formatCostCents(199900)).toBe("$1999.00");
  });
});

describe("getCurrentPeriod", () => {
  it("returns a YYYY-MM format string", () => {
    const period = getCurrentPeriod();
    expect(period).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("getMonthLabel", () => {
  it("formats period to readable label", () => {
    expect(getMonthLabel("2026-06")).toBe("June 2026");
  });
});
