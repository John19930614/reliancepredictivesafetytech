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
}

export interface ResearchedLegalItem {
  title: string;
  citation: string;
  issuing_body: string;
  category: LegalRegisterCategory;
  jurisdiction: LegalRegisterJurisdiction;
  jurisdiction_state?: string;
  industry_sectors: string[];
  description: string;
  compliance_requirements: string;
  penalties: string;
  effective_date?: string;
  source_urls: string[];
}

export interface LegalResearchResult {
  items: ResearchedLegalItem[];
  summary: string;
  query: string;
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
