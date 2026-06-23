import { describe, expect, it } from "vitest";
import { deriveCategory, mapFindingToRow, normalizeJurisdiction } from "./register-mapping";
import type { ResearchFinding } from "./types";

function finding(overrides: Partial<ResearchFinding> = {}): ResearchFinding {
  return {
    title: "Confined Space Entry",
    citation: "29 CFR 1910.146",
    agency: "OSHA",
    jurisdiction: "federal",
    state: "",
    requirement_type: "regulation",
    summary: "Permit-required confined spaces.",
    applicability: "Applies to facilities with confined spaces.",
    applicability_status: "applies",
    required_action: "Implement a permit program.",
    documentation_required: "Written program",
    training_required: "Authorized entrant training",
    inspection_required: "Pre-entry atmospheric testing",
    permit_required: "Entry permit",
    record_retention: "1 year",
    responsible_role: "Safety Manager",
    risk_level: "critical",
    confidence_level: "high",
    human_review_required: true,
    source_url: "https://osha.gov",
    source_notes: "",
    module_assignment: "Confined Space",
    ...overrides,
  };
}

describe("normalizeJurisdiction", () => {
  it("passes through valid values and defaults invalid ones to federal", () => {
    expect(normalizeJurisdiction("STATE")).toBe("state");
    expect(normalizeJurisdiction("galactic")).toBe("federal");
    expect(normalizeJurisdiction("")).toBe("federal");
  });
});

describe("deriveCategory", () => {
  it("derives jurisdiction-aware categories", () => {
    expect(deriveCategory("law", "state")).toBe("state_law");
    expect(deriveCategory("law", "federal")).toBe("federal_law");
    expect(deriveCategory("regulation", "state")).toBe("state_regulation");
    expect(deriveCategory("regulation", "federal")).toBe("federal_regulation");
    expect(deriveCategory("consensus_standard", "multi")).toBe("standard");
    expect(deriveCategory("agency_guidance", "federal")).toBe("guideline");
    expect(deriveCategory("best_practice", "federal")).toBe("guideline");
    expect(deriveCategory("internal_policy", "federal")).toBe("policy");
    expect(deriveCategory("needs_legal_review", "federal")).toBe("other");
  });
});

describe("mapFindingToRow (Human Authority Rule)", () => {
  it("routes review-flagged findings to needs_review, never approved", () => {
    const row = mapFindingToRow(finding({ human_review_required: true }), "run-1", "q", "user-1", "Confined Space");
    expect(row.review_status).toBe("needs_review");
  });

  it("approves findings that do not require review", () => {
    const row = mapFindingToRow(finding({ human_review_required: false }), "run-1", "q", "user-1", "Confined Space");
    expect(row.review_status).toBe("approved");
  });

  it("carries the structured fields through to register columns", () => {
    const row = mapFindingToRow(finding(), "run-1", "fuel transport", "user-1", "Confined Space");
    expect(row.category).toBe("federal_regulation");
    expect(row.issuing_body).toBe("OSHA");
    expect(row.risk_level).toBe("critical");
    expect(row.source_urls).toEqual(["https://osha.gov"]);
    expect(row.research_run_id).toBe("run-1");
    expect(row.ai_researched).toBe(true);
  });
});
