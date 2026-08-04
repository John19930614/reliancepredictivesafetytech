// Pure lifecycle rules and input validation for client-proposal share links.
//
// Deliberately split from ./share-token: that module pulls in `node:crypto` and
// can therefore only ever run on the server, while these rules are needed by the
// employee-facing share panel too. Keeping them here means the browser and the
// server answer "is this link still good?" from ONE definition instead of two
// that can drift.
//
// Everything in this file is pure and I/O-free, so it is unit-testable without
// a database — see ./share-link-policy.test.ts.

import type { ProposalStatus } from "@/lib/proposals/types";

export const minShareLinkDays = 1;
export const maxShareLinkDays = 180;
export const defaultShareLinkDays = 14;

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every reason a share URL can fail to resolve. The public route renders ONE
 * identical message for all three failure states so a caller cannot use the
 * response to learn whether a proposal exists behind a given token.
 */
export type ShareLinkState = "valid" | "unknown" | "revoked" | "expired";

export interface ShareLinkLifecycle {
  expires_at?: string | null;
  revoked_at?: string | null;
}

function toTime(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The single authority on whether a link may be used.
 *
 * Order matters: revocation is checked before expiry, so a link that was pulled
 * back reads as `revoked` even after its natural expiry has also passed.
 *
 * Fail-closed: a missing row, an unparseable `expires_at`, and a `revoked_at`
 * that cannot be parsed all deny access rather than defaulting to open.
 */
export function evaluateShareLink(
  link: ShareLinkLifecycle | null | undefined,
  now: Date = new Date(),
): ShareLinkState {
  if (!link || typeof link !== "object") return "unknown";

  // Any non-empty revoked_at revokes, parseable or not.
  if (typeof link.revoked_at === "string" && link.revoked_at.trim() !== "") return "revoked";

  const expiresAt = toTime(link.expires_at);
  if (expiresAt === null) return "expired";
  if (expiresAt <= now.getTime()) return "expired";

  return "valid";
}

export function isShareLinkUsable(
  link: ShareLinkLifecycle | null | undefined,
  now: Date = new Date(),
): boolean {
  return evaluateShareLink(link, now) === "valid";
}

export const shareLinkStateLabels: Record<ShareLinkState, string> = {
  valid: "Active",
  unknown: "Unknown",
  revoked: "Revoked",
  expired: "Expired",
};

/** Clamps a requested lifetime into the allowed window. Non-numeric -> default. */
export function clampShareLinkDays(days: unknown): number {
  const parsed = typeof days === "number" ? days : typeof days === "string" ? Number(days) : Number.NaN;
  if (!Number.isFinite(parsed)) return defaultShareLinkDays;
  return Math.min(maxShareLinkDays, Math.max(minShareLinkDays, Math.floor(parsed)));
}

/** ISO expiry timestamp for a link created `days` from `now`. */
export function shareLinkExpiryIso(days: unknown, now: Date = new Date()): string {
  return new Date(now.getTime() + clampShareLinkDays(days) * 86_400_000).toISOString();
}

/** Public share URL. Relative when no origin is known, so it still works. */
export function buildShareLinkPath(token: string): string {
  return `/proposals/share/${encodeURIComponent(token)}`;
}

export function buildShareLinkUrl(origin: string | null | undefined, token: string): string {
  const path = buildShareLinkPath(token);
  if (!origin) return path;
  try {
    return new URL(path, origin).toString();
  } catch {
    return path;
  }
}

/* -------------------------------------------------------------------------- */
/* Share gate                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A share link is the client-facing artifact of a RELEASED proposal, so it can
 * only be minted from `sent`.
 *
 * Deliberately narrower than "any readable status":
 *   * draft / in_review are internal work — the document would render itself as
 *     "Draft" to the client and its terms are still moving;
 *   * accepted / declined are closed — the acceptance is already bound to a
 *     revision, and issuing a fresh link would invite a second, conflicting
 *     acceptance against a different snapshot;
 *   * archived is withdrawn.
 *
 * Content edits are already locked at `sent` (canEditProposalContent), so the
 * revision a link is bound to cannot change underneath the client while the
 * link is live.
 */
export function canShareProposal(status: ProposalStatus | string): { ok: boolean; reason?: string } {
  if (status === "sent") return { ok: true };
  if (status === "accepted" || status === "declined") {
    return { ok: false, reason: `This proposal is already ${status}. Share links are only issued while it is sent.` };
  }
  return {
    ok: false,
    reason: `A ${status} proposal cannot be shared with a client. Mark it as sent first.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Acceptance input                                                            */
/*                                                                             */
/* The acceptance form is an unauthenticated public POST. Everything it sends   */
/* is untrusted and is normalised here before it reaches a column.              */
/* -------------------------------------------------------------------------- */

export const acceptanceNameMaxLength = 120;
export const acceptanceEmailMaxLength = 254;
export const declineReasonMaxLength = 500;

// Pragmatic, not RFC 5322: one @, no whitespace, a dot in the domain.
const emailPattern = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export interface AcceptanceInput {
  name?: unknown;
  email?: unknown;
  agreed?: unknown;
}

export interface AcceptanceValidation {
  ok: boolean;
  errors: Record<string, string>;
  error?: string;
  value?: { name: string; email: string };
}

export function validateAcceptanceInput(input: AcceptanceInput): AcceptanceValidation {
  const errors: Record<string, string> = {};

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) errors.name = "Enter your full name.";
  else if (name.length > acceptanceNameMaxLength) {
    errors.name = `Keep the name to ${acceptanceNameMaxLength} characters or fewer.`;
  }

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email) errors.email = "Enter your email address.";
  else if (email.length > acceptanceEmailMaxLength || !emailPattern.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  // The checkbox is the record of informed agreement — never inferred.
  if (input.agreed !== true && input.agreed !== "on" && input.agreed !== "true") {
    errors.agreed = "Tick the box to confirm you accept the proposal terms.";
  }

  const first = Object.values(errors)[0];
  if (first) return { ok: false, errors, error: first };
  return { ok: true, errors, value: { name, email } };
}

/**
 * First hop of an `x-forwarded-for` chain, length-capped.
 *
 * Taken from request headers server-side and never from the request body — a
 * client-supplied "my IP is…" field would be worthless as evidence. Later hops
 * are the proxies, not the client, so only the first entry is kept.
 */
export function extractClientIp(forwardedFor: string | null | undefined): string | null {
  if (typeof forwardedFor !== "string") return null;
  const first = forwardedFor.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  return first.slice(0, 100);
}
