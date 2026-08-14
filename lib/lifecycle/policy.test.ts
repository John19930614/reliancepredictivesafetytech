import { describe, expect, it } from "vitest";
import { portalAdminRoles, portalUserRoles } from "@/lib/user-management";
import { isLifecyclePortalRole, resolveLifecycleRoleFlags } from "./policy";

const denied = {
  canRead: false,
  canManage: false,
  canAdvance: false,
  canSkip: false,
  canExit: false,
  canReopen: false,
  isAdmin: false,
};

describe("lifecycle RBAC flags", () => {
  it("lets every active portal role read, manage and advance", () => {
    for (const role of portalUserRoles) {
      const flags = resolveLifecycleRoleFlags(role, true);
      expect(flags.canRead, `${role} must read`).toBe(true);
      expect(flags.canManage, `${role} must manage`).toBe(true);
      expect(flags.canAdvance, `${role} must advance`).toBe(true);
    }
  });

  // A rep who has just been told the deal is dead has to be able to say so;
  // routing that through an admin is how pipelines fill with stale open deals.
  it("lets every active portal role close a deal", () => {
    for (const role of portalUserRoles) {
      expect(resolveLifecycleRoleFlags(role, true).canExit, `${role} canExit`).toBe(true);
    }
  });

  // ...but un-saying it, and jumping the process, are admin acts.
  it("grants skip and reopen to exactly the four admin roles", () => {
    // Compared as a set: portalAdminRoles is ordered by command rank, and that
    // order is free to change without affecting who may skip.
    expect([...portalAdminRoles].sort()).toEqual(["admin", "company_admin", "platform_admin", "super_admin"]);

    for (const role of portalUserRoles) {
      const expected = (portalAdminRoles as readonly string[]).includes(role);
      const flags = resolveLifecycleRoleFlags(role, true);
      expect(flags.canSkip, `${role} canSkip`).toBe(expected);
      expect(flags.canReopen, `${role} canReopen`).toBe(expected);
      expect(flags.isAdmin, `${role} isAdmin`).toBe(expected);
    }
  });

  it("denies everything to inactive users, whatever their role", () => {
    for (const role of portalUserRoles) {
      expect(resolveLifecycleRoleFlags(role, false), `inactive ${role}`).toEqual(denied);
    }
  });

  // The DB predicate is_company_portal_employee() whitelists exactly these
  // seven. Granting outside it makes the UI claim success on a write RLS drops.
  it("mirrors the is_company_portal_employee() whitelist exactly", () => {
    expect([...portalUserRoles].sort()).toEqual(
      ["admin", "company_admin", "employee", "internal_reviewer", "marketing", "platform_admin", "super_admin"].sort(),
    );
    for (const role of portalUserRoles) {
      expect(isLifecyclePortalRole(role), role).toBe(true);
    }
  });

  it("denies unknown, malformed and missing roles even when active", () => {
    for (const role of ["client_user", "contractor", "viewer", "ADMIN", "", null, undefined]) {
      expect(isLifecyclePortalRole(role), String(role)).toBe(false);
      expect(resolveLifecycleRoleFlags(role, true), String(role)).toEqual(denied);
    }
  });
});
