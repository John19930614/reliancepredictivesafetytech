"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpenCheck,
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CarFront,
  Clock3,
  ClipboardList,
  BarChart2,
  CreditCard,
  Database,
  DollarSign,
  FilePlus2,
  FileSignature,
  FileText,
  FolderOpen,
  Gauge,
  Globe2,
  GraduationCap,
  HandCoins,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  LogOut,
  Mail,
  Network,
  Package,
  Palmtree,
  Presentation,
  ReceiptText,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  Smartphone,
  Terminal,
  TestTube2,
  UploadCloud,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { logout } from "@/app/employee-login/actions";
import { COMPANY_NAME, TAGLINE } from "@/lib/company-data";
import { canAccessEmployeePath, isPortalOwnerRole } from "@/lib/user-management";

/**
 * The navigation, as seven workspaces instead of one list of forty-eight links.
 *
 * The previous sidebar showed every link at once, grouped by org chart, so
 * nothing was prioritised and the deepest tools -- the eleven legal-register
 * pages, the talent desk, the platform suite -- were unreachable without
 * knowing a URL.
 *
 * A workspace answers a question. You pick the question on the rail, and the
 * sub-nav shows only the surfaces that answer it. Every link that existed
 * before still exists; none was dropped. Permission filtering is unchanged and
 * still runs per item through canAccessEmployeePath.
 */
