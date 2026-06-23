"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string }[] = [
  { href: "/employee/legal-register/dashboard", label: "Dashboard" },
  { href: "/employee/legal-register/new-research", label: "New Research" },
  { href: "/employee/legal-register/register", label: "Register" },
  { href: "/employee/legal-register/gap-analysis", label: "Gap Analysis" },
  { href: "/employee/legal-register/program-assistant", label: "Program Assistant" },
  { href: "/employee/legal-register/audit-builder", label: "Audit Builder" },
  { href: "/employee/legal-register/module-recommendations", label: "Module Recs" },
  { href: "/employee/legal-register/sources", label: "Sources" },
  { href: "/employee/legal-register/review-queue", label: "Review Queue" },
  { href: "/employee/legal-register/change-log", label: "Change Log" },
  { href: "/employee/legal-register/exports", label: "Exports" },
];

export function LegalRegisterTabs() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        display: "flex",
        gap: 4,
        overflowX: "auto",
        borderBottom: "1px solid var(--portal-border)",
        marginBottom: 24,
        paddingBottom: 2,
      }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: "8px 14px",
              fontSize: "0.82rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
              color: active ? "var(--portal-gold)" : "var(--portal-muted)",
              borderBottom: `2px solid ${active ? "var(--portal-gold)" : "transparent"}`,
              textDecoration: "none",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
