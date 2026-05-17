import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, KanbanSquare, Scale } from "lucide-react";
import type { CompanyOperationsRecord, WorkflowActionProposal } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function dueSoonIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function isClosed(record: CompanyOperationsRecord) {
  return ["Complete", "Archived"].includes(record.status);
}

function isProject(record: CompanyOperationsRecord) {
  const type = record.record_type.toLowerCase();
  return type.includes("project") || ["Operations", "Technology / Security", "Product"].includes(record.category);
}

function isDecision(record: CompanyOperationsRecord) {
  const text = `${record.record_type} ${record.title} ${record.description ?? ""}`.toLowerCase();
  return text.includes("decision") || text.includes("approval") || record.category === "Leadership";
}

function WorkRecordCard({ record }: { record: CompanyOperationsRecord }) {
  const overdue = record.due_date ? record.due_date < todayIsoDate() && !isClosed(record) : false;

  return (
    <article className="doc-card work-card">
      <div className="portal-topline">
        <div>
          <h3>{record.title}</h3>
          <p>
            {record.category} - {record.record_type} - {record.owner || "Unassigned"}
          </p>
        </div>
        <span className={`record-badge ${overdue ? "record-badge-danger" : record.priority === "High" ? "record-badge-gold" : ""}`}>
          {record.priority}
        </span>
      </div>
      <p>{record.description || record.notes || "No description recorded."}</p>
      <div className="record-badge-row">
        <span className="record-badge">{record.status}</span>
        <span className={overdue ? "record-badge record-badge-danger" : "record-badge record-badge-neutral"}>{formatDate(record.due_date)}</span>
      </div>
    </article>
  );
}

function ProposalCard({ proposal }: { proposal: WorkflowActionProposal }) {
  return (
    <article className="doc-card work-card">
      <div className="portal-topline">
        <div>
          <h3>{proposal.title}</h3>
          <p>
            {proposal.action_type} - {proposal.target_table}
          </p>
        </div>
        <span className={`record-badge ${proposal.risk_level === "critical" || proposal.risk_level === "high" ? "record-badge-danger" : "record-badge-gold"}`}>
          {proposal.risk_level}
        </span>
      </div>
      <p>{proposal.description}</p>
      <div className="record-badge-row">
        <span className="record-badge">{proposal.status}</span>
        <span className="record-badge record-badge-neutral">{formatDate(proposal.created_at.slice(0, 10))}</span>
      </div>
    </article>
  );
}

function WorkSection({
  actionHref,
  actionLabel,
  children,
  count,
  icon: Icon,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  children: ReactNode;
  count: number;
  icon: ComponentType<{ size?: number }>;
  title: string;
}) {
  return (
    <section className="command-panel work-section">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            <Icon size={14} /> {count} visible
          </span>
          <h2>{title}</h2>
        </div>
        <Link className="panel-link" href={actionHref}>
          {actionLabel} <ArrowRight size={16} />
        </Link>
      </div>
      <div className="work-card-list">{children}</div>
    </section>
  );
}

export default async function WorkManagementPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <div className="eyebrow">Work Management</div>
            <h1>Projects, tasks, decisions, and approvals</h1>
            <p>Supabase is required before work management records can be loaded.</p>
          </div>
        </div>
      </>
    );
  }

  const [{ data: records }, { data: proposals }] = await Promise.all([
    supabase.from("company_operations_records").select("*").order("updated_at", { ascending: false }),
    supabase.from("workflow_action_proposals").select("*").order("created_at", { ascending: false }).limit(80),
  ]);

  const operationRecords = ((records ?? []) as CompanyOperationsRecord[]).filter((record) => !isClosed(record));
  const workflowProposals = (proposals ?? []) as unknown as WorkflowActionProposal[];
  const today = todayIsoDate();
  const soon = dueSoonIsoDate();
  const projects = operationRecords.filter(isProject).slice(0, 8);
  const tasks = operationRecords.filter((record) => !isProject(record) && !isDecision(record)).slice(0, 8);
  const decisions = operationRecords.filter(isDecision).slice(0, 8);
  const approvals = workflowProposals.filter((proposal) => proposal.status === "pending").slice(0, 8);
  const overdue = operationRecords.filter((record) => record.due_date && record.due_date < today).slice(0, 8);
  const dueSoon = operationRecords.filter((record) => record.due_date && record.due_date >= today && record.due_date <= soon).slice(0, 8);

  const kpis = [
    { label: "Open work", value: operationRecords.length, detail: "Active operations records" },
    { label: "Projects", value: projects.length, detail: "Project-like operating work" },
    { label: "Approvals", value: approvals.length, detail: "Pending workflow proposals" },
    { label: "Overdue", value: overdue.length, detail: "Past due active work" },
    { label: "Due soon", value: dueSoon.length, detail: "Due in the next 7 days" },
  ];

  return (
    <div className="command-center work-management">
      <div className="portal-topline command-hero">
        <div>
          <div className="eyebrow">Work Management</div>
          <h1>Projects, tasks, decisions, and approvals</h1>
          <p>Unified internal work view built from operations records and workflow proposals.</p>
        </div>
        <span className="badge">
          <KanbanSquare size={14} />
          ERP work layer
        </span>
      </div>

      <section className="kpi-strip finance-kpi-strip" aria-label="Work management KPIs">
        {kpis.map((kpi) => (
          <div className="kpi-card" key={kpi.label}>
            <span className="kpi-icon">
              <ClipboardList size={18} />
            </span>
            <span className="kpi-value">{kpi.value}</span>
            <span className="kpi-label">{kpi.label}</span>
            <span className="kpi-detail">{kpi.detail}</span>
          </div>
        ))}
      </section>

      <div className="work-management-grid">
        <WorkSection actionHref="/employee/operations" actionLabel="Open records" count={projects.length} icon={KanbanSquare} title="Projects">
          {projects.length === 0 ? <div className="empty-state">No active project records.</div> : projects.map((record) => <WorkRecordCard key={record.id} record={record} />)}
        </WorkSection>

        <WorkSection actionHref="/employee/operations" actionLabel="Open tasks" count={tasks.length} icon={ClipboardList} title="Tasks">
          {tasks.length === 0 ? <div className="empty-state">No active task records.</div> : tasks.map((record) => <WorkRecordCard key={record.id} record={record} />)}
        </WorkSection>

        <WorkSection actionHref="/employee/operations" actionLabel="Open decisions" count={decisions.length} icon={Scale} title="Decisions">
          {decisions.length === 0 ? <div className="empty-state">No active decision records.</div> : decisions.map((record) => <WorkRecordCard key={record.id} record={record} />)}
        </WorkSection>

        <WorkSection actionHref="/employee/ai" actionLabel="Review approvals" count={approvals.length} icon={CheckCircle2} title="Approvals">
          {approvals.length === 0 ? <div className="empty-state">No pending workflow approvals.</div> : approvals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} />)}
        </WorkSection>

        <WorkSection actionHref="/employee/operations" actionLabel="Open overdue" count={overdue.length} icon={AlertTriangle} title="Overdue">
          {overdue.length === 0 ? <div className="empty-state">No active work is overdue.</div> : overdue.map((record) => <WorkRecordCard key={record.id} record={record} />)}
        </WorkSection>

        <WorkSection actionHref="/employee/operations" actionLabel="Open due soon" count={dueSoon.length} icon={ClipboardList} title="Due Soon">
          {dueSoon.length === 0 ? <div className="empty-state">No active work is due in the next 7 days.</div> : dueSoon.map((record) => <WorkRecordCard key={record.id} record={record} />)}
        </WorkSection>
      </div>
    </div>
  );
}
