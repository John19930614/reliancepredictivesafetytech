import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPortalRoleCommandRank } from "@/lib/user-management";
import { resolveLifecycleRoleFlags, type LifecycleRoleFlags } from "./policy";

export interface LifecycleAccess extends LifecycleRoleFlags {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string | null;
  role: string | null;
  /** Named on activity rows, which record a person rather than a role. */
  userEmail: string | null;
}

const denied: LifecycleRoleFlags = {
  canRead: false,
  canManage: false,
  canAdvance: false,
  canSkip: false,
  canExit: false,
  canReopen: false,
  isAdmin: false,
};

/** Resolves the current user's Client Lifecycle access from user_roles. */
export async function getLifecycleAccess(): Promise<LifecycleAccess> {
  const supabase = await createClient();
  if (!supabase) {
    return { supabase: null, userId: null, role: null, userEmail: null, ...denied };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, userId: null, role: null, userEmail: null, ...denied };
  }

  // Deliberately NOT .maybeSingle(), for the reason documented in
  // lib/talent-engine/access.ts: two active user_roles rows make PostgREST
  // return PGRST116 with data = null, which would read as "signed out" for
  // someone the database would authorise. Duplicates resolve to the strongest
  // active role, the same way the RLS predicates do.
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .eq("account_status", "active");

  const rows: Array<{ role: string | null }> = Array.isArray(roleRows) ? roleRows : [];
  const role =
    rows
      .map((row) => row?.role ?? null)
      .sort((a, b) => getPortalRoleCommandRank(a) - getPortalRoleCommandRank(b))[0] ?? null;

  const flags = resolveLifecycleRoleFlags(role, rows.length > 0);

  return { supabase, userId: user.id, role, userEmail: user.email ?? null, ...flags };
}
