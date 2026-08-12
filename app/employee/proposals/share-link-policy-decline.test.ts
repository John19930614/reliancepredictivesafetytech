import { describe, expect, it } from "vitest";
import {
  declineReasonLabel,
  declineReasonMaxLength,
  declineReasonOptions,
  validateDeclineInput,
} from "./share-link-policy";

// The decline form is an unauthenticated public POST, so everything it sends is
// untrusted and must be normalised before it reaches decline_reason.

describe("validateDeclineInput", () => {
  it("accepts a name and a picked reason", () => {
    const result = validateDeclineInput({ name: "  Dana Reyes ", reason: "price" });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ name: "Dana Reyes", reasonValue: "price", reason: "Price / budget" });
  });

  it("appends the optional detail to the picked label", () => {
    const result = validateDeclineInput({ name: "Dana", reason: "timing", detail: "  Revisit in Q1  " });
    expect(result.value?.reason).toBe("Timing — not now — Revisit in Q1");
  });

  it("requires a name", () => {
    const result = validateDeclineInput({ name: "   ", reason: "price" });
    expect(result.ok).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  it("requires a reason from the list, rejecting free-text codes", () => {
    expect(validateDeclineInput({ name: "Dana", reason: "" }).ok).toBe(false);
    expect(validateDeclineInput({ name: "Dana", reason: "because" }).ok).toBe(false);
    expect(validateDeclineInput({ name: "Dana" }).errors.reason).toBeDefined();
  });

  it("rejects an over-long detail rather than silently truncating it", () => {
    const result = validateDeclineInput({
      name: "Dana",
      reason: "other",
      detail: "x".repeat(declineReasonMaxLength + 1),
    });
    expect(result.ok).toBe(false);
    expect(result.errors.detail).toBeDefined();
  });

  it("caps the stored sentence at the column's own limit", () => {
    const result = validateDeclineInput({
      name: "Dana",
      reason: "other",
      detail: "x".repeat(declineReasonMaxLength),
    });
    expect(result.ok).toBe(true);
    expect(result.value!.reason.length).toBeLessThanOrEqual(declineReasonMaxLength);
  });

  it("ignores non-string input instead of coercing it", () => {
    const result = validateDeclineInput({ name: 42, reason: ["price"], detail: { a: 1 } });
    expect(result.ok).toBe(false);
  });
});

describe("declineReasonOptions", () => {
  it("resolves labels, and only for known values", () => {
    expect(declineReasonLabel("competitor")).toBe("Went with another provider");
    expect(declineReasonLabel("nope")).toBeNull();
  });

  it("offers a countable, non-empty picklist", () => {
    expect(declineReasonOptions.length).toBeGreaterThan(3);
    for (const option of declineReasonOptions) {
      expect(option.value.trim()).not.toBe("");
      expect(option.label.trim()).not.toBe("");
    }
  });
});
