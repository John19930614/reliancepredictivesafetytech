import "server-only";

// Server-only resolution of a raw share token into the exact, minimal set of
// facts the unauthenticated /proposals/share/[token] route is allowed to see.
//
// WHY THE SERVICE-ROLE CLIENT
//   The share route has no session. The alternatives were:
//     (a) grant `anon` a SELECT policy on client_proposal_share_links — which
//         would let ANY anonymous caller list every link, its proposal id, its
//         expiry and its token hash. Rejected.
//     (b) resolve the token here, server-side, with the service-role client and
//         hand back only a hand-built projection. Chosen.
//   The service-role key is used strictly inside this server-only module —
//   never in a client component (CLAUDE.md SECURITY STANDARDS).
//
// WHAT THIS MODULE WILL NOT RETURN
//   Nothing beyond the shared revision's document state and the handful of
//   proposal fields the client-facing document itself already prints. In
//   particular it never returns: client_id, owner, proposal_value, created_by,
//   body_markdown, other proposals, other revisions, other share links, any
//   employee identity, or the internal pricing catalog. The projection is an
//   explicit allow-list, not a `select *` with fields removed later.
//
// This module deliberately holds no policy of its own — every "may this link be
// used?" decision comes from ./share-link-policy, which is pure and unit-tested.

import { createAdminClient } from "@/lib/supabase/admin";
import { isProposalUuid } from "@/lib/proposals/policy";
import type { ProposalStatus } from "@/lib/proposals/types";
import { evaluateShareLink, type ShareLinkState } from "./share-link-policy";
import { hashShareToken, isShareTokenFormat, shareTokenHashesMatch } from "./share-token";

/**
 * The generated `Database` types do not yet describe
 * `client_proposal_share_links` or the acceptance columns — those arrive with
 * the 20260804 migrations, and types are regenerated after a migration is
 * applied, not before. `lib/proposals/access.ts` already types its client as
 * `any` for the same reason, so this follows the module's existing convention
 * rather than inventing a second one.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

function adminDb(): LooseClient | null {
  return createAdminClient() as LooseClient | null;
}

/** Row shape this module reads. Not exported to any client component. */
export interface ShareLinkRecord {
  id: string;
  proposal_id: string;
  revision_id: string;
  expires_at: string | null;
  revoked_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
}

/** Everything the public page is allowed to render. Nothing internal. */
export interface SharedProposalView {
  linkId: string;
  proposalId: string;
  /** Title of the SHARED revision, not the live working copy. */
  title: string;
  status: ProposalStatus;
  validUntil: string | null;
  revisionId: string;
  revisionNumber: number;
  revisionSavedAt: string | null;
  /** Untyped generator state — the caller validates it with isGeneratorState(). */
  formData: unknown;
  acceptedAt: string | null;
  acceptedByName: string | null;
  declinedAt: string | null;
}

export interface ResolvedShareLink {
  state: ShareLinkState;
  /** Populated only when `state === "valid"`. */
  view: SharedProposalView | null;
  link: ShareLinkRecord | null;
}

const rejected = (state: ShareLinkState): ResolvedShareLink => ({ state, view: null, link: null });

/**
 * Resolves a raw token. Fails closed at every step, and returns NOTHING about
 * the proposal unless the link is currently usable — an expired or revoked link
 * leaks no more than an unknown one.
 */
export async function resolveShareLink(rawToken: unknown): Promise<ResolvedShareLink> {
  // Structural check first: junk never reaches the digest or the database.
  if (!isShareTokenFormat(rawToken)) return rejected("unknown");

  const db = adminDb();
  // No service-role credentials configured -> deny, never fall back to a
  // session-bound client that would behave differently.
  if (!db) return rejected("unknown");

  const tokenHash = hashShareToken(rawToken);

  const { data: link, error } = await db
    .from("client_proposal_share_links")
    .select("id, proposal_id, revision_id, token_hash, expires_at, revoked_at, first_viewed_at, last_viewed_at, view_count")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !link) return rejected("unknown");
  // Defence in depth: confirm the stored digest really is the one we computed,
  // in constant time, before trusting the row the database matched.
  if (!shareTokenHashesMatch(link.token_hash, tokenHash)) return rejected("unknown");

  const record: ShareLinkRecord = {
    id: link.id,
    proposal_id: link.proposal_id,
    revision_id: link.revision_id,
    expires_at: link.expires_at ?? null,
    revoked_at: link.revoked_at ?? null,
    first_viewed_at: link.first_viewed_at ?? null,
    last_viewed_at: link.last_viewed_at ?? null,
    view_count: Number(link.view_count ?? 0),
  };

  const state = evaluateShareLink(record);
  if (state !== "valid") return rejected(state);

  if (!isProposalUuid(record.proposal_id) || !isProposalUuid(record.revision_id)) return rejected("unknown");

  const [{ data: revision }, { data: proposal }] = await Promise.all([
    // Scoped by BOTH ids: a link whose revision belongs to a different proposal
    // must not render that revision under this proposal's heading.
    db
      .from("client_proposal_revisions")
      .select("id, proposal_id, revision_number, title, form_data, created_at")
      .eq("id", record.revision_id)
      .eq("proposal_id", record.proposal_id)
      .maybeSingle(),
    db
      .from("client_proposals")
      .select("id, title, status, valid_until, accepted_at, accepted_by_name, declined_at")
      .eq("id", record.proposal_id)
      .maybeSingle(),
  ]);

  if (!revision || !proposal) return rejected("unknown");

  return {
    state: "valid",
    link: record,
    view: {
      linkId: record.id,
      proposalId: proposal.id,
      title: (revision.title as string) || (proposal.title as string),
      status: proposal.status as ProposalStatus,
      validUntil: (proposal.valid_until ?? null) as string | null,
      revisionId: revision.id as string,
      revisionNumber: Number(revision.revision_number ?? 0),
      revisionSavedAt: (revision.created_at ?? null) as string | null,
      formData: revision.form_data ?? null,
      acceptedAt: (proposal.accepted_at ?? null) as string | null,
      acceptedByName: (proposal.accepted_by_name ?? null) as string | null,
      declinedAt: (proposal.declined_at ?? null) as string | null,
    },
  };
}

