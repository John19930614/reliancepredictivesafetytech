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
    return { supabase: null, userId: null, role: null, canRead: false, canManage: false, isAdmin: false, canApprove: false };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, userId: null, role: null, canRead: false, canManage: false, isAdmin: false, canApprove: false };
  }

  // Deliberately NOT .maybeSingle(): a user with two active user_roles rows made
  // PostgREST return PGRST116 with data = null, which collapsed to "You must be
  // signed in." even though the database would happily authorise them. RLS
  // grants on `exists(... role in (...))`, so duplicates effectively resolve to
  // the strongest active role — resolve the same way here.
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role, can_approve_proposals")
    .eq("user_id", user.id)
    .eq("account_status", "active");

  const rows: Array<{ role: string | null; can_approve_proposals?: boolean | null }> = Array.isArray(roleRows)
    ? roleRows
    : [];
  const role =
    rows
      .map((row) => row?.role ?? null)
      .sort((a, b) => getPortalRoleCommandRank(a) - getPortalRoleCommandRank(b))[0] ?? null;

  // Resolved across ALL active rows, matching how the strongest role is picked
  // above: a user carrying two rows is granted the capability if either row
  // grants it, rather than depending on which row happened to sort first.
  const canApproveProposals = rows.some((row) => row?.can_approve_proposals === true);

  const flags = resolveProposalRoleFlags(role, rows.length > 0, canApproveProposals);

  return { supabase, userId: user.id, role, ...flags };
}
