import { describe, expect, it } from "vitest";
import {
  canDecideProposal,
  canDispatchToClient,
  canSendProposal,
  canSubmitForReview,
  decisionNoteMaxLength,
  editVoidsApproval,
  isProposalDecision,
  normalizeDecisionNote,
  resolveApprovalState,
  type ProposalApprovalRecord,
} from "./approval";
import { proposalStatuses, type ProposalStatus } from "./types";

const MAKER = "steve";
const APPROVER = "john";

function decision(overrides: Partial<ProposalApprovalRecord> = {}): ProposalApprovalRecord {
  return {
    id: "a1",
    revisionId: "rev-1",
    revisionNumber: 4,
    decision: "approved",
    note: null,
    decidedBy: APPROVER,
    decidedByName: "",
    decidedAt: "2026-08-11T10:00:00.000Z",
    ...overrides,
  };
}

describe("resolveApprovalState", () => {
  it("reports no approval when nothing has been decided", () => {
    const state = resolveApprovalState([], 1);
    expect(state.latest).toBeNull();
    expect(state.lastApproval).toBeNull();
    expect(state.currentRevisionApproved).toBe(false);
    expect(state.supersededByEdit).toBe(false);
  });

  it("approves the current revision when the newest decision names it", () => {
    const state = resolveApprovalState([decision({ revisionNumber: 4 })], 4);
    expect(state.currentRevisionApproved).toBe(true);
    expect(state.supersededByEdit).toBe(false);
  });

  // The property the whole design exists for: an approval covers ONE revision.
  it("stops covering the proposal once a newer revision is saved", () => {
    const state = resolveApprovalState([decision({ revisionNumber: 4 })], 5);
    expect(state.currentRevisionApproved).toBe(false);
    expect(state.supersededByEdit).toBe(true);
    expect(state.lastApproval?.revisionNumber).toBe(4);
  });

  it("takes the newest decision regardless of array order", () => {
    const state = resolveApprovalState(
      [
        decision({ id: "old", revisionNumber: 4, decidedAt: "2026-08-11T10:00:00.000Z" }),
        decision({ id: "new", revisionNumber: 4, decision: "changes_requested", decidedAt: "2026-08-11T12:00:00.000Z" }),
      ],
      4,
    );
    expect(state.latest?.id).toBe("new");
    expect(state.currentRevisionApproved).toBe(false);
  });

  it("does not let a superseded approval re-open the send gate", () => {
    // Approved, then changes requested on the SAME revision. The approval is
    // still the last approval, but it is not the last word.
    const state = resolveApprovalState(
      [
        decision({ id: "approve", revisionNumber: 4, decidedAt: "2026-08-11T10:00:00.000Z" }),
        decision({
          id: "reject",
          revisionNumber: 4,
          decision: "changes_requested",
          note: "Drop the price.",
          decidedAt: "2026-08-11T11:00:00.000Z",
        }),
      ],
      4,
    );
    expect(state.lastApproval?.id).toBe("approve");
    expect(state.currentRevisionApproved).toBe(false);
  });

  it("re-approving a new revision clears the superseded flag", () => {
    const state = resolveApprovalState(
      [
        decision({ id: "v4", revisionNumber: 4, decidedAt: "2026-08-11T10:00:00.000Z" }),
        decision({ id: "v5", revisionNumber: 5, decidedAt: "2026-08-11T13:00:00.000Z" }),
      ],
      5,
    );
    expect(state.currentRevisionApproved).toBe(true);
    expect(state.supersededByEdit).toBe(false);
  });
});

describe("canSubmitForReview", () => {
  it("is the maker's action and needs no approver capability", () => {
    expect(canSubmitForReview("draft").ok).toBe(true);
  });

  it("refuses when the proposal is not a draft", () => {
    expect(canSubmitForReview("in_review").ok).toBe(false);
    for (const status of ["sent", "accepted", "declined", "archived"] as ProposalStatus[]) {
      expect(canSubmitForReview(status).ok).toBe(false);
    }
  });
});

