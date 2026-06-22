export const portalUserRoles = [
  "platform_admin",
  "super_admin",
  "company_admin",
  "admin",
  "internal_reviewer",
  "marketing",
  "employee",
] as const;

export const portalAdminRoles = ["platform_admin", "super_admin", "company_admin", "admin"] as const;
export const portalOwnerRoles = ["platform_admin", "super_admin"] as const;

export const portalAccountStatuses = ["active", "archived"] as const;

export type PortalUserRole = (typeof portalUserRoles)[number];
export type PortalAdminRole = (typeof portalAdminRoles)[number];
export type PortalOwnerRole = (typeof portalOwnerRoles)[number];
export type PortalAccountStatus = (typeof portalAccountStatuses)[number];

export function getPortalRoleCommandRank(role: string | null | undefined) {
  const index = portalUserRoles.indexOf(role as PortalUserRole);

  return index === -1 ? portalUserRoles.length : index;
}

export function isPortalAdminRole(role: string | null | undefined): role is PortalAdminRole {
  return portalAdminRoles.includes(role as PortalAdminRole);
}

export function isPortalOwnerRole(role: string | null | undefined): role is PortalOwnerRole {
  return portalOwnerRoles.includes(role as PortalOwnerRole);
}

export function isPortalSuperAdminRole(role: string | null | undefined) {
  return role === "super_admin";
}

export const portalModuleCatalog = [
  { key: "dashboard", label: "Dashboard", group: "Command", pathPrefixes: ["/employee"] },
  { key: "ai_command", label: "AI Command", group: "Command", pathPrefixes: ["/employee/ai"] },
  { key: "website_operations", label: "Website Ops", group: "Command", pathPrefixes: ["/employee/website-operations"] },
  { key: "work_management", label: "Work Management", group: "Command", pathPrefixes: ["/employee/work"] },
  { key: "parking_lots", label: "Parking Lots", group: "Command", pathPrefixes: ["/employee/parking-lots"] },
  { key: "employee_expenses", label: "Expenses", group: "Command", pathPrefixes: ["/employee/expenses"] },
  { key: "reports", label: "Reports", group: "Command", pathPrefixes: ["/employee/reports"] },
  { key: "finance", label: "Finance Center", group: "Command", pathPrefixes: ["/employee/finance"] },
  { key: "payroll_tracker", label: "Payroll Tracker", group: "Command", pathPrefixes: ["/employee/payroll"] },
  { key: "operations_database", label: "Operations Database", group: "Command", pathPrefixes: ["/employee/operations"] },
  { key: "startup_checklist", label: "Startup Checklist", group: "Command", pathPrefixes: ["/employee/checklist"] },
  { key: "demo_showcase", label: "Demo Showcase", group: "Commercial", pathPrefixes: ["/employee/demo-showcase"] },
  { key: "request_inbox", label: "Request Inbox", group: "Commercial", pathPrefixes: ["/employee/inbox"] },
  { key: "sales_pipeline", label: "Sales Pipeline", group: "Commercial", pathPrefixes: ["/employee/sales", "/employee/sales-meetings"] },
  { key: "active_companies", label: "Active Companies", group: "Commercial", pathPrefixes: ["/employee/active-companies", "/employee/clients"] },
  { key: "employee_mail", label: "Employee Mail", group: "Commercial", pathPrefixes: ["/employee/mail"] },
  { key: "company_tree", label: "Company Tree", group: "People", pathPrefixes: ["/employee/company-tree"] },
  { key: "hr_onboarding", label: "HR Onboarding", group: "People", pathPrefixes: ["/employee/hr-onboarding"] },
  { key: "training", label: "Training", group: "People", pathPrefixes: ["/employee/training"] },
  { key: "performance_reviews", label: "Performance Reviews", group: "People", pathPrefixes: ["/employee/performance"] },
  { key: "hr_documents", label: "HR Documents", group: "People", pathPrefixes: ["/employee/hr-documents"] },
  { key: "time_cards", label: "Time Cards", group: "People", pathPrefixes: ["/employee/time-cards"] },
  { key: "employee_calendar", label: "Calendar", group: "People", pathPrefixes: ["/employee/calendar"] },
  { key: "master_document_library", label: "Master Document Library", group: "Governance", pathPrefixes: ["/employee/documents"] },
  { key: "legal_issues", label: "Legal Issues", group: "Governance", pathPrefixes: ["/employee/legal-issues"] },
  { key: "required_documents", label: "Required Documents", group: "Governance", pathPrefixes: ["/employee/required-documents"] },
  { key: "launch_gate", label: "Launch Gate", group: "Governance", pathPrefixes: ["/employee/launch-gate"] },
  { key: "users", label: "Users", group: "Admin", pathPrefixes: ["/employee/users"] },
  { key: "settings", label: "Settings", group: "Admin", pathPrefixes: ["/employee/settings"] },
  { key: "platform_sprint", label: "Sprint Planning", group: "Platform", pathPrefixes: ["/employee/platform/sprint"] },
  { key: "platform_releases", label: "Build & Release", group: "Platform", pathPrefixes: ["/employee/platform/releases"] },
  { key: "platform_qa", label: "QA & Testing", group: "Platform", pathPrefixes: ["/employee/platform/qa"] },
  { key: "platform_metrics", label: "Platform Metrics", group: "Platform", pathPrefixes: ["/employee/platform/metrics"] },
  { key: "platform_docs", label: "Runbooks & Docs", group: "Platform", pathPrefixes: ["/employee/platform/docs"] },
  { key: "platform_packages", label: "Vertical Packages", group: "Platform", pathPrefixes: ["/employee/platform/packages"] },
  { key: "platform_billing", label: "Billing & Subscriptions", group: "Platform", pathPrefixes: ["/employee/platform/billing"] },
  { key: "platform_audit", label: "Audit & Evidence", group: "Platform", pathPrefixes: ["/employee/platform/audit"] },
  { key: "platform_ai_services", label: "AI Services", group: "Platform", pathPrefixes: ["/employee/platform/ai-services"] },
  { key: "platform_infrastructure", label: "Infrastructure", group: "Platform", pathPrefixes: ["/employee/platform/infrastructure"] },
] as const;

