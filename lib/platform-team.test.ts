import { describe, expect, it } from "vitest";
import {
  portalModuleCatalog,
  getPortalModuleForPath,
  canAccessEmployeePath,
} from "./user-management";

describe("Platform Team module catalog", () => {
  const platformKeys = [
    "platform_sprint", "platform_releases", "platform_qa",
    "platform_metrics", "platform_docs", "platform_packages",
    "platform_billing", "platform_audit", "platform_ai_services", "platform_infrastructure",
  ] as const;

  it("includes all 10 platform module keys", () => {
    const keys = portalModuleCatalog.map((m) => m.key);
    for (const key of platformKeys) {
      expect(keys).toContain(key);
    }
  });

  it("assigns all platform modules to the Platform group", () => {
    const platformModules = portalModuleCatalog.filter((m) => m.group === "Platform");
    expect(platformModules).toHaveLength(10);
    const keys = platformModules.map((m) => m.key);
    for (const key of platformKeys) {
      expect(keys).toContain(key);
    }
  });

  it("resolves /employee/platform/sprint path to platform_sprint module", () => {
    const mod = getPortalModuleForPath("/employee/platform/sprint");
    expect(mod?.key).toBe("platform_sprint");
  });

  it("resolves /employee/platform/releases path to platform_releases module", () => {
    const mod = getPortalModuleForPath("/employee/platform/releases");
    expect(mod?.key).toBe("platform_releases");
  });

  it("resolves /employee/platform/qa path", () => {
    const mod = getPortalModuleForPath("/employee/platform/qa");
    expect(mod?.key).toBe("platform_qa");
  });

  it("resolves /employee/platform/metrics path", () => {
    const mod = getPortalModuleForPath("/employee/platform/metrics");
    expect(mod?.key).toBe("platform_metrics");
  });

  it("resolves /employee/platform/docs path", () => {
    const mod = getPortalModuleForPath("/employee/platform/docs");
    expect(mod?.key).toBe("platform_docs");
  });

  it("resolves /employee/platform/packages path", () => {
    const mod = getPortalModuleForPath("/employee/platform/packages");
    expect(mod?.key).toBe("platform_packages");
  });
});

describe("Platform module access control", () => {
  const platformModuleKeys = ["platform_sprint", "platform_releases", "platform_qa", "platform_metrics", "platform_docs", "platform_packages"];

  it("platform_admin can access platform sprint path when module granted", () => {
    expect(canAccessEmployeePath("platform_admin", "active", "/employee/platform/sprint", platformModuleKeys)).toBe(true);
  });

  it("super_admin can access platform paths when module granted", () => {
    expect(canAccessEmployeePath("super_admin", "active", "/employee/platform/qa", platformModuleKeys)).toBe(true);
  });

  it("regular employee cannot access platform paths even with module keys listed", () => {
    expect(canAccessEmployeePath("employee", "active", "/employee/platform/sprint", platformModuleKeys)).toBe(false);
  });

  it("admin cannot access platform paths", () => {
    expect(canAccessEmployeePath("admin", "active", "/employee/platform/releases", platformModuleKeys)).toBe(false);
  });
});
