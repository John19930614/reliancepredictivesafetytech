import { describe, expect, it } from "vitest";
import {
  buildPortalModuleAccessRows,
  canAccessEmployeePath,
  defaultEmployeePortalModuleKeys,
  getPortalModuleForPath,
  hasFullPortalVisibility,
  normalizePortalModuleKeys,
} from "./user-management";

describe("portal module access", () => {
  it("maps exact and nested employee paths to module grants", () => {
    expect(getPortalModuleForPath("/employee")?.key).toBe("dashboard");
    expect(getPortalModuleForPath("/employee/ai")?.key).toBe("ai_command");
    expect(getPortalModuleForPath("/employee/ai/history")?.key).toBe("ai_command");
  });

  it("maps client detail routes to active companies", () => {
    expect(getPortalModuleForPath("/employee/clients/client-123")?.key).toBe("active_companies");
    expect(canAccessEmployeePath("employee", "active", "/employee/clients/client-123", ["active_companies"])).toBe(true);
  });

  it("denies unknown paths and inactive users", () => {
    expect(canAccessEmployeePath("employee", "active", "/employee/not-real", ["dashboard"])).toBe(false);
    expect(canAccessEmployeePath("employee", "archived", "/employee", ["dashboard"])).toBe(false);
  });

  it("requires explicit module grants for non-owner roles", () => {
    expect(canAccessEmployeePath("employee", "active", "/employee", [])).toBe(false);
    expect(canAccessEmployeePath("admin", "active", "/employee/users", ["users"])).toBe(true);
    expect(canAccessEmployeePath("admin", "active", "/employee/users", ["dashboard"])).toBe(false);
  });

  it("lets platform admins and super admins see every module while active", () => {
    expect(hasFullPortalVisibility("platform_admin", "active")).toBe(true);
    expect(hasFullPortalVisibility("super_admin", "active")).toBe(true);
    expect(canAccessEmployeePath("super_admin", "active", "/employee/finance", [])).toBe(true);
    expect(canAccessEmployeePath("super_admin", "active", "/employee/payroll", [])).toBe(true);
    expect(canAccessEmployeePath("super_admin", "archived", "/employee/finance", [])).toBe(false);
  });

  it("maps payroll tracker routes to the payroll module", () => {
    expect(getPortalModuleForPath("/employee/payroll")?.key).toBe("payroll_tracker");
    expect(canAccessEmployeePath("employee", "active", "/employee/payroll", ["payroll_tracker"])).toBe(true);
    expect(canAccessEmployeePath("employee", "active", "/employee/payroll/history", ["dashboard"])).toBe(false);
  });

  it("normalizes selected module keys for visibility updates", () => {
    expect(normalizePortalModuleKeys(["dashboard", "dashboard", "not_a_module", null])).toEqual(["dashboard"]);
    expect(buildPortalModuleAccessRows("user-1", "admin-1", [])).toEqual([]);
    expect(buildPortalModuleAccessRows("user-1", "admin-1", ["dashboard", "users"])).toEqual([
      { user_id: "user-1", module_key: "dashboard", granted_by: "admin-1" },
      { user_id: "user-1", module_key: "users", granted_by: "admin-1" },
    ]);
  });

  it("grants enough default visibility for invited employees to enter onboarding and mail", () => {
    expect(defaultEmployeePortalModuleKeys).toEqual(["dashboard", "employee_mail", "hr_onboarding", "hr_documents", "time_cards", "employee_calendar"]);
    expect(canAccessEmployeePath("employee", "active", "/employee", defaultEmployeePortalModuleKeys)).toBe(true);
    expect(canAccessEmployeePath("employee", "active", "/employee/mail", defaultEmployeePortalModuleKeys)).toBe(true);
    expect(canAccessEmployeePath("employee", "active", "/employee/hr-onboarding", defaultEmployeePortalModuleKeys)).toBe(true);
    expect(canAccessEmployeePath("employee", "active", "/employee/time-cards", defaultEmployeePortalModuleKeys)).toBe(true);
  });
});
