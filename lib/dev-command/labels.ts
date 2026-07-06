export const STAGE_LABELS: Record<string, string> = {
  intake: "Intake",
  requirements_review: "Requirements Review",
  architecture_review: "Architecture Review",
  ui_ux_review: "UI/UX Review",
  experience_review: "Experience Review",
  code_plan: "Code Plan",
  file_change_plan: "File Change Plan",
  approval_required: "Approval Required",
  approved_for_drafting: "Approved for Drafting",
  code_draft: "Code Draft",
  qa_review: "QA Review",
  security_review: "Security Review",
  experience_final_review: "Experience Final Review",
  documentation: "Documentation",
  release_plan: "Release Plan",
  human_final_approval: "Human Final Approval",
  complete: "Complete",
  rejected: "Rejected",
  blocked: "Blocked",
};

export const RISK_LEVEL_COLORS: Record<string, string> = {
  low: "#42d392",
  medium: "#f5a623",
  high: "#ff9d5c",
  critical: "#ff6b6b",
};

export const APPROVAL_TYPE_LABELS: Record<string, string> = {
  database_change: "Database Change",
  auth_permission_change: "Auth/Permission Change",
  rls_policy_change: "RLS Policy Change",
  file_write: "File Write",
  file_delete: "File Delete",
  github_branch: "GitHub Branch",
  pull_request: "Pull Request",
  deployment: "Deployment",
  production_release: "Production Release",
  environment_variable_change: "Environment Variable Change",
  ai_tool_permission_change: "AI Tool Permission Change",
  delete_action: "Delete Action",
};

export const APPROVAL_STATUS_COLORS: Record<string, string> = {
  pending: "#f5a623",
  approved: "#42d392",
  rejected: "#ff6b6b",
  needs_revision: "#c8a2ff",
  expired: "#bfb7a3",
  cancelled: "#bfb7a3",
};

export function formatStageLabel(stage: string | null | undefined) {
  if (!stage) return "—";
  return STAGE_LABELS[stage] ?? stage;
}
