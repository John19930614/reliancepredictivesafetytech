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

  it("returns null when either side is missing", () => {
    expect(daysUntilProposalExpiry(null, "2026-08-11")).toBeNull();
    expect(daysUntilProposalExpiry("2026-08-11", null)).toBeNull();
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
