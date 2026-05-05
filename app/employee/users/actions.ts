"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole, portalUserRoles, type PortalUserRole } from "@/lib/user-management";

function usersPath(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return `/employee/users?${searchParams.toString()}`;
}

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
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
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  legalName: string,
  email: string,
  timeCardRoleId: string | null,
  assignedBy: string,
) {
  if (!admin) {
    return null;
  }

  const { error: profileError } = await admin.from("employee_profiles").upsert({
    user_id: userId,
    legal_name: legalName || null,
    display_name: legalName || null,
    email,
    profile_status: "active",
    time_card_role_id: timeCardRoleId,
    onboarding_status: "not_started",
  });

  if (profileError) {
    return profileError;
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
    return null;
  }

  const { error: assignmentError } = await admin.from("employee_document_assignments").upsert(
    templates.map((template) => ({
      user_id: userId,
      template_id: template.id,
      status: "pending",
      assigned_by: assignedBy,
    })),
    { onConflict: "user_id,template_id" },
  );

  return assignmentError;
}

async function upsertEmployeeChatProfile(
  admin: ReturnType<typeof createAdminClient>,
  values: {
    userId: string;
    displayName?: string | null;
    email?: string | null;
    role?: string;
    team?: string | null;
    accountStatus?: string;
  },
) {
  if (!admin) {
    return null;
  }

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

export async function createPortalUser(formData: FormData) {
  const currentUser = await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const email = cleanText(formData.get("email")).toLowerCase();
  const password = cleanText(formData.get("password"));
  const displayName = cleanText(formData.get("display_name"));
  const team = cleanText(formData.get("team"));
  const timeCardRoleId = cleanText(formData.get("time_card_role_id")) || null;
  const requestedRole = cleanText(formData.get("role"));
  const role = isPortalUserRole(requestedRole) ? requestedRole : "employee";

  if (!email || !password) {
    redirect(usersPath({ error: "Email and temporary password are required." }));
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: displayName ? { display_name: displayName } : undefined,
  });

  if (error || !data.user) {
    redirect(usersPath({ error: error?.message ?? "Could not create user." }));
  }

  const { error: roleError } = await admin.from("user_roles").upsert({
    user_id: data.user.id,
    role,
    team: team || null,
    account_status: "active",
  });

  if (roleError) {
    await admin.auth.admin.deleteUser(data.user.id, true);
    redirect(usersPath({ error: roleError.message }));
  }

  const onboardingError = await createEmployeeProfileAndAssignments(admin, data.user.id, displayName, email, timeCardRoleId, currentUser.id);

  if (onboardingError) {
    await admin.auth.admin.deleteUser(data.user.id, true);
    redirect(usersPath({ error: onboardingError.message }));
  }

  const chatProfileError = await upsertEmployeeChatProfile(admin, {
    userId: data.user.id,
    displayName,
    email,
    role,
    team,
    accountStatus: "active",
  });

  if (chatProfileError) {
    await admin.auth.admin.deleteUser(data.user.id, true);
    redirect(usersPath({ error: chatProfileError.message }));
  }

  revalidatePath("/employee/users");
  revalidatePath("/employee/time-cards");
  redirect(usersPath({ message: "User created with HR onboarding assigned." }));
}

export async function updatePortalUserRole(formData: FormData) {
  await getAuthorizedAdmin();
  const admin = getAdminClientOrRedirect();
  const userId = cleanText(formData.get("user_id"));
  const requestedRole = cleanText(formData.get("role"));
  const team = cleanText(formData.get("team"));
  const timeCardRoleId = cleanText(formData.get("time_card_role_id")) || null;
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
  });

  if (profileError) {
    redirect(usersPath({ error: profileError.message }));
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
