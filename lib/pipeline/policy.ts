// Who may move a client through the journey, and who may force a move.
//
// PURE role→capability mapping, in the shape the rest of the repo uses
// (resolveFileRoleFlags, resolveProposalRoleFlags, resolveTalentRoleFlags): a
// role string plus an active flag in, a flags object out. Unit-tested against
// portalUserRoles so a new role cannot quietly inherit the override right.
//
// Kept apart from lib/pipeline/gates.ts on purpose. Gates answer "is this step
// finished"; this answers "may you act". Mixing them would let a role check
// stand in for evidence, which is exactly how a stage gate stops meaning
// anything.

import { isPortalAdminRole, portalUserRoles } from "@/lib/user-management";

export interface PipelineRoleFlags {
  /** See the workflow view at all. */
  canRead: boolean;
  /** Advance a client whose current step has no outstanding requirements. */
  canAdvance: boolean;
  /** Move a client past a step that is NOT finished, with a written reason. */
  canOverride: boolean;
  /** Create and edit a draft invoice. */
  canDraftInvoice: boolean;
  /** Issue an invoice to the client, mark it paid, or void it. */
  canSettleInvoice: boolean;
  isAdmin: boolean;
}

const denied: PipelineRoleFlags = {
  canRead: false,
  canAdvance: false,
  canOverride: false,
  canDraftInvoice: false,
  canSettleInvoice: false,
  isAdmin: false,
};

/**
 * The seven roles the database predicate is_company_portal_employee()
 * whitelists. Granting a capability to a role outside this list would make the
 * UI claim a success on a write RLS silently discards.
 */
export function isPipelinePortalRole(role: string | null | undefined): boolean {
  return typeof role === "string" && (portalUserRoles as readonly string[]).includes(role);
}

/**
 * Capabilities for a role.
 *
 * Reading and advancing are open to every active portal role, matching the RLS
 * update policy on company_clients — the workflow should not claim to withhold
 * something the database would allow through another door (the board, the
 * client record, the mobile app all write the same column).
 *
 * Overriding a failing gate and settling an invoice are admin-only. Both are
 * assertions about the business rather than records of work: one says "I am
 * accountable for skipping this step", the other asks a client for money.
 */
export function resolvePipelineRoleFlags(
  role: string | null | undefined,
  isActive: boolean,
): PipelineRoleFlags {
  if (!isActive || !isPipelinePortalRole(role)) return denied;

  const isAdmin = isPortalAdminRole(role);

  return {
    canRead: true,
    canAdvance: true,
    canOverride: isAdmin,
    canDraftInvoice: true,
    canSettleInvoice: isAdmin,
    isAdmin,
  };
}

/** Longest a written override reason may be, matching the column CHECK. */
export const maxOverrideReasonLength = 1000;

/** Shortest an override reason may be — "ok" is not a reason. */
export const minOverrideReasonLength = 10;

export interface OverrideReasonCheck {
  ok: boolean;
  error?: string;
  /** The trimmed value to store, when ok. */
  reason?: string;
}

/**
 * Validates the reason attached to a forced move.
 *
 * A floor of ten characters is deliberate. The whole value of the override
 * record is that someone had to say why in a form a later reader can act on,
 * and a one-word reason is indistinguishable from no reason at all.
 */
export function checkOverrideReason(input: string | null | undefined): OverrideReasonCheck {
  const reason = typeof input === "string" ? input.trim() : "";

  if (reason.length === 0) {
    return { ok: false, error: "Give a reason for moving this client past an unfinished step." };
  }
  if (reason.length < minOverrideReasonLength) {
    return { ok: false, error: "Say a little more about why this step is being skipped." };
  }
  if (reason.length > maxOverrideReasonLength) {
    return { ok: false, error: `Keep the reason under ${maxOverrideReasonLength} characters.` };
  }

  return { ok: true, reason };
}
