import Link from "next/link";
import {
  ListChecks,
  ShieldAlert,
  Bot,
  AlertTriangle,
  Eye,
  ArrowRight,
  Activity,
} from "lucide-react";
import { getDashboardCounts, getRecentAuditLog, getDevTasks, getPendingApprovals } from "@/lib/dev-command/repo";
import { formatStageLabel, APPROVAL_TYPE_LABELS } from "@/lib/dev-command/labels";
import { AGENT_REGISTRY, type AgentGroup } from "@/lib/dev-command/agent-registry";

const CLOSED_STATUSES = new Set(["done", "rejected", "cancelled", "failed"]);
const GROUP_ORDER: AgentGroup[] = ["Team Lead", "Planning & Build", "Quality, Security, Performance", "Experience & Clarity", "Ship & Support"];

function riskDotClass(riskLevel: string | null | undefined) {
  if (riskLevel === "critical" || riskLevel === "high") return "status-dot-danger";
  if (riskLevel === "medium") return "status-dot-gold";
  return "status-dot-neutral";
}

export default async function DevCommandDashboardPage() {
  const [counts, auditLog, tasks, approvals] = await Promise.all([
    getDashboardCounts(),
    getRecentAuditLog(8),
    getDevTasks(),
    getPendingApprovals(),
  ]);

  const openTasks = tasks.filter((task) => !CLOSED_STATUSES.has(task.status));
  const blockedOrRiskyTasks = openTasks.filter((task) => task.status === "blocked" || task.risk_level === "high" || task.risk_level === "critical");
  const inReviewTasks = openTasks.filter((task) => task.status === "in_review" || task.status === "awaiting_approval");
  const inProgressTasks = openTasks.filter((task) => task.status === "planning" || task.status === "in_progress");

  const kpis = [
    { label: "Open tasks", value: counts.openTasks, detail: `${inProgressTasks.length} in progress`, icon: ListChecks, href: "/employee/platform/dev-command/tasks" },
    { label: "Pending approvals", value: counts.pendingApprovals, detail: "Waiting on your decision", icon: ShieldAlert, href: "/employee/platform/dev-command/approvals" },
    { label: "Active agents", value: counts.totalAgents, detail: `${AGENT_REGISTRY.length}-agent roster`, icon: Bot, href: "/employee/platform/dev-command/agents" },
    { label: "In review", value: inReviewTasks.length, detail: "Awaiting review or approval", icon: Eye, href: "/employee/platform/dev-command/tasks" },
    { label: "Blocked / high risk", value: blockedOrRiskyTasks.length, detail: "Needs attention", icon: AlertTriangle, href: "/employee/platform/dev-command/tasks" },
  ];

  const stageCounts = openTasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.stage] = (acc[task.stage] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="platform-page">
      <div className="portal-topline command-hero">
        <div>
          <div className="eyebrow">Platform / AI Dev Command Center</div>
          <h1>AI Dev Command Center</h1>
          <p>Give software tasks to the AI team. The AI team drafts — you decide.</p>
        </div>
        <div className="command-status">
          <span className="badge">{counts.pendingApprovals > 0 ? `${counts.pendingApprovals} awaiting approval` : "All clear"}</span>
          <span>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        <Link href="/employee/platform/dev-command/tasks/new" className="platform-btn platform-btn-primary">+ New Task</Link>
        <Link href="/employee/platform/dev-command/tasks" className="platform-btn">View Tasks</Link>
        <Link href="/employee/platform/dev-command/approvals" className="platform-btn">Approval Center</Link>
        <Link href="/employee/platform/dev-command/agents" className="platform-btn">Agent Roster</Link>
      </div>

      <section className="kpi-strip" aria-label="Dev Command KPIs" style={{ marginBottom: 18 }}>
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

      <div className="command-layout">
        <section className="command-panel attention-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Needs Attention</span>
              <h2>Pending approvals</h2>
            </div>
            <Link className="panel-link" href="/employee/platform/dev-command/approvals">
              Approval Center <ArrowRight size={16} />
            </Link>
          </div>
          <div className="attention-list">
            {approvals.length === 0 && <div className="platform-empty">No pending approvals. Nothing is waiting on you.</div>}
            {approvals.slice(0, 8).map((approval) => {
              const task = (approval as typeof approval & { dev_tasks?: { title: string } | null }).dev_tasks;
              return (
                <Link
                  className="attention-row work-queue-row"
                  href={approval.task_id ? `/employee/platform/dev-command/tasks/${approval.task_id}` : "/employee/platform/dev-command/approvals"}
                  key={approval.id}
                >
                  <span className={`status-dot ${riskDotClass(approval.risk_level)}`} />
                  <span>
                    <strong>{APPROVAL_TYPE_LABELS[approval.approval_type] ?? approval.approval_type}</strong>
                    <small>{task?.title ?? "Untitled task"}</small>
                  </span>
                  <span className="queue-label">{approval.risk_level}</span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="command-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Workflow</span>
              <h2>Pipeline by stage</h2>
            </div>
            <Link className="panel-link" href="/employee/platform/dev-command/tasks">
              All tasks <ArrowRight size={16} />
            </Link>
          </div>
          <div className="pipeline-summary">
            {Object.keys(stageCounts).length === 0 ? (
              <div className="pipeline-summary-row">
                <span>No open tasks</span>
                <strong>0</strong>
              </div>
            ) : (
              Object.entries(stageCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([stage, count]) => (
                  <div className="pipeline-summary-row" key={stage}>
                    <span>{formatStageLabel(stage)}</span>
                    <strong>{count}</strong>
                  </div>
                ))
            )}
          </div>
        </section>
      </div>

      <section className="command-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Workload</span>
            <h2>In progress, in review, and blocked or high risk</h2>
          </div>
        </div>
        <div className="work-queue-grid">
          <section className="work-queue-column">
            <h3>In Progress</h3>
            {inProgressTasks.length === 0 && <div className="platform-empty">Nothing in progress.</div>}
            {inProgressTasks.slice(0, 6).map((task) => (
              <Link className="attention-row work-queue-row" href={`/employee/platform/dev-command/tasks/${task.id}`} key={task.id}>
                <span className={`status-dot ${riskDotClass(task.risk_level)}`} />
                <span>
                  <strong>{task.title}</strong>
                  <small>{formatStageLabel(task.stage)}</small>
                </span>
                <span className="queue-label">{task.risk_level}</span>
              </Link>
            ))}
          </section>
          <section className="work-queue-column">
            <h3>In Review</h3>
            {inReviewTasks.length === 0 && <div className="platform-empty">Nothing awaiting review.</div>}
            {inReviewTasks.slice(0, 6).map((task) => (
              <Link className="attention-row work-queue-row" href={`/employee/platform/dev-command/tasks/${task.id}`} key={task.id}>
                <span className={`status-dot ${riskDotClass(task.risk_level)}`} />
                <span>
                  <strong>{task.title}</strong>
                  <small>{formatStageLabel(task.stage)}</small>
                </span>
                <span className="queue-label">{task.status.replace(/_/g, " ")}</span>
              </Link>
            ))}
          </section>
          <section className="work-queue-column">
            <h3>Blocked / High Risk</h3>
            {blockedOrRiskyTasks.length === 0 && <div className="platform-empty">Nothing blocked or high risk.</div>}
            {blockedOrRiskyTasks.slice(0, 6).map((task) => (
              <Link className="attention-row work-queue-row" href={`/employee/platform/dev-command/tasks/${task.id}`} key={task.id}>
                <span className={`status-dot ${riskDotClass(task.risk_level)}`} />
                <span>
                  <strong>{task.title}</strong>
                  <small>{task.status.replace(/_/g, " ")}</small>
                </span>
                <span className="queue-label">{task.risk_level}</span>
              </Link>
            ))}
          </section>
        </div>
      </section>

      <section className="command-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Activity</span>
            <h2>Recent activity</h2>
          </div>
        </div>
        <div className="attention-list">
          {auditLog.length === 0 && <div className="platform-empty">No activity yet. Create a task to get started.</div>}
          {auditLog.map((entry) => (
            <div className="attention-row" key={entry.id}>
              <span className="status-dot status-dot-neutral" />
              <span>
                <strong>{entry.action.replace(/_/g, " ")}</strong>
                <small>{entry.created_at ? new Date(entry.created_at).toLocaleString() : "—"}</small>
              </span>
              <span className="queue-label">{entry.actor_type}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="command-panel module-launcher">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Team</span>
            <h2>Agent roster</h2>
          </div>
          <Link className="panel-link" href="/employee/platform/dev-command/agents">
            Full roster <ArrowRight size={16} />
          </Link>
        </div>
        <div className="module-group-grid">
          {GROUP_ORDER.map((group) => {
            const agents = AGENT_REGISTRY.filter((agent) => agent.group === group);
            if (agents.length === 0) return null;
            return (
              <section className="module-group" key={group}>
                <h3>{group}</h3>
                <p>{agents.length} agent{agents.length === 1 ? "" : "s"}</p>
                <div className="module-link-list">
                  {agents.map((agent) => (
                    <Link href="/employee/platform/dev-command/agents" key={agent.key}>
                      <Bot size={17} />
                      <span>{agent.name}</span>
                      <Activity size={15} />
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
