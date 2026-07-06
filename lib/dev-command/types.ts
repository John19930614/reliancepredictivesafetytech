import type { Database } from "@/lib/supabase/types";

export type DevTask = Database["public"]["Tables"]["dev_tasks"]["Row"];
export type DevAgent = Database["public"]["Tables"]["dev_agents"]["Row"];
export type DevAgentRun = Database["public"]["Tables"]["dev_agent_runs"]["Row"];
export type DevAgentMessage = Database["public"]["Tables"]["dev_agent_messages"]["Row"];
export type DevArtifact = Database["public"]["Tables"]["dev_artifacts"]["Row"];
export type DevFileChangePlan = Database["public"]["Tables"]["dev_file_change_plans"]["Row"];
export type DevCodeReview = Database["public"]["Tables"]["dev_code_reviews"]["Row"];
export type DevTestResult = Database["public"]["Tables"]["dev_test_results"]["Row"];
export type DevSecurityReview = Database["public"]["Tables"]["dev_security_reviews"]["Row"];
export type DevExperienceReview = Database["public"]["Tables"]["dev_experience_reviews"]["Row"];
export type DevApproval = Database["public"]["Tables"]["dev_approvals"]["Row"];
export type DevDeployment = Database["public"]["Tables"]["dev_deployments"]["Row"];
export type DevAuditLogEntry = Database["public"]["Tables"]["dev_audit_log"]["Row"];
export type DevAgentMemory = Database["public"]["Tables"]["dev_agent_memory"]["Row"];
export type DevToolPermission = Database["public"]["Tables"]["dev_tool_permissions"]["Row"];
export type DevFeedback = Database["public"]["Tables"]["dev_feedback"]["Row"];

export type DevTaskStage = DevTask["stage"];
export type DevApprovalType = DevApproval["approval_type"];
export type DevRiskLevel = "low" | "medium" | "high" | "critical";