const workspaces = [
  {
    key: "today",
    label: "Today",
    icon: LayoutDashboard,
    question: "What needs me right now?",
    groups: [
      {
        label: "Your day",
        items: [
          { href: "/employee", label: "Priority Queue", icon: LayoutDashboard },
          { href: "/employee/ai", label: "AI Command", icon: Bot },
          { href: "/employee/inbox", label: "Request Inbox", icon: Inbox },
        ],
      },
      {
        label: "Communication",
        items: [
          { href: "/employee/mail", label: "Employee Mail", icon: Mail },
          { href: "/employee/calendar", label: "Calendar", icon: CalendarDays },
          { href: "/m", label: "Mobile App", icon: Smartphone },
        ],
      },
    ],
  },
  {
    key: "revenue",
    label: "Revenue",
    icon: DollarSign,
    question: "Where is every deal and every dollar?",
    groups: [
      {
        // Ordered by the deal, not the org chart: a lead arrives in the inbox,
        // is worked on the pipeline, lives on its lifecycle record, is priced
        // in a proposal and ends up an active company.
        label: "Clients",
        items: [
          { href: "/employee/sales", label: "Sales Pipeline", icon: BriefcaseBusiness },
          { href: "/employee/lifecycle", label: "Client Lifecycle", icon: Building2 },
          { href: "/employee/active-companies", label: "Active Companies", icon: Gauge },
        ],
      },
      {
        label: "Selling",
        items: [
          { href: "/employee/proposals", label: "Proposals", icon: ScrollText },
          { href: "/employee/proposals/templates", label: "Proposal Templates", icon: LayoutTemplate },
          // Team Bios had a working page and no way to reach it except by
          // typing the URL. Same module key as Proposals, so surfacing it
          // widens nothing -- it only makes the page findable.
          { href: "/employee/proposals/bio", label: "Team Bios", icon: Users },
          { href: "/employee/demo-showcase", label: "Demo Showcase", icon: Presentation },
        ],
      },
      {
        label: "Money",
        items: [
          { href: "/employee/finance", label: "Finance Center", icon: DollarSign, financeOnly: true },
          // The invoice ledger sits on the finance module rather than a key of
          // its own: the DB CHECK constraint on portal_user_module_access
          // enumerates the allowed keys, so inventing one here would make it
          // ungrantable until a migration caught up.
          { href: "/employee/invoices", label: "Invoices", icon: ReceiptText, financeOnly: true },
          // Same reasoning as Invoices immediately above: sits on the finance
          // module rather than a key of its own.
          { href: "/employee/payments", label: "Payments", icon: Wallet, financeOnly: true },
          { href: "/employee/grants", label: "Grant Tracker", icon: HandCoins },
          { href: "/employee/reports", label: "Reports", icon: BarChart2 },
        ],
      },
    ],
  },
  {
    key: "talent",
    label: "Talent",
    icon: HandCoins,
    question: "Who can we place, and at what margin?",
    groups: [
      {
        label: "Desk",
        items: [{ href: "/employee/talent-engine", label: "Talent Engine", icon: HandCoins }],
      },
    ],
  },
  {
    key: "people",
    label: "People",
    icon: Users,
    question: "Who works here and are they ready?",
    groups: [
      {
        label: "Org",
        items: [
          { href: "/employee/company-tree", label: "Company Tree", icon: Network },
          { href: "/employee/users", label: "Users & Permissions", icon: Users },
        ],
      },
      {
        label: "Readiness",
        items: [
          { href: "/employee/hr-onboarding", label: "HR Onboarding", icon: FileSignature },
          { href: "/employee/hr-documents", label: "HR Documents", icon: FileText },
          { href: "/employee/training", label: "Training", icon: GraduationCap },
          { href: "/employee/performance", label: "Performance Reviews", icon: ClipboardList },
        ],
      },
      {
        label: "Time & pay",
        items: [
          { href: "/employee/time-cards", label: "Time Cards", icon: Clock3 },
          { href: "/employee/time-off", label: "Time Off", icon: Palmtree },
          { href: "/employee/payroll", label: "Payroll Tracker", icon: ReceiptText, ownerOnly: true },
          { href: "/employee/expenses", label: "Expenses", icon: ReceiptText },
        ],
      },
    ],
  },
  {
    key: "governance",
    label: "Governance",
    icon: ShieldCheck,
    question: "Can we prove we are compliant?",
    groups: [
      {
        label: "Documents",
        items: [
          { href: "/employee/documents", label: "Master Document Library", icon: UploadCloud },
          { href: "/employee/files", label: "File Center", icon: FolderOpen },
          { href: "/employee/document-builder", label: "Document Builder", icon: FilePlus2 },
          { href: "/employee/required-documents", label: "Required Documents", icon: FileText },
        ],
      },
      {
        label: "Risk",
        items: [
          { href: "/employee/legal-register", label: "Legal Register", icon: ShieldCheck },
          { href: "/employee/legal-issues", label: "Legal Issues", icon: Scale },
          { href: "/employee/launch-gate", label: "Launch Gate", icon: BookOpenCheck },
        ],
      },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    icon: KanbanSquare,
    question: "What is the business doing?",
    groups: [
      {
        label: "Work",
        items: [
          { href: "/employee/work", label: "Work Management", icon: KanbanSquare },
          { href: "/employee/parking-lots", label: "Parking Lots", icon: CarFront },
          { href: "/employee/checklist", label: "Startup Checklist", icon: ListChecks },
        ],
      },
      {
        label: "Business",
        items: [
          { href: "/employee/operations", label: "Operations Database", icon: Database },
          { href: "/employee/website-operations", label: "Website Ops", icon: Globe2 },
          { href: "/employee/settings", label: "Settings", icon: Settings },
        ],
      },
    ],
  },
  {
    key: "platform",
    label: "Platform",
    icon: Terminal,
    question: "Is the product itself healthy?",
    groups: [
      {
        label: "Delivery",
        items: [
          { href: "/employee/platform/sprint", label: "Sprint Planning", icon: KanbanSquare, platformOnly: true },
          { href: "/employee/platform/releases", label: "Build & Release", icon: Zap, platformOnly: true },
          { href: "/employee/platform/qa", label: "QA & Testing", icon: TestTube2, platformOnly: true },
          { href: "/employee/platform/dev-command", label: "AI Dev Command Center", icon: Terminal, platformOnly: true },
        ],
      },
      {
        label: "Health",
        items: [
          { href: "/employee/platform/metrics", label: "Platform Metrics", icon: BarChart2, platformOnly: true },
          { href: "/employee/platform/infrastructure", label: "Infrastructure", icon: Database, platformOnly: true },
          { href: "/employee/platform/ai-services", label: "AI Services", icon: Bot, platformOnly: true },
          { href: "/employee/platform/audit", label: "Audit & Evidence", icon: ShieldCheck, platformOnly: true },
        ],
      },
      {
        label: "Product",
        items: [
          { href: "/employee/platform/packages", label: "Vertical Packages", icon: Package, platformOnly: true },
          { href: "/employee/platform/billing", label: "Billing & Subscriptions", icon: CreditCard, platformOnly: true },
          { href: "/employee/platform/docs", label: "Runbooks & Docs", icon: BookOpenCheck, platformOnly: true },
        ],
      },
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

  /**
   * Permission filtering, unchanged from the previous sidebar. Every item still
   * runs through canAccessEmployeePath, and the three narrower guards still
   * apply on top of it. Reorganising the navigation must not change who can
   * reach what.
   */
  function canSee(item: { href: string; platformOnly?: boolean; ownerOnly?: boolean; financeOnly?: boolean }) {
    if (item.platformOnly) {
      return (
        accountStatus === "active" &&
        (currentRole === "platform_admin" || currentRole === "super_admin") &&
        canAccessEmployeePath(currentRole, accountStatus, item.href, moduleKeys)
      );
    }

    if (item.ownerOnly) {
      return accountStatus === "active" && isPortalOwnerRole(currentRole) && canAccessEmployeePath(currentRole, accountStatus, item.href, moduleKeys);
    }

    if (item.financeOnly) {
      return accountStatus === "active" && canAccessFinance && canAccessEmployeePath(currentRole, accountStatus, item.href, moduleKeys);
    }

    return canAccessEmployeePath(currentRole, accountStatus, item.href, moduleKeys);
  }

  const visibleWorkspaces = workspaces
    .map((workspace) => ({
      ...workspace,
      groups: workspace.groups
        .map((group) => ({ ...group, items: group.items.filter(canSee) }))
        .filter((group) => group.items.length > 0),
    }))
    .filter((workspace) => workspace.groups.length > 0);

  /**
   * Which workspace the current URL belongs to. Longest matching href wins, so
   * /employee/proposals/templates resolves to Revenue rather than falling back.
   */
  const workspaceForPath = (() => {
    let best: { key: string; length: number } | null = null;

    for (const workspace of visibleWorkspaces) {
      for (const group of workspace.groups) {
        for (const item of group.items) {
          if (isActivePath(pathname, item.href) && (!best || item.href.length > best.length)) {
            best = { key: workspace.key, length: item.href.length };
          }
        }
      }
    }

    return best?.key ?? visibleWorkspaces[0]?.key ?? "today";
  })();

  // Browsing the rail should not navigate. Selecting a workspace only changes
  // which sub-nav is shown; the page changes when a link is clicked.
  const [browsing, setBrowsing] = useState<string | null>(null);
  const activeKey = browsing ?? workspaceForPath;
  const active = visibleWorkspaces.find((workspace) => workspace.key === activeKey) ?? visibleWorkspaces[0];

  function badgeFor(href: string) {
    if (href === "/employee/ai" && unreadNotificationCount > 0) return unreadNotificationCount;
    if (href === "/employee/hr-onboarding" && pendingOnboardingCount > 0) return pendingOnboardingCount;

    return null;
  }

  const railBadge: Record<string, number> = {
    today: unreadNotificationCount,
    people: pendingOnboardingCount,
  };

  return (
    <aside className="portal-nav-shell">
      <nav className="portal-rail" aria-label="Workspaces">
        <Link className="portal-rail-brand" href="/employee" aria-label={`${COMPANY_NAME} — dashboard`}>
          <Image alt={`${COMPANY_NAME} logo`} height={120} src="/reliance-logo-transparent.png" width={406} />
        </Link>

        {visibleWorkspaces.map((workspace) => {
          const Icon = workspace.icon;
          const isActive = workspace.key === activeKey;
          const count = railBadge[workspace.key] ?? 0;

          return (
            <button
              aria-current={isActive ? "true" : undefined}
              className={`portal-rail-item${isActive ? " is-active" : ""}`}
              key={workspace.key}
              onClick={() => setBrowsing(workspace.key)}
              title={workspace.question}
              type="button"
            >
              <Icon size={19} />
              <span>{workspace.label}</span>
              {count > 0 ? <span className="portal-rail-badge">{count}</span> : null}
            </button>
          );
        })}

        <form className="portal-rail-signout" action={logout}>
          <button title="Sign out" type="submit">
            <LogOut size={19} />
            <span>Sign out</span>
          </button>
        </form>
      </nav>

      <div className="portal-subnav">
        <div className="portal-subnav-head">
          <strong>{active?.label}</strong>
          <p>{active?.question}</p>
        </div>

        {active?.groups.map((group) => (
          <section key={group.label} aria-label={`${active.label} — ${group.label}`}>
            <div className="portal-subnav-group">{group.label}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = isActivePath(pathname, item.href);
              const badge = badgeFor(item.href);

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`portal-subnav-item${isActive ? " is-active" : ""}`}
                  href={item.href}
                  key={item.href}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                  {badge ? <span className="portal-subnav-badge">{badge}</span> : null}
                </Link>
              );
            })}
          </section>
        ))}

        <div className="portal-subnav-foot">
          <strong>{COMPANY_NAME}</strong>
          <p>{TAGLINE}</p>
        </div>
      </div>
    </aside>
  );
}
