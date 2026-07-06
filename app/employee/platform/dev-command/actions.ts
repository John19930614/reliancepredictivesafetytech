"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/supabase/server";
import { logDevAudit } from "@/lib/dev-command/repo";
import { agentForStage, generateExperienceReview, generateFileChangePlan, generateSecurityReview, generateTestResults, runPlanningStage } from "@/lib/dev-command/stage-runners";
import { isGate, isTerminal, nextStage, phaseForStage, type WorkflowStage } from "@/lib/dev-command/workflow";

export async function createDevTask(form: FormData) {
  const supabase = await requireClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const title = String(form.get("title") ?? "").trim();
  if (!title) {
    throw new Error("Title is required");
  }

  const { data: task, error } = await supabase
    .from("dev_tasks")
    .insert({
      title,
      description: form.get("description") ? String(form.get("description")) : null,
      target_area: form.get("target_area") ? String(form.get("target_area")) : null,
      priority: String(form.get("priority") ?? "medium"),
      risk_level: String(form.get("risk_level") ?? "low"),
      database_changes_allowed: form.get("database_changes_allowed") === "on",
      file_changes_allowed: form.get("file_changes_allowed") === "on",
      github_branch_allowed: form.get("github_branch_allowed") === "on",
      deployment_allowed: form.get("deployment_allowed") === "on",
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !task) {
    throw new Error(error?.message ?? "Failed to create task");
  }

  await logDevAudit({
    task_id: task.id,
    actor_type: "human",
    actor_id: user?.id ?? null,
    action: "task_created",
    entity: "dev_tasks",
    entity_id: task.id,
    detail: { title },
  });

  revalidatePath("/employee/platform/dev-command/tasks");
  redirect(`/employee/platform/dev-command/tasks/${task.id}`);
}

function approvalTypeForTask(task: { database_changes_allowed: boolean; file_changes_allowed: boolean; github_branch_allowed: boolean; deployment_allowed: boolean }) {
  if (task.database_changes_allowed) return "database_change";
  if (task.deployment_allowed) return "deployment";
  if (task.github_branch_allowed) return "github_branch";
  return "file_write";
}

export async function runNextStage(taskId: string) {
  const supabase = await requireClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: task } = await supabase.from("dev_tasks").select("*").eq("id", taskId).maybeSingle();
  if (!task) {
    throw new Error("Task not found");
  }

  if (isTerminal(task.stage)) {
    return;
  }

  if (isGate(task.stage)) {
    // Already paused at a gate awaiting a human decision — nothing to run.
    return;
  }

  const target = nextStage(task.stage) as WorkflowStage | null;
  if (!target) {
    return;
  }

  const agentKey = agentForStage(target);
  const { data: agent } = await supabase.from("dev_agents").select("id").eq("key", agentKey).maybeSingle();

  const { data: run } = await supabase
    .from("dev_agent_runs")
    .insert({
      task_id: taskId,
      agent_id: agent?.id ?? null,
      phase: phaseForStage(target),
      status: "succeeded",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  const draft = runPlanningStage(target, task);
  await supabase.from("dev_agent_messages").insert({
    run_id: run?.id ?? null,
    task_id: taskId,
    agent_id: agent?.id ?? null,
    role: "assistant",
    content: draft.content,
  });
  await supabase.from("dev_artifacts").insert({
    task_id: taskId,
    run_id: run?.id ?? null,
    kind: "summary",
    title: draft.summary,
    content: draft.content,
    status: "proposed",
    created_by: user?.id ?? null,
  });

  if (target === "file_change_plan") {
    const plans = generateFileChangePlan(task);
    await supabase.from("dev_file_change_plans").insert(
      plans.map((plan) => ({
        task_id: taskId,
        file_path: plan.file_path,
        change_type: plan.change_type,
        rationale: plan.rationale,
        risk_level: plan.risk_level,
      })),
    );
  }

  if (target === "qa_review") {
    const results = generateTestResults(task);
    await supabase.from("dev_test_results").insert({ task_id: taskId, run_id: run?.id ?? null, ...results });
  }

  if (target === "security_review") {
    const review = generateSecurityReview(task);
    await supabase.from("dev_security_reviews").insert({
      task_id: taskId,
      run_id: run?.id ?? null,
      reviewer_agent_id: agent?.id ?? null,
      summary: review.summary,
      findings: review.findings,
      risk_level: review.risk_level,
      verdict: review.verdict,
    });
  }

  if (target === "experience_final_review") {
    const review = generateExperienceReview(task);
    await supabase.from("dev_experience_reviews").insert({
      task_id: taskId,
      run_id: run?.id ?? null,
      reviewer_agent_id: agent?.id ?? null,
      perspective: review.perspective,
      summary: review.summary,
      findings: review.findings,
      score: review.score,
      verdict: review.verdict,
    });
  }

  const nextStatus = isGate(target) ? "awaiting_approval" : "in_progress";
  await supabase.from("dev_tasks").update({ stage: target, status: nextStatus }).eq("id", taskId);

  if (isGate(target)) {
    await supabase.from("dev_approvals").insert({
      task_id: taskId,
      approval_type: approvalTypeForTask(task),
      risk_level: task.risk_level,
      summary: `${target === "human_final_approval" ? "Final release approval" : "Plan approval"} needed for "${task.title}".`,
      plain_english_summary: `A human needs to review and approve this before "${task.title}" can continue.`,
      requested_by: user?.id ?? null,
    });
  }

  await logDevAudit({
    task_id: taskId,
    actor_type: "agent",
    agent_id: agent?.id ?? null,
    action: "stage_advanced",
    entity: "dev_tasks",
    entity_id: taskId,
    risk_level: task.risk_level,
    detail: { from: task.stage, to: target },
  });

  revalidatePath(`/employee/platform/dev-command/tasks/${taskId}`);
  revalidatePath("/employee/platform/dev-command/approvals");
}

export async function decideApproval(approvalId: string, decision: "approved" | "rejected", note?: string) {
  const supabase = await requireClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: approval } = await supabase.from("dev_approvals").select("*").eq("id", approvalId).maybeSingle();
  if (!approval || approval.status !== "pending") {
    return;
  }

  await supabase
    .from("dev_approvals")
    .update({ status: decision, decided_by: user?.id ?? null, decided_at: new Date().toISOString(), decision_note: note ?? null })
    .eq("id", approvalId);

  if (approval.task_id) {
    const { data: task } = await supabase.from("dev_tasks").select("stage").eq("id", approval.task_id).maybeSingle();

    if (decision === "rejected") {
      await supabase.from("dev_tasks").update({ stage: "rejected", status: "rejected" }).eq("id", approval.task_id);
    } else if (task && isGate(task.stage)) {
      const target = nextStage(task.stage);
      if (target) {
        await supabase
          .from("dev_tasks")
          .update({ stage: target, status: target === "complete" ? "done" : "in_progress" })
          .eq("id", approval.task_id);
      }
    }

    await logDevAudit({
      task_id: approval.task_id,
      actor_type: "human",
      actor_id: user?.id ?? null,
      action: decision === "approved" ? "approval_granted" : "approval_rejected",
      entity: "dev_approvals",
      entity_id: approvalId,
      risk_level: approval.risk_level,
      detail: { note: note ?? null },
    });
  }

  revalidatePath("/employee/platform/dev-command/approvals");
  if (approval.task_id) {
    revalidatePath(`/employee/platform/dev-command/tasks/${approval.task_id}`);
  }
}
