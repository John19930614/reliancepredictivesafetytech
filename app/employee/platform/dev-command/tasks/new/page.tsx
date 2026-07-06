import { createDevTask } from "@/app/employee/platform/dev-command/actions";

export default function NewDevTaskPage() {
  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>New Dev Task</h1>
          <p>Describe what you want built. The AI team drafts a plan — nothing risky happens without your approval.</p>
        </div>
      </div>

      <form action={createDevTask} style={{ display: "grid", gap: 12, maxWidth: 640 }}>
        <input name="title" placeholder="Task title" required className="platform-input" />
        <textarea name="description" placeholder="Describe what you want built or changed" className="platform-input" style={{ minHeight: 120, resize: "vertical" }} />
        <input name="target_area" placeholder="Target area (e.g. app/employee/dashboard)" className="platform-input" />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "var(--portal-muted)" }}>
            Priority
            <select name="priority" className="platform-input" style={{ display: "block", marginTop: 4, width: 160 }} defaultValue="medium">
              {["low", "medium", "high", "critical"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, color: "var(--portal-muted)" }}>
            Risk level
            <select name="risk_level" className="platform-input" style={{ display: "block", marginTop: 4, width: 160 }} defaultValue="low">
              {["low", "medium", "high", "critical"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>

        <fieldset style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: 12 }}>
          <legend style={{ fontSize: 12, color: "var(--portal-muted)", padding: "0 6px" }}>Permissions (all off by default — human approval is always required regardless)</legend>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><input name="database_changes_allowed" type="checkbox" /> Database changes</label>
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><input name="file_changes_allowed" type="checkbox" /> File changes</label>
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><input name="github_branch_allowed" type="checkbox" /> GitHub branch/PR prep</label>
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><input name="deployment_allowed" type="checkbox" /> Deployment prep</label>
          </div>
        </fieldset>

        <button type="submit" className="platform-btn platform-btn-primary" style={{ width: "fit-content" }}>Create Task</button>
      </form>
    </div>
  );
}
