import type { DevTask } from "@/lib/dev-command/types";
import { checkPath, isDestructive } from "@/lib/dev-command/path-safety";
import type { WorkflowStage } from "@/lib/dev-command/workflow";

/**
 * Deterministic placeholder agent output, matching the stubbed behavior in
 * the MACO source (real LLM wiring is an explicit follow-up, not built here).
 * Each stage returns a short summary plus the structured rows the caller
 * (runNextStage) should insert for that stage.
 */

export interface StageRunResult {
  agentKey: string;
  summary: string;
  content: string;
}

const STAGE_AGENT: Partial<Record<WorkflowStage, string>> = {
  requirements_review: "product-requirements",
  architecture_review: "platform-architect",
  ui_ux_review: "ui-ux",
  experience_review: "human-experience",
  code_plan: "platform-architect",
  file_change_plan: "backend-api",
  code_draft: "backend-api",
  qa_review: "qa-test",
  security_review: "security-permissions",
  experience_final_review: "accessibility",
  documentation: "documentation",
  release_plan: "devops-release",
};

export function agentForStage(stage: string) {
  return STAGE_AGENT[stage as WorkflowStage] ?? "dev-manager";
}

export function runPlanningStage(stage: WorkflowStage, task: Pick<DevTask, "title" | "description" | "target_area">): StageRunResult {
  const agentKey = agentForStage(stage);
  const summary = `${agentKey} reviewed "${task.title}" for the ${stage.replace(/_/g, " ")} stage.`;
  const content = [
    `Task: ${task.title}`,
    task.description ? `Description: ${task.description}` : null,
    task.target_area ? `Target area: ${task.target_area}` : null,
    "",
    "This is a placeholder draft. Real AI-generated output will replace this once the agent is wired to an LLM.",
  ]
    .filter(Boolean)
    .join("\n");

  return { agentKey, summary, content };
}

export interface FileChangePlanDraft {
  file_path: string;
  change_type: "create" | "modify" | "delete" | "rename";
  rationale: string;
  risk_level: "low" | "medium" | "high" | "critical";
}

export function generateFileChangePlan(task: Pick<DevTask, "title" | "target_area">): FileChangePlanDraft[] {
  const area = task.target_area?.trim() || "app/employee";
  const slug = task.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "task";
  const filePath = `${area.replace(/\/$/, "")}/${slug}.tsx`;
  const { touchesSensitiveArea } = checkPath(filePath);

  return [
    {
      file_path: filePath,
      change_type: "create",
      rationale: `Draft file proposed for "${task.title}".`,
      risk_level: isDestructive("create", filePath) || touchesSensitiveArea ? "high" : "low",
    },
  ];
}

export interface TestResultDraft {
  kind: "unit" | "integration" | "system" | "lint" | "typecheck" | "qa" | "other";
  status: "passed" | "failed" | "error" | "skipped" | "pending";
  summary: string;
  passed: number;
  failed: number;
  skipped: number;
}

export function generateTestResults(task: Pick<DevTask, "title">): TestResultDraft {
  return {
    kind: "qa",
    status: "pending",
    summary: `Placeholder QA pass for "${task.title}" — no automated test run wired up yet.`,
    passed: 0,
    failed: 0,
    skipped: 0,
  };
}

export interface SecurityReviewDraft {
  summary: string;
  findings: Array<{ category: string; severity: "low" | "medium" | "high" | "critical"; note: string }>;
  risk_level: "low" | "medium" | "high" | "critical";
  verdict: "pass" | "fail" | "needs_changes" | "pending";
}

const SECURITY_CHECKS = [
  "Authentication",
  "Authorization",
  "Supabase RLS",
  "API route protection",
  "Server action protection",
  "Dangerous tool permissions",
  "Customer data exposure",
  "Secret exposure",
  "Prompt injection risk",
  "Over-permissioned agents",
];

export function generateSecurityReview(task: Pick<DevTask, "title" | "database_changes_allowed" | "file_changes_allowed">): SecurityReviewDraft {
  const findings = SECURITY_CHECKS.map((category) => ({
    category,
    severity: "low" as const,
    note: "No automated finding yet — placeholder pending real security-agent wiring.",
  }));

  return {
    summary: `Placeholder security review for "${task.title}" across ${SECURITY_CHECKS.length} standard checks.`,
    findings,
    risk_level: task.database_changes_allowed ? "medium" : "low",
    verdict: "pending",
  };
}

export interface ExperienceReviewDraft {
  perspective: "ux" | "plain_english" | "accessibility" | "onboarding" | "simplification" | "other";
  summary: string;
  findings: Array<{ note: string }>;
  score: number | null;
  verdict: "pass" | "fail" | "needs_changes" | "pending";
}

export function generateExperienceReview(task: Pick<DevTask, "title">): ExperienceReviewDraft {
  return {
    perspective: "accessibility",
    summary: `Placeholder experience review for "${task.title}".`,
    findings: [{ note: "No automated finding yet — placeholder pending real experience-agent wiring." }],
    score: null,
    verdict: "pending",
  };
}
