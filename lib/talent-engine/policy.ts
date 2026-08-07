// Pure workflow rules for the EHS Talent Engine, kept separate from the server
// actions so status transitions, the rate-edit lock, the human-approval gate,
// the RBAC matrix and certification checks can be unit-tested directly.
//
// Nothing here touches Supabase. RLS is still the binding constraint on every
// write; these functions exist so a user the database will reject is told so up
// front, and so the approval gate is a single testable expression rather than
// an `if` scattered across four call sites.

import {
  isPortalAdminRole,
  isPortalOwnerRole,
  portalUserRoles,
  type PortalUserRole,
} from "@/lib/user-management";
import {
  certExpiryWarningDays,
  defaultMinSpreadPerHour,
  matchStatuses,
  type MatchStatus,
} from "./types";

export interface GateResult {
  ok: boolean;
  reason?: string;
}

/* -------------------------------------------------------------------------- */
/* Match status graph                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Allowed match transitions. Anything not listed is rejected.
 *
 * The shape of the graph is the approval gate expressed as data:
 *   * nothing reaches `submitted` without passing through `approved`, so a
 *     candidate cannot be put in front of a client on AI say-so;
 *   * `counter_proposed` loops back through `pending_approval`, so a re-priced
 *     match is re-approved rather than inheriting the old sign-off;
 *   * `placed` is terminal — a started placement is unwound by ending the
 *     placement record, not by rewinding the match that justified it;
 *   * `withdrawn` is reachable from every live state, because pulling a
 *     submittal must never require an approval of its own.
 */
export const talentMatchTransitions: Record<MatchStatus, readonly MatchStatus[]> = {
  draft: ["pending_approval", "withdrawn"],
  pending_approval: ["approved", "rejected", "counter_proposed", "withdrawn"],
  counter_proposed: ["pending_approval", "approved", "rejected", "withdrawn"],
  approved: ["submitted", "withdrawn"],
  submitted: ["placed", "rejected", "withdrawn"],
  rejected: ["draft"],
  placed: [],
  withdrawn: ["draft"],
};

function isMatchStatus(value: unknown): value is MatchStatus {
  return matchStatuses.includes(value as MatchStatus);
}

export function canTransitionMatch(from: MatchStatus, to: MatchStatus): GateResult {
  if (!isMatchStatus(from) || !isMatchStatus(to)) {
    return { ok: false, reason: "That is not a match status." };
  }
  if (from === to) return { ok: false, reason: "The match is already in that status." };
  if (talentMatchTransitions[from].length === 0) {
    return { ok: false, reason: `A ${from} match is final and cannot change status.` };
  }
  if (!talentMatchTransitions[from].includes(to)) {
    return { ok: false, reason: `A ${from} match cannot move to ${to}.` };
  }
  return { ok: true };
}

/**
 * Rates are editable only while the match is still being worked out.
 *
 * Once a match is `approved`, the spread on the row IS the record of what a
 * human signed off on: a reviewer looked at $95 bill / $70 pay, judged the $25
 * spread acceptable, and their decision is stored in talent_match_approvals
 * against those exact numbers. Letting anyone re-price the row afterwards would
 * leave an approval pointing at rates nobody ever approved — and `submitted`
 * goes further, because by then the client has been quoted. Re-pricing from
 * there means countering (back to `counter_proposed`, which returns to
 * `pending_approval`) or withdrawing, so the new spread gets its own sign-off.
 */
export function canEditMatchRates(status: MatchStatus): GateResult {
  if (status === "draft" || status === "pending_approval" || status === "counter_proposed") {
    return { ok: true };
  }
  if (!isMatchStatus(status)) return { ok: false, reason: "That is not a match status." };
  return {
    ok: false,
    reason: `A ${status} match's rates are locked — the approved spread is the record of what was signed off. Counter or withdraw it to change them.`,
  };
}

/* -------------------------------------------------------------------------- */
/* RBAC                                                                       */
/* -------------------------------------------------------------------------- */

export interface TalentRoleFlags {
  canRead: boolean;
  /** May create and edit a match, i.e. propose a candidate at a rate. */
  canPropose: boolean;
  /** May type a bill or pay rate onto a match. */
  canSetRate: boolean;
  /** May approve, reject or counter a match — the Human Authority gate. */
  canApprove: boolean;
  /** May create or end a placement (the Tier-3 commitment). */
  canManagePlacements: boolean;
  /** Platform owner: destructive surfaces. See the note below. */
  isAdmin: boolean;
}

