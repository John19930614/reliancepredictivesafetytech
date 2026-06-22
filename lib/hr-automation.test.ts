import { describe, expect, it } from "vitest";
import { normalizeStateCode, payrollSetupDueDate } from "./hr-automation";

describe("normalizeStateCode", () => {
  it("uppercases a valid 2-letter state code", () => {
    expect(normalizeStateCode("tx")).toBe("TX");
    expect(normalizeStateCode("ca")).toBe("CA");
  });

  it("accepts already-uppercase codes", () => {
    expect(normalizeStateCode("NY")).toBe("NY");
  });

  it("trims whitespace before validating", () => {
    expect(normalizeStateCode("  FL  ")).toBe("FL");
  });

  it("returns null for codes that are too short or too long", () => {
    expect(normalizeStateCode("T")).toBeNull();
    expect(normalizeStateCode("TEX")).toBeNull();
  });

  it("returns null for codes containing non-letters", () => {
    expect(normalizeStateCode("T1")).toBeNull();
    expect(normalizeStateCode("1X")).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(normalizeStateCode(null)).toBeNull();
    expect(normalizeStateCode(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeStateCode("")).toBeNull();
  });
});

describe("payrollSetupDueDate", () => {
  it("returns a YYYY-MM-DD formatted string", () => {
    const result = payrollSetupDueDate(3);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("defaults to 3 days from now", () => {
    const result = payrollSetupDueDate();
    const parsed = new Date(result);
    const diff = Math.round((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    expect(diff).toBeGreaterThanOrEqual(2);
    expect(diff).toBeLessThanOrEqual(3);
  });

  it("respects a custom days offset", () => {
    const result = payrollSetupDueDate(7);
    const parsed = new Date(result);
    const diff = Math.round((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    expect(diff).toBeGreaterThanOrEqual(6);
    expect(diff).toBeLessThanOrEqual(7);
  });
});
