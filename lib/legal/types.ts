export const legalRegisterCategories = [
  "federal_law",
  "state_law",
  "local_law",
  "federal_regulation",
  "state_regulation",
  "standard",
  "guideline",
  "policy",
  "other",
] as const;

export const legalRegisterJurisdictions = [
  "federal",
  "state",
  "local",
  "international",
  "multi",
] as const;

export const legalComplianceStatuses = [
  "not_assessed",
  "compliant",
  "in_progress",
  "non_compliant",
  "not_applicable",
] as const;

export type LegalRegisterCategory = (typeof legalRegisterCategories)[number];
export type LegalRegisterJurisdiction = (typeof legalRegisterJurisdictions)[number];
export type LegalComplianceStatus = (typeof legalComplianceStatuses)[number];

export interface LegalRegisterItem {
  id: string;
  title: string;
  citation: string | null;
  issuing_body: string | null;
  category: LegalRegisterCategory;
  jurisdiction: LegalRegisterJurisdiction;
  jurisdiction_state: string | null;
  industry_sectors: string[];
  description: string | null;
  compliance_requirements: string | null;
  penalties: string | null;
  applies_to_us: boolean;
  applicability_notes: string | null;
  compliance_status: LegalComplianceStatus;
  effective_date: string | null;
  review_date: string | null;
  last_updated_from_source: string | null;
  source_urls: string[];
  ai_researched: boolean;
  ai_research_query: string | null;
  owner_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Intelligence Center extensions (20260623000000_legal_register_intelligence)
  company_id?: string | null;
  project_id?: string | null;
  research_run_id?: string | null;
  program?: string | null;
  requirement_type?: string | null;
  applicability_status?: string | null;
  required_action?: string | null;
  documentation_required?: string | null;
  training_required?: string | null;
  inspection_required?: string | null;
  permit_required?: string | null;
  record_retention?: string | null;
  responsible_role?: string | null;
  risk_level?: RiskLevel | null;
  review_status?: ReviewStatus | null;
  human_review_required?: boolean | null;
  confidence_level?: ConfidenceLevel | null;
  module_assignment?: string | null;
  source_notes?: string | null;
  review_role_needed?: string | null;
  reviewed_by?: string | null;
  last_reviewed_at?: string | null;
  archived?: boolean | null;
}

// ============================================================================
// Intelligence Center enums, labels & badge colors (doc §7–§9, §12)
// ============================================================================

export const DEFAULT_LEGAL_DISCLAIMER =
  "AI-generated compliance research is for safety program development, gap analysis, and decision-support only. Final legal, regulatory, engineering, DOT, environmental, medical, or safety approval must be completed by a qualified responsible person.";

export const riskLevels = ["low", "medium", "high", "critical"] as const;
export const confidenceLevels = ["high", "medium", "low", "needs_review"] as const;
export const reviewStatuses = [
  "draft",
  "needs_review",
  "approved",
  "rejected",
  "changes_requested",
  "not_applicable",
  "archived",
] as const;
export const requirementTypes = [
  "law",
  "regulation",
  "agency_guidance",
  "letter_of_interpretation",
  "consensus_standard",
  "best_practice",
  "internal_policy",
  "needs_legal_review",
] as const;
export const applicabilityStatuses = [
  "applies",
  "may_apply",
  "does_not_apply",
  "needs_more_information",
  "needs_human_review",
] as const;
export const gapStatuses = [
  "existing",
  "added",
  "changed",
  "missing",
  "needs_review",
  "not_applicable",
  "removed",
  "outdated",
] as const;
export const moduleBuildStatuses = [
  "not_started",
  "planned",
  "in_build",
  "testing",
  "live",
  "needs_update",
  "archived",
] as const;
export const legalSourceTypes = [
  "Federal Regulation",
  "State Regulation",
  "Local Code",
  "Agency Guidance",
  "Letter of Interpretation",
  "Consensus Standard",
  "Best Practice",
  "Internal Policy",
  "Case Law / Legal Reference",
  "Manufacturer Guidance",
] as const;

export type RiskLevel = (typeof riskLevels)[number];
export type ConfidenceLevel = (typeof confidenceLevels)[number];
export type ReviewStatus = (typeof reviewStatuses)[number];
export type RequirementType = (typeof requirementTypes)[number];
export type ApplicabilityStatus = (typeof applicabilityStatuses)[number];
export type GapStatus = (typeof gapStatuses)[number];
export type ModuleBuildStatus = (typeof moduleBuildStatuses)[number];

export const riskLabels: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

// doc §12: low green, medium gold, high orange, critical red
export const riskColors: Record<RiskLevel, string> = {
  low: "#22c55e",
  medium: "#c9932b",
  high: "#f97316",
  critical: "#ef4444",
};

export const confidenceLabels: Record<ConfidenceLevel, string> = {
  high: "High Confidence",
  medium: "Medium Confidence",
  low: "Low Confidence",
  needs_review: "Needs Review",
};

export const confidenceColors: Record<ConfidenceLevel, string> = {
  high: "#22c55e",
  medium: "#c9932b",
  low: "#f97316",
  needs_review: "#f59e0b",
};

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  draft: "Draft",
  needs_review: "Needs Review",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes Requested",
  not_applicable: "N/A",
  archived: "Archived",
};

