import { isPortalAdminRole } from "@/lib/user-management";

export interface LegalRoleFlags {
  canRead: boolean;
  isAdmin: boolean;
  isReviewer: boolean;
}

/**
 * Maps a portal role + active status onto Legal Register capabilities
 * (doc §4, mapped to existing portalUserRoles — no auth changes):
 *   - admins (platform_admin/super_admin/company_admin/admin): full CRUD
 *   - internal_reviewer: may act on the review queue + read
 *   - any active user: read approved entries
 */
export function resolveLegalRoleFlags(role: string | null | undefined, isActive: boolean): LegalRoleFlags {
  if (!isActive) return { canRead: false, isAdmin: false, isReviewer: false };
  const isAdmin = isPortalAdminRole(role);
  const isReviewer = isAdmin || role === "internal_reviewer";
  return { canRead: true, isAdmin, isReviewer };
}
