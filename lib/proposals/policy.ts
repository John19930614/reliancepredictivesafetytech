// Pure workflow rules for the Client Proposal Builder, kept separate from the
// server actions so status transitions, edit locks, revision numbering, and
// input validation can be unit-tested directly.

import { isPortalAdminRole, portalUserRoles, type PortalUserRole } from "@/lib/user-management";
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

/**
 * Commercial/assignment fields (client_id, proposal_value, valid_until) are
 * part of the offer. Editing them creates no revision, so they are frozen
 * everywhere except `draft` — otherwise a proposal could be silently re-priced,
 * re-dated, or reassigned to a different company with no audit-visible version
 * bump. `in_review` is locked too: the proposal is in front of a reviewer, and
 * re-pricing it underneath them is exactly the drift this gate exists to stop.
 *
 * This is deliberately stricter than canEditProposalContent(), which still
 * allows in_review edits because those DO mint a reviewable revision.
 *
 * `owner` is deliberately NOT covered by this gate: it is internal routing, not
 * part of the offer, and reassigning a closed deal's owner is legitimate.
 */
export function canEditProposalMeta(status: ProposalStatus): GateResult {
  if (status === "draft") return { ok: true };
  return {
    ok: false,
    reason: `A ${status} proposal's company, value, and expiry are locked. Reopen it as a draft to change them.`,
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
 * The role whitelist enforced by `public.is_company_portal_employee()` (see
 * supabase/migrations/20260505000000_company_portal.sql). `portalUserRoles` is
 * that exact set, so the app-level check and the RLS predicate cannot drift.
 */
export function isProposalPortalRole(role: string | null | undefined): role is PortalUserRole {
  return portalUserRoles.includes(role as PortalUserRole);
}

/**
 * Maps a portal role + active status onto proposal capabilities:
 *   - any active user holding a whitelisted portal role: read + create/edit
 *     (sales is a whole-team activity)
 *   - admins: additionally delete
 *
 * The role whitelist mirrors `is_company_portal_employee()` exactly. RLS is
 * still the binding constraint — this check exists so a user the database will
 * reject is told so up front instead of seeing a success message backed by a
 * silent zero-row write.
 */
export function resolveProposalRoleFlags(role: string | null | undefined, isActive: boolean): ProposalRoleFlags {
  if (!isActive || !isProposalPortalRole(role)) return { canRead: false, canManage: false, isAdmin: false };
  return { canRead: true, canManage: true, isAdmin: isPortalAdminRole(role) };
}

// ---------------------------------------------------------------------------
// Input validation
//
// Server Actions are public POST endpoints: anything the browser can call, a
// script can call with arbitrary payloads. These bounds are checked before any
// value reaches numeric(14,2) / date / text columns so the caller gets a clean
// field error instead of a raw Postgres constraint message.
// ---------------------------------------------------------------------------

/** Matches the practical limit for `client_proposals.title` (unbounded text column). */
export const proposalTitleMaxLength = 200;
/** Upper bound that safely fits numeric(14,2). */
export const proposalValueMax = 1e10;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Rejects impossible dates that Date would otherwise roll over (2026-02-30).
  return parsed.toISOString().slice(0, 10) === `${year}-${month}-${day}`;
}

export function isProposalUuid(value: string): boolean {
  return uuidPattern.test(value.trim());
}

export interface ProposalFieldInput {
  /** Omit the key entirely when the field is not part of this write. */
  title?: string | null;
  clientId?: string | null;
  proposalValue?: number | null;
  validUntil?: string | null;
}

export interface ProposalFieldValidation {
  ok: boolean;
  /** Field-level messages keyed by the input field name. */
  errors: Record<string, string>;
  /** First message, ready to render in a single-line form banner. */
  error?: string;
}

export function validateProposalFields(input: ProposalFieldInput): ProposalFieldValidation {
  const errors: Record<string, string> = {};

  if ("title" in input) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) errors.title = "Give the proposal a title.";
    else if (title.length > proposalTitleMaxLength) {
      errors.title = `Keep the title to ${proposalTitleMaxLength} characters or fewer.`;
    }
  }

  if ("clientId" in input && input.clientId !== null && input.clientId !== undefined && input.clientId !== "") {
    if (typeof input.clientId !== "string" || !isProposalUuid(input.clientId)) {
      errors.clientId = "That company reference is not valid.";
    }
  }

  if ("proposalValue" in input && input.proposalValue !== null && input.proposalValue !== undefined) {
    const value = input.proposalValue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.proposalValue = "Proposal value must be a number.";
    } else if (value < 0) {
      errors.proposalValue = "Proposal value cannot be negative.";
    } else if (value > proposalValueMax) {
      errors.proposalValue = "Proposal value is too large.";
    }
  }

  if ("validUntil" in input && input.validUntil !== null && input.validUntil !== undefined && input.validUntil !== "") {
    if (typeof input.validUntil !== "string" || !isCalendarDate(input.validUntil)) {
      errors.validUntil = "Valid-until must be a real date (YYYY-MM-DD).";
    }
  }

  const first = Object.values(errors)[0];
  return first ? { ok: false, errors, error: first } : { ok: true, errors };
}
