// Pure mapping helpers (no server-only) for turning structured research findings
// into legal_register_items rows. Extracted so the mapping + Human Authority
// gating can be unit-tested without the API route's Supabase/auth dependencies.

import type { LegalRegisterCategory, LegalRegisterJurisdiction, ResearchFinding } from "./types";

const VALID_JURISDICTIONS = new Set<LegalRegisterJurisdiction>(["federal", "state", "local", "international", "multi"]);

export function normalizeJurisdiction(value: string): LegalRegisterJurisdiction {
  const v = (value || "").toLowerCase().trim() as LegalRegisterJurisdiction;
  return VALID_JURISDICTIONS.has(v) ? v : "federal";
}

/** Maps the structured requirement_type + jurisdiction onto the legacy register category enum. */
export function deriveCategory(requirementType: string, jurisdiction: LegalRegisterJurisdiction): LegalRegisterCategory {
  switch (requirementType) {
    case "law":
      return jurisdiction === "state" ? "state_law" : jurisdiction === "local" ? "local_law" : "federal_law";
    case "regulation":
      return jurisdiction === "state" ? "state_regulation" : "federal_regulation";
    case "consensus_standard":
      return "standard";
    case "agency_guidance":
    case "letter_of_interpretation":
    case "best_practice":
      return "guideline";
    case "internal_policy":
      return "policy";
    default:
      return "other";
  }
}

export function mapFindingToRow(
  finding: ResearchFinding,
  runId: string,
  query: string,
  userId: string,
  program: string,
) {
  const jurisdiction = normalizeJurisdiction(finding.jurisdiction);
  return {
    title: finding.title.trim(),
    citation: finding.citation || null,
    issuing_body: finding.agency || null,
    category: deriveCategory(finding.requirement_type, jurisdiction),
    jurisdiction,
    jurisdiction_state: finding.state || null,
    description: finding.summary || null,
    compliance_requirements: finding.required_action || null,
    applicability_notes: finding.applicability || null,
    source_urls: finding.source_url ? [finding.source_url] : [],
    ai_researched: true,
    ai_research_query: query,
    created_by: userId,
    research_run_id: runId || null,
    program: program || null,
    requirement_type: finding.requirement_type || null,
    applicability_status: finding.applicability_status || null,
    required_action: finding.required_action || null,
    documentation_required: finding.documentation_required || null,
    training_required: finding.training_required || null,
    inspection_required: finding.inspection_required || null,
    permit_required: finding.permit_required || null,
    record_retention: finding.record_retention || null,
    responsible_role: finding.responsible_role || null,
    risk_level: finding.risk_level || null,
    confidence_level: finding.confidence_level || null,
    human_review_required: finding.human_review_required,
    module_assignment: finding.module_assignment || null,
    source_notes: finding.source_notes || null,
    // Human Authority Rule: anything flagged for review must NOT auto-approve.
    review_status: finding.human_review_required ? "needs_review" : "approved",
    compliance_status: "not_assessed",
  };
}
