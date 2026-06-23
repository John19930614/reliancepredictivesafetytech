import { describe, expect, it } from "vitest";
import { buildStructuredResearchPrompt, normalizeStructuredResult } from "./structured-research";
import { DEFAULT_LEGAL_DISCLAIMER } from "./types";

function findingShape(overrides: Record<string, unknown> = {}) {
  return {
    title: "Lockout/Tagout",
    citation: "29 CFR 1910.147",
    agency: "OSHA",
    jurisdiction: "federal",
    state: "",
    requirement_type: "regulation",
    summary: "Controls hazardous energy.",
    applicability: "Applies to servicing equipment.",
    applicability_status: "applies",
    required_action: "Establish an energy control program.",
    documentation_required: "Written LOTO program",
    training_required: "Authorized employee training",
    inspection_required: "Annual periodic inspection",
    permit_required: "",
    record_retention: "",
    responsible_role: "Safety Manager",
    risk_level: "high",
    confidence_level: "high",
    human_review_required: false,
    source_url: "https://osha.gov",
    source_notes: "",
    module_assignment: "Lockout/Tagout",
    ...overrides,
  };
}

describe("normalizeStructuredResult", () => {
  it("returns null when there are no usable findings", () => {
    expect(normalizeStructuredResult({ findings: [] })).toBeNull();
    expect(normalizeStructuredResult(null)).toBeNull();
    expect(normalizeStructuredResult({ findings: [{ summary: "no title" }] })).toBeNull();
  });

  it("forces human review for high/critical risk findings even if model said false", () => {
    const result = normalizeStructuredResult({ findings: [findingShape({ risk_level: "high", human_review_required: false })] });
    expect(result?.findings[0].human_review_required).toBe(true);
  });

  it("forces human review when confidence is needs_review", () => {
    const result = normalizeStructuredResult({
      findings: [findingShape({ risk_level: "low", confidence_level: "needs_review", human_review_required: false })],
    });
    expect(result?.findings[0].human_review_required).toBe(true);
  });

  it("does not force review for a low-risk high-confidence finding", () => {
    const result = normalizeStructuredResult({
      findings: [findingShape({ risk_level: "low", confidence_level: "high", human_review_required: false })],
    });
    expect(result?.findings[0].human_review_required).toBe(false);
  });

  it("coerces invalid enums to safe fallbacks", () => {
    const result = normalizeStructuredResult({
      findings: [findingShape({ requirement_type: "made_up", risk_level: "extreme", confidence_level: "??", applicability_status: "maybe" })],
    });
    const f = result!.findings[0];
    expect(f.requirement_type).toBe("needs_legal_review");
    expect(f.risk_level).toBe("medium");
    expect(f.confidence_level).toBe("needs_review");
    expect(f.applicability_status).toBe("needs_human_review");
  });

  it("always pins the fixed disclaimer regardless of model output", () => {
    const result = normalizeStructuredResult({ findings: [findingShape()], disclaimer: "anything else" });
    expect(result?.disclaimer).toBe(DEFAULT_LEGAL_DISCLAIMER);
  });

  it("normalizes nested gap, module, and audit collections", () => {
    const result = normalizeStructuredResult({
      findings: [findingShape()],
      gap_analysis: [{ finding: "Missing LOTO program", status: "missing", risk_level: "high" }],
      module_recommendations: [{ module_name: "LOTO", build_status: "made_up" }],
      audit_checklist_items: [{ checklist_item: "LOTO posted?", risk_level: "high" }],
      human_review_notes: ["Confirm energy sources", ""],
    });
    expect(result?.gap_analysis[0].status).toBe("missing");
    expect(result?.module_recommendations[0].build_status).toBe("planned"); // fallback
    expect(result?.audit_checklist_items[0].answer_type).toBe("Yes/No/NA");
    expect(result?.human_review_notes).toEqual(["Confirm energy sources"]);
  });
});

describe("buildStructuredResearchPrompt", () => {
  it("includes the guardrail system prompt for a plain string query", () => {
    const prompt = buildStructuredResearchPrompt("fuel transport across state lines");
    expect(prompt).toContain("senior safety compliance researcher");
    expect(prompt).toContain("fuel transport across state lines");
    expect(prompt).toContain("Do NOT claim final legal approval");
  });

  it("renders structured scope fields and the existing program block", () => {
    const prompt = buildStructuredResearchPrompt({
      industry: "Construction",
      program: "Fall Protection",
      state: "TX",
      existing_program_text: "Our current fall protection plan...",
    });
    expect(prompt).toContain("Industry: Construction");
    expect(prompt).toContain("Program type: Fall Protection");
    expect(prompt).toContain("State: TX");
    expect(prompt).toContain("Existing program to compare against");
  });
});
