import { describe, expect, it } from "vitest";
import { daysUntilProposalExpiry, isCalendarDate, isProposalExpired } from "./validity";

describe("isProposalExpired", () => {
  it("is open through the validity date itself", () => {
    expect(isProposalExpired("2026-08-30", "2026-08-30")).toBe(false);
  });

  it("expires the day after", () => {
    expect(isProposalExpired("2026-08-30", "2026-08-31")).toBe(true);
  });

  it("is open before the date", () => {
    expect(isProposalExpired("2026-12-31", "2026-08-11")).toBe(false);
  });

  it("treats an absent or malformed date as no expiry rather than as expired", () => {
    // A proposal that never claimed a deadline must not have one invented for
    // it — the client was shown no date to be held to.
    expect(isProposalExpired(null, "2026-08-11")).toBe(false);
    expect(isProposalExpired("", "2026-08-11")).toBe(false);
    expect(isProposalExpired("not-a-date", "2026-08-11")).toBe(false);
    expect(isProposalExpired(undefined, "2026-08-11")).toBe(false);
    expect(isProposalExpired("2026-08-01", "nonsense")).toBe(false);
  });

  it("compares across year and month boundaries", () => {
    expect(isProposalExpired("2025-12-31", "2026-01-01")).toBe(true);
    expect(isProposalExpired("2026-01-01", "2025-12-31")).toBe(false);
    expect(isProposalExpired("2026-02-28", "2026-03-01")).toBe(true);
  });
});

describe("daysUntilProposalExpiry", () => {
  it("counts whole calendar days, zero on the last valid day", () => {
    expect(daysUntilProposalExpiry("2026-08-11", "2026-08-11")).toBe(0);
    expect(daysUntilProposalExpiry("2026-08-18", "2026-08-11")).toBe(7);
    expect(daysUntilProposalExpiry("2026-09-10", "2026-08-11")).toBe(30);
  });

  it("goes negative once past", () => {
    expect(daysUntilProposalExpiry("2026-08-01", "2026-08-11")).toBe(-10);
  });

  it("spans months and leap days without drifting", () => {
    expect(daysUntilProposalExpiry("2026-03-01", "2026-02-28")).toBe(1);
    expect(daysUntilProposalExpiry("2024-03-01", "2024-02-28")).toBe(2); // 2024 is a leap year
    expect(daysUntilProposalExpiry("2027-01-01", "2026-12-31")).toBe(1);
  });

  it("counts across a month end and a leap day in either direction", () => {
    expect(daysUntilProposalExpiry("2026-02-01", "2026-01-31")).toBe(1);
    expect(daysUntilProposalExpiry("2026-01-31", "2026-02-01")).toBe(-1);
    // 2028-02-29 exists; 2026 has no 29th, so the same jump is a day shorter.
    expect(daysUntilProposalExpiry("2028-03-01", "2028-02-28")).toBe(2);
    expect(daysUntilProposalExpiry("2028-12-31", "2028-01-01")).toBe(365); // 366-day year
    expect(daysUntilProposalExpiry("2026-12-31", "2026-01-01")).toBe(364);
  });

  it("measures a two-digit year in the millennium it was written in", () => {
    // A date input hands back "0026-08-12" when a seller types the year as 26
    // and tabs away. Date.UTC maps 0-99 onto 1900-1999, so this used to be
    // measured as 1926 — 36,525 days out instead of 730,485.
    expect(daysUntilProposalExpiry("0026-08-12", "2026-08-12")).toBe(-730485);
    expect(daysUntilProposalExpiry("0026-08-13", "0026-08-12")).toBe(1);
    // And it is expired either way, which the string compare already knew.
    expect(isProposalExpired("0026-08-12", "2026-08-12")).toBe(true);
  });

  it("returns null when either side is missing", () => {
    expect(daysUntilProposalExpiry(null, "2026-08-11")).toBeNull();
    expect(daysUntilProposalExpiry("2026-08-11", null)).toBeNull();
    expect(daysUntilProposalExpiry("2026-08-11", "11/08/2026")).toBeNull();
  });
});

describe("isCalendarDate", () => {
  it("accepts only YYYY-MM-DD", () => {
    expect(isCalendarDate("2026-08-11")).toBe(true);
    expect(isCalendarDate("2026-8-11")).toBe(false);
    expect(isCalendarDate("11/08/2026")).toBe(false);
    expect(isCalendarDate("2026-08-11T00:00:00Z")).toBe(false);
    expect(isCalendarDate(20260811)).toBe(false);
  });
});
