import type { Metadata, Viewport } from "next";
import "../mobile.css";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { COMPANY_NAME } from "@/lib/company-data";
import { loadMobileSession } from "./session";

export const metadata: Metadata = {
  title: `${COMPANY_NAME} Mobile`,
  description: "Chat with the team, submit ideas, and update leads from your phone.",
  appleWebApp: {
    capable: true,
    title: "SafetyIQ",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#070707",
  width: "device-width",
  initialScale: 1,
  // Home-screen apps should not rubber-band zoom on double tap, but pinch zoom
  // stays available so the app remains usable for low-vision employees.
  maximumScale: 5,
  viewportFit: "cover",
};

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await loadMobileSession();

  return (
    <div className="m-shell">
      <div className="m-content">{children}</div>
      <MobileTabBar tabs={session.visibleTabs.map((tab) => ({ key: tab.key, label: tab.label, href: tab.href }))} />
    </div>
  );
}
