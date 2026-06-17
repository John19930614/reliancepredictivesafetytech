"use server";

import { revalidatePath } from "next/cache";
import { generateWorkflowNotificationsForUser } from "@/lib/notifications/rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";

const proposalPatchAllowList: Record<string, readonly string[]> = {
  demo_requests: ["status"],
  company_clients: ["lifecycle_stage", "status", "owner", "notes"],
  company_operations_records: ["status", "priority", "owner", "due_date", "notes"],
  company_legal_issues: ["status", "owner", "due_date", "resolution_notes"],
  company_checklist_items: ["status", "owner", "due_date", "notes", "completed"],
  client_onboarding_items: ["status", "owner", "due_date", "notes", "completed"],
  company_documents: ["status", "owner", "notes", "renewal_date", "expiration_date"],
  employee_time_cards: ["status", "review_notes"],
  employee_document_assignments: ["verification_status", "rejection_reason", "notes"],
  hr_candidate_intakes: ["status", "notes", "human_decision", "human_decision_notes"],
  employee_payroll_setup_tasks: ["status", "due_date", "notes"],
  website_content_items: ["draft_value", "approved_value", "status", "ai_notes", "metadata"],
  website_operations_events: ["body", "risk_level", "metadata"],
};

async function getCurrentUser() {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  return { supabase, user };
}

async function requireAdmin() {
  const { supabase, user } = await getCurrentUser();
  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  if (!isPortalAdminRole(role?.role)) {
    throw new Error("Admin access is required for workflow proposal decisions.");
  }

  return user;
}

function cleanPatch(targetTable: string, proposedPatch: unknown) {
  if (!proposedPatch || typeof proposedPatch !== "object" || Array.isArray(proposedPatch)) {
    return {};
  }

  const allowedColumns = proposalPatchAllowList[targetTable] ?? [];
  return Object.fromEntries(
    Object.entries(proposedPatch as Record<string, unknown>).filter(([key]) => allowedColumns.includes(key)),
  );
}

export async function generateMyWorkflowNotifications() {
  const { supabase, user } = await getCurrentUser();
  const notifications = await generateWorkflowNotificationsForUser(supabase, user.id);
  revalidatePath("/employee/ai");
  revalidatePath("/employee");

  return { createdCount: notifications.length };
}

export async function markNotificationRead(notificationId: string) {
  const { supabase, user } = await getCurrentUser();
  await supabase
    .from("portal_notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_user_id", user.id);
  revalidatePath("/employee/ai");
}

export async function archiveNotification(notificationId: string) {
  const { supabase, user } = await getCurrentUser();
  await supabase
    .from("portal_notifications")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_user_id", user.id);
  revalidatePath("/employee/ai");
}

export async function rejectWorkflowProposal(formData: FormData) {
  const user = await requireAdmin();
  const admin = createAdminClient();
  const proposalId = String(formData.get("proposal_id") ?? "");
  const approvalNotes = String(formData.get("approval_notes") ?? "").trim() || null;

  if (!admin || !proposalId) {
    throw new Error("Could not reject this proposal.");
  }

  await admin
    .from("workflow_action_proposals")
    .update({
      status: "rejected",
      approval_notes: approvalNotes,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", proposalId);

  revalidatePath("/employee/ai");
}

export async function approveWorkflowProposal(formData: FormData) {
  const user = await requireAdmin();
  const admin = createAdminClient();
  const proposalId = String(formData.get("proposal_id") ?? "");
  const approvalNotes = String(formData.get("approval_notes") ?? "").trim() || null;

  if (!admin || !proposalId) {
    throw new Error("Could not approve this proposal.");
  }

  const { data: proposal, error } = await admin
    .from("workflow_action_proposals")
    .select("*")
    .eq("id", proposalId)
    .eq("status", "pending")
    .maybeSingle();

  if (error || !proposal) {
    throw new Error(error?.message ?? "Proposal not found or already decided.");
  }

  const patch = cleanPatch(proposal.target_table, proposal.proposed_patch);
  const appliedAt = new Date().toISOString();
  let nextStatus = "approved";

  // If the AI proposed a non-empty patch for a specific record but every field
  // was stripped by the column allowlist, the update would silently do nothing.
  // Surface this as an error so the admin knows manual intervention is needed.
  const originalPatch = proposal.proposed_patch;
  if (
    proposal.target_record_id &&
    originalPatch &&
    typeof originalPatch === "object" &&
    !Array.isArray(originalPatch) &&
    Object.keys(originalPatch as object).length > 0 &&
    Object.keys(patch).length === 0
  ) {
    throw new Error(
      "This proposal's patch fields are not permitted for automated application. Review the proposed changes and apply them manually.",
    );
  }

  if (proposal.target_record_id && Object.keys(patch).length > 0) {
    if (proposal.target_table === "website_content_items" && patch.status === "approved") {
      Object.assign(patch, {
        approved_by: user.id,
        approved_at: appliedAt,
      });
    }

    const { error: updateError } = await (admin.from(proposal.target_table as never) as any)
      .update(patch)
      .eq("id", proposal.target_record_id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    nextStatus = "applied";
  }

  await admin
    .from("workflow_action_proposals")
    .update({
      status: nextStatus,
      approval_notes: approvalNotes,
      approved_by: user.id,
      approved_at: appliedAt,
      applied_at: nextStatus === "applied" ? appliedAt : null,
    })
    .eq("id", proposalId);

  revalidatePath("/employee/ai");
  revalidatePath("/employee");
}
