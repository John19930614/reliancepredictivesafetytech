import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CarFront,
  CheckCircle2,
  Clock3,
  Database,
  DollarSign,
  FileSignature,
  FileText,
  Gauge,
  Inbox,
  ListChecks,
  Network,
  ReceiptText,
  Scale,
  ShieldCheck,
  UploadCloud,
  Users,
} from "lucide-react";
import {
  companyPositionSeed,
  lifecycleStages,
  requiredDocuments,
  startupChecklistSeed,
  type CompanyClient,
  type CompanyDocument,
} from "@/lib/company-data";
import { getCommandSnapshot, type CommandPriorityItem } from "@/lib/ai/command-context";
import { createClient } from "@/lib/supabase/server";
import { canAccessEmployeePath, hasFullPortalVisibility, isPortalOwnerRole } from "@/lib/user-management";

const moduleGroups = [
  {
    label: "Operations",
    description: "Company records, launch readiness, and decision control.",
    modules: [
      { title: "AI Command Center", href: "/employee/ai", icon: Bot },
      { title: "Work Management", href: "/employee/work", icon: ListChecks },
      { title: "Parking Lots", href: "/employee/parking-lots", icon: CarFront },
      { title: "Employee Expenses", href: "/employee/expenses", icon: ReceiptText },
      { title: "Finance Center", href: "/employee/finance", icon: DollarSign },
      { title: "Payroll Tracker", href: "/employee/payroll", icon: ReceiptText },
      { title: "Operations Database", href: "/employee/operations", icon: Database },
      { title: "Startup Checklist", href: "/employee/checklist", icon: ListChecks },
      { title: "Launch Gate", href: "/employee/launch-gate", icon: BookOpenCheck },
    ],
  },
  {
    label: "Commercial",
    description: "Requests, pipeline movement, and active accounts.",
    modules: [
      { title: "Request Inbox", href: "/employee/inbox", icon: Inbox },
      { title: "Sales Pipeline", href: "/employee/sales", icon: BriefcaseBusiness },
      { title: "Active Companies", href: "/employee/active-companies", icon: Gauge },
    ],
  },
  {
    label: "People",
    description: "Roles, HR readiness, employee records, and time review.",
    modules: [
      { title: "Company Tree", href: "/employee/company-tree", icon: Network },
      { title: "HR Onboarding", href: "/employee/hr-onboarding", icon: Users },
      { title: "Time Cards", href: "/employee/time-cards", icon: Clock3 },
    ],
  },
  {
    label: "Governance",
    description: "Controlled documents, legal issues, and required registers.",
    modules: [
      { title: "Master Document Library", href: "/employee/documents", icon: UploadCloud },
      { title: "Legal Issues", href: "/employee/legal-issues", icon: Scale },
      { title: "Required Documents", href: "/employee/required-documents", icon: FileText },
    ],
  },
];

const commercialFocusStages = [
  "Lead",
  "First Pitch",
  "Demo Scheduled",
  "Proposal Sent",
  "Legal Review",
  "Signed / Won",
  "Onboarding",
  "Active Company",
] as const;

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

function percent(part: number, whole: number) {
  if (whole === 0) {
    return 0;
  }

  return Math.round((part / whole) * 100);
}

function buildPipelineCounts(clients: Pick<CompanyClient, "lifecycle_stage">[]) {
  const counts = new Map<string, number>();
  clients.forEach((client) => {
    counts.set(client.lifecycle_stage, (counts.get(client.lifecycle_stage) ?? 0) + 1);
  });

  return lifecycleStages.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
}

function workItemTone(item: CommandPriorityItem) {
  if (item.priority === "critical" || item.priority === "high") return "danger";
  if (item.reviewRequired) return "gold";
  return "neutral";
}

function WorkQueueList({ empty, items }: { empty: string; items: CommandPriorityItem[] }) {
  if (items.length === 0) {
    return <div className="empty-state">{empty}</div>;
  }

  return (
    <div className="attention-list">
      {items.map((item) => (
        <Link className="attention-row work-queue-row" href={item.actionHref} key={`${item.sourceType}-${item.sourceId}-${item.label}`}>
          <span className={`status-dot status-dot-${workItemTone(item)}`} />
          <span>
            <strong>{item.title}</strong>
            <small>
              {item.sourceLabel} - {item.status} - {item.detail}
            </small>
          </span>
          <span className="queue-label">{item.label}</span>
        </Link>
      ))}
    </div>
  );
}

