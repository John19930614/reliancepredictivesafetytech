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

const employeeSelfServicePaths = [
  "/employee",
  "/employee/ai",
  "/employee/company-tree",
  "/employee/hr-onboarding",
  "/employee/time-cards",
] as const;

const commercialPaths = [
  "/employee/demo-showcase",
  "/employee/inbox",
  "/employee/sales",
  "/employee/active-companies",
  "/employee/clients",
] as const;

const operationsPaths = [
  "/employee/operations",
  "/employee/checklist",
  "/employee/launch-gate",
] as const;

const governancePaths = [
  "/employee/documents",
  "/employee/legal-issues",
  "/employee/required-documents",
] as const;

const adminPaths = [
  "/employee/hr-documents",
  "/employee/users",
  "/employee/settings",
] as const;

const allPortalPaths = [
  ...employeeSelfServicePaths,
  ...commercialPaths,
  ...operationsPaths,
  ...governancePaths,
  ...adminPaths,
] as const;

export const portalRolePathAccess: Record<PortalUserRole, readonly string[]> = {
  platform_admin: allPortalPaths,
  super_admin: allPortalPaths,
  company_admin: allPortalPaths,
  admin: allPortalPaths,
  internal_reviewer: [
    ...employeeSelfServicePaths,
    ...operationsPaths,
    ...governancePaths,
    "/employee/active-companies",
  ],
  marketing: [
    ...employeeSelfServicePaths,
    ...commercialPaths,
    "/employee/documents",
    "/employee/required-documents",
  ],
  employee: employeeSelfServicePaths,
};

function normalizePortalPath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export function canAccessEmployeePath(
  role: string | null | undefined,
  accountStatus: string | null | undefined,
  pathname: string,
) {
  if (accountStatus !== "active" || !portalUserRoles.includes(role as PortalUserRole)) {
    return false;
  }

  const normalizedPath = normalizePortalPath(pathname);
  const allowedPaths = portalRolePathAccess[role as PortalUserRole];

  return allowedPaths.some((allowedPath) => normalizedPath === allowedPath || normalizedPath.startsWith(`${allowedPath}/`));
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
