import { getSprintsWithTasks, createSprint, createTask, updateSprintStatus, updateTaskStatus } from "./actions";

const STATUS_ORDER = ["backlog", "in_progress", "review", "done", "blocked"];
const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ff6b6b",
  high: "#f5a623",
  medium: "#7db8ff",
  low: "#42d392",
};

export default async function SprintPage() {
  const sprints = await getSprintsWithTasks();
  const activeSprint = sprints.find((s) => s.status === "active") ?? sprints[0] ?? null;

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>Sprint Planning &amp; Tracking</h1>
          <p>Manage development sprints, task breakdown, capacity planning, blockers, and velocity.</p>
        </div>
        <form action={createSprint}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input name="sprint_number" type="number" placeholder="Sprint #" required style={{ width: 90 }} className="platform-input" />
            <input name="title" placeholder="Sprint title" required className="platform-input" style={{ width: 200 }} />
            <input name="start_date" type="date" required className="platform-input" />
            <input name="end_date" type="date" required className="platform-input" />
            <input name="capacity_points" type="number" placeholder="Capacity pts" className="platform-input" style={{ width: 120 }} />
            <button type="submit" className="platform-btn platform-btn-primary">+ New Sprint</button>
          </div>
        </form>
      </div>

      {sprints.length === 0 && (
        <div className="platform-empty">No sprints yet. Create your first sprint above.</div>
      )}

      {sprints.map((sprint) => {
        const tasks = (sprint.platform_sprint_tasks ?? []) as Array<{
          id: string; title: string; status: string; priority: string; estimate_points: number | null; blocker_note: string | null;
        }>;
        const totalPts = tasks.reduce((s, t) => s + (t.estimate_points ?? 0), 0);
        const donePts = tasks.filter((t) => t.status === "done").reduce((s, t) => s + (t.estimate_points ?? 0), 0);

        return (
          <section key={sprint.id} className="platform-card">
            <div className="platform-card-header">
              <div>
                <span className="platform-badge">Sprint {sprint.sprint_number}</span>
                <strong style={{ marginLeft: 10 }}>{sprint.title}</strong>
                {sprint.goal && <p style={{ margin: "4px 0 0", color: "var(--portal-muted)", fontSize: 13 }}>{sprint.goal}</p>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--portal-muted)" }}>{donePts}/{totalPts} pts</span>
                <span className={`platform-status platform-status-${sprint.status}`}>{sprint.status}</span>
                {sprint.status === "planning" && (
                  <form action={updateSprintStatus.bind(null, sprint.id, "active")}>
                    <button type="submit" className="platform-btn platform-btn-sm">Activate</button>
                  </form>
                )}
                {sprint.status === "active" && (
                  <form action={updateSprintStatus.bind(null, sprint.id, "completed")}>
                    <button type="submit" className="platform-btn platform-btn-sm">Complete</button>
                  </form>
                )}
              </div>
            </div>

            <div className="platform-kanban">
              {STATUS_ORDER.map((col) => (
                <div key={col} className="platform-kanban-col">
                  <div className="platform-kanban-col-header">{col.replace("_", " ")}</div>
                  {tasks.filter((t) => t.status === col).map((task) => (
                    <div key={task.id} className="platform-task-card">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                        <span style={{ fontSize: 13 }}>{task.title}</span>
                        <span style={{ fontSize: 11, color: PRIORITY_COLORS[task.priority], fontWeight: 700, flexShrink: 0 }}>{task.priority}</span>
                      </div>
                      {task.estimate_points && <div style={{ fontSize: 11, color: "var(--portal-muted)", marginTop: 4 }}>{task.estimate_points} pts</div>}
                      {task.blocker_note && <div style={{ fontSize: 11, color: "#ff6b6b", marginTop: 4 }}> {task.blocker_note}</div>}
                      <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                        {STATUS_ORDER.filter((s) => s !== col).map((s) => (
                          <form key={s} action={updateTaskStatus.bind(null, task.id, s)}>
                            <button type="submit" className="platform-btn platform-btn-xs">→ {s.replace("_", " ")}</button>
                          </form>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <form action={createTask} style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <input type="hidden" name="sprint_id" value={sprint.id} />
              <input name="title" placeholder="New task title" required className="platform-input" style={{ width: 240 }} />
              <select name="priority" className="platform-input" style={{ width: 110 }}>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
                <option value="low">Low</option>
              </select>
              <input name="estimate_points" type="number" placeholder="Points" className="platform-input" style={{ width: 80 }} />
              <button type="submit" className="platform-btn platform-btn-sm">+ Add Task</button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