const deniedTalentFlags: TalentRoleFlags = {
  canRead: false,
  canPropose: false,
  canSetRate: false,
  canApprove: false,
  canManagePlacements: false,
  isAdmin: false,
};

/**
 * The role whitelist enforced by `public.is_company_portal_employee()` (see
 * supabase/migrations/20260505000000_company_portal.sql). `portalUserRoles` is
 * that exact set, so the app-level check and the RLS predicate cannot drift.
 */
export function isTalentPortalRole(role: string | null | undefined): role is PortalUserRole {
  return portalUserRoles.includes(role as PortalUserRole);
}

/**
 * Maps a portal role + active status onto the blueprint's roles-and-permissions
 * matrix:
 *
 *   Oversight Manager  — the four `portalAdminRoles`. Sets rates, approves
 *                        matches, opens and ends placements. This is the human
 *                        in "AI acts → human approves".
 *   Recruiter/Reviewer — `internal_reviewer`, `employee`. Sources, screens and
 *                        proposes. Explicitly CANNOT approve: a proposer who
 *                        can approve their own proposal is not a gate.
 *   Account Manager    — `marketing`. Reads the console and the client-facing
 *                        side; does not propose and does not touch rates.
 *
 * `isAdmin` is narrower than the other flags on purpose: it means PLATFORM
 * OWNER (`platform_admin` / `super_admin`), and gates destructive UI. The
 * migration's admin-only policies accept all four admin roles, so this is
 * strictly the fail-closed direction — a company_admin the database would allow
 * simply does not see the destructive control. `canManagePlacements` is the
 * flag that mirrors those DB policies, and that one covers all four.
 */
export function resolveTalentRoleFlags(
  role: string | null | undefined,
  hasActiveRole: boolean,
): TalentRoleFlags {
  if (!hasActiveRole || !isTalentPortalRole(role)) return { ...deniedTalentFlags };

  if (isPortalAdminRole(role)) {
    return {
      canRead: true,
      canPropose: true,
      canSetRate: true,
      canApprove: true,
      canManagePlacements: true,
      isAdmin: isPortalOwnerRole(role),
    };
  }

  if (role === "internal_reviewer" || role === "employee") {
    return {
      canRead: true,
      canPropose: true,
      canSetRate: false,
      canApprove: false,
      canManagePlacements: false,
      isAdmin: false,
    };
  }

  // marketing — Account Manager. Read-only over the staffing pipeline.
  return { ...deniedTalentFlags, canRead: true };
}

/* -------------------------------------------------------------------------- */
/* The Human Authority gate                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The fields requiresHumanApproval() needs to clear a match. Every one is
 * required at the type level so a call site cannot forget to supply the
 * certification lists and get a quiet `false`; the runtime checks below repeat
 * the same guards for callers that arrive untyped (JSON, a test, an AI tool
 * result).
 */
export interface HumanApprovalInput {
  /** talent_matches.requires_human_review — DB default is true. */
  requires_human_review: boolean;
  /** talent_matches.spread (bill − pay), already rounded by pricing.ts. */
  spread: number;
  /** Job-order override of the agency floor; null falls back to the default. */
  min_spread: number | null;
  /** talent_matches.floor_ok, as computed when the row was written. */
  floor_ok: boolean;
  /** talent_job_orders.cert_requirements. */
  cert_requirements: string[];
  /** talent_candidates.verified_certifications. */
  verified_certifications: string[];
}

/**
 * The Human Authority Rule from CLAUDE.md, as one expression.
 *
 * Returns true — meaning "no AI output may be applied to this record until a
 * human has reviewed it" — whenever ANY of the following holds:
 *   1. `requires_human_review` is set on the row;
 *   2. the spread is under the floor (money the agency would lose);
 *   3. a required certification is not verified;
 *   4. the input is missing, malformed, or of the wrong type.
 *
 * (4) is the important one. This function is a safety gate, so the only way to
 * get `false` out of it is to hand it a complete, well-typed, demonstrably
 * clean match. A missing field, a string where a number belongs, a null cert
 * list, a non-object — every one of those returns true. There is no accidental
 * path to "no review needed".
 */
