import { describe, expect, it } from "vitest";
import { validateVerticalPackageAdvancement, validateVerticalManifest } from "./vertical-package";

describe("validateVerticalPackageAdvancement", () => {
  it("allows development → pilot with >= 20 scenarios", () => {
    const result = validateVerticalPackageAdvancement("development", "pilot", 20);
    expect(result.allowed).toBe(true);
  });

  it("blocks development → pilot with < 20 scenarios", () => {
    const result = validateVerticalPackageAdvancement("development", "pilot", 15);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("20");
  });

  it("blocks pilot → production with < 40 scenarios", () => {
    const result = validateVerticalPackageAdvancement("pilot", "production", 35);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("40");
  });

  it("allows pilot → production with >= 40 scenarios", () => {
    const result = validateVerticalPackageAdvancement("pilot", "production", 40);
    expect(result.allowed).toBe(true);
  });

  it("always allows advancement to deprecated", () => {
    const result = validateVerticalPackageAdvancement("production", "deprecated", 0);
    expect(result.allowed).toBe(true);
  });

  it("blocks status downgrade", () => {
    const result = validateVerticalPackageAdvancement("production", "pilot", 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("downgrade");
  });
});

describe("validateVerticalManifest", () => {
  const validManifest = {
    verticalKey: "safepredict",
    name: "SafePredict",
    description: "Predictive risk scoring engine.",
    currentVersion: "0.2.0",
    status: "development" as const,
    scenarioTestCount: 0,
  };

  it("passes a valid development manifest", () => {
    const { valid } = validateVerticalManifest(validManifest);
    expect(valid).toBe(true);
  });

  it("rejects invalid verticalKey (has uppercase)", () => {
    const { errors } = validateVerticalManifest({ ...validManifest, verticalKey: "SafePredict" });
    expect(errors.some((e) => e.includes("snake_case"))).toBe(true);
  });

  it("rejects missing description", () => {
    const { errors } = validateVerticalManifest({ ...validManifest, description: "" });
    expect(errors.some((e) => e.includes("description"))).toBe(true);
  });

  it("rejects non-semver version", () => {
    const { errors } = validateVerticalManifest({ ...validManifest, currentVersion: "v1.0" });
    expect(errors.some((e) => e.includes("semver"))).toBe(true);
  });

  it("rejects pilot status without enough scenarios", () => {
    const { errors } = validateVerticalManifest({ ...validManifest, status: "pilot", scenarioTestCount: 5 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts pilot status with 20+ scenarios", () => {
    const { valid } = validateVerticalManifest({ ...validManifest, status: "pilot", scenarioTestCount: 20 });
    expect(valid).toBe(true);
  });
});
