export interface VerticalPackageManifest {
  verticalKey: string;
  name: string;
  description: string;
  currentVersion: string;
  status: "development" | "pilot" | "production" | "deprecated";
  scenarioTestCount: number;
  pilotFeatureFlags?: Record<string, boolean>;
  repositoryUrl?: string;
}

export const VERTICAL_MIN_SCENARIOS: Record<VerticalPackageManifest["status"], number> = {
  development: 0,
  pilot: 20,
  production: 40,
  deprecated: 0,
};

export function validateVerticalPackageAdvancement(
  current: VerticalPackageManifest["status"],
  target: VerticalPackageManifest["status"],
  scenarioTestCount: number,
): { allowed: boolean; reason?: string } {
  const STATUS_ORDER = ["development", "pilot", "production", "deprecated"];
  const currentIdx = STATUS_ORDER.indexOf(current);
  const targetIdx = STATUS_ORDER.indexOf(target);

  if (target === "deprecated") {
    return { allowed: true };
  }

  if (targetIdx <= currentIdx) {
    return { allowed: false, reason: `Cannot downgrade status from ${current} to ${target}` };
  }

  const required = VERTICAL_MIN_SCENARIOS[target];
  if (scenarioTestCount < required) {
    return {
      allowed: false,
      reason: `${target} requires at least ${required} test scenarios; found ${scenarioTestCount}`,
    };
  }

  return { allowed: true };
}

export function validateVerticalManifest(manifest: VerticalPackageManifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!manifest.verticalKey || !/^[a-z][a-z0-9_]*$/.test(manifest.verticalKey)) {
    errors.push("verticalKey must be snake_case");
  }

  if (!manifest.name?.trim()) {
    errors.push("name is required");
  }

  if (!manifest.description?.trim()) {
    errors.push("description is required");
  }

  if (!manifest.currentVersion || !/^\d+\.\d+\.\d+$/.test(manifest.currentVersion)) {
    errors.push("currentVersion must be semver (e.g. 1.0.0)");
  }

  const advancement = validateVerticalPackageAdvancement(
    "development",
    manifest.status,
    manifest.scenarioTestCount,
  );

  if (!advancement.allowed && manifest.status !== "development") {
    errors.push(advancement.reason ?? "Status advancement not allowed");
  }

  return { valid: errors.length === 0, errors };
}
