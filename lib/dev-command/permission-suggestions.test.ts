import { describe, expect, it } from "vitest";
import { suggestPermissions } from "./permission-suggestions";

describe("suggestPermissions", () => {
  it("suggests database permission when the task mentions schema/migration/rls", () => {
    const result = suggestPermissions({ description: "Add an RLS policy for the new table", riskLevel: "low" });
    expect(result.database_changes_allowed).toBe(true);
    expect(result.file_changes_allowed).toBe(false);
  });

  it("suggests file permission when the task mentions a UI component", () => {
    const result = suggestPermissions({ description: "Add a new component to the dashboard page", riskLevel: "low" });
    expect(result.file_changes_allowed).toBe(true);
    expect(result.database_changes_allowed).toBe(false);
  });

  it("suggests deployment permission when the task mentions release/production", () => {
    const result = suggestPermissions({ description: "Ship this to production", riskLevel: "medium" });
    expect(result.deployment_allowed).toBe(true);
  });

  it("escalates github permission for high-risk tasks that touch db or files", () => {
    const result = suggestPermissions({ description: "Modify the migration for user_roles", riskLevel: "high" });
    expect(result.github_branch_allowed).toBe(true);
  });

  it("suggests nothing for an unrelated, low-risk description", () => {
    const result = suggestPermissions({ description: "Update the marketing copy wording", riskLevel: "low" });
    expect(result).toEqual({
      database_changes_allowed: false,
      file_changes_allowed: false,
      github_branch_allowed: false,
      deployment_allowed: false,
    });
  });
});
