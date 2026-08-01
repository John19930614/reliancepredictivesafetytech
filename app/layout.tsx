import type { Metadata, Viewport } from "next";
import "./globals.css";
import { COMPANY_NAME, TAGLINE } from "@/lib/company-data";

export const metadata: Metadata = {
  title: `${COMPANY_NAME} | ${TAGLINE}`,
  description:
    "AI-assisted safety technology for predictive safety intelligence, document generation, SOR tracking, incident workflows, and safety document libraries.",
  // iOS only treats a page as installable if these are present on the page the
  // employee is looking at when they tap Add to Home Screen. Signed-out users
  // get bounced from /m to /employee-login, so this has to live at the root —
  // on /m alone, adding from the login page silently produced a plain Safari
  // bookmark instead of a standalone web app.
  applicationName: "RPST",
  appleWebApp: {
    capable: true,
    title: "RPST",
    statusBarStyle: "black-translucent",
  },
  other: {
    // Next renders appleWebApp.capable as `mobile-web-app-capable`, which is the
    // Android/Chrome name. iOS Safari reads the apple- prefixed one to decide
    // whether a home-screen tap launches standalone or just reopens Safari, so
    // it has to be emitted explicitly. Without it the installed icon opens to a
    // dead Safari tab.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#070707",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