describe("canDecideProposal", () => {
  it("lets an approver decide a proposal under review", () => {
    expect(canDecideProposal("in_review", true).ok).toBe(true);
  });

  it("refuses the maker outright, on every status", () => {
    for (const status of proposalStatuses) {
      const gate = canDecideProposal(status, false);
      expect(gate.ok).toBe(false);
      expect(gate.reason).toMatch(/approver/i);
    }
  });

  it("refuses an approver on a proposal that is not under review", () => {
    expect(canDecideProposal("draft", true).ok).toBe(false);
    expect(canDecideProposal("draft", true).reason).toMatch(/not been submitted/i);
    expect(canDecideProposal("sent", true).ok).toBe(false);
  });
});

describe("canSendProposal", () => {
  const approvedNow = resolveApprovalState([decision({ revisionNumber: 4 })], 4);

  it("opens for an approver holding an approval of the current revision", () => {
    expect(
      canSendProposal({ status: "in_review", isApprover: true, approval: approvedNow, currentRevision: 4 }).ok,
    ).toBe(true);
  });

  it("refuses the maker even when the proposal is fully approved", () => {
    const gate = canSendProposal({
      status: "in_review",
      isApprover: false,
      approval: approvedNow,
      currentRevision: 4,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/approver/i);
  });

  it("refuses an approver when nothing has been approved", () => {
    const gate = canSendProposal({
      status: "in_review",
      isApprover: true,
      approval: resolveApprovalState([], 4),
      currentRevision: 4,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/Approve this proposal/i);
  });

  // Approve a modest scope, rewrite it, send the rewrite. This is the attack
  // the revision pin exists to stop.
  it("refuses to spend an approval on a revision it was not given for", () => {
    const gate = canSendProposal({
      status: "in_review",
      isApprover: true,
      approval: resolveApprovalState([decision({ revisionNumber: 4 })], 5),
      currentRevision: 5,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain("v4 was approved");
    expect(gate.reason).toContain("now on v5");
  });

  it("refuses to send straight from draft", () => {
    const gate = canSendProposal({
      status: "draft",
      isApprover: true,
      approval: approvedNow,
      currentRevision: 4,
    });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/Submit this proposal for review/i);
  });
});

describe("canDispatchToClient", () => {
  it("lets an approver issue a sent proposal", () => {
    expect(canDispatchToClient("sent", true).ok).toBe(true);
  });

  it("refuses the maker on a sent proposal", () => {
    expect(canDispatchToClient("sent", false).ok).toBe(false);
  });

  // sendProposalToDocusign() previously checked only that the proposal existed.
  it("refuses to put a draft in front of a client for signature", () => {
    for (const status of ["draft", "in_review", "accepted", "declined", "archived"] as ProposalStatus[]) {
      expect(canDispatchToClient(status, true).ok).toBe(false);
    }
  });
});

describe("editVoidsApproval", () => {
  it("voids on a maker's edit and carries forward on an approver's", () => {
    expect(editVoidsApproval(false)).toBe(true);
    expect(editVoidsApproval(true)).toBe(false);
  });
});

describe("normalizeDecisionNote", () => {
  it("trims, and treats blank as absent", () => {
    expect(normalizeDecisionNote("  fix the price  ")).toEqual({ ok: true, value: "fix the price" });
    expect(normalizeDecisionNote("   ")).toEqual({ ok: true, value: null });
    expect(normalizeDecisionNote(null)).toEqual({ ok: true, value: null });
    expect(normalizeDecisionNote(undefined)).toEqual({ ok: true, value: null });
  });

  it("rejects a non-string and an over-long note", () => {
    expect(normalizeDecisionNote(42).ok).toBe(false);
    expect(normalizeDecisionNote("x".repeat(decisionNoteMaxLength + 1)).ok).toBe(false);
    expect(normalizeDecisionNote("x".repeat(decisionNoteMaxLength)).ok).toBe(true);
  });
});

describe("isProposalDecision", () => {
  it("accepts only the two recorded decisions", () => {
    expect(isProposalDecision("approved")).toBe(true);
    expect(isProposalDecision("changes_requested")).toBe(true);
    expect(isProposalDecision("sent")).toBe(false);
    expect(isProposalDecision(null)).toBe(false);
  });
});
