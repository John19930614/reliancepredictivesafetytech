import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPortalRoleCommandRank } from "@/lib/user-management";
import { resolveGrantRoleFlags, deniedGrantRoleFlags, type GrantRoleFlags } from "./policy";

export interface GrantTrackerAccess extends GrantRoleFlags {
  /**
   * Untyped on purpose: company_grant_opportunities is newer than the last
   * `npm run types:generate`, the same escape hatch company_profiles uses in
   * app/employee/clients/[id]/page.tsx until types are regenerated.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string | null;
  role: string | null;
}

/** Resolves the current user's Grant Tracker access from user_roles. */
export async function getGrantTrackerAccess(): Promise<GrantTrackerAccess> {
  const supabase = await createClient();
  if (!supabase) {
    return { supabase: null, userId: null, role: null, ...deniedGrantRoleFlags };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, userId: null, role: null, ...deniedGrantRoleFlags };
  }

  // Deliberately NOT .maybeSingle(), for the reason documented in
  // lib/lifecycle/access.ts: two active user_roles rows make PostgREST return
  // PGRST116 with data = null, which would read as "signed out" for someone the
  // database would authorise. Duplicates resolve to the strongest active role,
  // the same way the RLS predicates do.
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

  const flags = resolveGrantRoleFlags(role, rows.length > 0);

  return { supabase, userId: user.id, role, ...flags };
}
