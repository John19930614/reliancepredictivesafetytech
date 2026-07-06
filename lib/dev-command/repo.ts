import { requireClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export async function getDevTasks() {
  const supabase = await requireClient();
  const { data } = await supabase.from("dev_tasks").select("*").order("created_at", { ascending: false });
  return data ?? [];
}

export async function getTaskDetail(taskId: string) {
  const supabase = await requireClient();

  const [{ data: task }, { data: runs }, { data: artifacts }, { data: fileChangePlans }, { data: approvals }, { data: testResults }, { data: securityReviews }, { data: experienceReviews }, { data: auditLog }] = await Promise.all([
    supabase.from("dev_tasks").select("*").eq("id", taskId).maybeSingle(),
    supabase.from("dev_agent_runs").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    supabase.from("dev_artifacts").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    supabase.from("dev_file_change_plans").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    supabase.from("dev_approvals").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    supabase.from("dev_test_results").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    supabase.from("dev_security_reviews").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    supabase.from("dev_experience_reviews").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    supabase.from("dev_audit_log").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
  ]);

  return {
    task: task ?? null,
    runs: runs ?? [],
    artifacts: artifacts ?? [],
    fileChangePlans: fileChangePlans ?? [],
    approvals: approvals ?? [],
    testResults: testResults ?? [],
    securityReviews: securityReviews ?? [],
    experienceReviews: experienceReviews ?? [],
    auditLog: auditLog ?? [],
  };
}

export async function getDevAgents() {
  const supabase = await requireClient();
  const { data } = await supabase.from("dev_agents").select("*").order("sort_order");
  return data ?? [];
}

export async function getPendingApprovals() {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("dev_approvals")
    .select("*, dev_tasks(title)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function getDashboardCounts() {
  const supabase = await requireClient();

  const [{ count: openTasks }, { count: pendingApprovals }, { count: totalAgents }] = await Promise.all([
    supabase.from("dev_tasks").select("*", { count: "exact", head: true }).not("status", "in", "(done,rejected,cancelled,failed)"),
    supabase.from("dev_approvals").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("dev_agents").select("*", { count: "exact", head: true }).eq("status", "active"),
  ]);

  return {
    openTasks: openTasks ?? 0,
    pendingApprovals: pendingApprovals ?? 0,
    totalAgents: totalAgents ?? 0,
  };
}

export async function getRecentAuditLog(limit = 20) {
  const supabase = await requireClient();
  const { data } = await supabase.from("dev_audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export async function logDevAudit(entry: {
  task_id?: string | null;
  actor_type: "agent" | "human" | "system";
  actor_id?: string | null;
  agent_id?: string | null;
  action: string;
  entity?: string | null;
  entity_id?: string | null;
  risk_level?: string;
  detail?: Record<string, Json>;
}) {
  const supabase = await requireClient();
  await supabase.from("dev_audit_log").insert({ ...entry, detail: entry.detail ?? {} });
}
