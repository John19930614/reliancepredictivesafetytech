"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeStateCode, payrollSetupStatuses } from "@/lib/hr-automation";
import { updateEmployeeOnboardingCompletion } from "@/lib/hr-onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole, isPortalSuperAdminRole } from "@/lib/user-management";

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

async function getAuthorizedSuperAdmin(profileUserId: string) {
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

  if (!role || role.account_status !== "active" || !isPortalSuperAdminRole(role.role)) {
    redirect(`/employee/users/${profileUserId}?error=Only super admins can edit employee profiles.`);
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
    return null;
  }

  return updateEmployeeOnboardingCompletion(admin, userId);
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
      verification_status: "waived",
      verified_by: currentUser.id,
      verified_at: waivedAt,
      rejection_reason: null,
      assigned_by: currentUser.id,
      notes: notes || `Satisfied by existing document: ${document.title}`,
    })
    .eq("id", assignment.id)
    .eq("user_id", profileUserId);

  if (error) {
    redirect(`/employee/users/${profileUserId}?error=${encodeURIComponent(error.message)}`);
  }

  const completionError = await updateProfileCompletion(profileUserId);

  if (completionError) {
    redirect(`/employee/users/${profileUserId}?error=${encodeURIComponent(completionError.message)}`);
  }

  await admin.from("employee_onboarding_audit_events").insert({
    assignment_id: assignment.id,
    user_id: profileUserId,
    actor_user_id: currentUser.id,
    event_type: "satisfied_by_uploaded_record",
    event_details: { document_id: document.id, document_title: document.title, notes },
  });

  revalidatePath("/employee/users");
  revalidatePath(`/employee/users/${profileUserId}`);
  redirect(`/employee/users/${profileUserId}?message=Requirement satisfied by uploaded record.`);
}

export async function reviewEmployeeOnboardingUpload(formData: FormData) {
  const profileUserId = cleanText(formData.get("profile_user_id"));
  const assignmentId = cleanText(formData.get("assignment_id"));
  const uploadId = cleanText(formData.get("upload_id"));
  const decision = cleanText(formData.get("decision"));
  const reviewNotes = cleanText(formData.get("review_notes"));
  const retentionUntil = cleanText(formData.get("retention_until")) || null;
  const legalHold = formData.get("legal_hold") === "on";

  if (!profileUserId || !assignmentId || !uploadId || !["approve", "reject"].includes(decision)) {
    redirect(`/employee/users/${profileUserId || ""}?error=Choose an upload and review decision.`);
  }

  const currentUser = await getAuthorizedAdmin(profileUserId);
  const admin = getAdminClientOrRedirect(profileUserId);

  const { data: upload } = await admin
    .from("employee_onboarding_uploads")
    .select("*")
    .eq("id", uploadId)
    .eq("assignment_id", assignmentId)
    .eq("user_id", profileUserId)
    .maybeSingle();

  if (!upload) {
    redirect(`/employee/users/${profileUserId}?error=Onboarding upload was not found.`);
  }

  const reviewedAt = new Date().toISOString();
  const approved = decision === "approve";
  const { error: uploadError } = await admin
    .from("employee_onboarding_uploads")
    .update({
      upload_status: approved ? "approved" : "rejected",
      review_notes: reviewNotes || (approved ? "Approved by admin review." : "Rejected by admin review."),
      reviewed_by: currentUser.id,
      reviewed_at: reviewedAt,
    })
    .eq("id", upload.id);

  if (uploadError) {
    redirect(`/employee/users/${profileUserId}?error=${encodeURIComponent(uploadError.message)}`);
  }

  const { error: assignmentError } = await admin
    .from("employee_document_assignments")
    .update(
      approved
        ? {
            status: "signed",
            signed_at: reviewedAt,
            verification_status: "approved",
            verified_by: currentUser.id,
            verified_at: reviewedAt,
            rejection_reason: null,
            retention_until: retentionUntil,
            legal_hold: legalHold,
            notes: reviewNotes || `Approved upload: ${upload.file_name}`,
          }
        : {
            status: "pending",
            verification_status: "rejected",
            verified_by: currentUser.id,
            verified_at: reviewedAt,
            rejection_reason: reviewNotes || "Upload rejected. Please replace the file.",
            retention_until: retentionUntil,
            legal_hold: legalHold,
            notes: reviewNotes || `Rejected upload: ${upload.file_name}`,
          },
    )
    .eq("id", assignmentId)
    .eq("user_id", profileUserId);

  if (assignmentError) {
    redirect(`/employee/users/${profileUserId}?error=${encodeURIComponent(assignmentError.message)}`);
  }

  const completionError = await updateProfileCompletion(profileUserId);

  if (completionError) {
    redirect(`/employee/users/${profileUserId}?error=${encodeURIComponent(completionError.message)}`);
  }

  await admin.from("employee_onboarding_audit_events").insert({
    assignment_id: assignmentId,
    user_id: profileUserId,
    actor_user_id: currentUser.id,
    event_type: approved ? "upload_approved" : "upload_rejected",
    event_details: {
      upload_id: upload.id,
      file_name: upload.file_name,
      file_sha256: upload.file_sha256,
      review_notes: reviewNotes,
      retention_until: retentionUntil,
      legal_hold: legalHold,
    },
  });

  revalidatePath("/employee/users");
  revalidatePath(`/employee/users/${profileUserId}`);
  revalidatePath("/employee/hr-onboarding");
  redirect(`/employee/users/${profileUserId}?message=${approved ? "Upload approved and requirement completed." : "Upload rejected. Employee can replace it."}`);
}

