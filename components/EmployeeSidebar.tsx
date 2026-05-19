"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenCheck,
  Bot,
  BriefcaseBusiness,
  CarFront,
  Clock3,
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
  Network,
  Presentation,
  ReceiptText,
  Scale,
  Settings,
  UploadCloud,
  Users,
} from "lucide-react";
import { logout } from "@/app/employee-login/actions";
import { COMPANY_NAME, TAGLINE } from "@/lib/company-data";
import { canAccessEmployeePath } from "@/lib/user-management";

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
      { href: "/employee/finance", label: "Finance Center", icon: DollarSign, financeOnly: true },
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
    ],
  },
  {
    label: "People",
    items: [
      { href: "/employee/company-tree", label: "Company Tree", icon: Network },
      { href: "/employee/hr-onboarding", label: "HR Onboarding", icon: FileSignature },
      { href: "/employee/training", label: "Training", icon: GraduationCap },
      { href: "/employee/hr-documents", label: "HR Documents", icon: FileText },
      { href: "/employee/time-cards", label: "Time Cards", icon: Clock3 },
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
];

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
  unreadNotificationCount?: number;
};

export function EmployeeSidebar({
  accountStatus = "active",
  canAccessFinance = false,
  currentRole = "employee",
  moduleKeys = [],
  unreadNotificationCount = 0,
}: EmployeeSidebarProps) {
  const pathname = usePathname();
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        "financeOnly" in item && item.financeOnly
          ? accountStatus === "active" && canAccessFinance && canAccessEmployeePath(currentRole, accountStatus, item.href, moduleKeys)
          : canAccessEmployeePath(currentRole, accountStatus, item.href, moduleKeys),
      ),
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
        {visibleGroups.map((group) => (
          <section className="portal-nav-group" key={group.label} aria-label={group.label}>
            <div className="portal-nav-heading">{group.label}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item.href);

              return (
                <Link className={active ? "active" : undefined} href={item.href} key={item.href} aria-current={active ? "page" : undefined}>
                  <Icon size={17} />
                  <span>{item.label}</span>
                  {item.href === "/employee/ai" && unreadNotificationCount > 0 ? (
                    <span className="nav-count-badge">{unreadNotificationCount}</span>
                  ) : null}
                </Link>
              );
            })}
          </section>
        ))}
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
