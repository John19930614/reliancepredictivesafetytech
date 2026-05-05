"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

async function getAuthorizedAdmin(profileUserId: string) {
  const supabase = await createClient();

  if (!supabase) {
    redirect(`/employee/users/${profileUserId}?error=Supabase is not configured yet.`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/employee-login?next=/employee/users/${profileUserId}`);
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!role || role.account_status !== "active" || !isPortalAdminRole(role.role)) {
    redirect(`/employee/users/${profileUserId}?error=Only portal admins can update employee onboarding.`);
  }

  return user;
}

function getAdminClientOrRedirect(profileUserId: string) {
  const admin = createAdminClient();

  if (!admin) {
    redirect(`/employee/users/${profileUserId}?error=Add SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY before updating onboarding.`);
  }

  return admin;
}

async function updateProfileCompletion(userId: string) {
  const admin = createAdminClient();

  if (!admin) {
    return;
  }

  const { count } = await admin
    .from("employee_document_assignments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");

  await admin
    .from("employee_profiles")
    .update({
      onboarding_status: (count ?? 0) > 0 ? "in_progress" : "complete",
      onboarding_completed_at: (count ?? 0) > 0 ? null : new Date().toISOString(),
    })
    .eq("user_id", userId);
}

export async function attachExistingEmployeeDocument(formData: FormData) {
  const profileUserId = cleanText(formData.get("profile_user_id"));
  const assignmentId = cleanText(formData.get("assignment_id"));
  const documentId = cleanText(formData.get("existing_document_id"));
  const notes = cleanText(formData.get("notes"));

  if (!profileUserId || !assignmentId || !documentId) {
    redirect(`/employee/users/${profileUserId || ""}?error=Choose an employee, requirement, and existing document.`);
  }

  const currentUser = await getAuthorizedAdmin(profileUserId);
  const admin = getAdminClientOrRedirect(profileUserId);

  const { data: assignment } = await admin
    .from("employee_document_assignments")
    .select("id, user_id, status")
    .eq("id", assignmentId)
    .eq("user_id", profileUserId)
    .maybeSingle();

  if (!assignment) {
    redirect(`/employee/users/${profileUserId}?error=Onboarding assignment was not found.`);
  }

  const { data: document } = await admin
    .from("company_documents")
    .select("id, title")
    .eq("id", documentId)
    .maybeSingle();

  if (!document) {
    redirect(`/employee/users/${profileUserId}?error=Existing document was not found.`);
  }

  const waivedAt = new Date().toISOString();
  const { error } = await admin
    .from("employee_document_assignments")
    .update({
      status: "waived",
      existing_document_id: document.id,
      waived_at: waivedAt,
      assigned_by: currentUser.id,
      notes: notes || `Satisfied by existing document: ${document.title}`,
    })
    .eq("id", assignment.id)
    .eq("user_id", profileUserId);

  if (error) {
    redirect(`/employee/users/${profileUserId}?error=${encodeURIComponent(error.message)}`);
  }

  await updateProfileCompletion(profileUserId);

  revalidatePath("/employee/users");
  revalidatePath(`/employee/users/${profileUserId}`);
  redirect(`/employee/users/${profileUserId}?message=Existing document attached and requirement bypassed.`);
}
