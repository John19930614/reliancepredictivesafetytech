"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensurePayrollSetupTask, normalizeStateCode } from "@/lib/hr-automation";
import { assignActiveRequiredHrDocuments } from "@/lib/hr-onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole, portalUserRoles, type PortalUserRole } from "@/lib/user-management";

type SupabaseAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const siteUrl = "https://reliancepredictivesafetytechnologies.com";
const employeePortalUrl = `${siteUrl}/employee`;

function usersPath(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return `/employee/users?${searchParams.toString()}`;
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function buildCompanyAuthLink(tokenHash: string, type: "invite" | "recovery") {
  const url = new URL("/auth/confirm", siteUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", type === "recovery" ? "/auth/update-password" : "/employee");
  return url.toString();
}

function isPortalUserRole(value: string): value is PortalUserRole {
  return portalUserRoles.includes(value as PortalUserRole);
}

async function getAuthorizedAdmin() {
  const supabase = await createClient();

  if (!supabase) {
    redirect(usersPath({ error: "Supabase is not configured yet." }));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employee-login?next=/employee/users");
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!role || role.account_status !== "active" || !isPortalAdminRole(role.role)) {
    redirect(usersPath({ error: "Only portal admins can manage users." }));
  }

  return user;
}

function getAdminClientOrRedirect() {
  const admin = createAdminClient();

  if (!admin) {
    redirect(usersPath({ error: "Add SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY before managing users." }));
  }

  return admin;
}

async function createEmployeeProfileAndAssignments(
  admin: SupabaseAdminClient,
  userId: string,
  legalName: string,
  email: string,
  timeCardRoleId: string | null,
  assignedBy: string,
  jurisdictionState: string | null,
  sourceCandidateId?: string | null,
) {
  const { error: profileError } = await admin.from("employee_profiles").upsert({
    user_id: userId,
    legal_name: legalName || null,
    display_name: legalName || null,
    email,
    profile_status: "active",
    time_card_role_id: timeCardRoleId,
    work_state: jurisdictionState,
    onboarding_status: "not_started",
  });

  if (profileError) {
    return profileError;
  }

  const assignmentError = await assignActiveRequiredHrDocuments(admin, [userId], assignedBy);

  if (assignmentError) {
    return assignmentError;
  }

  return ensurePayrollSetupTask(admin, {
    userId,
    createdBy: assignedBy,
    jurisdictionState,
    sourceCandidateId,
  });
}

async function upsertEmployeeChatProfile(
  admin: SupabaseAdminClient,
  values: {
    userId: string;
    displayName?: string | null;
    email?: string | null;
    role?: string;
    team?: string | null;
    accountStatus?: string;
  },
) {
  const { error } = await admin.from("employee_chat_profiles").upsert({
    user_id: values.userId,
    display_name: values.displayName || null,
    email: values.email || null,
    role: values.role ?? "employee",
    team: values.team || null,
    account_status: values.accountStatus ?? "active",
  });

  if (isMissingSchemaRelationError(error)) {
    return null;
  }

  return error;
}

type PortalUserSetupValues = {
  displayName: string;
  email: string;
  role: PortalUserRole;
  team: string;
  timeCardRoleId: string | null;
  jurisdictionState: string | null;
};

function getPortalUserSetupValues(formData: FormData): PortalUserSetupValues {
  const email = cleanText(formData.get("email")).toLowerCase();
  const displayName = cleanText(formData.get("display_name"));
  const team = cleanText(formData.get("team"));
  const timeCardRoleId = cleanText(formData.get("time_card_role_id")) || null;
  const jurisdictionState = normalizeStateCode(cleanText(formData.get("jurisdiction_state")));
  const requestedRole = cleanText(formData.get("role"));
  const role = isPortalUserRole(requestedRole) ? requestedRole : "employee";

  return {
    displayName,
    email,
    role,
    team,
    timeCardRoleId,
    jurisdictionState,
  };
}

async function assignPortalUserAccess(
  admin: SupabaseAdminClient,
  values: PortalUserSetupValues & {
    assignedBy: string;
    userId: string;
    sourceCandidateId?: string | null;
  },
) {
  const { error: roleError } = await admin.from("user_roles").upsert({
    user_id: values.userId,
    role: values.role,
    team: values.team || null,
    account_status: "active",
  });

  if (roleError) {
    return roleError;
  }

  const onboardingError = await createEmployeeProfileAndAssignments(
    admin,
    values.userId,
    values.displayName,
    values.email,
    values.timeCardRoleId,
    values.assignedBy,
    values.jurisdictionState,
    values.sourceCandidateId ?? null,
  );

  if (onboardingError) {
    return onboardingError;
  }

  return upsertEmployeeChatProfile(admin, {
    userId: values.userId,
    displayName: values.displayName,
    email: values.email,
    role: values.role,
    team: values.team,
    accountStatus: "active",
  });
}

async function rollbackCreatedAuthUser(admin: SupabaseAdminClient, userId: string) {
  await admin.auth.admin.deleteUser(userId, true);
}

export async function createCandidateIntake(formData: FormData) {
  const currentUser = await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const candidateName = cleanText(formData.get("candidate_name"));
  const email = cleanText(formData.get("email")).toLowerCase();
  const targetRole = cleanText(formData.get("target_role")) || "Employee";
  const jurisdictionState = normalizeStateCode(cleanText(formData.get("jurisdiction_state")));
  const source = cleanText(formData.get("source")) || null;
  const notes = cleanText(formData.get("notes")) || null;

  if (!candidateName || !email) {
    redirect(usersPath({ error: "Candidate name and email are required." }));
  }

  const { error } = await admin.from("hr_candidate_intakes").insert({
    candidate_name: candidateName,
    email,
    target_role: targetRole,
    jurisdiction_state: jurisdictionState,
    source,
    notes,
    status: "new",
    human_decision: "pending",
    created_by: currentUser.id,
  });

  if (error) {
    redirect(usersPath({ error: error.message }));
  }

  revalidatePath("/employee/users");
  revalidatePath("/employee/ai");
  redirect(usersPath({ message: "Candidate intake created for human review." }));
}

export async function approveCandidateForInvite(formData: FormData) {
  const currentUser = await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const candidateId = cleanText(formData.get("candidate_id"));
  const notes = cleanText(formData.get("human_decision_notes")) || null;

  if (!candidateId) {
    redirect(usersPath({ error: "Choose a candidate to approve for invite." }));
  }

  const decidedAt = new Date().toISOString();
  const { error } = await admin
    .from("hr_candidate_intakes")
    .update({
      status: "approved_for_invite",
      human_decision: "approved_to_invite",
      human_decision_notes: notes,
      decided_by: currentUser.id,
      decided_at: decidedAt,
    })
    .eq("id", candidateId)
    .in("status", ["new", "screening", "approved_for_invite"]);

  if (error) {
    redirect(usersPath({ error: error.message }));
  }

  revalidatePath("/employee/users");
  revalidatePath("/employee/ai");
  redirect(usersPath({ message: "Candidate approved for invite. Generate the invite when ready." }));
}

export async function convertCandidateToInvite(formData: FormData) {
  const currentUser = await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const candidateId = cleanText(formData.get("candidate_id"));

  if (!candidateId) {
    redirect(usersPath({ error: "Choose a candidate before generating an invite." }));
  }

  const { data: candidate, error: candidateError } = await admin
    .from("hr_candidate_intakes")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();

  if (candidateError || !candidate) {
    redirect(usersPath({ error: candidateError?.message ?? "Candidate intake was not found." }));
  }

  if (candidate.status !== "approved_for_invite" || candidate.human_decision !== "approved_to_invite") {
    redirect(usersPath({ error: "A human admin must approve the candidate for invite before conversion." }));
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: candidate.email,
    options: {
      data: { display_name: candidate.candidate_name },
      redirectTo: employeePortalUrl,
    },
  });

  if (error || !data.user || !data.properties?.hashed_token) {
    redirect(usersPath({ error: error?.message ?? "Could not generate candidate invite link." }));
  }

  const setupError = await assignPortalUserAccess(admin, {
    displayName: candidate.candidate_name,
    email: candidate.email,
    role: "employee",
    team: "People / HR",
    timeCardRoleId: null,
    jurisdictionState: candidate.jurisdiction_state,
    assignedBy: currentUser.id,
    userId: data.user.id,
    sourceCandidateId: candidate.id,
  });

  if (setupError) {
    await rollbackCreatedAuthUser(admin, data.user.id);
    redirect(usersPath({ error: setupError.message }));
  }

  await admin
    .from("hr_candidate_intakes")
    .update({
      status: "invited",
      converted_user_id: data.user.id,
      invite_generated_at: new Date().toISOString(),
    })
    .eq("id", candidate.id);

  revalidatePath("/employee/users");
  revalidatePath("/employee/time-cards");
  revalidatePath("/employee/ai");
  redirect(
    usersPath({
      message: "Candidate converted to employee invite with onboarding and payroll setup.",
      invite_link: buildCompanyAuthLink(data.properties.hashed_token, "invite"),
    }),
  );
}

export async function inviteEmployee(formData: FormData) {
  const currentUser = await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const values = getPortalUserSetupValues(formData);

  if (!values.email) {
    redirect(usersPath({ error: "Employee email is required." }));
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: values.email,
    options: {
      data: values.displayName ? { display_name: values.displayName } : undefined,
      redirectTo: employeePortalUrl,
    },
  });

  if (error || !data.user || !data.properties?.hashed_token) {
    redirect(usersPath({ error: error?.message ?? "Could not generate employee invite link." }));
  }

  const setupError = await assignPortalUserAccess(admin, {
    ...values,
    assignedBy: currentUser.id,
    userId: data.user.id,
  });

  if (setupError) {
    await rollbackCreatedAuthUser(admin, data.user.id);
    redirect(usersPath({ error: setupError.message }));
  }

  revalidatePath("/employee/users");
  revalidatePath("/employee/time-cards");
  redirect(usersPath({ message: "Employee invite link generated with HR onboarding assigned.", invite_link: buildCompanyAuthLink(data.properties.hashed_token, "invite") }));
}

