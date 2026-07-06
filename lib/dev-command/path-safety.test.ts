import { describe, expect, it } from "vitest";
import { checkPath, isDestructive } from "./path-safety";

describe("isDestructive", () => {
  it("treats any delete as destructive regardless of path", () => {
    expect(isDestructive("delete", "app/employee/dashboard/page.tsx")).toBe(true);
  });

  it("flags migrations, env files, workflows, middleware, and the supabase server client as destructive", () => {
    expect(isDestructive("modify", "supabase/migrations/20260101000000_x.sql")).toBe(true);
    expect(isDestructive("modify", ".env.local")).toBe(true);
    expect(isDestructive("create", ".github/workflows/deploy.yml")).toBe(true);
    expect(isDestructive("modify", "middleware.ts")).toBe(true);
    expect(isDestructive("modify", "lib/supabase/server.ts")).toBe(true);
  });

  it("does not flag an ordinary component create/modify", () => {
    expect(isDestructive("create", "app/employee/dashboard/page.tsx")).toBe(false);
    expect(isDestructive("modify", "components/EmployeeSidebar.tsx")).toBe(false);
  });
});

describe("checkPath", () => {
  it("flags paths that touch auth/RLS/permission/secret keywords", () => {
    expect(checkPath("lib/auth/session.ts").touchesSensitiveArea).toBe(true);
    expect(checkPath("supabase/migrations/x_rls_policy.sql").touchesSensitiveArea).toBe(true);
    expect(checkPath("app/employee/dashboard/page.tsx").touchesSensitiveArea).toBe(false);
  });

  it("detects attempts to escape the repo root", () => {
    expect(checkPath("../outside-repo/file.ts").isOutsideRepo).toBe(true);
    expect(checkPath("app/employee/dashboard/page.tsx").isOutsideRepo).toBe(false);
  });

  it("strips leading slashes", () => {
    expect(checkPath("/app/employee/page.tsx").path).toBe("app/employee/page.tsx");
  });
});
