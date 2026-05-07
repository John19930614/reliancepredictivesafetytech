import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanEmployeeActionHref } from "@/lib/ai/task-routing";
import type { Database, Json } from "@/lib/supabase/types";
import { portalAdminRoles } from "@/lib/user-management";

type PortalClient = SupabaseClient<Database>;

export const candidateStatuses = ["new", "screening", "approved_for_invite", "invited", "rejected", "archived"] as const;
export const candidateHumanDecisions = ["pending", "approved_to_invite", "not_selected", "hold"] as const;
export const payrollSetupStatuses = ["not_started", "in_progress", "ready_for_payroll", "completed", "blocked", "not_required"] as const;

export function normalizeStateCode(value: string | null | undefined) {
  const state = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : null;
}

export function payrollSetupDueDate(daysFromNow = 3) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

export async function ensurePayrollSetupTask(
  admin: PortalClient,
  values: {
    userId: string;
    createdBy: string | null;
    jurisdictionState?: string | null;
    sourceCandidateId?: string | null;
    notes?: string | null;
  },
) {
  const jurisdictionState = normalizeStateCode(values.jurisdictionState);
  const { data: existing, error: existingError } = await admin
    .from("employee_payroll_setup_tasks")
    .select("id, jurisdiction_state, source_candidate_id")
    .eq("user_id", values.userId)
    .maybeSingle();

  if (existingError) {
    return existingError;
  }

  if (existing) {
    const { error } = await admin
      .from("employee_payroll_setup_tasks")
      .update({
        jurisdiction_state: jurisdictionState ?? existing.jurisdiction_state,
        source_candidate_id: values.sourceCandidateId ?? existing.source_candidate_id,
      })
      .eq("id", existing.id);

    return error;
  }

  const { error } = await admin.from("employee_payroll_setup_tasks").insert({
      user_id: values.userId,
      source_candidate_id: values.sourceCandidateId ?? null,
      jurisdiction_state: jurisdictionState,
      due_date: payrollSetupDueDate(),
      status: "not_started",
      notes: values.notes ?? "Portal-native payroll setup handoff created with employee onboarding.",
      created_by: values.createdBy,
  });

  return error;
}

export async function getActiveAdminUserIds(admin: PortalClient, preferredUserId?: string | null) {
  const { data, error } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("account_status", "active")
    .in("role", [...portalAdminRoles]);

  if (error) {
    throw new Error(error.message);
  }

  const userIds = [...new Set((data ?? []).map((role) => role.user_id))];
  if (preferredUserId && userIds.includes(preferredUserId)) {
    return [preferredUserId, ...userIds.filter((userId) => userId !== preferredUserId)];
  }

  return userIds;
}

export async function createHrAutomationNotification(
  supabase: PortalClient,
  values: {
    recipientUserId: string;
    title: string;
    body: string;
    priority?: "low" | "medium" | "high" | "critical";
    actionHref?: string | null;
    sourceType: string;
    sourceId?: string | null;
    dedupeKey: string;
    aiSummary?: string | null;
    actorUserId?: string | null;
    targetUserId?: string | null;
    candidateIntakeId?: string | null;
    eventType?: string;
    metadata?: Json;
  },
) {
  const { data: notification, error } = await supabase
    .from("portal_notifications")
    .insert({
      recipient_user_id: values.recipientUserId,
      title: values.title,
      body: values.body,
      priority: values.priority ?? "medium",
      source_type: values.sourceType,
      source_id: values.sourceId ?? null,
      action_href: cleanEmployeeActionHref(values.actionHref, "/employee/ai"),
      ai_summary: values.aiSummary ?? "Created by HR onboarding automation for human review.",
      dedupe_key: values.dedupeKey,
      created_by_ai: true,
      metadata: {
        generated_from: "hr_onboarding_automation",
        ...(values.metadata && typeof values.metadata === "object" && !Array.isArray(values.metadata) ? values.metadata : {}),
      },
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return null;
    }

    throw new Error(error.message);
  }

  await supabase.from("hr_automation_events").insert({
    actor_user_id: values.actorUserId ?? null,
    target_user_id: values.targetUserId ?? values.recipientUserId,
    candidate_intake_id: values.candidateIntakeId ?? null,
    notification_id: notification.id,
    source_type: values.sourceType,
    source_id: values.sourceId ?? null,
    event_type: values.eventType ?? "notification_created",
    title: values.title,
    body: values.body,
    created_by_ai: true,
    metadata: values.metadata ?? {},
  });

  return notification;
}
