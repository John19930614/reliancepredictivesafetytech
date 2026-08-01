import { redirect } from "next/navigation";
import { canAccessMobileApp, canAccessMobileTab, getVisibleMobileTabs, mobileAppTabs, type MobileAppTabKey } from "@/lib/mobile-app";
import { createClient } from "@/lib/supabase/server";
import { hasFullPortalVisibility } from "@/lib/user-management";

export type MobileSession = {
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
  userId: string;
  email: string | null;
  role: string;
  accountStatus: string;
  moduleKeys: string[];
  visibleTabs: ReturnType<typeof getVisibleMobileTabs>;
};

/**
 * Resolves the signed-in employee plus their module grants for the mobile shell.
 * The middleware already redirects unauthenticated traffic away from /m, so the
 * redirects here are a second line of defence rather than the normal path.
 */
export async function loadMobileSession(): Promise<MobileSession> {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/employee-login?message=supabase-required");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employee-login?next=/m");
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  if (!role) {
    redirect("/employee-login?message=employee-role-required");
  }

  const { data: moduleAccess } = hasFullPortalVisibility(role.role, role.account_status)
    ? { data: [] }
    : await supabase.from("portal_user_module_access").select("module_key").eq("user_id", user.id);

  const moduleKeys = (moduleAccess ?? []).map((access) => access.module_key);

  if (!canAccessMobileApp(role.role, role.account_status, moduleKeys)) {
    redirect("/employee-login?message=portal-module-required");
  }

  return {
    supabase,
    userId: user.id,
    email: user.email ?? null,
    role: role.role,
    accountStatus: role.account_status,
    moduleKeys,
    visibleTabs: getVisibleMobileTabs(role.role, role.account_status, moduleKeys),
  };
}

/** Same as loadMobileSession, but also enforces access to one specific tab. */
export async function requireMobileTabSession(tabKey: MobileAppTabKey): Promise<MobileSession> {
  const session = await loadMobileSession();
  const tab = mobileAppTabs.find((candidate) => candidate.key === tabKey);

  if (!tab || !canAccessMobileTab(tab, session.role, session.accountStatus, session.moduleKeys)) {
    redirect("/m?message=tab-access-required");
  }

  return session;
}