// doc §12: approved green, draft gray, archived dark gray, needs review amber
export const reviewStatusColors: Record<ReviewStatus, string> = {
  draft: "var(--portal-muted)",
  needs_review: "#f59e0b",
  approved: "#22c55e",
  rejected: "#ef4444",
  changes_requested: "#f97316",
  not_applicable: "var(--portal-muted)",
  archived: "#6b7280",
};

export const requirementTypeLabels: Record<RequirementType, string> = {
  law: "Law",
  regulation: "Regulation",
  agency_guidance: "Agency Guidance",
  letter_of_interpretation: "Letter of Interpretation",
  consensus_standard: "Consensus Standard",
  best_practice: "Best Practice",
  internal_policy: "Internal Policy Recommendation",
  needs_legal_review: "Needs Legal Review",
};

export const gapStatusLabels: Record<GapStatus, string> = {
  existing: "Existing",
  added: "Added",
  changed: "Changed",
  missing: "Missing",
  needs_review: "Needs Review",
  not_applicable: "Not Applicable",
  removed: "Removed",
  outdated: "Outdated",
};

// doc §5.5 highlight rules: added gold, changed blue, missing red, needs review amber,
// existing green, not applicable gray
export const gapStatusColors: Record<GapStatus, string> = {
  existing: "#22c55e",
  added: "#c9932b",
  changed: "#3b82f6",
  missing: "#ef4444",
  needs_review: "#f59e0b",
  not_applicable: "var(--portal-muted)",
  removed: "#ef4444",
  outdated: "#f97316",
};

export const moduleBuildStatusLabels: Record<ModuleBuildStatus, string> = {
  not_started: "Not Started",
  planned: "Planned",
  in_build: "In Build",
  testing: "Testing",
  live: "Live",
  needs_update: "Needs Update",
  archived: "Archived",
};

// ============================================================================
// Structured research output (doc §14)
// ============================================================================

export interface ResearchScopeDetected {
  industry: string;
  jurisdiction: string;
  state: string;
  program: string;
  work_activity: string;
  equipment: string;
  chemicals_materials: string;
  vehicle_type: string;
  hazards: string[];
}

export interface ResearchFinding {
  title: string;
  citation: string;
  agency: string;
  jurisdiction: string;
  state: string;
  requirement_type: string;
  summary: string;
  applicability: string;
  applicability_status: string;
  required_action: string;
  documentation_required: string;
  training_required: string;
  inspection_required: string;
  permit_required: string;
  record_retention: string;
  responsible_role: string;
  risk_level: string;
  confidence_level: string;
  human_review_required: boolean;
  source_url: string;
  source_notes: string;
  module_assignment: string;
}

export interface GapFinding {
  existing_item: string;
  finding: string;
  status: string;
  gap_description: string;
  recommended_update: string;
  module_assignment: string;
  risk_level: string;
  human_review_required: boolean;
}

export interface ModuleRecommendationFinding {
  module_name: string;
  reason_needed: string;
  required_forms: string;
  required_permits: string;
  required_inspections: string;
  required_training: string;
  required_dashboards: string;
  required_alerts: string;
  required_reports: string;
  priority_level: string;
  build_status: string;
}

export interface AuditChecklistFinding {
  program: string;
  checklist_item: string;
  question_text: string;
  answer_type: string;
  citation: string;
  evidence_required: string;
  risk_level: string;
  corrective_action_trigger: string;
  responsible_role: string;
  frequency: string;
  module_assignment: string;
}

export interface StructuredResearchResult {
  research_summary: string;
  scope_detected: ResearchScopeDetected;
  findings: ResearchFinding[];
  gap_analysis: GapFinding[];
  module_recommendations: ModuleRecommendationFinding[];
  audit_checklist_items: AuditChecklistFinding[];
  human_review_notes: string[];
  disclaimer: string;
  query: string;
}

/** Inputs collected by the New Research Run form (doc §5.2). */
export interface ResearchRunInput {
  title?: string;
  company?: string;
  project?: string;
  industry?: string;
  program?: string;
  work_activity?: string;
  state?: string;
  jurisdiction?: string;
  federal_only?: boolean;
  include_state_local?: boolean;
  scope?: string;
  equipment?: string;
  chemicals_materials?: string;
  vehicle_type?: string;
  employee_type?: string;
  contractor_type?: string;
  risk_level?: string;
  existing_program_text?: string;
  question?: string;
}

export const categoryLabels: Record<LegalRegisterCategory, string> = {
  federal_law: "Federal Law",
  state_law: "State Law",
  local_law: "Local Law",
  federal_regulation: "Federal Regulation",
  state_regulation: "State Regulation",
  standard: "Standard",
  guideline: "Guideline",
  policy: "Policy",
  other: "Other",
};

export const jurisdictionLabels: Record<LegalRegisterJurisdiction, string> = {
  federal: "Federal",
  state: "State",
  local: "Local",
  international: "International",
  multi: "Multi-jurisdiction",
};

export const statusLabels: Record<LegalComplianceStatus, string> = {
  not_assessed: "Not Assessed",
  compliant: "Compliant",
  in_progress: "In Progress",
  non_compliant: "Non-Compliant",
  not_applicable: "N/A",
};

export const statusColors: Record<LegalComplianceStatus, string> = {
  not_assessed: "var(--portal-muted)",
  compliant: "#22c55e",
  in_progress: "#f59e0b",
  non_compliant: "#ef4444",
  not_applicable: "var(--portal-muted)",
};