export async function createPortalUser(formData: FormData) {
  const currentUser = await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const values = getPortalUserSetupValues(formData);
  const password = cleanText(formData.get("password"));

  if (!values.email || !password) {
    redirect(usersPath({ error: "Email and temporary password are required." }));
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: values.email,
    password,
    email_confirm: true,
    user_metadata: values.displayName ? { display_name: values.displayName } : undefined,
  });

  if (error || !data.user) {
    redirect(usersPath({ error: error?.message ?? "Could not create user." }));
  }

  const setupError = await assignPortalUserAccess(admin, {
    ...values,
    assignedBy: currentUser.id,
    userId: data.user.id,
  });

  if (setupError) {
    await rollbackCreatedAuthUser(admin, data.user.id);
    redirect(usersPath({ error: setupError.message }));
  }

  revalidatePath("/employee/users");
  revalidatePath("/employee/time-cards");
  redirect(usersPath({ message: "User created with HR onboarding assigned." }));
}

export async function generateEmployeeAccessLink(formData: FormData) {
  await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const email = cleanText(formData.get("email")).toLowerCase();

  if (!email) {
    redirect(usersPath({ error: "Choose a user email before generating an access link." }));
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: employeePortalUrl,
    },
  });

  if (error || !data.properties?.hashed_token) {
    redirect(usersPath({ error: error?.message ?? "Could not generate employee access link." }));
  }

  revalidatePath("/employee/users");
  redirect(usersPath({ message: `Access link generated for ${email}.`, invite_link: buildCompanyAuthLink(data.properties.hashed_token, "recovery") }));
}

