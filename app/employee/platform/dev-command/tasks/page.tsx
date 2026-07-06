import Link from "next/link";
import { getDevTasks } from "@/lib/dev-command/repo";
import { formatStageLabel, RISK_LEVEL_COLORS } from "@/lib/dev-command/labels";

const CLOSED_STATUSES = new Set(["done", "rejected", "cancelled", "failed"]);

export default async function DevCommandTasksPage() {
  const tasks = await getDevTasks();
  const openTasks = tasks.filter((task) => !CLOSED_STATUSES.has(task.status));
  const closedTasks = tasks.filter((task) => CLOSED_STATUSES.has(task.status));

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>Dev Tasks</h1>
          <p>Every task assigned to the AI dev team, and where it stands in the workflow.</p>
        </div>
        <Link href="/employee/platform/dev-command/tasks/new" className="platform-btn platform-btn-primary">+ New Task</Link>
      </div>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Open ({openTasks.length})</h2>
        {openTasks.length === 0 && <div className="platform-empty">No open tasks.</div>}
        <div style={{ display: "grid", gap: 10 }}>
          {openTasks.map((task) => (
            <Link key={task.id} href={`/employee/platform/dev-command/tasks/${task.id}`} className="platform-card" style={{ padding: 14, display: "block", textDecoration: "none", color: "inherit" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <strong>{task.title}</strong>
                <span style={{ fontSize: 11, fontWeight: 700, color: RISK_LEVEL_COLORS[task.risk_level] ?? undefined, textTransform: "uppercase" }}>{task.risk_level}</span>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 12, color: "var(--portal-muted)" }}>
                <span>{formatStageLabel(task.stage)}</span>
                <span>·</span>
                <span>{task.status.replace(/_/g, " ")}</span>
                {task.target_area && <><span>·</span><span>{task.target_area}</span></>}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Closed ({closedTasks.length})</h2>
        {closedTasks.length === 0 && <div className="platform-empty">No closed tasks yet.</div>}
        <div style={{ display: "grid", gap: 10 }}>
          {closedTasks.map((task) => (
            <Link key={task.id} href={`/employee/platform/dev-command/tasks/${task.id}`} className="platform-card" style={{ padding: 14, display: "block", textDecoration: "none", color: "inherit", opacity: 0.75 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <strong>{task.title}</strong>
                <span style={{ fontSize: 12, color: "var(--portal-muted)" }}>{task.status.replace(/_/g, " ")}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
