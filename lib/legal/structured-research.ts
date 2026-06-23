// Pure (no server-only / OpenAI) helpers for the structured legal-research
// pipeline so they can be unit-tested directly. The OpenAI orchestration that
// uses these lives in research.ts (runStructuredLegalResearch).

import {
  DEFAULT_LEGAL_DISCLAIMER,
  applicabilityStatuses,
  confidenceLevels,
  gapStatuses,
  moduleBuildStatuses,
  requirementTypes,
  riskLevels,
  type ApplicabilityStatus,
  type AuditChecklistFinding,
  type ConfidenceLevel,
  type GapFinding,
  type GapStatus,
  type ModuleBuildStatus,
  type ModuleRecommendationFinding,
  type RequirementType,
  type ResearchFinding,
  type ResearchRunInput,
  type RiskLevel,
  type StructuredResearchResult,
} from "./types";

export const STRUCTURED_RESEARCH_SYSTEM_PROMPT = `You are a senior safety compliance researcher building a legal register for ANY industry, jurisdiction, or compliance domain (construction, general industry, DOT/fleet, chemical, waste, contractor, healthcare, laboratory, environmental, emergency response, training, audit, permit management, and more).

Use web search to find current, authoritative sources. Prefer official government and standards-body sources. Be exhaustive — list EVERY genuinely applicable requirement.

You MUST follow these guardrails:
- Separate federal, state, local, and site-specific requirements.
- Classify each finding's requirement_type as exactly one of: law, regulation, agency_guidance, letter_of_interpretation, consensus_standard, best_practice, internal_policy, needs_legal_review. NEVER call guidance a law or a best practice a regulation.
- Set applicability_status to one of: applies, may_apply, does_not_apply, needs_more_information, needs_human_review — and explain the applicability in plain language.
- Set confidence_level to: high (direct regulation/law/agency standard), medium (agency guidance/interpretation), low (consensus standard/best practice/inferred), or needs_review (legal/engineering/DOT/hazmat/medical/environmental interpretation or unclear applicability).
- Set risk_level to: low, medium, high, or critical. Use high/critical for worker-safety, serious-injury, DOT hazmat, confined space, trenching, fall exposure, LOTO, or environmental-release exposure.
- Set human_review_required = true for anything involving legal interpretation, engineering judgment, DOT/hazmat classification, medical review, environmental permitting, or unclear applicability — and for every high/critical risk finding.
- Always include a citation and source_url when available.
- Do NOT claim final legal approval. Findings are decision-support drafts for a qualified person to review.`;

function field(description: string, enumValues?: readonly string[]) {
  return enumValues ? { type: "string", description, enum: [...enumValues] } : { type: "string", description };
}

const findingProperties = {
  title: field("Official full name of the requirement"),
  citation: field("Legal/standard reference, e.g. '29 CFR 1910.146'. Empty string if none."),
  agency: field("Issuing agency or body, e.g. 'OSHA', 'FMCSA', 'NFPA'"),
  jurisdiction: field("federal, state, local, international, or multi"),
  state: field("Two-letter state code if state/local, else empty string"),
  requirement_type: field("Classification", requirementTypes),
  summary: field("2-3 sentences: what it requires and why it applies"),
  applicability: field("Plain-language explanation of whether/how it applies to this scope"),
  applicability_status: field("Applicability determination", applicabilityStatuses),
  required_action: field("Specific actions required to comply"),
  documentation_required: field("Documents/written programs required, or empty string"),
  training_required: field("Training required, or empty string"),
  inspection_required: field("Inspections required, or empty string"),
  permit_required: field("Permits required, or empty string"),
  record_retention: field("Record retention requirement, or empty string"),
  responsible_role: field("Role responsible (e.g. Safety Manager, Competent Person)"),
  risk_level: field("Risk level", riskLevels),
  confidence_level: field("Confidence level", confidenceLevels),
  human_review_required: { type: "boolean", description: "True if a qualified human must review before approval" },
  source_url: field("Authoritative source URL, or empty string"),
  source_notes: field("Notes about the source/applicability, or empty string"),
  module_assignment: field("Which platform module should own this requirement, or empty string"),
} as const;

const gapProperties = {
  existing_item: field("The existing program item compared against, or empty string"),
  finding: field("The requirement found in research"),
  status: field("Gap status", gapStatuses),
  gap_description: field("What is covered/missing/changed/outdated"),
  recommended_update: field("Recommended update to close the gap"),
  module_assignment: field("Module that should own this, or empty string"),
  risk_level: field("Risk level", riskLevels),
  human_review_required: { type: "boolean", description: "True if a qualified human must review" },
} as const;