export async function updateEmployeeProfileDetails(formData: FormData) {
  const profileUserId = cleanText(formData.get("profile_user_id"));
  const legalName = cleanText(formData.get("legal_name"));
  const displayName = cleanText(formData.get("display_name"));
  const email = cleanText(formData.get("email")).toLowerCase();
  const phone = cleanText(formData.get("phone")) || null;
  const emergencyContactName = cleanText(formData.get("emergency_contact_name")) || null;
  const emergencyContactPhone = cleanText(formData.get("emergency_contact_phone")) || null;
  const emergencyContactRelationship = cleanText(formData.get("emergency_contact_relationship")) || null;
  const profileStatus = cleanText(formData.get("profile_status")) === "archived" ? "archived" : "active";
  const timeCardRoleId = cleanText(formData.get("time_card_role_id")) || null;
  const workState = normalizeStateCode(cleanText(formData.get("work_state")));

  if (!profileUserId) {
    redirect("/employee/users?error=Choose an employee profile to update.");
  }

  await getAuthorizedSuperAdmin(profileUserId);
  const admin = getAdminClientOrRedirect(profileUserId);
  const normalizedDisplayName = displayName || legalName || null;

  if (!email) {
    redirect(`/employee/users/${profileUserId}?error=Employee email is required.`);
  }

  const { data: targetUser, error: targetUserError } = await admin.auth.admin.getUserById(profileUserId);

  if (targetUserError) {
    redirect(`/employee/users/${profileUserId}?error=${encodeURIComponent(targetUserError.message)}`);
  }

  const { error: authError } = await admin.auth.admin.updateUserById(profileUserId, {
    email,
    user_metadata: {
      ...(targetUser.user?.user_metadata ?? {}),
      display_name: normalizedDisplayName,
    },
  });

  if (authError) {
    redirect(`/employee/users/${profileUserId}?error=${encodeURIComponent(authError.message)}`);
  }

  const { error: profileError } = await admin.from("employee_profiles").upsert({
    user_id: profileUserId,
    legal_name: legalName || null,
    display_name: normalizedDisplayName,
    email,
    phone,
    emergency_contact_name: emergencyContactName,
    emergency_contact_phone: emergencyContactPhone,
    emergency_contact_relationship: emergencyContactRelationship,
    profile_status: profileStatus,
    time_card_role_id: timeCardRoleId,
    work_state: workState,
  });

  if (profileError) {
    redirect(`/employee/users/${profileUserId}?error=${encodeURIComponent(profileError.message)}`);
  }

  await admin
    .from("employee_payroll_setup_tasks")
    .update({ jurisdiction_state: workState })
    .eq("user_id", profileUserId)
    .neq("status", "completed");

  const { data: role } = await admin
    .from("user_roles")
    .select("role, team, account_status")
    .eq("user_id", profileUserId)
    .maybeSingle();

  const { error: chatProfileError } = await admin.from("employee_chat_profiles").upsert({
    user_id: profileUserId,
    display_name: normalizedDisplayName,
    email,
    role: role?.role ?? "employee",
    team: role?.team ?? null,
    account_status: profileStatus === "archived" ? "archived" : (role?.account_status ?? "active"),
  });

  if (chatProfileError) {
    redirect(`/employee/users/${profileUserId}?error=${encodeURIComponent(chatProfileError.message)}`);
  }

  revalidatePath("/employee/users");
  revalidatePath(`/employee/users/${profileUserId}`);
  revalidatePath("/employee/company-tree");
  revalidatePath("/employee/time-cards");
  redirect(`/employee/users/${profileUserId}?message=Employee profile updated.`);
}