export default async function EmployeeDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const { data: currentRole } =
    supabase && user
      ? await supabase
          .from("user_roles")
          .select("role, account_status")
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null };
  const [{ data: financeAuthorization }, { data: moduleAccess }] =
    supabase && user
      ? await Promise.all([
          supabase.from("company_finance_authorized_users").select("user_id").eq("user_id", user.id).maybeSingle(),
          hasFullPortalVisibility(currentRole?.role, currentRole?.account_status)
            ? Promise.resolve({ data: [] })
            : supabase.from("portal_user_module_access").select("module_key").eq("user_id", user.id),
        ])
      : [{ data: null }, { data: [] }];
  const moduleKeys = (moduleAccess ?? []).map((access) => access.module_key);
  const canViewFinanceModule = canAccessEmployeePath(currentRole?.role, currentRole?.account_status, "/employee/finance", moduleKeys);
  const canAccessFinance = Boolean(
    currentRole?.account_status === "active" && canViewFinanceModule && (isPortalOwnerRole(currentRole.role) || financeAuthorization),
  );
  const canAccessPayroll = Boolean(currentRole?.account_status === "active" && isPortalOwnerRole(currentRole.role));
  const canManageFinanceRecords = Boolean(financeAuthorization && canViewFinanceModule);
  const canOpenPath = (href: string) =>
    !supabase ||
    (href === "/employee/finance"
      ? canAccessFinance && canAccessEmployeePath(currentRole?.role, currentRole?.account_status, href, moduleKeys)
      : href === "/employee/payroll"
        ? canAccessPayroll && canAccessEmployeePath(currentRole?.role, currentRole?.account_status, href, moduleKeys)
      : canAccessEmployeePath(currentRole?.role, currentRole?.account_status, href, moduleKeys));
  // 8 queries instead of 19 — one per table, counts derived in JS
  const [
    { data: checklistStatuses },
    { data: documentStatuses },
    { data: requestStatuses },
    { data: clientStages },
    { count: priorityOpsCount },
    { count: openLegalIssueCount },
    { data: positionStatuses },
    { count: submittedTimeCardCount },
  ] = supabase
    ? await Promise.all([
        supabase.from("company_checklist_items").select("status"),
        supabase.from("company_documents").select("status"),
        supabase.from("demo_requests").select("status"),
        supabase.from("company_clients").select("lifecycle_stage"),
        supabase
          .from("company_operations_records")
          .select("*", { count: "exact", head: true })
          .in("priority", ["High", "Critical"])
          .neq("status", "Archived"),
        supabase
          .from("company_legal_issues")
          .select("*", { count: "exact", head: true })
          .in("status", ["Open", "In Review", "Waiting"]),
        supabase.from("company_positions").select("status"),
        supabase.from("employee_time_cards").select("*", { count: "exact", head: true }).eq("status", "submitted"),
      ])
    : [
        { data: startupChecklistSeed.map((i) => ({ status: i.status })) },
        { data: [] as { status: string }[] },
        { data: [] as { status: string }[] },
        { data: [] as { lifecycle_stage: string }[] },
        { count: 0 },
        { count: 0 },
        { data: companyPositionSeed.map((p) => ({ status: p.status })) },
        { count: 0 },
      ];

  const checklistCount = checklistStatuses?.length ?? startupChecklistSeed.length;
  const blockedChecklistCount =
    checklistStatuses?.filter((i) => i.status === "Blocked").length ??
    startupChecklistSeed.filter((i) => i.status === "Blocked").length;
  const documentCount = documentStatuses?.length ?? 0;
  const approvedDocumentCount =
    documentStatuses?.filter((d) => d.status && ["Approved", "Signed / Executed"].includes(d.status)).length ?? 0;
  const documentStatusRows = (documentStatuses ?? []) as Pick<CompanyDocument, "status">[];
  const requestCount = requestStatuses?.length ?? 0;
  const newRequestCount = requestStatuses?.filter((r) => r.status === "new").length ?? 0;
  const clientCount = clientStages?.length ?? 0;
  const activeCompanyCount =
    clientStages?.filter((c) => ["Active Company", "Renewal / Expansion"].includes(c.lifecycle_stage as string)).length ?? 0;
  const pipelineRows = buildPipelineCounts((clientStages ?? []) as Pick<CompanyClient, "lifecycle_stage">[]);
  const companyPositionCount = positionStatuses?.length ?? companyPositionSeed.length;
  const openPositionCount =
    positionStatuses?.filter((p) => ["Open", "Needed"].includes(p.status)).length ??
    companyPositionSeed.filter((position) => ["Open", "Needed"].includes(position.status)).length;
  const requiredDocumentTotal = requiredDocuments.reduce((total, group) => total + group.items.length, 0);
  const approvedReadiness = percent(approvedDocumentCount, documentCount);
  const activeRiskCount = (openLegalIssueCount ?? 0) + (priorityOpsCount ?? 0) + (blockedChecklistCount ?? 0);
  const isOwnerRole = canAccessPayroll;
  const [commandSnapshot, { count: pendingOnboardingCount }, { count: totalOnboardingCount }] = await Promise.all([
    supabase && user ? getCommandSnapshot(supabase, user.id) : Promise.resolve(null),
    supabase && user
      ? supabase.from("employee_document_assignments").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "pending")
      : Promise.resolve({ count: 0 as number | null }),
    supabase && user
      ? supabase.from("employee_document_assignments").select("*", { count: "exact", head: true }).eq("user_id", user.id)
      : Promise.resolve({ count: 0 as number | null }),
  ]);
  const financePriorityItems: CommandPriorityItem[] = [];
  let financeOpenAmount = 0;
  let financeReviewCount = 0;

  if (supabase && canManageFinanceRecords) {
    const [{ data: financeTransactions }, { data: financeRecurringItems }] = await Promise.all([
      supabase.from("company_finance_transactions").select("*").neq("status", "cancelled").order("transaction_date", { ascending: true }).limit(80),
      supabase.from("company_finance_recurring_items").select("*").eq("status", "active").order("next_due_date", { ascending: true }).limit(30),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date();
    soon.setDate(soon.getDate() + 14);
    const soonDate = soon.toISOString().slice(0, 10);

    (financeTransactions ?? []).forEach((transaction) => {
      const open =
        (transaction.transaction_type === "expense" && ["planned", "due"].includes(transaction.status)) ||
        (transaction.transaction_type === "income" && ["expected", "invoiced"].includes(transaction.status));
      if (open) financeOpenAmount += Number(transaction.amount);
      if (transaction.review_status !== "reviewed") financeReviewCount += 1;
      if (open && transaction.transaction_date <= soonDate) {
        financePriorityItems.push({
          title: transaction.title,
          label: transaction.transaction_type === "expense" ? "Finance due" : "Income follow-up",
          href: "/employee/finance",
          actionHref: "/employee/finance",
          priority: transaction.transaction_date < today ? "high" : "medium",
          detail: `${transaction.category} - $${Number(transaction.amount).toFixed(2)} - due ${formatDate(transaction.transaction_date)}`,
          owner: transaction.owner,
          dueDate: transaction.transaction_date,
          status: transaction.status,
          sourceLabel: "Finance",
          sourceType: "company_finance_transaction",
          sourceId: transaction.id,
          reviewRequired: transaction.review_status !== "reviewed",
        });
      }
    });

    (financeRecurringItems ?? []).forEach((item) => {
      if (item.next_due_date && item.next_due_date <= soonDate) {
        financePriorityItems.push({
          title: item.title,
          label: "Recurring finance",
          href: "/employee/finance",
          actionHref: "/employee/finance",
          priority: item.next_due_date < today ? "high" : "medium",
          detail: `${item.category} - $${Number(item.amount).toFixed(2)} - next ${formatDate(item.next_due_date)}`,
          owner: item.owner,
          dueDate: item.next_due_date,
          status: item.status,
          sourceLabel: "Finance",
          sourceType: "company_finance_recurring_item",
          sourceId: item.id,
          reviewRequired: false,
        });
      }
    });
  }

  const workItems = [...financePriorityItems, ...(commandSnapshot?.priorityItems ?? [])].filter((item) => canOpenPath(item.actionHref));
  const myWorkItems = workItems.filter((item) => !item.reviewRequired).slice(0, 6);
  const reviewItems = workItems.filter((item) => item.reviewRequired).slice(0, 6);
  const riskItems = workItems
    .filter((item) => item.priority === "critical" || item.priority === "high" || item.dueDate)
    .slice(0, 6);

  const kpis = [
    {
      label: "Active clients",
      value: activeCompanyCount ?? 0,
      detail: `${clientCount ?? 0} total client records`,
      icon: Gauge,
      href: "/employee/active-companies",
    },
    {
      label: "Pipeline activity",
      value: (clientCount ?? 0) + (requestCount ?? 0),
      detail: `${newRequestCount ?? 0} new request${newRequestCount === 1 ? "" : "s"}`,
      icon: BarChart3,
      href: "/employee/sales",
    },
    {
      label: "Risk queue",
      value: activeRiskCount,
      detail: `${openLegalIssueCount ?? 0} legal, ${blockedChecklistCount ?? 0} blocked`,
      icon: AlertTriangle,
      href: "/employee/legal-issues",
    },
    {
      label: "Time cards",
      value: submittedTimeCardCount ?? 0,
      detail: "Submitted for review",
      icon: Clock3,
      href: "/employee/time-cards",
    },
    {
      label: "Finance control",
      value: financeReviewCount,
      detail: canManageFinanceRecords ? `$${financeOpenAmount.toFixed(2)} open cash movement` : "Owner finance access",
      icon: DollarSign,
      href: "/employee/finance",
    },
    {
      label: "Controlled docs",
      value: documentCount ?? 0,
      detail: `${approvedReadiness}% approved or executed`,
      icon: ShieldCheck,
      href: "/employee/documents",
    },
  ].filter((kpi) => canOpenPath(kpi.href));
  const visibleModuleGroups = moduleGroups
    .map((group) => ({
      ...group,
      modules: group.modules.filter((module) => canOpenPath(module.href)),
    }))
    .filter((group) => group.modules.length > 0);

  const pendingCount = pendingOnboardingCount ?? 0;
  const totalCount = totalOnboardingCount ?? 0;
  const getStartedSteps = [
    {
      href: "/employee/hr-onboarding",
      icon: Users,
      title: "HR Onboarding",
      description: pendingCount > 0 ? `${pendingCount} item${pendingCount === 1 ? "" : "s"} pending` : "All items complete",
      variant: pendingCount > 0 ? "urgent" : "done",
    },
    { href: "/employee/hr-documents", icon: FileText, title: "HR Documents", description: "Your employment documents", variant: "default" },
    { href: "/employee/time-cards", icon: Clock3, title: "Time Cards", description: "Log and submit your hours", variant: "default" },
    { href: "/employee/mail", icon: Inbox, title: "Employee Mail", description: "Messages from your team", variant: "default" },
    { href: "/employee/calendar", icon: CalendarDays, title: "Calendar", description: "Your schedule and events", variant: "default" },
  ].filter((step) => canOpenPath(step.href));

  return (
    <div className="command-center">
      <div className="portal-topline command-hero">
        <div>
          <div className="eyebrow">Employee Operations Hub</div>
          <h1>Enterprise command center</h1>
          <p>Prioritized operating view for requests, sales, active companies, documents, legal issues, people, and launch readiness.</p>
        </div>
        <div className="command-status">
          <span className="badge">{supabase ? "Supabase connected" : "Supabase setup required"}</span>
          <span>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="onboarding-banner" role="alert">
          <div className="onboarding-banner-body">
            <FileSignature size={20} />
            <div>
              <strong>Complete your HR onboarding</strong>
              <p>
                {pendingCount} of {totalCount} {totalCount === 1 ? "item" : "items"} still need your attention.
              </p>
            </div>
          </div>
          <Link className="button button-primary" href="/employee/hr-onboarding">
            Go to Onboarding <ArrowRight size={16} />
          </Link>
        </div>
      )}

      {isOwnerRole ? (
        <section className="kpi-strip" aria-label="Command center KPIs">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Link className="kpi-card" href={kpi.href} key={kpi.label}>
                <span className="kpi-icon">
                  <Icon size={18} />
                </span>
                <span className="kpi-value">{kpi.value}</span>
                <span className="kpi-label">{kpi.label}</span>
                <span className="kpi-detail">{kpi.detail}</span>
              </Link>
            );
          })}
        </section>
      ) : (
        <section className="command-panel" aria-label="Getting started">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Welcome</span>
              <h2>Your first steps</h2>
            </div>
          </div>
          <div className="get-started-steps">
            {getStartedSteps.map((step) => {
              const Icon = step.icon;
              return (
                <Link
                  key={step.href}
                  href={step.href}
                  className={`get-started-step${step.variant === "urgent" ? " get-started-step-urgent" : step.variant === "done" ? " get-started-step-done" : ""}`}
                >
                  <span className="get-started-step-icon">
                    <Icon size={18} />
                  </span>
                  <span className="get-started-step-text">
                    <strong>{step.title}</strong>
                    <span>{step.description}</span>
                  </span>
                  <ArrowRight size={15} className="get-started-step-arrow" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="command-layout">
        <section className="command-panel attention-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Needs Attention</span>
              <h2>Priority work queue</h2>
            </div>
            <span className="badge">{workItems.length} visible</span>
          </div>

          <WorkQueueList
            empty="No urgent requests, legal issues, HR reviews, time cards, or high-priority operations records are waiting."
            items={workItems.slice(0, 8)}
          />
        </section>

        <section className="command-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Commercial</span>
              <h2>Pipeline health</h2>
            </div>
            <Link className="panel-link" href="/employee/sales">
              Open pipeline <ArrowRight size={16} />
            </Link>
          </div>
          <div className="pipeline-summary">
            {pipelineRows
              .filter((item) => commercialFocusStages.includes(item.stage as (typeof commercialFocusStages)[number]))
              .map((item) => (
                <div className="pipeline-summary-row" key={item.stage}>
                  <span>{item.stage}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
          </div>
        </section>
      </div>

      <section className="command-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Internal Work</span>
            <h2>My work, review queue, and risk due soon</h2>
          </div>
          <Link className="panel-link" href="/employee/ai">
            Open AI command <ArrowRight size={16} />
          </Link>
        </div>
        <div className="work-queue-grid">
          <section className="work-queue-column">
            <h3>My Work</h3>
            <WorkQueueList empty="No assigned operating work is waiting." items={myWorkItems} />
          </section>
          <section className="work-queue-column">
            <h3>Review Queue</h3>
            <WorkQueueList empty="No HR, time-card, legal, proposal, or commercial reviews are waiting." items={reviewItems} />
          </section>
          <section className="work-queue-column">
            <h3>Risk / Due Soon</h3>
            <WorkQueueList empty="No high-risk or due-soon work is visible." items={riskItems} />
          </section>
        </div>
      </section>

      <div className="command-layout command-layout-secondary">
        <section className="command-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Governance</span>
              <h2>Document readiness</h2>
            </div>
            <Link className="panel-link" href="/employee/required-documents">
              Register <ArrowRight size={16} />
            </Link>
          </div>
          <div className="readiness-grid">
            <div>
              <span>Required groups</span>
              <strong>{requiredDocuments.length}</strong>
              <small>{requiredDocumentTotal} required document items</small>
            </div>
            <div>
              <span>Controlled files</span>
              <strong>{documentCount ?? 0}</strong>
              <small>{approvedDocumentCount ?? 0} approved or executed</small>
            </div>
            <div>
              <span>Launch checklist</span>
              <strong>{checklistCount ?? startupChecklistSeed.length}</strong>
              <small>{blockedChecklistCount ?? 0} blocked items</small>
            </div>
          </div>
          <div className="document-status-list">
            {documentStatusRows.length === 0 ? (
              <div className="document-status-row">
                <span>No controlled document status data yet</span>
                <strong>0</strong>
              </div>
            ) : (
              Object.entries(
                documentStatusRows.reduce<Record<string, number>>((accumulator, document) => {
                  accumulator[document.status] = (accumulator[document.status] ?? 0) + 1;
                  return accumulator;
                }, {}),
              ).map(([status, count]) => (
                <div className="document-status-row" key={status}>
                  <span>{status}</span>
                  <strong>{count}</strong>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="command-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">People</span>
              <h2>Capacity snapshot</h2>
            </div>
            <Link className="panel-link" href="/employee/company-tree">
              Company tree <ArrowRight size={16} />
            </Link>
          </div>
          <div className="capacity-card">
            <div>
              <span className="kpi-value">{companyPositionCount ?? companyPositionSeed.length}</span>
              <span className="kpi-label">Tracked positions</span>
            </div>
            <div>
              <span className="kpi-value">{openPositionCount ?? 0}</span>
              <span className="kpi-label">Open or needed roles</span>
            </div>
            <div>
              <span className="kpi-value">{submittedTimeCardCount ?? 0}</span>
              <span className="kpi-label">Time cards awaiting review</span>
            </div>
          </div>
        </section>
      </div>

      <section className="command-panel module-launcher">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2>Operating modules</h2>
          </div>
        </div>
        <div className="module-group-grid">
          {visibleModuleGroups.map((group) => (
            <section className="module-group" key={group.label}>
              <h3>{group.label}</h3>
              <p>{group.description}</p>
              <div className="module-link-list">
                {group.modules.map((module) => {
                  const Icon = module.icon;
                  return (
                    <Link href={module.href} key={module.href}>
                      <Icon size={17} />
                      <span>{module.title}</span>
                      <CheckCircle2 size={15} />
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
