import { describe, expect, it } from "vitest";
import {
  buildPortalModuleAccessRows,
  canAccessEmployeePath,
  canAssignPortalRole,
  canManagePortalUserAccount,
  defaultEmployeePortalModuleKeys,
  getAssignablePortalRoles,
  getPortalModuleForPath,
  getPortalRoleCommandRank,
  hasFullPortalVisibility,
  normalizePortalModuleKeys,
  portalModuleCatalog,
} from "./user-management";

describe("portal role assignment rank", () => {
  it("ranks super_admin above platform_admin", () => {
    // The order of `portalUserRoles` is the command rank, and super_admin has
    // to lead it: `isPortalSuperAdminRole` — which platform_admin does not
    // satisfy — is what gates employee profile edits and time-card approval.
    // Flipping these two would let a platform_admin promote someone into a
    // role that outranks it.
    expect(getPortalRoleCommandRank("super_admin")).toBeLessThan(getPortalRoleCommandRank("platform_admin"));
    expect(canAssignPortalRole("super_admin", "platform_admin")).toBe(true);
    expect(canAssignPortalRole("platform_admin", "super_admin")).toBe(false);
  });

  it("lets owners grant owner roles at or below their rank", () => {
    expect(canAssignPortalRole("super_admin", "super_admin")).toBe(true);
    expect(canAssignPortalRole("super_admin", "platform_admin")).toBe(true);
    expect(canAssignPortalRole("platform_admin", "platform_admin")).toBe(true);
  });

  it("stops non-owner admins from granting owner roles", () => {
    // `admin` and `company_admin` pass isPortalAdminRole but are not owners, so
    // without this they could promote anyone — including themselves — to
    // super_admin through the users module.
    expect(canAssignPortalRole("admin", "super_admin")).toBe(false);
    expect(canAssignPortalRole("admin", "platform_admin")).toBe(false);
    expect(canAssignPortalRole("company_admin", "super_admin")).toBe(false);
    expect(canAssignPortalRole("company_admin", "platform_admin")).toBe(false);
  });

  it("stops any admin from granting a role above their own rank", () => {
    expect(canAssignPortalRole("admin", "company_admin")).toBe(false);
    expect(canAssignPortalRole("platform_admin", "super_admin")).toBe(false);
  });

  it("allows peer and lower roles", () => {
    expect(canAssignPortalRole("admin", "admin")).toBe(true);
    expect(canAssignPortalRole("admin", "employee")).toBe(true);
    expect(canAssignPortalRole("admin", "internal_reviewer")).toBe(true);
    expect(canAssignPortalRole("company_admin", "admin")).toBe(true);
  });

  it("grants nothing to non-admin roles", () => {
    expect(canAssignPortalRole("employee", "employee")).toBe(false);
    expect(canAssignPortalRole("internal_reviewer", "employee")).toBe(false);
    expect(canAssignPortalRole(null, "employee")).toBe(false);
    expect(canAssignPortalRole(undefined, "employee")).toBe(false);
  });

  it("treats an unknown requested role as the lowest rank rather than failing open", () => {
    expect(canAssignPortalRole("admin", "not_a_role")).toBe(true);
    expect(canAssignPortalRole("employee", "not_a_role")).toBe(false);
  });

  it("lists only the roles a caller may pick", () => {
    expect(getAssignablePortalRoles("admin")).toEqual(["admin", "internal_reviewer", "marketing", "employee"]);
    // The top role can hand out anything, including its own.
    expect(getAssignablePortalRoles("super_admin")).toHaveLength(7);
    expect(getAssignablePortalRoles("platform_admin")).toEqual([
      "platform_admin",
      "company_admin",
      "admin",
      "internal_reviewer",
      "marketing",
      "employee",
    ]);
    expect(getAssignablePortalRoles("employee")).toEqual([]);
  });
});

