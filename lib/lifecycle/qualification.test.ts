import { describe, expect, it } from "vitest";
import {
  bantTests,
  checkQualificationInput,
  discoveryItems,
  discoveryProgress,
  qualificationState,
  suggestedProbability,
  type QualificationRow,
} from "./qualification";

function row(over: Partial<QualificationRow> = {}): QualificationRow {
  return {
    opportunity_id: "11111111-1111-4111-8111-111111111111",
    discovery_call_at: null,
    primary_need: null,
    pain_points: null,
    decision_makers: null,
    budget_range: null,
    timeline: null,
    has_budget: false,
    has_authority: false,
    has_need: false,
    has_timeline: false,
    competition: null,
    qualified_at: null,
    qualified_by: null,
    updated_at: "2026-08-14T09:00:00Z",
    ...over,
  };
}

describe("BANT", () => {
  it("is the four tests the lifecycle map names at step 6", () => {
    expect(bantTests.map((test) => test.label)).toEqual(["Budget", "Authority", "Need", "Timeline"]);
  });

  it("gives every test a question worth going and answering", () => {
    for (const test of bantTests) {
      expect(test.question.length, test.label).toBeGreaterThan(10);
    }
  });
});

describe("qualificationState", () => {
  it("counts nothing established when there is no record at all", () => {
    const state = qualificationState(null);
    expect(state.met).toBe(0);
    expect(state.outstanding).toHaveLength(4);
    expect(state.complete).toBe(false);
    expect(state.qualified).toBe(false);
  });

  it("counts only the boxes actually ticked", () => {
    const state = qualificationState(row({ has_budget: true, has_need: true }));
    expect(state.met).toBe(2);
    expect(state.outstanding.map((test) => test.key)).toEqual(["has_authority", "has_timeline"]);
    expect(state.complete).toBe(false);
  });

  it("is complete only when all four are met", () => {
    const state = qualificationState(
      row({ has_budget: true, has_authority: true, has_need: true, has_timeline: true }),
    );
    expect(state.met).toBe(4);
    expect(state.outstanding).toHaveLength(0);
    expect(state.complete).toBe(true);
  });

  it("reports qualified only once a person has recorded the decision", () => {
    expect(qualificationState(row({ has_budget: true })).qualified).toBe(false);
    expect(qualificationState(row({ qualified_at: "2026-08-14T09:00:00Z" })).qualified).toBe(true);
  });
});

describe("discoveryItems", () => {
  it("treats nothing as captured on an empty record", () => {
    expect(discoveryItems(null).every((item) => !item.captured)).toBe(true);
    expect(discoveryProgress(null)).toEqual({ captured: 0, total: 4 });
  });

  // A field containing a space is the same as an empty one to the person
  // reading it later.
  it("does not count whitespace as captured", () => {
    const items = discoveryItems(row({ primary_need: "   ", decision_makers: "\n\t" }));
    expect(items.find((item) => item.key === "primary_need")?.captured).toBe(false);
    expect(items.find((item) => item.key === "decision_makers")?.captured).toBe(false);
  });

  it("counts needs as captured from either the need or the pain points", () => {
    expect(discoveryItems(row({ primary_need: "Downtime" })).find((i) => i.key === "primary_need")?.captured).toBe(true);
    expect(discoveryItems(row({ pain_points: "Unplanned stoppages" })).find((i) => i.key === "primary_need")?.captured).toBe(true);
  });

  // The lifecycle map bullets them together: "Budget + timeline discussed".
  it("requires both budget and timeline for that item", () => {
    expect(discoveryItems(row({ budget_range: "$200k" })).find((i) => i.key === "budget_range")?.captured).toBe(false);
    expect(discoveryItems(row({ timeline: "Q1" })).find((i) => i.key === "budget_range")?.captured).toBe(false);
    expect(
      discoveryItems(row({ budget_range: "$200k", timeline: "Q1" })).find((i) => i.key === "budget_range")?.captured,
    ).toBe(true);
  });

  it("counts a full record as complete", () => {
    const full = row({
      discovery_call_at: "2026-08-10T09:00:00Z",
      primary_need: "Downtime",
      decision_makers: "Jane Smith",
      budget_range: "$200k",
      timeline: "Q1",
    });
    expect(discoveryProgress(full)).toEqual({ captured: 4, total: 4 });
  });
});

describe("suggestedProbability", () => {
  it("rises with the number established", () => {
    expect(suggestedProbability(0)).toBe(5);
    expect(suggestedProbability(4)).toBe(60);
    // Monotonic: more established evidence can never suggest a lower number.
    for (let met = 1; met <= 4; met += 1) {
      expect(suggestedProbability(met)).toBeGreaterThan(suggestedProbability(met - 1));
    }
  });

  // The one met is usually "need", which every enquiry has by definition.
  it("stays low at one of four", () => {
    expect(suggestedProbability(1)).toBeLessThanOrEqual(10);
  });

  it("never suggests certainty", () => {
    for (let met = 0; met <= 4; met += 1) {
      expect(suggestedProbability(met)).toBeLessThan(100);
    }
  });
});

describe("checkQualificationInput", () => {
  it("shapes supplied text into columns and trims it", () => {
    const result = checkQualificationInput({ primaryNeed: "  Unplanned downtime  " });
    expect(result.ok).toBe(true);
    expect(result.patch).toEqual({ primary_need: "Unplanned downtime" });
  });

  // Saving the BANT boxes must not blank a discovery note the caller never saw.
  it("writes only the keys supplied", () => {
    const result = checkQualificationInput({ hasBudget: true });
    expect(result.patch).toEqual({ has_budget: true });
    expect(result.patch).not.toHaveProperty("primary_need");
  });

  it("stores a blank string as null rather than an empty note", () => {
    expect(checkQualificationInput({ competition: "   " }).patch).toEqual({ competition: null });
  });

  it("refuses text longer than the column allows", () => {
    const result = checkQualificationInput({ budgetRange: "a".repeat(201) });
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.budgetRange).toBeTruthy();
  });

  it("accepts and normalises a discovery date, and clears it on empty", () => {
    expect(checkQualificationInput({ discoveryCallAt: "2026-08-10" }).patch?.discovery_call_at).toBe(
      new Date("2026-08-10").toISOString(),
    );
    expect(checkQualificationInput({ discoveryCallAt: "" }).patch).toEqual({ discovery_call_at: null });
    expect(checkQualificationInput({ discoveryCallAt: null }).patch).toEqual({ discovery_call_at: null });
  });

  it("refuses a malformed discovery date", () => {
    const result = checkQualificationInput({ discoveryCallAt: "some time last week" });
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.discoveryCallAt).toBeTruthy();
  });

  it("refuses a non-boolean on a BANT test", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(checkQualificationInput({ hasBudget: "yes" as any }).ok).toBe(false);
  });

  it("refuses an empty edit rather than writing nothing", () => {
    const result = checkQualificationInput({});
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Nothing to save");
  });

  it("accepts all four tests together", () => {
    const result = checkQualificationInput({
      hasBudget: true,
      hasAuthority: true,
      hasNeed: true,
      hasTimeline: false,
    });
    expect(result.patch).toEqual({
      has_budget: true,
      has_authority: true,
      has_need: true,
      has_timeline: false,
    });
  });
});
