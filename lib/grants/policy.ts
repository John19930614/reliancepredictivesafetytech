/**
 * Who may do what in the Grant Tracker.
 *
 * Pure: no Supabase, no request context, so the RBAC matrix is testable on its
 * own (lib/grants/policy.test.ts). lib/grants/access.ts resolves the role and
 * calls this; the RLS policies in the migration are the backstop that enforces
 * the same split at the database.
 */

import { isPortalAdminRole, portalUserRoles, type PortalUserRole } from "@/lib/user-management";

export interface GrantRoleFlags {
  canRead: boolean;
  canManage: boolean;
  canChangeStatus: boolean;
  /** Move a row to awarded / declined / not_eligible. */
  canRecordOutcome: boolean;
  /** Edit or re-open a row that has already been decided. */
  canEditClosed: boolean;
  canDelete: boolean;
  isAdmin: boolean;
}

const denied: GrantRoleFlags = {
  canRead: false,
  canManage: false,
  canChangeStatus: false,
  canRecordOutcome: false,
  canEditClosed: false,
  canDelete: false,
  isAdmin: false,
};

export const deniedGrantRoleFlags: GrantRoleFlags = denied;

/**
 * `isActive` is the account_status gate — an archived account resolves to the
 * denied set regardless of role, matching is_company_portal_employee().
 *
 * Every active portal role may record an outcome, including a decline: a person
 * who has just been told "no" must be able to say so without waiting on an
 * admin. What they cannot do is un-say it — reopening a decided row is
 * canEditClosed, and that is admin-only, the same argument as lifecycle's
 * canExit / canReopen split.
 */
export function resolveGrantRoleFlags(role: string | null | undefined, isActive: boolean): GrantRoleFlags {
  if (!isActive || !portalUserRoles.includes(role as PortalUserRole)) {
    return { ...denied };
  }

  const isAdmin = isPortalAdminRole(role);

  return {
    canRead: true,
    canManage: true,
    canChangeStatus: true,
    canRecordOutcome: true,
    canEditClosed: isAdmin,
    canDelete: isAdmin,
    isAdmin,
  };
}