describe("portal account management rank", () => {
  it("stops a lower admin from acting on a higher-ranked account", () => {
    expect(canManagePortalUserAccount("admin", "super_admin")).toBe(false);
    expect(canManagePortalUserAccount("admin", "company_admin")).toBe(false);
    expect(canManagePortalUserAccount("platform_admin", "super_admin")).toBe(false);
  });

  it("allows peer, lower, and role-less targets", () => {
    expect(canManagePortalUserAccount("admin", "admin")).toBe(true);
    expect(canManagePortalUserAccount("admin", "employee")).toBe(true);
    expect(canManagePortalUserAccount("admin", null)).toBe(true);
    expect(canManagePortalUserAccount("super_admin", "platform_admin")).toBe(true);
  });

  it("refuses non-admin callers outright", () => {
    expect(canManagePortalUserAccount("employee", "employee")).toBe(false);
    expect(canManagePortalUserAccount("employee", null)).toBe(false);
    expect(canManagePortalUserAccount(null, "employee")).toBe(false);
  });
});

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

  // The company directory rides the existing active_companies grant rather than
  // introducing a key of its own, so anyone who can already open a client record
  // can list companies — and nobody else gains a surface they did not have.
  it("gates the company directory on the same grant as the client record", () => {
    expect(getPortalModuleForPath("/employee/clients")?.key).toBe("active_companies");
    expect(canAccessEmployeePath("employee", "active", "/employee/clients", ["active_companies"])).toBe(true);
    expect(canAccessEmployeePath("employee", "active", "/employee/clients", ["dashboard"])).toBe(false);
    expect(canAccessEmployeePath("employee", "archived", "/employee/clients", ["active_companies"])).toBe(false);
    // Owners bypass grants entirely, the same way they do everywhere else.
    expect(canAccessEmployeePath("super_admin", "active", "/employee/clients", [])).toBe(true);
  });

  // The meetings index and the meeting room both ride the sales_pipeline grant,
  // so listing meetings never reaches someone who cannot open one.
  it("gates the sales meetings index on the sales pipeline grant", () => {
    expect(getPortalModuleForPath("/employee/sales-meetings")?.key).toBe("sales_pipeline");
    expect(canAccessEmployeePath("employee", "active", "/employee/sales-meetings", ["sales_pipeline"])).toBe(true);
    expect(canAccessEmployeePath("employee", "active", "/employee/sales-meetings", ["dashboard"])).toBe(false);
    expect(canAccessEmployeePath("employee", "archived", "/employee/sales-meetings", ["sales_pipeline"])).toBe(false);
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

  it("restricts the AI Dev Command Center to platform admins and super admins only", () => {
    expect(getPortalModuleForPath("/employee/platform/dev-command")?.key).toBe("platform_dev_command");
    expect(getPortalModuleForPath("/employee/platform/dev-command/tasks/task-1")?.key).toBe("platform_dev_command");
    expect(canAccessEmployeePath("platform_admin", "active", "/employee/platform/dev-command", [])).toBe(true);
    expect(canAccessEmployeePath("super_admin", "active", "/employee/platform/dev-command", [])).toBe(true);
    expect(canAccessEmployeePath("company_admin", "active", "/employee/platform/dev-command", ["platform_dev_command"])).toBe(false);
    expect(canAccessEmployeePath("employee", "active", "/employee/platform/dev-command", [])).toBe(false);
  });

  it("maps both talent engine tabs to the one ehs_talent_engine module", () => {
    // The console and the framework reference share a single module key, so a
    // grant opens both tabs and nobody has to be granted twice.
    expect(getPortalModuleForPath("/employee/talent-engine")?.key).toBe("ehs_talent_engine");
    expect(getPortalModuleForPath("/employee/talent-engine/framework")?.key).toBe("ehs_talent_engine");
    expect(getPortalModuleForPath("/employee/talent-engine/")?.key).toBe("ehs_talent_engine");
    expect(portalModuleCatalog.find((module) => module.key === "ehs_talent_engine")?.group).toBe("Commercial");
  });

  it("gates the talent engine on an explicit grant because it exposes bill, pay and spread", () => {
    expect(canAccessEmployeePath("employee", "active", "/employee/talent-engine", ["ehs_talent_engine"])).toBe(true);
    expect(canAccessEmployeePath("employee", "active", "/employee/talent-engine/framework", ["ehs_talent_engine"])).toBe(true);
    // Owner roles keep full visibility without an explicit grant.
    expect(canAccessEmployeePath("super_admin", "active", "/employee/talent-engine", [])).toBe(true);
    expect(canAccessEmployeePath("super_admin", "active", "/employee/talent-engine/framework", [])).toBe(true);
    // An active employee without the grant sees neither tab.
    expect(canAccessEmployeePath("employee", "active", "/employee/talent-engine", ["dashboard"])).toBe(false);
    expect(canAccessEmployeePath("employee", "active", "/employee/talent-engine/framework", ["dashboard"])).toBe(false);
    // The grant does not survive archiving the account.
    expect(canAccessEmployeePath("employee", "archived", "/employee/talent-engine", ["ehs_talent_engine"])).toBe(false);
    expect(canAccessEmployeePath("employee", "archived", "/employee/talent-engine/framework", ["ehs_talent_engine"])).toBe(false);
    expect(canAccessEmployeePath("super_admin", "archived", "/employee/talent-engine", [])).toBe(false);
  });

  it("keeps the talent engine out of the default employee grant", () => {
    expect(defaultEmployeePortalModuleKeys).not.toContain("ehs_talent_engine");
    expect(canAccessEmployeePath("employee", "active", "/employee/talent-engine", defaultEmployeePortalModuleKeys)).toBe(false);
  });

  it("puts the web-sourcing review queue on the same grant, with no second module key", () => {
    // /employee/talent-engine/leads is a SUB-PATH of the module's single prefix,
    // so `startsWith` already resolves it. That is deliberate: a separate key
    // would have to be handed out again, and everyone who can already see bill
    // rates, pay rates and the spread would arrive at the review queue locked
    // out of the very thing they are meant to review.
    expect(getPortalModuleForPath("/employee/talent-engine/leads")?.key).toBe("ehs_talent_engine");
    expect(getPortalModuleForPath("/employee/talent-engine/leads/")?.key).toBe("ehs_talent_engine");
    expect(getPortalModuleForPath("/employee/talent-engine/leads?status=new")?.key).toBe("ehs_talent_engine");

    // Nothing else in the catalog claims a piece of the talent-engine surface,
    // so there is exactly one grant to reason about for the whole module.
    const talentModules = portalModuleCatalog.filter((module) =>
      module.pathPrefixes.some((prefix) => prefix.startsWith("/employee/talent-engine")),
    );
    expect(talentModules.map((module) => module.key)).toEqual(["ehs_talent_engine"]);

    // The grant, and only the grant, opens the queue for a non-owner role.
    expect(canAccessEmployeePath("employee", "active", "/employee/talent-engine/leads", ["ehs_talent_engine"])).toBe(true);
    expect(canAccessEmployeePath("internal_reviewer", "active", "/employee/talent-engine/leads", ["ehs_talent_engine"])).toBe(true);
    expect(canAccessEmployeePath("employee", "active", "/employee/talent-engine/leads", ["dashboard"])).toBe(false);
    expect(canAccessEmployeePath("employee", "active", "/employee/talent-engine/leads", [])).toBe(false);
    expect(canAccessEmployeePath("employee", "active", "/employee/talent-engine/leads", defaultEmployeePortalModuleKeys)).toBe(false);

    // Owner roles keep full visibility without an explicit grant; archiving the
    // account still closes the queue for everyone, grant or not.
    expect(canAccessEmployeePath("super_admin", "active", "/employee/talent-engine/leads", [])).toBe(true);
    expect(canAccessEmployeePath("platform_admin", "active", "/employee/talent-engine/leads", [])).toBe(true);
    expect(canAccessEmployeePath("employee", "archived", "/employee/talent-engine/leads", ["ehs_talent_engine"])).toBe(false);
    expect(canAccessEmployeePath("super_admin", "archived", "/employee/talent-engine/leads", [])).toBe(false);
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
    expect(defaultEmployeePortalModuleKeys).toEqual(["dashboard", "mobile_app", "employee_mail", "hr_onboarding", "hr_documents", "time_cards", "employee_time_off", "employee_calendar", "file_center"]);
    expect(canAccessEmployeePath("employee", "active", "/employee", defaultEmployeePortalModuleKeys)).toBe(true);
    expect(canAccessEmployeePath("employee", "active", "/employee/mail", defaultEmployeePortalModuleKeys)).toBe(true);
    expect(canAccessEmployeePath("employee", "active", "/employee/hr-onboarding", defaultEmployeePortalModuleKeys)).toBe(true);
    expect(canAccessEmployeePath("employee", "active", "/employee/time-cards", defaultEmployeePortalModuleKeys)).toBe(true);
    // Every employee can request their own leave without an extra grant.
    expect(canAccessEmployeePath("employee", "active", "/employee/time-off", defaultEmployeePortalModuleKeys)).toBe(true);
    // New employees get the phone app by default; the data-bearing tabs inside
    // it still need their own grants, so this hands out no extra records.
    expect(canAccessEmployeePath("employee", "active", "/m", defaultEmployeePortalModuleKeys)).toBe(true);
    // The File Center is default-visible: filing is whole-team infrastructure,
    // and the tables' RLS already reads at portal-employee level.
    expect(canAccessEmployeePath("employee", "active", "/employee/files", defaultEmployeePortalModuleKeys)).toBe(true);
    expect(canAccessEmployeePath("employee", "active", "/employee/sales", defaultEmployeePortalModuleKeys)).toBe(false);
    expect(canAccessEmployeePath("employee", "active", "/employee/parking-lots", defaultEmployeePortalModuleKeys)).toBe(false);
  });
});
