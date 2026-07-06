import Link from "next/link";
import { getDashboardCounts, getRecentAuditLog } from "@/lib/dev-command/repo";

export default async function DevCommandDashboardPage() {
  const [counts, auditLog] = await Promise.all([getDashboardCounts(), getRecentAuditLog(10)]);

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>AI Dev Command Center</h1>
          <p>Give software tasks to the AI team. The AI team drafts — you decide.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
        <div className="platform-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--portal-muted)" }}>Open tasks</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{counts.openTasks}</div>
        </div>
        <div className="platform-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--portal-muted)" }}>Pending approvals</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: counts.pendingApprovals > 0 ? "#f5a623" : undefined }}>{counts.pendingApprovals}</div>
        </div>
        <div className="platform-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--portal-muted)" }}>Active agents</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{counts.totalAgents}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
        <Link href="/employee/platform/dev-command/tasks/new" className="platform-btn platform-btn-primary">+ New Task</Link>
        <Link href="/employee/platform/dev-command/tasks" className="platform-btn">View Tasks</Link>
        <Link href="/employee/platform/dev-command/approvals" className="platform-btn">Approval Center</Link>
        <Link href="/employee/platform/dev-command/agents" className="platform-btn">Agent Roster</Link>
      </div>

      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Recent Activity</h2>
        {auditLog.length === 0 && <div className="platform-empty">No activity yet. Create a task to get started.</div>}
        <div style={{ display: "grid", gap: 8 }}>
          {auditLog.map((entry) => (
            <div key={entry.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)" }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#c8a2ff", minWidth: 60 }}>{entry.actor_type}</span>
              <span style={{ flex: 1, fontSize: 12 }}>{entry.action.replace(/_/g, " ")}</span>
              <span style={{ fontSize: 11, color: "var(--portal-muted)", whiteSpace: "nowrap" }}>{entry.created_at ? new Date(entry.created_at).toLocaleString() : "—"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