export interface AcceptanceWrite {
  proposalId: string;
  /** The revision the share link was bound to — the document they actually saw. */
  revisionId: string;
  name: string;
  email: string;
  /** Read from request headers server-side. Never from the submitted form. */
  ip: string | null;
}

/**
 * Stamps the acceptance columns and flips the status, in ONE conditional write.
 *
 * The `status = 'sent'` and `accepted_at is null` predicates are part of the
 * UPDATE rather than a preceding read, so two clients racing the same link
 * cannot both record an acceptance: the second matches zero rows. The write is
 * verified with `.select("id")` because PostgREST reports no error for an
 * UPDATE that matched nothing.
 */
export async function applyShareLinkAcceptance(
  input: AcceptanceWrite,
): Promise<{ ok: boolean; error?: string }> {
  const db = adminDb();
  if (!db) return { ok: false, error: "Acceptance is temporarily unavailable. Please contact your representative." };

  const { data: updated, error } = await db
    .from("client_proposals")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by_name: input.name,
      accepted_by_email: input.email,
      acceptance_ip: input.ip,
      accepted_revision_id: input.revisionId,
    })
    .eq("id", input.proposalId)
    .eq("status", "sent")
    .is("accepted_at", null)
    .select("id");

  if (error) return { ok: false, error: "Acceptance could not be recorded. Please contact your representative." };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "This proposal is no longer open for acceptance. Please contact your representative." };
  }
  return { ok: true };
}

export interface DeclineWrite {
  proposalId: string;
  /** Who declined, as they typed it. */
  name: string;
  /** The picked label plus any detail, already capped by validateDeclineInput. */
  reason: string;
}

/**
 * Records a client's decline: stamps the columns and flips the status, in ONE
 * conditional write.
 *
 * Same shape as applyShareLinkAcceptance and for the same reason — the
 * `status = 'sent'` / `accepted_at is null` / `declined_at is null` predicates
 * live in the UPDATE rather than a preceding read, so a client who declines
 * twice (or races their own acceptance) cannot record two outcomes: the second
 * write matches zero rows.
 *
 * `declined_at` and `decline_reason` have existed since 20260804101000 and were
 * never written by anything. This is the first writer.
 */
export async function applyShareLinkDecline(input: DeclineWrite): Promise<{ ok: boolean; error?: string }> {
  const db = adminDb();
  if (!db) return { ok: false, error: "This action is temporarily unavailable. Please contact your representative." };

  const { data: updated, error } = await db
    .from("client_proposals")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
      decline_reason: input.reason,
    })
    .eq("id", input.proposalId)
    .eq("status", "sent")
    .is("accepted_at", null)
    .is("declined_at", null)
    .select("id");

  if (error) return { ok: false, error: "Your response could not be recorded. Please contact your representative." };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "This proposal is no longer open for a response. Please contact your representative." };
  }
  return { ok: true };
}

/**
 * Best-effort view tracking. Never throws and never blocks the render from
 * succeeding: a counter that fails to increment must not stop a client reading
 * a proposal they were legitimately sent.
 *
 * The increment is read-then-write rather than an atomic `count + 1`, so two
 * simultaneous opens can record one view. That is acceptable for an engagement
 * signal; `first_viewed_at` and `last_viewed_at` — the fields that actually
 * matter as evidence — are not affected by the race.
 */
export async function recordShareLinkView(link: ShareLinkRecord): Promise<void> {
  try {
    const db = adminDb();
    if (!db) return;
    const now = new Date().toISOString();
    await db
      .from("client_proposal_share_links")
      .update({
        first_viewed_at: link.first_viewed_at ?? now,
        last_viewed_at: now,
        view_count: (Number.isFinite(link.view_count) ? link.view_count : 0) + 1,
      })
      .eq("id", link.id);
  } catch {
    // View tracking must never break the client's view of the document.
  }
}
