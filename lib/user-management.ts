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

export function formatPortalRole(role: string | null | undefined) {
  if (!role) {
    return "Unassigned";
  }

  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
