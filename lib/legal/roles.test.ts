import { describe, expect, it } from "vitest";
import { resolveLegalRoleFlags } from "./roles";

describe("resolveLegalRoleFlags (RBAC matrix)", () => {
  it("grants admins full CRUD", () => {
    for (const role of ["platform_admin", "super_admin", "company_admin", "admin"]) {
      const f = resolveLegalRoleFlags(role, true);
      expect(f).toEqual({ canRead: true, isAdmin: true, isReviewer: true });
    }
  });

  it("lets internal_reviewer review but not admin", () => {
    const f = resolveLegalRoleFlags("internal_reviewer", true);
    expect(f.isReviewer).toBe(true);
    expect(f.isAdmin).toBe(false);
    expect(f.canRead).toBe(true);
  });

  it("gives plain employees read-only access", () => {
    const f = resolveLegalRoleFlags("employee", true);
    expect(f).toEqual({ canRead: true, isAdmin: false, isReviewer: false });
  });

  it("denies everything to inactive accounts", () => {
    expect(resolveLegalRoleFlags("admin", false)).toEqual({ canRead: false, isAdmin: false, isReviewer: false });
    expect(resolveLegalRoleFlags(null, false)).toEqual({ canRead: false, isAdmin: false, isReviewer: false });
  });
});
