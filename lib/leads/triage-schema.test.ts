import { describe, expect, it } from "vitest";
import {
  buildLeadTriagePrompt,
  parseLeadTriageOutput,
  rankFindings,
  requiresHumanReview,
  type TriageLeadInput,
} from "./triage-schema";

const lead = (id: string, over: Partial<TriageLeadInput> = {}): TriageLeadInput => ({
  id,
  name: "Dana Reyes",
  company: "Ironline Construction",
  email: "dana@example.com",
  phone: null,
  role: "Safety Director",
  company_type: "Construction",
  interested_products: ["SafePredict"],
  message: "Need help with incident tracking.",
  status: "new",
  created_at: "2026-07-30T12:00:00Z",
  ...over,
});

function output(findings: unknown[], summary = "Summary.") {
  return JSON.stringify({ summary, findings });
}

describe("buildLeadTriagePrompt", () => {
  it("includes the date and every lead id", () => {
    const prompt = buildLeadTriagePrompt([lead("a"), lead("b")], "2026-08-01");
    expect(prompt).toContain("2026-08-01");
    expect(prompt).toContain('"id": "a"');
    expect(prompt).toContain('"id": "b"');
  });

  it("does not leak contact details the model does not need", () => {
    const prompt = buildLeadTriagePrompt([lead("a")], "2026-08-01");
    expect(prompt).not.toContain("dana@example.com");
  });
});

describe("parseLeadTriageOutput", () => {
  const valid = {
    lead_id: "a",
    priority_score: 90,
    segment: "Enterprise construction",
    next_step: "Call the safety director to book a demo.",
    rationale: "Senior role, named product.",
    confidence: "high",
  };

  it("parses a well-formed response", () => {
    const result = parseLeadTriageOutput(output([valid]), ["a"]);
    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0].priority_score).toBe(90);
    expect(result?.summary).toBe("Summary.");
  });

  it("returns null on malformed JSON", () => {
    expect(parseLeadTriageOutput("not json", ["a"])).toBeNull();
  });

  it("returns null when findings is not an array", () => {
    expect(parseLeadTriageOutput(JSON.stringify({ summary: "x", findings: {} }), ["a"])).toBeNull();
  });

  it("drops hallucinated leads that were never supplied", () => {
    const result = parseLeadTriageOutput(output([valid, { ...valid, lead_id: "ghost" }]), ["a"]);
    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0].lead_id).toBe("a");
  });

  it("drops findings with no concrete next step", () => {
    const result = parseLeadTriageOutput(output([{ ...valid, next_step: "   " }]), ["a"]);
    expect(result?.findings).toHaveLength(0);
  });

  it("clamps scores into 0-100", () => {
    const result = parseLeadTriageOutput(
      output([
        { ...valid, lead_id: "a", priority_score: 500 },
        { ...valid, lead_id: "b", priority_score: -20 },
      ]),
      ["a", "b"],
    );
    expect(result?.findings.find((f) => f.lead_id === "a")?.priority_score).toBe(100);
    expect(result?.findings.find((f) => f.lead_id === "b")?.priority_score).toBe(0);
  });

  it("defaults an unknown confidence to low", () => {
    const result = parseLeadTriageOutput(output([{ ...valid, confidence: "certain" }]), ["a"]);
    expect(result?.findings[0].confidence).toBe("low");
  });

  it("de-duplicates a repeated lead, keeping the highest score", () => {
    const result = parseLeadTriageOutput(
      output([
        { ...valid, priority_score: 40 },
        { ...valid, priority_score: 88 },
      ]),
      ["a"],
    );
    expect(result?.findings).toHaveLength(1);
    expect(result?.findings[0].priority_score).toBe(88);
  });

  it("sorts findings by descending score", () => {
    const result = parseLeadTriageOutput(
      output([
        { ...valid, lead_id: "a", priority_score: 10 },
        { ...valid, lead_id: "b", priority_score: 70 },
      ]),
      ["a", "b"],
    );
    expect(result?.findings.map((f) => f.lead_id)).toEqual(["b", "a"]);
  });
});

describe("rankFindings", () => {
  it("assigns 1-based ranks in score order", () => {
    const ranked = rankFindings([
      { lead_id: "a", priority_score: 10, segment: "s", next_step: "n", rationale: "", confidence: "low" },
      { lead_id: "b", priority_score: 90, segment: "s", next_step: "n", rationale: "", confidence: "high" },
    ]);
    expect(ranked[0]).toMatchObject({ lead_id: "b", priority_rank: 1 });
    expect(ranked[1]).toMatchObject({ lead_id: "a", priority_rank: 2 });
  });

  it("breaks ties deterministically on lead id", () => {
    const ranked = rankFindings([
      { lead_id: "z", priority_score: 50, segment: "s", next_step: "n", rationale: "", confidence: "low" },
      { lead_id: "a", priority_score: 50, segment: "s", next_step: "n", rationale: "", confidence: "low" },
    ]);
    expect(ranked.map((r) => r.lead_id)).toEqual(["a", "z"]);
  });
});

describe("requiresHumanReview", () => {
  it("flags anything below high confidence", () => {
    expect(requiresHumanReview({ confidence: "low", priority_score: 10 })).toBe(true);
    expect(requiresHumanReview({ confidence: "medium", priority_score: 10 })).toBe(true);
  });

  it("flags high-value leads even at high confidence", () => {
    expect(requiresHumanReview({ confidence: "high", priority_score: 95 })).toBe(true);
  });

  it("lets a routine high-confidence suggestion through", () => {
    expect(requiresHumanReview({ confidence: "high", priority_score: 40 })).toBe(false);
  });
});
