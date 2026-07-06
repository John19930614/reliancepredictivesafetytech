export const WORKFLOW_STAGES = [
  "intake",
  "requirements_review",
  "architecture_review",
  "ui_ux_review",
  "experience_review",
  "code_plan",
  "file_change_plan",
  "approval_required",
  "approved_for_drafting",
  "code_draft",
  "qa_review",
  "security_review",
  "experience_final_review",
  "documentation",
  "release_plan",
  "human_final_approval",
  "complete",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

const GATE_STAGES = new Set<WorkflowStage>(["approval_required", "human_final_approval"]);
const TERMINAL_STAGES = new Set(["complete", "rejected", "blocked"]);

export function isGate(stage: string | null | undefined) {
  return GATE_STAGES.has(stage as WorkflowStage);
}

export function isTerminal(stage: string | null | undefined) {
  return TERMINAL_STAGES.has(stage as WorkflowStage);
}

export function nextStage(current: string | null | undefined): WorkflowStage | null {
  const index = WORKFLOW_STAGES.indexOf(current as WorkflowStage);

  if (index === -1 || index === WORKFLOW_STAGES.length - 1) {
    return null;
  }

  return WORKFLOW_STAGES[index + 1];
}

export function stageIndex(stage: string | null | undefined) {
  return WORKFLOW_STAGES.indexOf(stage as WorkflowStage);
}

/** Which agent phase (dev_agent_runs.phase) drives a given workflow stage. */
export function phaseForStage(stage: string | null | undefined) {
  switch (stage as WorkflowStage) {
    case "requirements_review":
      return "plan";
    case "architecture_review":
    case "code_plan":
      return "design";
    case "ui_ux_review":
    case "experience_review":
    case "experience_final_review":
      return "review";
    case "file_change_plan":
      return "recommend";
    case "code_draft":
      return "draft";
    case "qa_review":
      return "test";
    case "security_review":
      return "review";
    case "documentation":
      return "document";
    case "release_plan":
      return "recommend";
    default:
      return "other";
  }
}
