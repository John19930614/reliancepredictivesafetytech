import { describe, expect, it } from "vitest";
import { validateModuleSpec, buildModuleSpecSummary } from "./module-spec";
import type { ModuleSpec } from "./module-spec";

const validSpec: ModuleSpec = {
  moduleId: "platform_sprint",
  purpose: "Manage development sprints, task breakdown, and velocity tracking.",
  rolesAllowed: ["platform_admin", "super_admin"],
  group: "Platform",
  pathPrefix: "/employee/platform/sprint",
  dataObjects: ["platform_sprints", "platform_sprint_tasks"],
  workflowStates: ["planning", "active", "completed"],
  acceptanceCriteria: [
    "platform_admin can create and activate a sprint",
    "regular employee cannot access sprint planning",
    "completed sprint retains all tasks",
  ],
  platformRolesOnly: true,
  minimumTestScenarios: 5,
};

describe("validateModuleSpec", () => {
  it("passes a fully valid spec", () => {
    const { valid, errors } = validateModuleSpec(validSpec);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it("rejects invalid moduleId (camelCase)", () => {
    const { errors } = validateModuleSpec({ ...validSpec, moduleId: "platformSprint" });
    expect(errors.some((e) => e.includes("snake_case"))).toBe(true);
  });

  it("rejects empty purpose", () => {
    const { errors } = validateModuleSpec({ ...validSpec, purpose: "" });
    expect(errors.some((e) => e.includes("purpose"))).toBe(true);
  });

  it("rejects empty rolesAllowed", () => {
    const { errors } = validateModuleSpec({ ...validSpec, rolesAllowed: [] });
    expect(errors.some((e) => e.includes("rolesAllowed"))).toBe(true);
  });

  it("rejects pathPrefix not starting with /employee/", () => {
    const { errors } = validateModuleSpec({ ...validSpec, pathPrefix: "/admin/sprint" });
    expect(errors.some((e) => e.includes("pathPrefix"))).toBe(true);
  });

  it("rejects empty dataObjects", () => {
    const { errors } = validateModuleSpec({ ...validSpec, dataObjects: [] });
    expect(errors.some((e) => e.includes("dataObjects"))).toBe(true);
  });

  it("rejects fewer than 2 acceptance criteria", () => {
    const { errors } = validateModuleSpec({ ...validSpec, acceptanceCriteria: ["only one criterion"] });
    expect(errors.some((e) => e.includes("acceptanceCriteria"))).toBe(true);
  });

  it("rejects Platform group without platformRolesOnly", () => {
    const { errors } = validateModuleSpec({ ...validSpec, platformRolesOnly: false });
    expect(errors.some((e) => e.includes("platformRolesOnly"))).toBe(true);
  });

  it("rejects Platform group with fewer than 5 test scenarios", () => {
    const { errors } = validateModuleSpec({ ...validSpec, minimumTestScenarios: 3 });
    expect(errors.some((e) => e.includes("minimumTestScenarios"))).toBe(true);
  });

  it("allows non-Platform group without platformRolesOnly", () => {
    const nonPlatformSpec: ModuleSpec = {
      ...validSpec,
      group: "Command",
      pathPrefix: "/employee/dashboard",
      platformRolesOnly: false,
      minimumTestScenarios: 0,
    };
    const { errors } = validateModuleSpec(nonPlatformSpec);
    expect(errors.filter((e) => e.includes("platformRolesOnly"))).toHaveLength(0);
  });
});

describe("buildModuleSpecSummary", () => {
  it("produces a string summary with all required fields", () => {
    const summary = buildModuleSpecSummary(validSpec);
    expect(summary).toContain("MODULE_ID: platform_sprint");
    expect(summary).toContain("GROUP: Platform");
    expect(summary).toContain("PLATFORM_ROLES_ONLY: true");
    expect(summary).toContain("WORKFLOW_STATES: planning → active → completed");
    expect(summary).toContain("- [ ]");
  });
});