export type PortalModule = (typeof portalModuleCatalog)[number];
export type PortalModuleKey = PortalModule["key"];

export const portalModuleKeys = portalModuleCatalog.map((module) => module.key);
export const defaultEmployeePortalModuleKeys = ["dashboard", "employee_mail", "hr_onboarding", "hr_documents", "time_cards", "employee_calendar"] as const satisfies readonly PortalModuleKey[];

function normalizePortalPath(pathname: string) {
  const [pathWithoutHash] = pathname.split("#", 1);
  const [pathWithoutQuery] = pathWithoutHash.split("?", 1);

  if (pathWithoutQuery.length > 1 && pathWithoutQuery.endsWith("/")) {
    return pathWithoutQuery.slice(0, -1);
  }

  return pathWithoutQuery;
}

function isPortalModuleKey(value: string | null | undefined): value is PortalModuleKey {
  return portalModuleKeys.includes(value as PortalModuleKey);
}

function moduleMatchesPath(module: PortalModule, pathname: string) {
  return module.pathPrefixes.some((pathPrefix) => {
    if (pathPrefix === "/employee") {
      return pathname === pathPrefix;
    }

    return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`);
  });
}

export function getPortalModuleForPath(pathname: string) {
  const normalizedPath = normalizePortalPath(pathname);

  return portalModuleCatalog.find((module) => moduleMatchesPath(module, normalizedPath)) ?? null;
}

export function normalizePortalModuleKeys(moduleKeys: readonly (string | null | undefined)[] | null | undefined) {
  return [...new Set((moduleKeys ?? []).filter(isPortalModuleKey))];
}

export function buildPortalModuleAccessRows(
  userId: string,
  grantedBy: string,
  moduleKeys: readonly (string | null | undefined)[] | null | undefined,
) {
  return normalizePortalModuleKeys(moduleKeys).map((moduleKey) => ({
    user_id: userId,
    module_key: moduleKey,
    granted_by: grantedBy,
  }));
}

export function hasFullPortalVisibility(role: string | null | undefined, accountStatus: string | null | undefined) {
  return accountStatus === "active" && isPortalOwnerRole(role);
}

export function isFinancePortalPath(pathname: string) {
  const normalizedPath = normalizePortalPath(pathname);
  return moduleMatchesPath(portalModuleCatalog.find((module) => module.key === "finance")!, normalizedPath);
}

export function canAccessPortalModule(
  role: string | null | undefined,
  accountStatus: string | null | undefined,
  moduleKey: string | null | undefined,
  moduleKeys: readonly (string | null | undefined)[] | null | undefined,
) {
  const module = isPortalModuleKey(moduleKey) ? portalModuleCatalog.find((m) => m.key === moduleKey) : undefined;

  // Platform group requires platform_admin or super_admin regardless of granted keys
  if (module?.group === "Platform") {
    return accountStatus === "active" && (role === "platform_admin" || role === "super_admin");
  }

  if (hasFullPortalVisibility(role, accountStatus)) {
    return true;
  }

  if (accountStatus !== "active" || !portalUserRoles.includes(role as PortalUserRole) || !isPortalModuleKey(moduleKey)) {
    return false;
  }

  return normalizePortalModuleKeys(moduleKeys).includes(moduleKey);
}

export function canAccessEmployeePath(
  role: string | null | undefined,
  accountStatus: string | null | undefined,
  pathname: string,
  moduleKeys: readonly (string | null | undefined)[] | null | undefined = [],
) {
  const module = getPortalModuleForPath(pathname);

  if (!module) {
    return false;
  }

  return canAccessPortalModule(role, accountStatus, module.key, moduleKeys);
}

export function formatPortalRole(role: string | null | undefined) {
  if (!role) {
    return "Unassigned";
  }

  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