export async function updatePortalUserRole(formData: FormData) {
  await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const userId = cleanText(formData.get("user_id"));
  const requestedRole = cleanText(formData.get("role"));
  const team = cleanText(formData.get("team"));
  const timeCardRoleId = cleanText(formData.get("time_card_role_id")) || null;
  const jurisdictionState = normalizeStateCode(cleanText(formData.get("jurisdiction_state")));
  const role = isPortalUserRole(requestedRole) ? requestedRole : "employee";

  if (!userId) {
    redirect(usersPath({ error: "Choose a user to update." }));
  }

  const { error } = await admin.from("user_roles").upsert({
    user_id: userId,
    role,
    team: team || null,
    account_status: "active",
  });

  if (error) {
    redirect(usersPath({ error: error.message }));
  }

  const { error: profileError } = await admin.from("employee_profiles").upsert({
    user_id: userId,
    profile_status: "active",
    time_card_role_id: timeCardRoleId,
    work_state: jurisdictionState,
  });

  if (profileError) {
    redirect(usersPath({ error: profileError.message }));
  }

  const payrollError = await ensurePayrollSetupTask(admin, {
    userId,
    createdBy: null,
    jurisdictionState,
  });

  if (payrollError) {
    redirect(usersPath({ error: payrollError.message }));
  }

  const { data: existingProfile, error: existingProfileError } = await admin
    .from("employee_chat_profiles")
    .select("display_name, email")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingProfileError && !isMissingSchemaRelationError(existingProfileError)) {
    redirect(usersPath({ error: existingProfileError.message }));
  }

  const chatProfileError = await upsertEmployeeChatProfile(admin, {
    userId,
    displayName: existingProfile?.display_name ?? null,
    email: existingProfile?.email ?? null,
    role,
    team,
    accountStatus: "active",
  });

  if (chatProfileError) {
    redirect(usersPath({ error: chatProfileError.message }));
  }

  revalidatePath("/employee/users");
  revalidatePath("/employee/time-cards");
  redirect(usersPath({ message: "User updated." }));
}

