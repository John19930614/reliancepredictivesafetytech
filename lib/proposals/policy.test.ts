import { describe, expect, it } from "vitest";
import {
  canEditProposalContent,
  canEditProposalMeta,
  canTransitionProposal,
  isProposalPortalRole,
  nextRevisionNumber,
  proposalTitleMaxLength,
  proposalValueMax,
  resolveProposalRoleFlags,
  validateProposalFields,
} from "./policy";
import { portalUserRoles } from "@/lib/user-management";

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

describe("proposal commercial-field lock", () => {
  it("permits company/value/expiry edits only while the proposal is a draft", () => {
    expect(canEditProposalMeta("draft").ok).toBe(true);
  });

  it("freezes company/value/expiry as soon as the offer leaves draft", () => {
    for (const status of ["in_review", "sent", "accepted", "declined", "archived"] as const) {
      const gate = canEditProposalMeta(status);
      expect(gate.ok).toBe(false);
      expect(gate.reason).toContain(status);
    }
  });

  it("is stricter than the content lock, which still allows in_review revisions", () => {
    expect(canEditProposalContent("in_review").ok).toBe(true);
    expect(canEditProposalMeta("in_review").ok).toBe(false);
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

  it("denies everything to inactive users", () => {
    expect(resolveProposalRoleFlags("admin", false)).toEqual({
      canRead: false,
      canManage: false,
      isAdmin: false,
      canApprove: false,
    });
    expect(resolveProposalRoleFlags(null, false).canRead).toBe(false);
  });

  // The maker–checker split exists because the author and the reviewer both
  // hold super_admin. If the approver capability were derived from the role,
  // they would be indistinguishable and there would be no split to enforce.
  it("never grants the approver capability from a role alone", () => {
    for (const role of portalUserRoles) {
      expect(resolveProposalRoleFlags(role, true).canApprove).toBe(false);
    }
    expect(resolveProposalRoleFlags("super_admin", true, true).canApprove).toBe(true);
  });

  it("revokes the approver capability with portal access, even when the grant stands", () => {
    // Archiving someone must stop them sending proposals without anyone having
    // to remember to clear the column too.
    expect(resolveProposalRoleFlags("super_admin", false, true).canApprove).toBe(false);
    expect(resolveProposalRoleFlags("not_a_portal_role", true, true).canApprove).toBe(false);
  });

  // The DB predicate is_company_portal_employee() whitelists exactly the seven
  // portalUserRoles. Granting manage rights to a role outside that list makes
  // the UI claim success on a write RLS silently discards.
  it("mirrors the is_company_portal_employee() whitelist exactly", () => {
    expect([...portalUserRoles].sort()).toEqual(
      ["admin", "company_admin", "employee", "internal_reviewer", "marketing", "platform_admin", "super_admin"].sort(),
    );
    for (const role of portalUserRoles) {
      expect(isProposalPortalRole(role)).toBe(true);
      expect(resolveProposalRoleFlags(role, true).canManage).toBe(true);
    }
  });

  it("denies an active row whose role is null or outside the whitelist", () => {
    expect(resolveProposalRoleFlags(null, true)).toEqual({ canApprove: false, canRead: false, canManage: false, isAdmin: false });
    expect(resolveProposalRoleFlags(undefined, true).canManage).toBe(false);
    for (const role of ["client_user", "contractor", "viewer", "", "ADMIN"]) {
      expect(isProposalPortalRole(role)).toBe(false);
      expect(resolveProposalRoleFlags(role, true)).toEqual({ canApprove: false, canRead:false, canManage: false, isAdmin: false });
    }
  });
});

describe("proposal field validation", () => {
  it("accepts a well-formed payload", () => {
    const result = validateProposalFields({
      title: "SafetyIQ Rollout",
      clientId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      proposalValue: 25000,
      validUntil: "2026-12-31",
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("only validates fields that are present in the payload", () => {
    expect(validateProposalFields({}).ok).toBe(true);
    expect(validateProposalFields({ clientId: null, proposalValue: null, validUntil: null }).ok).toBe(true);
    expect(validateProposalFields({ clientId: "", validUntil: "" }).ok).toBe(true);
  });

  it("requires a title and caps its length", () => {
    expect(validateProposalFields({ title: "   " }).errors.title).toBeTruthy();
    expect(validateProposalFields({ title: null }).errors.title).toBeTruthy();
    expect(validateProposalFields({ title: "a".repeat(proposalTitleMaxLength) }).ok).toBe(true);
    expect(validateProposalFields({ title: "a".repeat(proposalTitleMaxLength + 1) }).errors.title).toBeTruthy();
  });

  it("rejects non-finite, negative, and oversized proposal values", () => {
    expect(validateProposalFields({ proposalValue: Number.NaN }).errors.proposalValue).toBeTruthy();
    expect(validateProposalFields({ proposalValue: Number.POSITIVE_INFINITY }).errors.proposalValue).toBeTruthy();
    expect(validateProposalFields({ proposalValue: -1 }).errors.proposalValue).toBeTruthy();
    expect(validateProposalFields({ proposalValue: proposalValueMax + 1 }).errors.proposalValue).toBeTruthy();
    expect(validateProposalFields({ proposalValue: 0 }).ok).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    expect(validateProposalFields({ validUntil: "not-a-date" }).errors.validUntil).toBeTruthy();
    expect(validateProposalFields({ validUntil: "2026-02-30" }).errors.validUntil).toBeTruthy();
    expect(validateProposalFields({ validUntil: "12/31/2026" }).errors.validUntil).toBeTruthy();
    expect(validateProposalFields({ validUntil: "2026-02-28" }).ok).toBe(true);
  });

  it("rejects a client id that is not a uuid", () => {
    expect(validateProposalFields({ clientId: "1; drop table client_proposals" }).errors.clientId).toBeTruthy();
    expect(validateProposalFields({ clientId: "not-a-uuid" }).errors.clientId).toBeTruthy();
  });

  it("surfaces the first message as a single-line error", () => {
    const result = validateProposalFields({ title: "", proposalValue: -5 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(result.errors.title);
  });
});
