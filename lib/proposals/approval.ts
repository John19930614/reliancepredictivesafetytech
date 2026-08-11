// Maker–checker rules for the Proposal Builder.
//
// Steve writes the proposal. John reviews it and sends it. Before this module
// there was no difference between them: every gate in the Proposal Builder was
// `canManage`, which is true for any active portal role, and both of them hold
// super_admin. Steve could mark a proposal sent, mint a client share link, and
// fire a DocuSign envelope with nobody having read it. `draft -> sent` was a
// legal transition, so the in_review status could be skipped entirely.
//
// THE RULE, in one line: a proposal may only go out when a user holding the
// approver capability has approved the exact revision being sent.
//
// APPROVAL BINDS TO A REVISION, NOT TO THE PROPOSAL. That is the whole
// integrity property, and it is not incidental — saveProposalDraft() rewrites
// `client_proposals.form_data` on a 30-second autosave WITHOUT minting a
// revision, so an approval recorded against "the proposal" would silently come
// to cover text nobody approved. A revision is immutable, so an approval
// pinned to one is a statement about a document that cannot change afterwards.
//
// WHY A CAPABILITY AND NOT "you cannot approve your own work": the symmetric
// separation-of-duties rule was the starting point, but it gets both ends of
// this workflow wrong. It would let Steve approve John's proposals (John is
// the only sender), and it would block John from sending a proposal he fixed a
// typo in (he is the approver; his own edits are reviewed by definition). The
// capability is explicit, seeded to John, and auditable — and a maker without
// it can never approve, which is the property that actually matters.

import type { ProposalStatus } from "./types";

export type ProposalDecision = "approved" | "changes_requested";

export const proposalDecisions = Object.freeze(["approved", "changes_requested"] as const);

export function isProposalDecision(value: unknown): value is ProposalDecision {
  return typeof value === "string" && (proposalDecisions as readonly string[]).includes(value);
}

/** Longest a reviewer's note may be; matches the CHECK in the migration. */
export const decisionNoteMaxLength = 1000;

export interface GateResult {
  ok: boolean;
  reason?: string;
}

/** One row of client_proposal_approvals, as the app reads it. */
export interface ProposalApprovalRecord {
  id: string;
  /** The immutable revision this decision was made about. */
  revisionId: string | null;
  revisionNumber: number;
  decision: ProposalDecision;
  note: string | null;
  decidedBy: string | null;
  /** Display name of the decider, resolved by the page. "" when unknown. */
  decidedByName: string;
  decidedAt: string;
}

export interface ApprovalState {
  /** Most recent decision of any kind, or null when never reviewed. */
  latest: ProposalApprovalRecord | null;
  /** The most recent APPROVAL, even if a later change-request superseded it. */
  lastApproval: ProposalApprovalRecord | null;
  /**
   * True only when the newest decision is an approval AND it names the
   * proposal's current revision. This is the flag every send gate reads.
   */
  currentRevisionApproved: boolean;
  /**
   * True when an approval exists but the proposal has moved past it — Steve
   * saved a new revision after John approved. Drives the "Approved v4, current
   * is v5" banner.
   */
  supersededByEdit: boolean;
}

/**
 * Folds the decision history into the state the UI and the gates both read.
 *
 * `records` may arrive in any order; the newest by `decidedAt` wins, with the
 * array position as the tie-break for two decisions inside the same clock tick.
 */
export function resolveApprovalState(
  records: readonly ProposalApprovalRecord[],
  currentRevision: number,
): ApprovalState {
  const ordered = [...records].sort((a, b) => {
    const byTime = Date.parse(b.decidedAt) - Date.parse(a.decidedAt);
    if (Number.isFinite(byTime) && byTime !== 0) return byTime;
    return records.indexOf(b) - records.indexOf(a);
  });

  const latest = ordered[0] ?? null;
  const lastApproval = ordered.find((record) => record.decision === "approved") ?? null;
  const currentRevisionApproved =
    latest !== null && latest.decision === "approved" && latest.revisionNumber === currentRevision;

  return {
    latest,
    lastApproval,
    currentRevisionApproved,
    supersededByEdit:
      lastApproval !== null && lastApproval.revisionNumber < currentRevision && !currentRevisionApproved,
  };
}

