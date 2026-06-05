export type CompanyAuthConfirmType = "invite" | "recovery" | "magiclink" | "email";
export type CompanyAuthLinkType = Extract<CompanyAuthConfirmType, "invite" | "recovery">;

const passwordSetupPath = "/auth/update-password";
const invitePasswordSetupPath = `${passwordSetupPath}?mode=invite`;
const employeeHomePath = "/employee";

function isEmployeePath(pathname: string) {
  return pathname === employeeHomePath || pathname.startsWith(`${employeeHomePath}/`);
}

function isPasswordSetupPath(pathname: string) {
  return pathname === passwordSetupPath;
}

function normalizeRelativePath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  try {
    const url = new URL(value, "https://company.local");
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function getCompanyAuthFallbackPath(type: CompanyAuthConfirmType) {
  return type === "invite" ? invitePasswordSetupPath : type === "recovery" ? passwordSetupPath : employeeHomePath;
}

export function getSafeCompanyAuthNext(value: string | null, type: CompanyAuthConfirmType) {
  const fallback = getCompanyAuthFallbackPath(type);
  const next = normalizeRelativePath(value);

  if (!next) {
    return fallback;
  }

  const { pathname } = new URL(next, "https://company.local");

  if (type === "invite" || type === "recovery") {
    return isPasswordSetupPath(pathname) ? next : fallback;
  }

  return isEmployeePath(pathname) || isPasswordSetupPath(pathname) ? next : fallback;
}

export function buildCompanyAuthLink(siteUrl: string, tokenHash: string, type: CompanyAuthLinkType) {
  const url = new URL("/auth/confirm", siteUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", getCompanyAuthFallbackPath(type));
  return url.toString();
}
