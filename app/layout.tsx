import type { Metadata } from "next";
import "./globals.css";
import { COMPANY_NAME, TAGLINE } from "@/lib/company-data";

export const metadata: Metadata = {
  title: `${COMPANY_NAME} | ${TAGLINE}`,
  description:
    "AI-assisted safety technology for predictive safety intelligence, document generation, SOR tracking, incident workflows, and safety document libraries.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
