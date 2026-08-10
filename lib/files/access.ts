import "server-only";
import { createClient } from "@/lib/supabase/server";
import { resolveFileRoleFlags } from "@/lib/files/policy";

export interface FileCenterAccess {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string | null;
  role: string | null;
  isActive: boolean;
  flags: ReturnType<typeof resolveFileRoleFlags>;
}

/**
 * Resolves the current user's File Center access. Every active employee may
 * browse and organise company/client files (canRead/canManage); permanently
 * deleting a file is reserved for portal admins (canDelete). RLS enforces the
 * same split at the database layer — these flags only drive the UI and the
 * server-action guards.
 */
export async function getFileCenterAccess(): Promise<FileCenterAccess> {
  const supabase = await createClient();
  if (!supabase) {
    return { supabase: null, userId: null, role: null, isActive: false, flags: resolveFileRoleFlags(null, false) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, userId: null, role: null, isActive: false, flags: resolveFileRoleFlags(null, false) };
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const role = roleRow?.role ?? null;
  const isActive = roleRow?.account_status === "active";

  return { supabase, userId: user.id, role, isActive, flags: resolveFileRoleFlags(role, isActive) };
}