const moduleRecProperties = {
  module_name: field("Recommended platform module name"),
  reason_needed: field("Why the module is needed"),
  required_forms: field("Required forms, or empty string"),
  required_permits: field("Required permits, or empty string"),
  required_inspections: field("Required inspections, or empty string"),
  required_training: field("Required training, or empty string"),
  required_dashboards: field("Required dashboards, or empty string"),
  required_alerts: field("Required alerts, or empty string"),
  required_reports: field("Required reports, or empty string"),
  priority_level: field("Priority, e.g. low/medium/high/critical"),
  build_status: field("Initial build status", moduleBuildStatuses),
} as const;

const auditProperties = {
  program: field("Program this checklist item belongs to"),
  checklist_item: field("Short checklist item label"),
  question_text: field("The audit question text"),
  answer_type: field("Answer type", ["Yes/No/NA"]),
  citation: field("Regulation/guidance source, or empty string"),
  evidence_required: field("Evidence required to verify compliance"),
  risk_level: field("Risk level", riskLevels),
  corrective_action_trigger: field("What triggers a corrective action"),
  responsible_role: field("Role responsible"),
  frequency: field("How often the check is performed"),
  module_assignment: field("Module that should own this, or empty string"),
} as const;

function arrayOf(properties: Record<string, unknown>) {
  return {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties,
      required: Object.keys(properties),
    },
  };
}

export const structuredResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    research_summary: field("2-4 sentence overview of the regulatory landscape for this request"),
    scope_detected: {
      type: "object",
      additionalProperties: false,
      properties: {
        industry: field("Detected industry"),
        jurisdiction: field("Detected jurisdiction"),
        state: field("Detected state, or empty string"),
        program: field("Detected program/work activity"),
        work_activity: field("Detected work activity, or empty string"),
        equipment: field("Detected equipment, or empty string"),
        chemicals_materials: field("Detected chemicals/materials, or empty string"),
        vehicle_type: field("Detected vehicle type, or empty string"),
        hazards: { type: "array", items: { type: "string" } },
      },
      required: [
        "industry", "jurisdiction", "state", "program", "work_activity",
        "equipment", "chemicals_materials", "vehicle_type", "hazards",
      ],
    },
    findings: arrayOf(findingProperties),
    gap_analysis: arrayOf(gapProperties),
    module_recommendations: arrayOf(moduleRecProperties),
    audit_checklist_items: arrayOf(auditProperties),
    human_review_notes: { type: "array", items: { type: "string" } },
    disclaimer: field("The fixed compliance disclaimer"),
  },
  required: [
    "research_summary", "scope_detected", "findings", "gap_analysis",
    "module_recommendations", "audit_checklist_items", "human_review_notes", "disclaimer",
  ],
} as const;

export function buildStructuredResearchPrompt(input: ResearchRunInput | string): string {
  if (typeof input === "string") {
    return `${STRUCTURED_RESEARCH_SYSTEM_PROMPT}

USER REQUEST:
"""
${input}
"""

Research the web and return the full structured legal register, gap analysis, module recommendations, and audit checklist for this request.`;
  }

  const lines: string[] = [];
  const add = (label: string, value?: string | boolean) => {
    if (value === undefined || value === "" || value === false) return;
    lines.push(`- ${label}: ${value === true ? "yes" : value}`);
  };
  add("Title", input.title);
  add("Company", input.company);
  add("Project/site", input.project);
  add("Industry", input.industry);
  add("Program type", input.program);
  add("Work activity", input.work_activity);
  add("State", input.state);
  add("Jurisdiction", input.jurisdiction);
  add("Federal only", input.federal_only);
  add("Include state/local", input.include_state_local);
  add("Scope of work", input.scope);
  add("Equipment involved", input.equipment);
  add("Chemicals/materials", input.chemicals_materials);
  add("Vehicle type", input.vehicle_type);
  add("Employee type", input.employee_type);
  add("Contractor type", input.contractor_type);
  add("Risk level", input.risk_level);
  add("Free-text question", input.question);
  if (input.existing_program_text) {
    lines.push(`- Existing program to compare against:\n"""\n${input.existing_program_text}\n"""`);
  }

  return `${STRUCTURED_RESEARCH_SYSTEM_PROMPT}

RESEARCH SCOPE:
${lines.join("\n")}

Research the web and return the full structured legal register, gap analysis, module recommendations, and audit checklist for this scope. If an existing program was provided, populate gap_analysis comparing it against your findings; otherwise gap_analysis may be an empty array.`;
}

// ---- normalization -----------------------------------------------------------

function coerceEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const v = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
const bool = (v: unknown): boolean => v === true || v === "true" || v === "yes";

