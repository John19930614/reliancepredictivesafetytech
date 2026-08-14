import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPortalRoleCommandRank } from "@/lib/user-management";
import { resolvePipelineRoleFlags, type PipelineRoleFlags } from "./policy";

export interface PipelineAccess extends PipelineRoleFlags {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string | null;
  role: string | null;
}

const denied: PipelineRoleFlags = {
  canRead: false,
  canAdvance: false,
  canOverride: false,
  canDraftInvoice: false,
  canSettleInvoice: false,
  isAdmin: false,
};

/** Resolves the current user's client-workflow access from user_roles. */
export async function getPipelineAccess(): Promise<PipelineAccess> {
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

  // Deliberately NOT .maybeSingle(), for the reason documented in
  // lib/talent-engine/access.ts: a user with two active user_roles rows makes
  // PostgREST return PGRST116 with data = null, which would read as "signed
  // out" for someone the database would happily authorise. RLS grants on
  // `exists(... role in (...))`, so duplicates resolve to the strongest active
  // role — resolve the same way here.
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

  const flags = resolvePipelineRoleFlags(role, rows.length > 0);

  return { supabase, userId: user.id, role, ...flags };
}
