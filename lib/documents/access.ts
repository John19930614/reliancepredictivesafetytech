import "server-only";
import { createClient } from "@/lib/supabase/server";
import { resolveLegalRoleFlags } from "@/lib/legal/roles";

export interface DocumentAccess {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string | null;
  role: string | null;
  isActive: boolean;
  isAdmin: boolean;
  isReviewer: boolean;
}

/**
 * Resolves the current user's Document Builder access. Reuses the platform-wide
 * role mapping (resolveLegalRoleFlags): admins = full CRUD + publish; internal
 * reviewers may act on the draft review workflow; all active users may read.
 */
export async function getDocumentAccess(): Promise<DocumentAccess> {
  const supabase = await createClient();
  if (!supabase) {
    return { supabase: null, userId: null, role: null, isActive: false, isAdmin: false, isReviewer: false };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, userId: null, role: null, isActive: false, isAdmin: false, isReviewer: false };
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  const role = roleRow?.role ?? null;
  const isActive = Boolean(roleRow);
  const { isAdmin, isReviewer } = resolveLegalRoleFlags(role, isActive);

  return { supabase, userId: user.id, role, isActive, isAdmin, isReviewer };
}
