import { describe, expect, it } from "vitest";
import { isPortalAdminRole, portalUserRoles } from "@/lib/user-management";
import { resolveGrantRoleFlags } from "./policy";

describe("grant tracker RBAC", () => {
  it("lets every active portal role read, manage and change status", () => {
    for (const role of portalUserRoles) {
      const flags = resolveGrantRoleFlags(role, true);
      expect(flags.canRead, role).toBe(true);
      expect(flags.canManage, role).toBe(true);
      expect(flags.canChangeStatus, role).toBe(true);
    }
  });

  it("lets every active role record an outcome, including a decline", () => {
    // Someone who has just been told "no" must be able to say so without
    // waiting on an admin. What they cannot do is un-say it — see below.
    for (const role of portalUserRoles) {
      expect(resolveGrantRoleFlags(role, true).canRecordOutcome, role).toBe(true);
    }
  });

  it("restricts delete and reopen to admin roles", () => {
    // Derived from isPortalAdminRole rather than hard-coded, so a role added to
    // portalUserRoles later cannot silently inherit an exception.
    for (const role of portalUserRoles) {
      const flags = resolveGrantRoleFlags(role, true);
      const admin = isPortalAdminRole(role);
      expect(flags.canDelete, role).toBe(admin);
      expect(flags.canEditClosed, role).toBe(admin);
      expect(flags.isAdmin, role).toBe(admin);
    }

    expect(resolveGrantRoleFlags("employee", true).canDelete).toBe(false);
    expect(resolveGrantRoleFlags("internal_reviewer", true).canEditClosed).toBe(false);
    expect(resolveGrantRoleFlags("marketing", true).canDelete).toBe(false);
    expect(resolveGrantRoleFlags("super_admin", true).canDelete).toBe(true);
  });

  it("denies everything to an archived account, whatever its role", () => {
    for (const role of portalUserRoles) {
      const flags = resolveGrantRoleFlags(role, false);
      expect(Object.values(flags).every((value) => value === false), role).toBe(true);
    }
  });

  it("denies an unknown role", () => {
    // These seven roles must match the is_company_portal_employee() whitelist,
    // or the UI reports success on a write RLS silently discards.
    const flags = resolveGrantRoleFlags("not_a_role", true);
    expect(Object.values(flags).every((value) => value === false)).toBe(true);
    expect(Object.values(resolveGrantRoleFlags(null, true)).every((value) => value === false)).toBe(true);
  });
});
