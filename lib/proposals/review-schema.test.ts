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
    expect(prompt).toContain("region_id: field:customSummary");
    expect(prompt).toContain("region_id: phase:0");
    expect(prompt).toContain("rewritten"); // rewrites routed into `edits`, drafts only
    expect(prompt).toContain("Nothing you return is applied automatically");
  });

  it("says so when the automated checks all passed", () => {
    const prompt = buildReviewPrompt({ state: state(), status: "draft", deterministic: [] });
    expect(prompt).toContain("(none — the automated checks all passed)");
  });
});

describe("parseReviewOutput", () => {
  const finding = { area: "pricing", severity: "warn", message: "Deposit is unstated.", suggestion: "State the deposit." };
  const REGIONS = ["field:customSummary", "phase:0"];

  it("parses a well-formed payload", () => {
    const parsed = parseReviewOutput(
      JSON.stringify({ verdict: "needs_attention", summary: "Close, not done.", findings: [finding], edits: [] }),
      REGIONS,
    );
    expect(parsed?.verdict).toBe("needs_attention");
    expect(parsed?.findings).toHaveLength(1);
    expect(parsed?.findings[0].area).toBe("pricing");
    expect(parsed?.edits).toEqual([]);
  });

  it("drops malformed findings instead of failing the run", () => {
    const parsed = parseReviewOutput(
      JSON.stringify({
        verdict: "ready",
        summary: "Fine.",
        findings: [finding, { area: "vibes", severity: "warn", message: "x", suggestion: "y" }, { area: "risk", severity: "shrug", message: "x", suggestion: "y" }, 42],
        edits: [],
      }),
      REGIONS,
    );
    expect(parsed?.findings).toHaveLength(1);
  });

  it("caps the findings list", () => {
    const parsed = parseReviewOutput(
      JSON.stringify({ verdict: "not_ready", summary: "Many.", findings: Array.from({ length: 40 }, () => finding), edits: [] }),
      REGIONS,
    );
    expect(parsed?.findings).toHaveLength(reviewMaxFindings);
  });

  it("keeps edits that target supplied regions and drops hallucinated or duplicate ones", () => {
    const parsed = parseReviewOutput(
      JSON.stringify({
        verdict: "needs_attention",
        summary: "One passage needs work.",
        findings: [finding],
        edits: [
          { region_id: "phase:0", text: "Kickoff, setup, and configuration of the accounts in scope.", note: "tightened" },
          { region_id: "phase:0", text: "A second rewrite of the same region.", note: "duplicate" },
          { region_id: "field:doesNotExist", text: "Hallucinated target.", note: "x" },
          { region_id: "phase:99", text: "Out of range.", note: "x" },
          "garbage",
        ],
      }),
      REGIONS,
    );
    expect(parsed?.edits).toHaveLength(1);
    expect(parsed?.edits[0].regionId).toBe("phase:0");
    expect(parsed?.edits[0].note).toBe("tightened");
  });

  it("tolerates a payload without an edits array (older model output)", () => {
    const parsed = parseReviewOutput(
      JSON.stringify({ verdict: "ready", summary: "Fine.", findings: [] }),
      REGIONS,
    );
    expect(parsed?.edits).toEqual([]);
  });

  it("returns null for non-JSON and for a payload missing its core", () => {
    expect(parseReviewOutput("the model had a bad day", REGIONS)).toBeNull();
    expect(parseReviewOutput(JSON.stringify({ verdict: "maybe", summary: "x", findings: [] }), REGIONS)).toBeNull();
    expect(parseReviewOutput(JSON.stringify({ verdict: "ready", summary: "", findings: [] }), REGIONS)).toBeNull();
  });
});
