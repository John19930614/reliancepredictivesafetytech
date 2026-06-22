import { getReleases, createRelease, updateReleaseStatus, signOffRelease } from "./actions";

const ENV_ORDER = ["development", "staging", "pilot", "production"];
const ENV_COLOR: Record<string, string> = {
  development: "#7db8ff",
  staging: "#c8a2ff",
  pilot: "#f5a623",
  production: "#42d392",
};

export default async function ReleasesPage() {
  const releases = await getReleases();

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>Build &amp; Release Management</h1>
          <p>Track builds, deployment pipelines, staging environments, pilot releases, and production rollouts.</p>
        </div>
        <form action={createRelease}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input name="version" placeholder="v1.2.0" required className="platform-input" style={{ width: 90 }} />
            <input name="title" placeholder="Release title" required className="platform-input" style={{ width: 200 }} />
            <select name="environment" className="platform-input" style={{ width: 130 }}>
              {ENV_ORDER.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <label style={{ fontSize: 12, color: "var(--portal-muted)", display: "flex", alignItems: "center", gap: 4 }}>
              <input name="migration_required" type="checkbox" /> Migration
            </label>
            <button type="submit" className="platform-btn platform-btn-primary">+ New Release</button>
          </div>
        </form>
      </div>

      {releases.length === 0 && <div className="platform-empty">No releases yet.</div>}

      <div style={{ display: "grid", gap: 14 }}>
        {releases.map((r) => (
          <div key={r.id} className="platform-card">
            <div className="platform-card-header">
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <code style={{ fontSize: 13, background: "rgba(255,255,255,.07)", padding: "2px 8px", borderRadius: 6 }}>{r.version}</code>
                <strong>{r.title}</strong>
                <span style={{ fontSize: 12, color: ENV_COLOR[r.environment], fontWeight: 700, textTransform: "uppercase" }}>{r.environment}</span>
                {r.migration_required && <span style={{ fontSize: 11, color: "#f5a623", border: "1px solid rgba(245,166,35,.4)", borderRadius: 6, padding: "1px 6px" }}>MIGRATION</span>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`platform-status platform-status-${r.status}`}>{r.status}</span>
                {r.status === "pending" && (
                  <form action={updateReleaseStatus.bind(null, r.id, "in_progress")}>
                    <button type="submit" className="platform-btn platform-btn-sm">Start</button>
                  </form>
                )}
                {r.status === "in_progress" && !r.signed_off_at && (
                  <form action={signOffRelease.bind(null, r.id)}>
                    <button type="submit" className="platform-btn platform-btn-sm">Sign Off</button>
                  </form>
                )}
                {r.status === "in_progress" && r.signed_off_at && (
                  <form action={updateReleaseStatus.bind(null, r.id, "deployed")}>
                    <button type="submit" className="platform-btn platform-btn-success">Deploy</button>
                  </form>
                )}
                {r.status === "deployed" && (
                  <form action={updateReleaseStatus.bind(null, r.id, "rolled_back")}>
                    <button type="submit" className="platform-btn platform-btn-danger">Rollback</button>
                  </form>
                )}
              </div>
            </div>
            {r.release_notes && <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--portal-muted)" }}>{r.release_notes}</p>}
            {r.rollback_plan && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#f5a623" }}> Rollback: {r.rollback_plan}</p>}
            {r.deployed_at && <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--portal-muted)" }}>Deployed: {new Date(r.deployed_at).toLocaleString()}</p>}
            {r.signed_off_at && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#42d392" }}> Signed off: {new Date(r.signed_off_at).toLocaleString()}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
