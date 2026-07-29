import "server-only";
import { createClient } from "@/lib/supabase/server";
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

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  const role = roleRow?.role ?? null;
  const flags = resolveProposalRoleFlags(role, Boolean(roleRow));

  return { supabase, userId: user.id, role, ...flags };
}
