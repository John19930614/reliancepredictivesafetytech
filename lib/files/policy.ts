// Pure role rules for the File Center, kept separate from the server actions
// so the capability matrix can be unit-tested directly. No I/O here.

import { isPortalAdminRole, portalUserRoles, type PortalUserRole } from "@/lib/user-management";

export interface FileRoleFlags {
  canRead: boolean;
  canManage: boolean;
  canDelete: boolean;
}

/**
 * The role whitelist enforced by `public.is_company_portal_employee()` (see
 * supabase/migrations/20260505000000_company_portal.sql). `portalUserRoles` is
 * that exact set, so the app-level check and the RLS predicate cannot drift.
 */
function isFilePortalRole(role: string | null | undefined): role is PortalUserRole {
  return portalUserRoles.includes(role as PortalUserRole);
}

/**
 * Maps a portal role + active status onto File Center capabilities:
 *   - any active user holding a whitelisted portal role: read + upload/rename/
 *     move/archive (the library is a whole-team surface, like proposals)
 *   - admins: additionally delete file rows — the destructive act that orphans
 *     the stored object, mirroring `company_files_delete_admin` in the
 *     migration
 *
 * RLS is still the binding constraint — this check exists so a user the
 * database will reject is told so up front instead of seeing a success message
 * backed by a silent zero-row write.
 */
export function resolveFileRoleFlags(role: string | null | undefined, isActive: boolean): FileRoleFlags {
  if (!isActive || !isFilePortalRole(role)) return { canRead: false, canManage: false, canDelete: false };
  return { canRead: true, canManage: true, canDelete: isPortalAdminRole(role) };
}
