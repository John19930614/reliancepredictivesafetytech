import { describe, expect, it } from "vitest";
import { resolveFileRoleFlags } from "./policy";
import { portalAdminRoles, portalUserRoles } from "@/lib/user-management";

const denied = { canRead: false, canManage: false, canDelete: false };

describe("resolveFileRoleFlags", () => {
  it("lets every active portal role read and manage the library", () => {
    for (const role of portalUserRoles) {
      const flags = resolveFileRoleFlags(role, true);
      expect(flags.canRead, `${role} must be able to read`).toBe(true);
      expect(flags.canManage, `${role} must be able to manage`).toBe(true);
    }
  });

  // Deleting a row orphans the stored object — the one capability that stays
  // admin-only, mirroring company_files_delete_admin in the migration.
  it("grants delete to exactly the four admin roles", () => {
    expect(portalAdminRoles).toEqual(["platform_admin", "super_admin", "company_admin", "admin"]);
    for (const role of portalUserRoles) {
      const expected = (portalAdminRoles as readonly string[]).includes(role);
      expect(resolveFileRoleFlags(role, true).canDelete, `${role} canDelete`).toBe(expected);
    }
  });

  it("denies everything to inactive users, whatever their role", () => {
    for (const role of portalUserRoles) {
      expect(resolveFileRoleFlags(role, false), `inactive ${role}`).toEqual(denied);
    }
  });

  it("denies unknown and missing roles even when active", () => {
    for (const role of ["client_user", "contractor", "viewer", "ADMIN", "", null, undefined]) {
      expect(resolveFileRoleFlags(role, true), String(role)).toEqual(denied);
    }
  });
});
