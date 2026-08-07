import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPortalRoleCommandRank } from "@/lib/user-management";
import { resolveTalentRoleFlags, type TalentRoleFlags } from "./policy";

export interface TalentAccess extends TalentRoleFlags {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string | null;
  role: string | null;
}

const denied: TalentRoleFlags = {
  canRead: false,
  canPropose: false,
  canSetRate: false,
  canApprove: false,
  canManagePlacements: false,
  isAdmin: false,
};

/** Resolves the current user's EHS Talent Engine access from user_roles. */
export async function getTalentAccess(): Promise<TalentAccess> {
  const supabase = await createClient();
  if (!supabase) {
    return { supabase: null, userId: null, role: null, ...denied };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, userId: null, role: null, ...denied };
  }

  // Deliberately NOT .maybeSingle(): a user with two active user_roles rows made
  // PostgREST return PGRST116 with data = null, which collapsed to "You must be
  // signed in." even though the database would happily authorise them. RLS
  // grants on `exists(... role in (...))`, so duplicates effectively resolve to
  // the strongest active role — resolve the same way here.
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_status", "active");

  const rows: Array<{ role: string | null }> = Array.isArray(roleRows) ? roleRows : [];
  const role =
    rows
      .map((row) => row?.role ?? null)
      .sort((a, b) => getPortalRoleCommandRank(a) - getPortalRoleCommandRank(b))[0] ?? null;

  const flags = resolveTalentRoleFlags(role, rows.length > 0);

  return { supabase, userId: user.id, role, ...flags };
}
