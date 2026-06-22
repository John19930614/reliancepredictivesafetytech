export type PortalGroupName = "Command" | "Commercial" | "People" | "Governance" | "Admin" | "Platform";

export interface ModuleSpec {
  moduleId: string;
  purpose: string;
  rolesAllowed: readonly string[];
  group: PortalGroupName;
  pathPrefix: string;
  dataObjects: readonly string[];
  workflowStates?: readonly string[];
  acceptanceCriteria: readonly string[];
  platformRolesOnly?: boolean;
  minimumTestScenarios?: number;
}

export function validateModuleSpec(spec: ModuleSpec): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!spec.moduleId || !/^[a-z][a-z0-9_]*$/.test(spec.moduleId)) {
    errors.push("moduleId must be snake_case starting with a letter");
  }

  if (!spec.purpose || spec.purpose.trim().length === 0) {
    errors.push("purpose is required");
  }

  if (!spec.rolesAllowed || spec.rolesAllowed.length === 0) {
    errors.push("rolesAllowed must list at least one role");
  }

  if (!spec.pathPrefix || !spec.pathPrefix.startsWith("/employee/")) {
    errors.push("pathPrefix must start with /employee/");
  }

  if (!spec.dataObjects || spec.dataObjects.length === 0) {
    errors.push("dataObjects must list at least one table");
  }

  if (!spec.acceptanceCriteria || spec.acceptanceCriteria.length < 2) {
    errors.push("acceptanceCriteria must have at least 2 criteria");
  }

  if (spec.group === "Platform" && !spec.platformRolesOnly) {
    errors.push("Platform group modules must set platformRolesOnly: true");
  }

  if (spec.group === "Platform" && (spec.minimumTestScenarios ?? 0) < 5) {
    errors.push("Platform group modules must have minimumTestScenarios >= 5");
  }

  return { valid: errors.length === 0, errors };
}

export function buildModuleSpecSummary(spec: ModuleSpec): string {
  const lines = [
    `MODULE_ID: ${spec.moduleId}`,
    `PURPOSE: ${spec.purpose}`,
    `ROLES_ALLOWED: ${spec.rolesAllowed.join(", ")}`,
    `GROUP: ${spec.group}`,
    `PATH_PREFIX: ${spec.pathPrefix}`,
    `DATA_OBJECTS: ${spec.dataObjects.join(", ")}`,
  ];

  if (spec.workflowStates?.length) {
    lines.push(`WORKFLOW_STATES: ${spec.workflowStates.join(" → ")}`);
  }

  if (spec.platformRolesOnly) {
    lines.push("PLATFORM_ROLES_ONLY: true");
  }

  lines.push("ACCEPTANCE_CRITERIA:");
  for (const criterion of spec.acceptanceCriteria) {
    lines.push(`  - [ ] ${criterion}`);
  }

  return lines.join("\n");
}
