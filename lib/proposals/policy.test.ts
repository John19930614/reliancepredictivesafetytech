import { describe, expect, it } from "vitest";
import {
  canEditProposalContent,
  canTransitionProposal,
  nextRevisionNumber,
  resolveProposalRoleFlags,
} from "./policy";

describe("proposal status transitions", () => {
  it("allows the normal forward path draft → in_review → sent → accepted", () => {
    expect(canTransitionProposal("draft", "in_review").ok).toBe(true);
    expect(canTransitionProposal("in_review", "sent").ok).toBe(true);
    expect(canTransitionProposal("sent", "accepted").ok).toBe(true);
  });

  it("allows reopening for a new revision after sent or declined", () => {
    expect(canTransitionProposal("sent", "draft").ok).toBe(true);
    expect(canTransitionProposal("declined", "draft").ok).toBe(true);
    expect(canTransitionProposal("archived", "draft").ok).toBe(true);
  });

  it("rejects invalid or no-op transitions", () => {
    expect(canTransitionProposal("draft", "draft").ok).toBe(false);
    expect(canTransitionProposal("draft", "accepted").ok).toBe(false);
    expect(canTransitionProposal("accepted", "sent").ok).toBe(false);
    expect(canTransitionProposal("accepted", "draft").ok).toBe(false);
    expect(canTransitionProposal("archived", "sent").ok).toBe(false);
  });
});

describe("proposal edit lock", () => {
  it("permits content edits while drafting or in review", () => {
    expect(canEditProposalContent("draft").ok).toBe(true);
    expect(canEditProposalContent("in_review").ok).toBe(true);
  });

  it("locks content once sent, decided, or archived", () => {
    expect(canEditProposalContent("sent").ok).toBe(false);
    expect(canEditProposalContent("accepted").ok).toBe(false);
    expect(canEditProposalContent("declined").ok).toBe(false);
    expect(canEditProposalContent("archived").ok).toBe(false);
  });
});

describe("revision numbering", () => {
  it("increments from the current revision", () => {
    expect(nextRevisionNumber(1)).toBe(2);
    expect(nextRevisionNumber(7)).toBe(8);
  });

  it("never produces a revision below 2 for malformed input", () => {
    expect(nextRevisionNumber(0)).toBe(2);
    expect(nextRevisionNumber(-3)).toBe(2);
  });
});

describe("proposal RBAC flags", () => {
  it("grants read + manage to every active portal role", () => {
    for (const role of ["employee", "marketing", "internal_reviewer"]) {
      const flags = resolveProposalRoleFlags(role, true);
      expect(flags.canRead).toBe(true);
      expect(flags.canManage).toBe(true);
      expect(flags.isAdmin).toBe(false);
    }
  });

  it("grants delete rights to admins only", () => {
    for (const role of ["platform_admin", "super_admin", "company_admin", "admin"]) {
      expect(resolveProposalRoleFlags(role, true).isAdmin).toBe(true);
    }
    expect(resolveProposalRoleFlags("employee", true).isAdmin).toBe(false);
  });

  it("denies everything to inactive or unknown users", () => {
    expect(resolveProposalRoleFlags("admin", false)).toEqual({ canRead: false, canManage: false, isAdmin: false });
    expect(resolveProposalRoleFlags(null, true).canRead).toBe(true);
    expect(resolveProposalRoleFlags(null, false).canRead).toBe(false);
  });
});
