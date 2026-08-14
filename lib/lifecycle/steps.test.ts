import { describe, expect, it } from "vitest";
import {
  finalStepKey,
  firstStepKey,
  isLifecycleStepKey,
  lifecycleStep,
  lifecycleStepCount,
  lifecycleStepKeys,
  lifecycleSteps,
  nextStepKey,
  previousStepKey,
  stepDistance,
  stepIndex,
  stepNumber,
  stepPosition,
  stepStatus,
} from "./steps";

describe("the eleven steps", () => {
  // Step keys are STORED values in opportunities.step, and the database CHECK
  // constraint lists the same eleven. Renaming a key here without a migration
  // strands every row carrying it.
  it("keeps the keys and their order", () => {
    expect([...lifecycleStepKeys]).toEqual([
      "lead_captured",
      "ai_triage",
      "sales_review",
      "assign_owner",
      "discovery",
      "opportunity_qualified",
      "solution_proposal",
      "proposal_review",
      "negotiation_approval",
      "commit_contract",
      "closed_won_onboarded",
    ]);
  });

  it("is eleven steps long", () => {
    expect(lifecycleStepCount).toBe(11);
    expect(lifecycleSteps).toHaveLength(11);
  });

  it("numbers them 1..11 in order", () => {
    expect(lifecycleSteps.map((step) => step.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("starts at Lead Captured and ends at Closed Won & Onboarded", () => {
    expect(firstStepKey).toBe("lead_captured");
    expect(finalStepKey).toBe("closed_won_onboarded");
    expect(nextStepKey(finalStepKey)).toBeNull();
  });

  it("gives every step a label, status, summary and four activities", () => {
    for (const step of lifecycleSteps) {
      expect(step.label.length, `${step.key} label`).toBeGreaterThan(0);
      expect(step.status.length, `${step.key} status`).toBeGreaterThan(0);
      expect(step.summary.length, `${step.key} summary`).toBeGreaterThan(0);
      expect(step.activities.length, `${step.key} activities`).toBeGreaterThan(0);
    }
  });

  it("gives an advance label to every step that has somewhere to go", () => {
    for (const step of lifecycleSteps) {
      if (nextStepKey(step.key)) {
        expect(step.advanceLabel, `${step.key} should offer an advance label`).not.toBe("");
      } else {
        expect(step.advanceLabel, "the final step advances nowhere").toBe("");
      }
    }
  });

  it("carries the status words from the lifecycle map", () => {
    expect(stepStatus("lead_captured")).toBe("New Lead");
    expect(stepStatus("ai_triage")).toBe("Triaged");
    expect(stepStatus("closed_won_onboarded")).toBe("Active Client");
    expect(stepStatus("not_a_step")).toBeNull();
  });
});

describe("lookups", () => {
  it("recognises the eleven keys and nothing else", () => {
    for (const key of lifecycleStepKeys) {
      expect(isLifecycleStepKey(key), key).toBe(true);
    }
    for (const value of ["", "Lead Captured", "LEAD_CAPTURED", "lead captured", null, undefined]) {
      expect(isLifecycleStepKey(value), String(value)).toBe(false);
    }
  });

  // A hand-edited row must render as off-lifecycle, not take the page down.
  it("returns null for an unknown key rather than throwing", () => {
    expect(lifecycleStep("nonsense")).toBeNull();
    expect(lifecycleStep(null)).toBeNull();
    expect(stepIndex("nonsense")).toBe(-1);
    expect(stepNumber("nonsense")).toBeNull();
  });

  it("numbers steps 1-based for display", () => {
    expect(stepNumber("lead_captured")).toBe(1);
    expect(stepNumber("assign_owner")).toBe(4);
    expect(stepNumber("closed_won_onboarded")).toBe(11);
  });
});

describe("walking the lifecycle", () => {
  it("moves forward one step at a time", () => {
    expect(nextStepKey("lead_captured")).toBe("ai_triage");
    expect(nextStepKey("ai_triage")).toBe("sales_review");
    expect(nextStepKey("commit_contract")).toBe("closed_won_onboarded");
  });

  it("moves back and stops at the start", () => {
    expect(previousStepKey("ai_triage")).toBe("lead_captured");
    expect(previousStepKey("lead_captured")).toBeNull();
  });

  it("returns null in both directions for an unknown key", () => {
    expect(nextStepKey("nonsense")).toBeNull();
    expect(previousStepKey("nonsense")).toBeNull();
  });
});

describe("stepPosition", () => {
  it("marks earlier steps done, the current one current, later ones future", () => {
    expect(stepPosition("lead_captured", "discovery")).toBe("done");
    expect(stepPosition("discovery", "discovery")).toBe("current");
    expect(stepPosition("commit_contract", "discovery")).toBe("future");
  });

  it("draws the whole rail as future when the current key is unknown", () => {
    for (const key of lifecycleStepKeys) {
      expect(stepPosition(key, "nonsense"), key).toBe("future");
    }
  });
});

describe("stepDistance", () => {
  it("is positive forwards and negative backwards", () => {
    expect(stepDistance("lead_captured", "sales_review")).toBe(2);
    expect(stepDistance("sales_review", "lead_captured")).toBe(-2);
    expect(stepDistance("discovery", "discovery")).toBe(0);
  });

  it("spans the whole lifecycle", () => {
    expect(stepDistance("lead_captured", "closed_won_onboarded")).toBe(10);
  });

  // Zero means "not a real move", which is what a caller should treat an
  // unknown key as rather than guessing a direction.
  it("is zero when either key is unknown", () => {
    expect(stepDistance("nonsense", "discovery")).toBe(0);
    expect(stepDistance("discovery", "nonsense")).toBe(0);
    expect(stepDistance(null, undefined)).toBe(0);
  });
});
