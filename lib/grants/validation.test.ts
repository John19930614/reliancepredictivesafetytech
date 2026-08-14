import { describe, expect, it } from "vitest";
import { checkGrantInput, checkGrantStatusChange, isRealDate, minOutcomeReasonLength } from "./validation";

const GOOD_REASON = "Programme requires Canadian revenue, which we do not have.";

describe("isRealDate", () => {
  it("accepts a real ISO date", () => {
    expect(isRealDate("2026-09-15")).toBe(true);
  });

  it("rejects a date that matches the shape but does not exist", () => {
    // The shape regex alone would let this reach a `date` column.
    expect(isRealDate("2026-13-45")).toBe(false);
    expect(isRealDate("2026-02-30")).toBe(false);
    expect(isRealDate("15/09/2026")).toBe(false);
    expect(isRealDate("")).toBe(false);
  });
});

describe("checkGrantInput", () => {
  it("accepts a minimal grant and trims it", () => {
    const result = checkGrantInput({ name: "  SBIR  " });
    expect(result.ok).toBe(true);
    expect(result.value?.name).toBe("SBIR");
    expect(result.value?.status).toBe("identified");
    expect(result.value?.agency).toBeNull();
    expect(result.value?.fee_paid).toBe(false);
  });

  it("accepts a fully populated grant", () => {
    const result = checkGrantInput({
      name: "Freed Fellowship Grant",
      agency: "Freed",
      status: "researching",
      feeAmount: "19",
      feeKind: "application",
      awardAmount: 500,
      websiteUrl: "https://example.com/freed",
      opensOn: "2026-09-15",
      deadline: "2026-10-15",
    });
    expect(result.ok).toBe(true);
    expect(result.value?.fee_amount).toBe(19);
    expect(result.value?.fee_kind).toBe("application");
    expect(result.value?.award_amount).toBe(500);
  });

  it("requires a name", () => {
    expect(checkGrantInput({ name: "" }).fieldErrors?.name).toBe("Program name is required.");
    expect(checkGrantInput({ name: "   " }).fieldErrors?.name).toBe("Program name is required.");
  });

  it("rejects a name over 200 characters", () => {
    const result = checkGrantInput({ name: "x".repeat(201) });
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.name).toContain("200");
  });

  it("refuses to create a grant directly in a terminal status", () => {
    // Outcomes go through changeGrantStatus so the transition is audited; the
    // RLS insert policy enforces the same rule.
    for (const status of ["awarded", "declined", "not_eligible"]) {
      const result = checkGrantInput({ name: "Zensurance", status });
      expect(result.ok, status).toBe(false);
      expect(result.fieldErrors?.status, status).toContain("Record an outcome");
    }
  });

  it("rejects an unknown status", () => {
    expect(checkGrantInput({ name: "X", status: "We do not qualify" }).fieldErrors?.status).toBe(
      "Choose a valid status.",
    );
  });

  it("rejects a non-numeric or negative fee", () => {
    expect(checkGrantInput({ name: "X", feeAmount: "free" }).fieldErrors?.feeAmount).toBe("Fee must be a number.");
    expect(checkGrantInput({ name: "X", feeAmount: -5 }).fieldErrors?.feeAmount).toBe("Fee cannot be negative.");
  });

  it("will not label or pay a fee that has no amount", () => {
    // Both mirror CHECK constraints, so the user sees a sentence not a 23514.
    expect(checkGrantInput({ name: "X", feeKind: "membership" }).fieldErrors?.feeKind).toContain("fee amount");
    expect(checkGrantInput({ name: "X", feePaid: true }).fieldErrors?.feePaid).toContain("fee amount");
  });

  it("accepts fee_paid once an amount is present", () => {
    const result = checkGrantInput({ name: "Outta Excuses", feeAmount: 15, feeKind: "application", feePaid: "on" });
    expect(result.ok).toBe(true);
    expect(result.value?.fee_paid).toBe(true);
  });

  it("rejects a website with no scheme", () => {
    // Source row 10 is exactly this: "linkedin.com/pulse/20000-veteran-...".
    const result = checkGrantInput({ name: "X", websiteUrl: "linkedin.com/pulse/20000-veteran" });
    expect(result.fieldErrors?.websiteUrl).toBe("Website must start with http:// or https://.");
  });

  it("rejects an impossible date and an inverted window", () => {
    expect(checkGrantInput({ name: "X", opensOn: "2026-13-45" }).fieldErrors?.opensOn).toBe(
      "Choose a valid opening date.",
    );
    expect(checkGrantInput({ name: "X", opensOn: "2026-10-15", deadline: "2026-09-15" }).fieldErrors?.deadline).toContain(
      "cannot fall before",
    );
  });

  it("rejects a malformed owner id", () => {
    expect(checkGrantInput({ name: "X", ownerUserId: "steve" }).fieldErrors?.ownerUserId).toBe("Choose a valid owner.");
  });
});

describe("checkGrantStatusChange", () => {
  it("accepts a pipeline move", () => {
    const result = checkGrantStatusChange("researching", { status: "application_submitted" });
    expect(result.ok).toBe(true);
    expect(result.value?.status).toBe("application_submitted");
    expect(result.value?.outcome_reason).toBeNull();
  });

  it("accepts a terminal move with a reason", () => {
    const result = checkGrantStatusChange("researching", { status: "not_eligible", outcomeReason: GOOD_REASON });
    expect(result.ok).toBe(true);
    expect(result.value?.outcome_reason).toBe(GOOD_REASON);
  });

  it("rejects a no-op transition", () => {
    // An audit trail full of "submitted to submitted" is worse than none.
    const result = checkGrantStatusChange("application_submitted", { status: "application_submitted" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("That grant is already in this status.");
  });

  it("rejects an unknown target status", () => {
    expect(checkGrantStatusChange("identified", { status: "maybe" }).error).toBe("Choose a valid status.");
  });

  it("requires a substantial reason to close a grant", () => {
    expect(checkGrantStatusChange("identified", { status: "declined" }).fieldErrors?.outcomeReason).toContain(
      "Say why",
    );
    const short = checkGrantStatusChange("identified", { status: "declined", outcomeReason: "no" });
    expect(short.ok).toBe(false);
    expect(short.fieldErrors?.outcomeReason).toContain(String(minOutcomeReasonLength));
  });

  it("requires an award value when marking a grant awarded", () => {
    expect(
      checkGrantStatusChange("application_submitted", { status: "awarded", outcomeReason: GOOD_REASON })
        .fieldErrors?.awardAmount,
    ).toBe("Record what the award is worth.");
    expect(
      checkGrantStatusChange("application_submitted", {
        status: "awarded",
        outcomeReason: GOOD_REASON,
        awardAmount: 0,
      }).fieldErrors?.awardAmount,
    ).toBe("Record what the award is worth.");

    const ok = checkGrantStatusChange("application_submitted", {
      status: "awarded",
      outcomeReason: GOOD_REASON,
      awardAmount: 20000,
    });
    expect(ok.ok).toBe(true);
    expect(ok.value?.award_amount).toBe(20000);
  });

  it("clears the outcome reason when a decided grant re-enters the pipeline", () => {
    const result = checkGrantStatusChange("not_eligible", { status: "researching", outcomeReason: GOOD_REASON });
    expect(result.ok).toBe(true);
    // A reopened row must stop claiming it was disqualified.
    expect(result.value?.outcome_reason).toBeNull();
  });
});
