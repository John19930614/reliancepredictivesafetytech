import { describe, expect, it } from "vitest";
import {
  canAccessMobileApp,
  canAccessMobileTab,
  formatRelativeTimestamp,
  getMobileTabForPath,
  getVisibleMobileTabs,
  mobileAppTabs,
} from "./mobile-app";
import { canAccessEmployeePath, getPortalModuleForPath } from "./user-management";

const IDEAS_TAB = mobileAppTabs.find((tab) => tab.key === "ideas")!;
const LEADS_TAB = mobileAppTabs.find((tab) => tab.key === "leads")!;
const CHAT_TAB = mobileAppTabs.find((tab) => tab.key === "chat")!;

describe("mobile app routing", () => {
  it("maps every /m path to the mobile_app module", () => {
    expect(getPortalModuleForPath("/m")?.key).toBe("mobile_app");
    expect(getPortalModuleForPath("/m/chat")?.key).toBe("mobile_app");
    expect(getPortalModuleForPath("/m/leads/client-123")?.key).toBe("mobile_app");
  });

  it("does not let the /m prefix swallow unrelated paths", () => {
    expect(getPortalModuleForPath("/mail")).toBeNull();
    expect(getPortalModuleForPath("/employee/mail")?.key).toBe("employee_mail");
  });

  it("resolves the deepest matching tab so detail routes stay on their tab", () => {
    expect(getMobileTabForPath("/m")?.key).toBe("home");
    expect(getMobileTabForPath("/m/leads")?.key).toBe("leads");
    expect(getMobileTabForPath("/m/leads/abc-123")?.key).toBe("leads");
    expect(getMobileTabForPath("/m/chat/thread-1?draft=hi")?.key).toBe("chat");
    expect(getMobileTabForPath("/m/ideas/")?.key).toBe("ideas");
    expect(getMobileTabForPath("/employee/sales")).toBeNull();
  });
});

describe("mobile app permissions", () => {
  it("requires the mobile_app grant before any tab is reachable", () => {
    expect(canAccessMobileApp("employee", "active", ["dashboard"])).toBe(false);
    expect(canAccessMobileApp("employee", "active", ["mobile_app"])).toBe(true);
    expect(canAccessMobileTab(CHAT_TAB, "employee", "active", ["parking_lots"])).toBe(false);
  });

  it("gates each tab on the desktop module that owns its data", () => {
    const withAppOnly = ["mobile_app"];
    expect(canAccessMobileTab(CHAT_TAB, "employee", "active", withAppOnly)).toBe(true);
    expect(canAccessMobileTab(IDEAS_TAB, "employee", "active", withAppOnly)).toBe(false);
    expect(canAccessMobileTab(LEADS_TAB, "employee", "active", withAppOnly)).toBe(false);

    expect(canAccessMobileTab(IDEAS_TAB, "employee", "active", ["mobile_app", "parking_lots"])).toBe(true);
    expect(canAccessMobileTab(LEADS_TAB, "employee", "active", ["mobile_app", "sales_pipeline"])).toBe(true);
  });

  it("never widens access beyond the desktop portal", () => {
    // A user with the pipeline on desktop but no mobile grant gets nothing.
    expect(canAccessEmployeePath("employee", "active", "/employee/sales", ["sales_pipeline"])).toBe(true);
    expect(canAccessMobileTab(LEADS_TAB, "employee", "active", ["sales_pipeline"])).toBe(false);
  });

  it("denies archived accounts even when every grant is present", () => {
    const everything = ["mobile_app", "parking_lots", "sales_pipeline"];
    expect(canAccessMobileApp("employee", "archived", everything)).toBe(false);
    expect(canAccessMobileTab(CHAT_TAB, "employee", "archived", everything)).toBe(false);
    expect(canAccessMobileTab(LEADS_TAB, "employee", "archived", everything)).toBe(false);
  });

  it("gives owner roles every tab without explicit grants", () => {
    expect(getVisibleMobileTabs("super_admin", "active", []).map((tab) => tab.key)).toEqual([
      "home",
      "chat",
      "ideas",
      "leads",
    ]);
    expect(getVisibleMobileTabs("platform_admin", "active", []).length).toBe(mobileAppTabs.length);
  });

  it("hides the tabs a partially granted employee cannot use", () => {
    expect(getVisibleMobileTabs("employee", "active", ["mobile_app", "parking_lots"]).map((tab) => tab.key)).toEqual([
      "home",
      "chat",
      "ideas",
    ]);
    expect(getVisibleMobileTabs("employee", "active", [])).toEqual([]);
  });

  it("rejects unknown roles", () => {
    expect(canAccessMobileApp("contractor", "active", ["mobile_app"])).toBe(false);
    expect(canAccessMobileApp(null, "active", ["mobile_app"])).toBe(false);
  });
});

describe("formatRelativeTimestamp", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");

  it("describes recent times in the smallest useful unit", () => {
    expect(formatRelativeTimestamp("2026-07-31T11:59:40.000Z", now)).toBe("just now");
    expect(formatRelativeTimestamp("2026-07-31T11:45:00.000Z", now)).toBe("15m ago");
    expect(formatRelativeTimestamp("2026-07-31T09:00:00.000Z", now)).toBe("3h ago");
    expect(formatRelativeTimestamp("2026-07-29T12:00:00.000Z", now)).toBe("2d ago");
  });

  it("falls back to a date beyond a week and tolerates bad input", () => {
    expect(formatRelativeTimestamp("2026-06-01T12:00:00.000Z", now)).not.toContain("ago");
    expect(formatRelativeTimestamp(null, now)).toBe("");
    expect(formatRelativeTimestamp("not-a-date", now)).toBe("");
  });
});
