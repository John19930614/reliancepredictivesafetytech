import { describe, expect, it } from "vitest";
import { isAwaitingReview, scoreBand, type TriageRow } from "./lead-context";

function triage(over: Partial<TriageRow> = {}): TriageRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    lead_id: "22222222-2222-4222-8222-222222222222",
    priority_rank: 1,
    priority_score: 82,
    segment: "Enterprise manufacturing",
    next_step: "Call the safety director to book a demo.",
    rationale: "Senior role, named product.",
    confidence: "high",
    human_review_required: true,
    status: "suggested",
    acted_by: null,
    acted_at: null,
    created_at: "2026-08-13T09:00:00Z",
    ...over,
  };
}

describe("scoreBand", () => {
  // The threshold matches lib/leads/triage-schema.ts, which flags anything at
  // or above 80 for human review regardless of confidence. A second, quietly
  // different opinion about what "high" means would be worse than none.
  it("starts high at 80, the same place triage does", () => {
    expect(scoreBand(80)).toBe("high");
    expect(scoreBand(79)).toBe("medium");
    expect(scoreBand(100)).toBe("high");
  });

  it("starts medium at 50", () => {
    expect(scoreBand(50)).toBe("medium");
    expect(scoreBand(49)).toBe("low");
  });

  it("bands the bottom of the range as low", () => {
    expect(scoreBand(0)).toBe("low");
  });

  it("is null for anything that is not a finite number", () => {
    for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(scoreBand(value as number | null | undefined), String(value)).toBeNull();
    }
  });
});

describe("isAwaitingReview", () => {
  it("is true only while the suggestion is untouched", () => {
    expect(isAwaitingReview(triage({ status: "suggested" }))).toBe(true);
    expect(isAwaitingReview(triage({ status: "accepted" }))).toBe(false);
    expect(isAwaitingReview(triage({ status: "dismissed" }))).toBe(false);
  });

  it("is false when there is no triage at all", () => {
    expect(isAwaitingReview(null)).toBe(false);
  });
});
