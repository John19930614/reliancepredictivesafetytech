import { describe, expect, it } from "vitest";
import type { GeneratorState } from "./generator-state";
import { buildReviewPrompt, parseReviewOutput, reviewMaxFindings } from "./review-schema";

function state(): GeneratorState {
  return {
    v: 1,
    fields: {
      clientCompany: "Acme",
      customSummary: "A pilot with a shared reporting cadence.",
      packageSelect: "custom",
      annualPrice: "5000",
    },
    phases: [{ type: "phase", key: "discovery", name: "Discovery & Intake", qty: 1, price: 0, desc: "Kickoff and setup.", unit: "" }],
    services: [],
  };
}

describe("buildReviewPrompt", () => {
  it("carries the facts, the stage guidance, the automated findings and fenced prose", () => {
    const prompt = buildReviewPrompt({
      state: state(),
      status: "in_review",
      deterministic: [{ id: "team_bios", severity: "warn", area: "Proposal team", message: "No teammates are selected." }],
    });
    expect(prompt).toContain("AUTHORITATIVE FACTS");
    expect(prompt).toContain("approver"); // in_review stage guidance
    expect(prompt).toContain("[warn] Proposal team: No teammates are selected.");
    expect(prompt).toContain("<<<PASSAGE");
    expect(prompt).toContain("Kickoff and setup.");
    expect(prompt).toContain("NEVER return rewritten passage text");
  });

  it("says so when the automated checks all passed", () => {
    const prompt = buildReviewPrompt({ state: state(), status: "draft", deterministic: [] });
    expect(prompt).toContain("(none — the automated checks all passed)");
  });
});

describe("parseReviewOutput", () => {
  const finding = { area: "pricing", severity: "warn", message: "Deposit is unstated.", suggestion: "State the deposit." };

  it("parses a well-formed payload", () => {
    const parsed = parseReviewOutput(
      JSON.stringify({ verdict: "needs_attention", summary: "Close, not done.", findings: [finding] }),
    );
    expect(parsed?.verdict).toBe("needs_attention");
    expect(parsed?.findings).toHaveLength(1);
    expect(parsed?.findings[0].area).toBe("pricing");
  });

  it("drops malformed findings instead of failing the run", () => {
    const parsed = parseReviewOutput(
      JSON.stringify({
        verdict: "ready",
        summary: "Fine.",
        findings: [finding, { area: "vibes", severity: "warn", message: "x", suggestion: "y" }, { area: "risk", severity: "shrug", message: "x", suggestion: "y" }, 42],
      }),
    );
    expect(parsed?.findings).toHaveLength(1);
  });

  it("caps the findings list", () => {
    const parsed = parseReviewOutput(
      JSON.stringify({ verdict: "not_ready", summary: "Many.", findings: Array.from({ length: 40 }, () => finding) }),
    );
    expect(parsed?.findings).toHaveLength(reviewMaxFindings);
  });

  it("returns null for non-JSON and for a payload missing its core", () => {
    expect(parseReviewOutput("the model had a bad day")).toBeNull();
    expect(parseReviewOutput(JSON.stringify({ verdict: "maybe", summary: "x", findings: [] }))).toBeNull();
    expect(parseReviewOutput(JSON.stringify({ verdict: "ready", summary: "", findings: [] }))).toBeNull();
  });
});
