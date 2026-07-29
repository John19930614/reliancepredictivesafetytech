// Pure workflow rules for the Client Proposal Builder, kept separate from the
// server actions so status transitions, edit locks, and revision numbering can
// be unit-tested directly.

import { isPortalAdminRole } from "@/lib/user-management";
import type { ProposalStatus } from "./types";

/** Allowed status transitions. Anything not listed is rejected. */
const proposalTransitions: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ["in_review", "sent", "archived"],
  in_review: ["draft", "sent", "archived"],
  sent: ["accepted", "declined", "draft", "archived"],
  accepted: ["archived"],
  declined: ["draft", "archived"],
  archived: ["draft"],
};

export interface GateResult {
  ok: boolean;
  reason?: string;
}

export function canTransitionProposal(from: ProposalStatus, to: ProposalStatus): GateResult {
  if (from === to) return { ok: false, reason: "The proposal is already in that status." };
  if (!proposalTransitions[from]?.includes(to)) {
    return { ok: false, reason: `A ${from} proposal cannot move to ${to}.` };
  }
  return { ok: true };
}

/**
 * Content edits (which create a new revision) are only allowed while the
 * proposal is being worked on. Once sent/accepted/declined/archived, it must be
 * reopened to draft first — this keeps the sent record honest.
 */
export function canEditProposalContent(status: ProposalStatus): GateResult {
  if (status === "draft" || status === "in_review") return { ok: true };
  return {
    ok: false,
    reason: `A ${status} proposal is locked. Reopen it as a draft to make a new revision.`,
  };
}

export function nextRevisionNumber(currentRevision: number): number {
  return Math.max(1, Math.floor(currentRevision)) + 1;
}

export interface ProposalRoleFlags {
  canRead: boolean;
  canManage: boolean;
  isAdmin: boolean;
}

/**
 * Maps a portal role + active status onto proposal capabilities:
 *   - any active employee: read + create/edit (sales is a whole-team activity)
 *   - admins: additionally delete
 * Mirrors the company_clients RLS so the UI and database agree.
 */
export function resolveProposalRoleFlags(role: string | null | undefined, isActive: boolean): ProposalRoleFlags {
  if (!isActive) return { canRead: false, canManage: false, isAdmin: false };
  return { canRead: true, canManage: true, isAdmin: isPortalAdminRole(role) };
}
