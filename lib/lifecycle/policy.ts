// Who may do what in the Client Lifecycle.
//
// PURE role→capability mapping, in the shape the rest of the repo uses
// (resolveFileRoleFlags, resolveProposalRoleFlags, resolvePipelineRoleFlags):
// role string plus an active flag in, flags object out. Unit-tested against
// portalUserRoles so a new role cannot quietly inherit an exception.
//
// The split follows what each act actually asserts:
//
//   Advancing one step        — ordinary work. Every active portal role.
//   Skipping steps            — asserts the skipped work was not needed.
//   Moving backwards          — rewrites the record of where a deal got to.
//   Exiting the lifecycle     — reports an outcome others act on.
//   Reopening an exited deal  — un-reports it.
//
// The last four are admin acts, and the RLS in the migration backs every one of
// them rather than leaving the rule in Node — which is exactly the hole the
// review pass found in the invoicing work.

import { isPortalAdminRole, portalUserRoles } from "@/lib/user-management";

export interface LifecycleRoleFlags {
  canRead: boolean;
  /** Create an opportunity and edit an open one. */
  canManage: boolean;
  /** Move it one step forward. */
  canAdvance: boolean;
  /** Jump forward over steps, or move back. */
  canSkip: boolean;
  /** Mark it Closed Lost / On Hold / Disqualified. */
  canExit: boolean;
  /** Bring an exited deal back into the lifecycle. */
  canReopen: boolean;
  isAdmin: boolean;
}

const denied: LifecycleRoleFlags = {
  canRead: false,
  canManage: false,
  canAdvance: false,
  canSkip: false,
  canExit: false,
  canReopen: false,
  isAdmin: false,
};

/**
 * The seven roles is_company_portal_employee() whitelists. Granting to a role
 * outside this list makes the UI claim success on a write RLS discards.
 */
export function isLifecyclePortalRole(role: string | null | undefined): boolean {
  return typeof role === "string" && (portalUserRoles as readonly string[]).includes(role);
}

export function resolveLifecycleRoleFlags(
  role: string | null | undefined,
  isActive: boolean,
): LifecycleRoleFlags {
  if (!isActive || !isLifecyclePortalRole(role)) return denied;

  const isAdmin = isPortalAdminRole(role);

  return {
    canRead: true,
    canManage: true,
    canAdvance: true,
    canSkip: isAdmin,
    // Exiting is deliberately NOT admin-only. A rep who has just been told the
    // deal is dead has to be able to say so — forcing that through an admin is
    // how pipelines fill with stale open deals nobody trusts. What the rep
    // cannot do is un-say it.
    canExit: true,
    canReopen: isAdmin,
    isAdmin,
  };
}
