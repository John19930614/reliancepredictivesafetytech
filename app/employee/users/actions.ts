"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assignActiveRequiredHrDocuments } from "@/lib/hr-onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole, portalUserRoles, type PortalUserRole } from "@/lib/user-management";

type SupabaseAdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://safety360docs.com";
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
) {
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

  return assignActiveRequiredHrDocuments(admin, [userId], assignedBy);
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
};

function getPortalUserSetupValues(formData: FormData): PortalUserSetupValues {
  const email = cleanText(formData.get("email")).toLowerCase();
  const displayName = cleanText(formData.get("display_name"));
  const team = cleanText(formData.get("team"));
  const timeCardRoleId = cleanText(formData.get("time_card_role_id")) || null;
  const requestedRole = cleanText(formData.get("role"));
  const role = isPortalUserRole(requestedRole) ? requestedRole : "employee";

  return {
    displayName,
    email,
    role,
    team,
    timeCardRoleId,
  };
}

async function assignPortalUserAccess(
  admin: SupabaseAdminClient,
  values: PortalUserSetupValues & {
    assignedBy: string;
    userId: string;
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