function normalizeFinding(f: Record<string, unknown>): ResearchFinding {
  const risk = coerceEnum<RiskLevel>(f.risk_level, riskLevels, "medium");
  const confidence = coerceEnum<ConfidenceLevel>(f.confidence_level, confidenceLevels, "needs_review");
  // Guardrail: high/critical risk and needs_review confidence always require human review.
  const humanReview =
    bool(f.human_review_required) || risk === "high" || risk === "critical" || confidence === "needs_review";
  return {
    title: str(f.title),
    citation: str(f.citation),
    agency: str(f.agency),
    jurisdiction: str(f.jurisdiction),
    state: str(f.state),
    requirement_type: coerceEnum<RequirementType>(f.requirement_type, requirementTypes, "needs_legal_review"),
    summary: str(f.summary),
    applicability: str(f.applicability),
    applicability_status: coerceEnum<ApplicabilityStatus>(f.applicability_status, applicabilityStatuses, "needs_human_review"),
    required_action: str(f.required_action),
    documentation_required: str(f.documentation_required),
    training_required: str(f.training_required),
    inspection_required: str(f.inspection_required),
    permit_required: str(f.permit_required),
    record_retention: str(f.record_retention),
    responsible_role: str(f.responsible_role),
    risk_level: risk,
    confidence_level: confidence,
    human_review_required: humanReview,
    source_url: str(f.source_url),
    source_notes: str(f.source_notes),
    module_assignment: str(f.module_assignment),
  };
}

function normalizeGap(g: Record<string, unknown>): GapFinding {
  return {
    existing_item: str(g.existing_item),
    finding: str(g.finding),
    status: coerceEnum<GapStatus>(g.status, gapStatuses, "needs_review"),
    gap_description: str(g.gap_description),
    recommended_update: str(g.recommended_update),
    module_assignment: str(g.module_assignment),
    risk_level: coerceEnum<RiskLevel>(g.risk_level, riskLevels, "medium"),
    human_review_required: bool(g.human_review_required),
  };
}

function normalizeModuleRec(m: Record<string, unknown>): ModuleRecommendationFinding {
  return {
    module_name: str(m.module_name),
    reason_needed: str(m.reason_needed),
    required_forms: str(m.required_forms),
    required_permits: str(m.required_permits),
    required_inspections: str(m.required_inspections),
    required_training: str(m.required_training),
    required_dashboards: str(m.required_dashboards),
    required_alerts: str(m.required_alerts),
    required_reports: str(m.required_reports),
    priority_level: str(m.priority_level),
    build_status: coerceEnum<ModuleBuildStatus>(m.build_status, moduleBuildStatuses, "planned"),
  };
}

function normalizeAudit(a: Record<string, unknown>): AuditChecklistFinding {
  return {
    program: str(a.program),
    checklist_item: str(a.checklist_item),
    question_text: str(a.question_text),
    answer_type: str(a.answer_type) || "Yes/No/NA",
    citation: str(a.citation),
    evidence_required: str(a.evidence_required),
    risk_level: coerceEnum<RiskLevel>(a.risk_level, riskLevels, "medium"),
    corrective_action_trigger: str(a.corrective_action_trigger),
    responsible_role: str(a.responsible_role),
    frequency: str(a.frequency),
    module_assignment: str(a.module_assignment),
  };
}

const asArray = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === "object") : [];

/**
 * Normalizes parsed model output into a validated StructuredResearchResult.
 * Returns null only when there are no usable findings at all.
 */
export function normalizeStructuredResult(parsed: Record<string, unknown> | null | undefined): StructuredResearchResult | null {
  if (!parsed || typeof parsed !== "object") return null;

  const findings = asArray(parsed.findings)
    .filter((f) => f.title)
    .map(normalizeFinding);

  if (findings.length === 0) return null;

  const scope = (parsed.scope_detected ?? {}) as Record<string, unknown>;

  return {
    research_summary: str(parsed.research_summary),
    scope_detected: {
      industry: str(scope.industry),
      jurisdiction: str(scope.jurisdiction),
      state: str(scope.state),
      program: str(scope.program),
      work_activity: str(scope.work_activity),
      equipment: str(scope.equipment),
      chemicals_materials: str(scope.chemicals_materials),
      vehicle_type: str(scope.vehicle_type),
      hazards: Array.isArray(scope.hazards) ? scope.hazards.map(str).filter(Boolean) : [],
    },
    findings,
    gap_analysis: asArray(parsed.gap_analysis).map(normalizeGap),
    module_recommendations: asArray(parsed.module_recommendations).filter((m) => m.module_name).map(normalizeModuleRec),
    audit_checklist_items: asArray(parsed.audit_checklist_items).map(normalizeAudit),
    human_review_notes: Array.isArray(parsed.human_review_notes) ? parsed.human_review_notes.map(str).filter(Boolean) : [],
    // Always pin the fixed disclaimer regardless of what the model returned (doc §7).
    disclaimer: DEFAULT_LEGAL_DISCLAIMER,
    query: "",
  };
}
