"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpenCheck,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CarFront,
  ChevronDown,
  Clock3,
  ClipboardList,
  BarChart2,
  CreditCard,
  Database,
  DollarSign,
  FileSignature,
  FileText,
  Gauge,
  Globe2,
  GraduationCap,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Network,
  Package,
  Presentation,
  ReceiptText,
  Scale,
  Settings,
  ShieldCheck,
  TestTube2,
  UploadCloud,
  Users,
  Zap,
} from "lucide-react";
import { logout } from "@/app/employee-login/actions";
import { COMPANY_NAME, TAGLINE } from "@/lib/company-data";
import { canAccessEmployeePath, isPortalOwnerRole } from "@/lib/user-management";

const navGroups = [
  {
    label: "Command",
    items: [
      { href: "/employee", label: "Dashboard", icon: LayoutDashboard },
      { href: "/employee/ai", label: "AI Command", icon: Bot },
      { href: "/employee/website-operations", label: "Website Ops", icon: Globe2 },
      { href: "/employee/work", label: "Work Management", icon: KanbanSquare },
      { href: "/employee/parking-lots", label: "Parking Lots", icon: CarFront },
      { href: "/employee/expenses", label: "Expenses", icon: ReceiptText },
      { href: "/employee/reports", label: "Reports", icon: BarChart2 },
      { href: "/employee/finance", label: "Finance Center", icon: DollarSign, financeOnly: true },
      { href: "/employee/payroll", label: "Payroll Tracker", icon: ReceiptText, ownerOnly: true },
      { href: "/employee/operations", label: "Operations Database", icon: Database },
      { href: "/employee/checklist", label: "Startup Checklist", icon: ListChecks },
    ],
  },
  {
    label: "Commercial",
    items: [
      { href: "/employee/demo-showcase", label: "Demo Showcase", icon: Presentation },
      { href: "/employee/inbox", label: "Request Inbox", icon: Inbox },
      { href: "/employee/sales", label: "Sales Pipeline", icon: BriefcaseBusiness },
      { href: "/employee/active-companies", label: "Active Companies", icon: Gauge },
      { href: "/employee/mail", label: "Employee Mail", icon: Mail },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/employee/company-tree", label: "Company Tree", icon: Network },
      { href: "/employee/hr-onboarding", label: "HR Onboarding", icon: FileSignature },
      { href: "/employee/training", label: "Training", icon: GraduationCap },
      { href: "/employee/performance", label: "Performance Reviews", icon: ClipboardList },
      { href: "/employee/hr-documents", label: "HR Documents", icon: FileText },
      { href: "/employee/time-cards", label: "Time Cards", icon: Clock3 },
      { href: "/employee/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Governance",
    items: [
      { href: "/employee/documents", label: "Master Document Library", icon: UploadCloud },
      { href: "/employee/legal-issues", label: "Legal Issues", icon: Scale },
      { href: "/employee/required-documents", label: "Required Documents", icon: FileText },
      { href: "/employee/launch-gate", label: "Launch Gate", icon: BookOpenCheck },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/employee/users", label: "Users", icon: Users },
      { href: "/employee/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/employee/platform/sprint", label: "Sprint Planning", icon: KanbanSquare, platformOnly: true },
      { href: "/employee/platform/releases", label: "Build & Release", icon: Zap, platformOnly: true },
      { href: "/employee/platform/qa", label: "QA & Testing", icon: TestTube2, platformOnly: true },
      { href: "/employee/platform/metrics", label: "Platform Metrics", icon: BarChart2, platformOnly: true },
      { href: "/employee/platform/docs", label: "Runbooks & Docs", icon: BookOpenCheck, platformOnly: true },
      { href: "/employee/platform/packages", label: "Vertical Packages", icon: Package, platformOnly: true },
      { href: "/employee/platform/billing", label: "Billing & Subscriptions", icon: CreditCard, platformOnly: true },
      { href: "/employee/platform/audit", label: "Audit & Evidence", icon: ShieldCheck, platformOnly: true },
      { href: "/employee/platform/ai-services", label: "AI Services", icon: Bot, platformOnly: true },
      { href: "/employee/platform/infrastructure", label: "Infrastructure", icon: Database, platformOnly: true },
    ],
  },
];

const STORAGE_KEY = "portal-nav-collapsed";

function isActivePath(pathname: string, href: string) {
  if (href === "/employee") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

type EmployeeSidebarProps = {
  accountStatus?: string | null;
  canAccessFinance?: boolean;
  currentRole?: string | null;
  moduleKeys?: readonly string[];
  pendingOnboardingCount?: number;
  unreadNotificationCount?: number;
};

export function EmployeeSidebar({
  accountStatus = "active",
  canAccessFinance = false,
  currentRole = "employee",
  moduleKeys = [],
  pendingOnboardingCount = 0,
  unreadNotificationCount = 0,
}: EmployeeSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  function toggleGroup(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if ("platformOnly" in item && item.platformOnly) {
          return accountStatus === "active" && (currentRole === "platform_admin" || currentRole === "super_admin") && canAccessEmployeePath(currentRole, accountStatus, item.href, moduleKeys);
        }

        if ("ownerOnly" in item && item.ownerOnly) {
          return accountStatus === "active" && isPortalOwnerRole(currentRole) && canAccessEmployeePath(currentRole, accountStatus, item.href, moduleKeys);
        }

        if ("financeOnly" in item && item.financeOnly) {
          return accountStatus === "active" && canAccessFinance && canAccessEmployeePath(currentRole, accountStatus, item.href, moduleKeys);
        }

        return canAccessEmployeePath(currentRole, accountStatus, item.href, moduleKeys);
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className="portal-sidebar">
      <div className="portal-brand-block">
        <Link className="portal-brand-link" href="/employee" aria-label="Open employee dashboard">
          <Image className="portal-logo" alt={`${COMPANY_NAME} logo`} height={120} src="/reliance-logo-transparent.png" width={406} />
        </Link>
        <div>
          <strong>{COMPANY_NAME}</strong>
          <p>{TAGLINE}</p>
        </div>
      </div>

      <nav className="portal-nav" aria-label="Employee navigation">
        {visibleGroups.map((group) => {
          const isCollapsed = collapsed.has(group.label);
          const hasActive = group.items.some((item) => isActivePath(pathname, item.href));

          return (
            <section className="portal-nav-group" key={group.label} aria-label={group.label}>
              <button
                className={`portal-nav-heading portal-nav-heading-toggle${isCollapsed ? " portal-nav-heading-collapsed" : ""}`}
                onClick={() => toggleGroup(group.label)}
                type="button"
                aria-expanded={!isCollapsed}
              >
                {group.label}
                {isCollapsed && hasActive && <span className="portal-nav-active-dot" aria-hidden="true" />}
                <ChevronDown size={13} className="portal-nav-chevron" aria-hidden="true" />
              </button>

              {!isCollapsed && group.items.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(pathname, item.href);

                return (
                  <Link className={active ? "active" : undefined} href={item.href} key={item.href} aria-current={active ? "page" : undefined}>
                    <Icon size={17} />
                    <span>{item.label}</span>
                    {item.href === "/employee/ai" && unreadNotificationCount > 0 ? (
                      <span className="nav-count-badge">{unreadNotificationCount}</span>
                    ) : item.href === "/employee/hr-onboarding" && pendingOnboardingCount > 0 ? (
                      <span className="nav-count-badge">{pendingOnboardingCount}</span>
                    ) : null}
                  </Link>
                );
              })}
            </section>
          );
        })}
      </nav>

      <form className="portal-signout" action={logout}>
        <button type="submit">
          <LogOut size={17} />
          <span>Sign Out</span>
        </button>
      </form>
    </aside>
  );
}
