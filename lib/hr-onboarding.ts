import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type SupabaseDatabaseClient = SupabaseClient<Database>;

export async function getPendingRequiredOnboardingCount(admin: SupabaseDatabaseClient, userId: string) {
  const { data: pendingAssignments, error: assignmentError } = await admin
    .from("employee_document_assignments")
    .select("template_id")
    .eq("user_id", userId)
    .eq("status", "pending");

  if (assignmentError) {
    return { count: 0, error: assignmentError };
  }

  const pendingTemplateIds = [...new Set((pendingAssignments ?? []).map((assignment) => assignment.template_id))];

  if (pendingTemplateIds.length === 0) {
    return { count: 0, error: null };
  }

  const { count, error: templateError } = await admin
    .from("hr_document_templates")
    .select("id", { count: "exact", head: true })
    .in("id", pendingTemplateIds)
    .eq("active", true)
    .eq("required", true);

  return { count: count ?? 0, error: templateError };
}

export async function updateEmployeeOnboardingCompletion(admin: SupabaseDatabaseClient, userId: string) {
  const { count, error: countError } = await getPendingRequiredOnboardingCount(admin, userId);

  if (countError) {
    return countError;
  }

  const { error } = await admin
    .from("employee_profiles")
    .update({
      onboarding_status: count > 0 ? "in_progress" : "complete",
      onboarding_completed_at: count > 0 ? null : new Date().toISOString(),
    })
    .eq("user_id", userId);

  return error;
}

export async function assignActiveRequiredHrDocuments(
  admin: SupabaseDatabaseClient,
  userIds: string[],
  assignedBy: string | null,
) {
  const uniqueUserIds = [...new Set(userIds)].filter(Boolean);

  if (uniqueUserIds.length === 0) {
    return null;
  }

  const { data: templates, error: templateError } = await admin
    .from("hr_document_templates")
    .select("id")
    .eq("active", true)
    .eq("required", true);

  if (templateError) {
    return templateError;
  }

  if (!templates || templates.length === 0) {
    for (const userId of uniqueUserIds) {
      const completionError = await updateEmployeeOnboardingCompletion(admin, userId);
      if (completionError) {
        return completionError;
      }
    }

    return null;
  }

  const { error: assignmentError } = await admin.from("employee_document_assignments").upsert(
    uniqueUserIds.flatMap((userId) =>
      templates.map((template) => ({
        user_id: userId,
        template_id: template.id,
        status: "pending",
        assigned_by: assignedBy,
      })),
    ),
    { ignoreDuplicates: true, onConflict: "user_id,template_id" },
  );

  if (assignmentError) {
    return assignmentError;
  }

  for (const userId of uniqueUserIds) {
    const completionError = await updateEmployeeOnboardingCompletion(admin, userId);
    if (completionError) {
      return completionError;
    }
  }

  return null;
}
