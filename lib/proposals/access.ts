import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPortalRoleCommandRank } from "@/lib/user-management";
import { resolveProposalRoleFlags, type ProposalRoleFlags } from "./policy";

export interface ProposalAccess extends ProposalRoleFlags {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string | null;
  role: string | null;
}

/** Resolves the current user's Proposal Builder access from user_roles. */
export async function getProposalAccess(): Promise<ProposalAccess> {
  const supabase = await createClient();
  if (!supabase) {
    return { supabase: null, userId: null, role: null, canRead: false, canManage: false, isAdmin: false };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, userId: null, role: null, canRead: false, canManage: false, isAdmin: false };
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

  const flags = resolveProposalRoleFlags(role, rows.length > 0);

  return { supabase, userId: user.id, role, ...flags };
}