/* -------------------------------------------------------------------------- */
/* Gates                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Handing the proposal to the reviewer. The maker's action, so it deliberately
 * does NOT require the approver capability — that is the point of the split.
 */
export function canSubmitForReview(status: ProposalStatus): GateResult {
  if (status === "draft") return { ok: true };
  if (status === "in_review") return { ok: false, reason: "This proposal is already with the reviewer." };
  return { ok: false, reason: `A ${status} proposal cannot be submitted for review.` };
}

/** Approving or requesting changes. Reviewer-only, and only while in review. */
export function canDecideProposal(status: ProposalStatus, isApprover: boolean): GateResult {
  if (!isApprover) {
    return {
      ok: false,
      reason: "Only a proposal approver can approve or request changes. Ask John to review it.",
    };
  }
  if (status !== "in_review") {
    return {
      ok: false,
      reason:
        status === "draft"
          ? "This proposal has not been submitted for review yet."
          : `A ${status} proposal is no longer under review.`,
    };
  }
  return { ok: true };
}

/**
 * The send moment: moving a reviewed proposal to `sent`.
 *
 * Three conditions, each of which has to hold on its own — the approver
 * capability, the review status, and an approval naming the revision that is
 * current RIGHT NOW. The third is what stops an approval being obtained on a
 * modest scope and then spent on a rewritten one.
 */
export function canSendProposal(input: {
  status: ProposalStatus;
  isApprover: boolean;
  approval: ApprovalState;
  currentRevision: number;
}): GateResult {
  if (!input.isApprover) {
    return { ok: false, reason: "Only a proposal approver can send a proposal to a client." };
  }
  if (input.status !== "in_review") {
    return {
      ok: false,
      reason:
        input.status === "draft"
          ? "Submit this proposal for review before sending it."
          : `A ${input.status} proposal cannot be sent.`,
    };
  }
  if (!input.approval.currentRevisionApproved) {
    const approved = input.approval.lastApproval;
    if (approved && approved.revisionNumber !== input.currentRevision) {
      return {
        ok: false,
        reason: `v${approved.revisionNumber} was approved but the proposal is now on v${input.currentRevision}. Re-approve before sending.`,
      };
    }
    return { ok: false, reason: "Approve this proposal before sending it." };
  }
  return { ok: true };
}

/**
 * Client-facing outbound actions on an already-sent proposal: minting a share
 * link, firing a DocuSign envelope.
 *
 * Separate from canSendProposal because the status requirement inverts — these
 * act on `sent`, not on `in_review` — but the capability requirement is the
 * same, and it is the one that was missing. sendProposalToDocusign() checked
 * only that the proposal existed, so a draft could be put in front of a client
 * for signature by anyone.
 */
export function canDispatchToClient(status: ProposalStatus, isApprover: boolean): GateResult {
  if (!isApprover) {
    return { ok: false, reason: "Only a proposal approver can send documents to a client." };
  }
  if (status !== "sent") {
    return {
      ok: false,
      reason: `A ${status} proposal cannot be issued to a client. Approve and send it first.`,
    };
  }
  return { ok: true };
}

/**
 * Whether a maker's save should void the standing approval.
 *
 * An approver editing their own approved proposal carries the approval forward:
 * they are the person the approval represents, so their change is reviewed by
 * definition and bouncing it back to themselves would be theatre. Anyone else's
 * save drops it back to the reviewer.
 */
export function editVoidsApproval(editorIsApprover: boolean): boolean {
  return !editorIsApprover;
}

/** Trimmed, length-checked reviewer note. Empty string becomes null. */
export function normalizeDecisionNote(note: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (note === null || note === undefined) return { ok: true, value: null };
  if (typeof note !== "string") return { ok: false, error: "The note must be text." };
  const trimmed = note.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > decisionNoteMaxLength) {
    return { ok: false, error: `Keep the note to ${decisionNoteMaxLength} characters or fewer.` };
  }
  return { ok: true, value: trimmed };
}