export function requiresHumanApproval(match: HumanApprovalInput | null | undefined): boolean {
  if (!match || typeof match !== "object") return true;

  // Re-read through `unknown`: the declared interface is the contract for typed
  // call sites, but this function must also survive an untyped caller, so every
  // field is checked at runtime rather than trusted.
  const row = match as unknown as Record<string, unknown>;

  // 1. The flag itself. Only an explicit boolean `false` clears it — `0`,
  //    `"false"`, null and undefined all mean "review".
  if (row.requires_human_review !== false) return true;

  // 2. The money floor. A non-numeric spread means we cannot prove the match is
  //    above water, which is itself a reason to look at it.
  const spread = row.spread;
  if (typeof spread !== "number" || !Number.isFinite(spread)) return true;

  const rawFloor = row.min_spread;
  let floor: number;
  if (rawFloor === null || rawFloor === undefined) {
    floor = defaultMinSpreadPerHour;
  } else if (typeof rawFloor === "number" && Number.isFinite(rawFloor)) {
    floor = rawFloor;
  } else {
    return true;
  }
  if (spread < floor) return true;

  // The app-computed flag must agree with the arithmetic. If it does not, the
  // row was written by something that disagrees with pricing.ts — escalate.
  if (row.floor_ok !== true) return true;

  // 3. Certifications. Both lists must be present and be arrays; a required
  //    cert with no verified counterpart blocks submittal.
  const required = row.cert_requirements;
  const verified = row.verified_certifications;
  if (!Array.isArray(required) || !Array.isArray(verified)) return true;
  if (missingRequiredCerts(required, verified).length > 0) return true;

  return false;
}

/* -------------------------------------------------------------------------- */
/* Certifications                                                             */
/* -------------------------------------------------------------------------- */

function normaliseCert(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Required certifications with no verified counterpart, in the caller's own
 * casing so the message can quote the job order verbatim.
 *
 * The compare is case- and whitespace-insensitive because the blueprint
 * guardrail is "cert verification blocks submittal", and a recruiter typing
 * "osha 30" against a job order asking for "OSHA 30" must not read as a missing
 * certification. HOLDING a cert is not enough — this deliberately compares
 * against `verified_certifications`, not `certifications`.
 *
 * Non-array `required` yields an empty list (nothing was asked for); a
 * non-array `verified` is treated as nothing verified, so everything required
 * comes back missing. Both defaults fail in the safe direction.
 */
export function missingRequiredCerts(required: string[], verified: string[]): string[] {
  if (!Array.isArray(required)) return [];

  const verifiedSet = new Set(
    (Array.isArray(verified) ? verified : []).map(normaliseCert).filter((cert) => cert !== ""),
  );

  const missing: string[] = [];
  const seen = new Set<string>();

  for (const entry of required) {
    const key = normaliseCert(entry);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    if (!verifiedSet.has(key)) missing.push(typeof entry === "string" ? entry.trim() : entry);
  }

  return missing;
}

/**
 * True when a certification has already lapsed or lapses inside the warning
 * window (`certExpiryWarningDays`). An already-expired cert is the loudest case
 * of "expiring soon", so it counts.
 *
 * A missing or unparseable date returns FALSE, not true: no date on file is an
 * absence of information, and raising an expiry warning on every candidate who
 * has not had one entered would train the reviewer to ignore the badge. The
 * gate that actually blocks a submittal is missingRequiredCerts() above.
 */
export function certExpiringSoon(
  expiryDate: string | null | undefined,
  now: Date = new Date(),
  windowDays: number = certExpiryWarningDays,
): boolean {
  if (typeof expiryDate !== "string" || expiryDate.trim() === "") return false;

  const expiry = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(expiryDate.trim())
      ? `${expiryDate.trim()}T00:00:00.000Z`
      : expiryDate.trim(),
  );
  if (Number.isNaN(expiry)) return false;

  const reference = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (Number.isNaN(reference)) return false;

  const days = Number.isFinite(windowDays) ? Math.max(0, windowDays) : certExpiryWarningDays;
  return expiry <= reference + days * 24 * 60 * 60 * 1000;
}

/* -------------------------------------------------------------------------- */
/* Input validation                                                           */
/* -------------------------------------------------------------------------- */

// Same pattern as lib/proposals/policy.ts — ids arrive from form posts and are
// interpolated into `.eq()` filters, so they are shape-checked before use.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTalentUuid(value: string): boolean {
  return typeof value === "string" && uuidPattern.test(value.trim());
}
