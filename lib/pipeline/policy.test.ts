import { describe, expect, it } from "vitest";
import { portalAdminRoles, portalUserRoles } from "@/lib/user-management";
import {
  checkOverrideReason,
  isPipelinePortalRole,
  maxOverrideReasonLength,
  minOverrideReasonLength,
  resolvePipelineRoleFlags,
} from "./policy";

const denied = {
  canRead: false,
  canAdvance: false,
  canOverride: false,
  canDraftInvoice: false,
  canSettleInvoice: false,
  isAdmin: false,
};

describe("pipeline RBAC flags", () => {
  it("lets every active portal role read, advance, and draft an invoice", () => {
    for (const role of portalUserRoles) {
      const flags = resolvePipelineRoleFlags(role, true);
      expect(flags.canRead, `${role} must read`).toBe(true);
      expect(flags.canAdvance, `${role} must advance`).toBe(true);
      expect(flags.canDraftInvoice, `${role} must draft`).toBe(true);
    }
  });

  // Overriding says "I am accountable for skipping a step" and settling asks a
  // client for money. Both are admin-only, and this is the test that stops a
  // new role quietly inheriting either.
  it("grants override and invoice settlement to exactly the four admin roles", () => {
    // Compared as a set: portalAdminRoles is ordered by command rank, and that
    // order is free to change without affecting who may override.
    expect([...portalAdminRoles].sort()).toEqual(["admin", "company_admin", "platform_admin", "super_admin"]);

    for (const role of portalUserRoles) {
      const expected = (portalAdminRoles as readonly string[]).includes(role);
      const flags = resolvePipelineRoleFlags(role, true);
      expect(flags.canOverride, `${role} canOverride`).toBe(expected);
      expect(flags.canSettleInvoice, `${role} canSettleInvoice`).toBe(expected);
      expect(flags.isAdmin, `${role} isAdmin`).toBe(expected);
    }
  });

  it("denies everything to inactive users, whatever their role", () => {
    for (const role of portalUserRoles) {
      expect(resolvePipelineRoleFlags(role, false), `inactive ${role}`).toEqual(denied);
    }
  });

  // The DB predicate is_company_portal_employee() whitelists exactly the seven
  // portalUserRoles. Granting to a role outside it makes the UI claim success
  // on a write RLS silently discards.
  it("mirrors the is_company_portal_employee() whitelist exactly", () => {
    expect([...portalUserRoles].sort()).toEqual(
      ["admin", "company_admin", "employee", "internal_reviewer", "marketing", "platform_admin", "super_admin"].sort(),
    );
    for (const role of portalUserRoles) {
      expect(isPipelinePortalRole(role), role).toBe(true);
    }
  });

  it("denies unknown, malformed, and missing roles even when active", () => {
    for (const role of ["client_user", "contractor", "viewer", "ADMIN", "", null, undefined]) {
      expect(isPipelinePortalRole(role), String(role)).toBe(false);
      expect(resolvePipelineRoleFlags(role, true), String(role)).toEqual(denied);
    }
  });
});

describe("checkOverrideReason", () => {
  it("accepts a reason that actually says something, trimmed", () => {
    const result = checkOverrideReason("  Client signed on paper, scan to follow Monday.  ");
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("Client signed on paper, scan to follow Monday.");
  });

  it("refuses an empty or whitespace-only reason", () => {
    for (const value of ["", "   ", "\n\t", null, undefined]) {
      const result = checkOverrideReason(value);
      expect(result.ok, String(value)).toBe(false);
      expect(result.error).toBeTruthy();
    }
  });

  // The whole value of the override record is that a later reader can act on
  // it. "ok" is indistinguishable from no reason at all.
  it("refuses a reason too short to be worth reading", () => {
    const result = checkOverrideReason("ok");
    expect(result.ok).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it("accepts a reason at exactly the floor", () => {
    const result = checkOverrideReason("a".repeat(minOverrideReasonLength));
    expect(result.ok).toBe(true);
  });

  it("refuses a reason longer than the column allows", () => {
    // The column CHECK caps this at 1000; failing here beats a 23514 at write.
    const result = checkOverrideReason("a".repeat(maxOverrideReasonLength + 1));
    expect(result.ok).toBe(false);
    expect(result.error).toContain(String(maxOverrideReasonLength));
  });

  it("accepts a reason at exactly the ceiling", () => {
    expect(checkOverrideReason("a".repeat(maxOverrideReasonLength)).ok).toBe(true);
  });
});