export async function updatePayrollSetupTask(formData: FormData) {
  const profileUserId = cleanText(formData.get("profile_user_id"));
  const taskId = cleanText(formData.get("payroll_setup_task_id"));
  const status = cleanText(formData.get("status"));
  const jurisdictionState = normalizeStateCode(cleanText(formData.get("jurisdiction_state")));
  const payrollProvider = cleanText(formData.get("payroll_provider")) || null;
  const dueDate = cleanText(formData.get("due_date")) || null;
  const notes = cleanText(formData.get("notes")) || null;

  if (!profileUserId || !taskId || !payrollSetupStatuses.includes(status as (typeof payrollSetupStatuses)[number])) {
    redirect(`/employee/users/${profileUserId || ""}?error=Choose an employee payroll setup task and valid status.`);
  }

  const currentUser = await getAuthorizedAdmin(profileUserId);
  const admin = getAdminClientOrRedirect(profileUserId);
  const reviewed = status === "completed" || status === "not_required";
  const reviewedAt = reviewed ? new Date().toISOString() : null;

  const { error } = await admin
    .from("employee_payroll_setup_tasks")
    .update({
      status,
      jurisdiction_state: jurisdictionState,
      payroll_provider: payrollProvider,
      due_date: dueDate,
      w4_received: formData.get("w4_received") === "on",
      i9_reviewed: formData.get("i9_reviewed") === "on",
      direct_deposit_ready: formData.get("direct_deposit_ready") === "on",
      state_new_hire_reported: formData.get("state_new_hire_reported") === "on",
      benefits_reviewed: formData.get("benefits_reviewed") === "on",
      reviewed_by: reviewed ? currentUser.id : null,
      reviewed_at: reviewedAt,
      notes,
    })
    .eq("id", taskId)
    .eq("user_id", profileUserId);

  if (error) {
    redirect(`/employee/users/${profileUserId}?error=${encodeURIComponent(error.message)}`);
  }

  await admin.from("hr_automation_events").insert({
    actor_user_id: currentUser.id,
    target_user_id: profileUserId,
    source_type: "employee_payroll_setup_task",
    source_id: taskId,
    event_type: "payroll_setup_updated",
    title: "Payroll setup updated",
    body: `Payroll setup marked ${status.replace("_", " ")}.`,
    created_by_ai: false,
    metadata: { status, due_date: dueDate, jurisdiction_state: jurisdictionState },
  });

  revalidatePath("/employee/users");
  revalidatePath(`/employee/users/${profileUserId}`);
  revalidatePath("/employee/ai");
  redirect(`/employee/users/${profileUserId}?message=Payroll setup updated.`);
}
