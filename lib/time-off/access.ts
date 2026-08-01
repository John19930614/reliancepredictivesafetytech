import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";

export interface TimeOffAccess {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string | null;
  role: string | null;
  isActive: boolean;
  isAdmin: boolean;
}

/**
 * Resolves the current user's Time Off access.
 *
 * Every active employee may file and cancel their own requests; admins
 * (company_admin / admin / platform_admin / super_admin) may review any
 * request and adjust balances. RLS enforces the same split at the database
 * layer — these flags only drive the UI and the server-action guards.
 */
export async function getTimeOffAccess(): Promise<TimeOffAccess> {
  const supabase = await createClient();
  if (!supabase) {
    return { supabase: null, userId: null, role: null, isActive: false, isAdmin: false };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, userId: null, role: null, isActive: false, isAdmin: false };
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const isActive = roleRow?.account_status === "active";

  return {
    supabase,
    userId: user.id,
    role: roleRow?.role ?? null,
    isActive,
    isAdmin: isActive && isPortalAdminRole(roleRow?.role),
  };
}
