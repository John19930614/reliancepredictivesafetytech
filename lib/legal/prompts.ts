import type { ResearchRunInput } from "./types";

export interface PromptTemplate {
  template_key: string;
  name: string;
  template_text: string;
  requires_human_review: boolean;
}

/**
 * Default editable AI prompt templates (doc §13). These mirror the rows seeded
 * into `legal_prompt_templates` so the module works even before an admin edits
 * them in the UI.
 */
export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    template_key: "build_legal_register",
    name: "Build Legal Register",
    template_text:
      "Act as a senior safety compliance researcher. Build a legal register for [industry] in [state/jurisdiction] for [program/work activity]. Identify federal, state, and local requirements. Separate laws/regulations from agency guidance, standards, and best practices. Include citations, source links, applicability, required actions, documentation, training, inspections, recordkeeping, risk level, confidence level, and human review flags.",
    requires_human_review: true,
  },
  {
    template_key: "gap_analysis",
    name: "Gap Analysis",
    template_text:
      "Compare this existing safety program against current regulatory requirements and recognized guidance. Identify what is covered, missing, outdated, unclear, or needs review. Recommend legal register updates, module updates, checklist items, training requirements, permit requirements, and corrective actions.",
    requires_human_review: true,
  },
  {
    template_key: "module_builder",
    name: "Module Builder",
    template_text:
      "Using the legal register findings, recommend the platform module structure needed to manage compliance. Include dashboards, forms, workflows, alerts, permits, inspections, training, document control, corrective actions, review queues, and reports.",
    requires_human_review: false,
  },
  {
    template_key: "audit_checklist_builder",
    name: "Audit Checklist Builder",
    template_text:
      "Convert these legal register requirements into a practical audit checklist. Each checklist item should include the regulation/guidance source, yes/no/NA answer type, evidence required, risk level, corrective action trigger, responsible role, frequency, and module assignment.",
    requires_human_review: false,
  },
  {
    template_key: "change_tracker",
    name: "Change Tracker",
    template_text:
      "Review the new findings against the existing register and clearly identify what was added, changed, removed, or needs review. Highlight all updates for the user.",
    requires_human_review: false,
  },
];

/**
 * Replaces `[placeholder]` tokens in a template with values from `vars`.
 * Unknown or empty placeholders are left intact so the gap is visible to the
 * user (and to the AI gateway) rather than silently dropped.
 */
export function resolveTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\[([^\]]+)\]/g, (full, rawKey: string) => {
    const value = vars[rawKey.trim()];
    return value && value.trim() ? value.trim() : full;
  });
}

/** Maps a research-run form input to the bracket keys used in the templates. */
export function buildTemplateVars(input: ResearchRunInput): Record<string, string | undefined> {
  const jurisdiction = [input.state, input.jurisdiction].filter(Boolean).join(" / ") || input.jurisdiction;
  const programActivity = [input.program, input.work_activity].filter(Boolean).join(" — ") || input.program;
  return {
    industry: input.industry,
    "state/jurisdiction": jurisdiction,
    "program/work activity": programActivity,
    program: input.program,
    state: input.state,
    jurisdiction: input.jurisdiction,
    "work activity": input.work_activity,
  };
}
