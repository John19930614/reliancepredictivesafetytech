import type { PortalModuleKey } from "@/lib/user-management";
import { canAccessPortalModule } from "@/lib/user-management";

/**
 * The installable mobile app (/m) is gated as a single module — `mobile_app` —
 * so an admin can turn the phone experience on or off per user. Each tab inside
 * it then re-checks the desktop module that owns the same data, so the phone can
 * never widen anyone's access beyond what they already have in the portal.
 *
 * Chat has no module key: it is the portal-wide presence chat that every active
 * employee already gets in the desktop shell, so `requiredModuleKey` is null.
 */
export const mobileAppTabs = [
  { key: "home", label: "Home", href: "/m", requiredModuleKey: null },
  { key: "chat", label: "Chat", href: "/m/chat", requiredModuleKey: null },
  { key: "ideas", label: "Ideas", href: "/m/ideas", requiredModuleKey: "parking_lots" },
  { key: "leads", label: "Leads", href: "/m/leads", requiredModuleKey: "sales_pipeline" },
] as const satisfies readonly {
  key: string;
  label: string;
  href: string;
  requiredModuleKey: PortalModuleKey | null;
}[];

export type MobileAppTab = (typeof mobileAppTabs)[number];
export type MobileAppTabKey = MobileAppTab["key"];

export const mobileAppModuleKey = "mobile_app" satisfies PortalModuleKey;

/** Longest-prefix match, so /m/leads/abc resolves to the Leads tab, not Home. */
export function getMobileTabForPath(pathname: string): MobileAppTab | null {
  const [withoutHash] = pathname.split("#", 1);
  const [path] = withoutHash.split("?", 1);
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

  let match: MobileAppTab | null = null;

  for (const tab of mobileAppTabs) {
    if (normalized === tab.href || normalized.startsWith(`${tab.href}/`)) {
      if (!match || tab.href.length > match.href.length) {
        match = tab;
      }
    }
  }

  return match;
}

export function canAccessMobileApp(
  role: string | null | undefined,
  accountStatus: string | null | undefined,
  moduleKeys: readonly (string | null | undefined)[] | null | undefined,
) {
  return canAccessPortalModule(role, accountStatus, mobileAppModuleKey, moduleKeys);
}

export function canAccessMobileTab(
  tab: MobileAppTab,
  role: string | null | undefined,
  accountStatus: string | null | undefined,
  moduleKeys: readonly (string | null | undefined)[] | null | undefined,
) {
  if (!canAccessMobileApp(role, accountStatus, moduleKeys)) {
    return false;
  }

  if (!tab.requiredModuleKey) {
    return accountStatus === "active";
  }

  return canAccessPortalModule(role, accountStatus, tab.requiredModuleKey, moduleKeys);
}

export function getVisibleMobileTabs(
  role: string | null | undefined,
  accountStatus: string | null | undefined,
  moduleKeys: readonly (string | null | undefined)[] | null | undefined,
) {
  return mobileAppTabs.filter((tab) => canAccessMobileTab(tab, role, accountStatus, moduleKeys));
}

/** Lane a freshly submitted idea lands in — triage happens on the desktop board. */
export const mobileIdeaDefaultLane = "parking_lot";

export const mobileLeadActivityTypes = ["Note", "Call", "Email", "Meeting", "Site Visit", "Follow Up"] as const;

export function formatRelativeTimestamp(iso: string | null | undefined, now: Date = new Date()) {
  if (!iso) {
    return "";
  }

  const then = new Date(iso);

  if (Number.isNaN(then.getTime())) {
    return "";
  }

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);

  if (seconds < 45) {
    return "just now";
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
