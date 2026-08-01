import type { Metadata, Viewport } from "next";
import "../mobile.css";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { COMPANY_NAME } from "@/lib/company-data";
import { loadMobileSession } from "./session";

// The installable/standalone meta lives in the root layout so every page is
// installable, including the sign-in page a signed-out employee lands on.
export const metadata: Metadata = {
  title: `${COMPANY_NAME} Mobile`,
  description: "Chat with the team, submit ideas, and update leads from your phone.",
};

export const viewport: Viewport = {
  themeColor: "#070707",
  width: "device-width",
  initialScale: 1,
  // Pinch zoom stays available so the app remains usable for low-vision employees.
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
