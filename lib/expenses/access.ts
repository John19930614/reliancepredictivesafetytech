import "server-only";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canAccessEmployeePath, hasFullPortalVisibility, isPortalOwnerRole } from "@/lib/user-management";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Server Action entry point — redirects an unauthenticated caller. Only safe
 * for Server Components/Actions; Route Handlers must check `auth.getUser()`
 * directly and return a JSON 401 instead (next/navigation's redirect() does
 * not translate to an HTTP redirect from inside a Route Handler).
 */
export async function getSignedInUser() {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/employee-login?message=supabase-required");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employee-login?next=/employee/expenses");
  }

  return { supabase, user };
}

export function getAdminClientOrError() {
  const admin = createAdminClient();

  if (!admin) {
    return { admin: null, error: "Supabase server admin key is required for expense actions." };
  }

  return { admin, error: null };
}

/** Does not redirect — safe to call from both Server Actions and Route Handlers. */
export async function getExpenseAccess(supabase: NonNullable<SupabaseServerClient>, userId: string) {
  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: moduleAccess } = hasFullPortalVisibility(role?.role, role?.account_status)
    ? { data: [] }
    : await supabase.from("portal_user_module_access").select("module_key").eq("user_id", userId);

  const moduleKeys = (moduleAccess ?? []).map((access) => access.module_key);
  return {
    active: role?.account_status === "active",
    canUseExpenses: canAccessEmployeePath(role?.role, role?.account_status, "/employee/expenses", moduleKeys),
    isOwner: role?.account_status === "active" && isPortalOwnerRole(role.role),
  };
}

export async function requireExpenseUser() {
  const { supabase, user } = await getSignedInUser();
  const access = await getExpenseAccess(supabase, user.id);

  if (!access.active || !access.canUseExpenses) {
    return { user: null, error: "Expense access is required for this account." };
  }

  return { user, error: null };
}

export async function requireExpenseReviewer() {
  const { supabase, user } = await getSignedInUser();
  const access = await getExpenseAccess(supabase, user.id);

  if (!access.active || !access.canUseExpenses) {
    return { user: null, error: "Expense access is required for this account." };
  }

  if (access.isOwner) {
    return { user, error: null };
  }

  const { admin, error } = getAdminClientOrError();
  if (!admin) return { user: null, error };

  const { data, error: financeError } = await admin
    .from("company_finance_authorized_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (financeError) {
    return { user: null, error: financeError.message };
  }

  if (!data) {
    return { user: null, error: "Finance authorization is required to review expenses." };
  }

  return { user, error: null };
}