export async function archivePortalUser(formData: FormData) {
  const currentUser = await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const userId = cleanText(formData.get("user_id"));

  if (!userId) {
    redirect(usersPath({ error: "Choose a user to archive." }));
  }

  if (userId === currentUser.id) {
    redirect(usersPath({ error: "You cannot archive your own account." }));
  }

  const { error } = await admin.from("user_roles").update({ account_status: "archived" }).eq("user_id", userId);

  if (error) {
    redirect(usersPath({ error: error.message }));
  }

  await admin.from("employee_profiles").update({ profile_status: "archived" }).eq("user_id", userId);
  await admin.from("employee_chat_profiles").update({ account_status: "archived" }).eq("user_id", userId);

  revalidatePath("/employee/users");
  revalidatePath("/employee/time-cards");
  redirect(usersPath({ message: "User archived." }));
}

export async function deletePortalUser(formData: FormData) {
  const currentUser = await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const userId = cleanText(formData.get("user_id"));

  if (!userId) {
    redirect(usersPath({ error: "Choose a user to delete." }));
  }

  if (userId === currentUser.id) {
    redirect(usersPath({ error: "You cannot delete your own account." }));
  }

  const { error } = await admin.auth.admin.deleteUser(userId, false);

  if (error) {
    redirect(usersPath({ error: error.message }));
  }

  await admin.from("user_roles").delete().eq("user_id", userId);
  await admin.from("employee_chat_profiles").delete().eq("user_id", userId);

  revalidatePath("/employee/users");
  revalidatePath("/employee/time-cards");
  redirect(usersPath({ message: "User deleted." }));
}
