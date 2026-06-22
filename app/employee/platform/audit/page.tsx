import { getAuditEvents } from "./actions";

const CATEGORY_COLORS: Record<string, string> = {
  auth: "#7db8ff",
  data: "#42d392",
  ai: "#c8a2ff",
  release: "#f5a623",
  billing: "#d4af37",
  admin: "#bfb7a3",
  security: "#ff6b6b",
  general: "#bfb7a3",
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "#42d392",
  warn: "#f5a623",
  error: "#ff6b6b",
  critical: "#ff2020",
};

export default async function AuditPage() {
  const events = await getAuditEvents(200);

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>Audit &amp; Evidence Chain</h1>
          <p>Immutable audit log of all platform actions, evidence links, compliance trail.</p>
        </div>
        <span style={{ fontSize: 13, color: "var(--portal-muted)" }}>{events.length} recent events</span>
      </div>

      {events.length === 0 && (
        <div className="platform-empty">No audit events recorded yet. Events are written automatically as platform actions occur.</div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {events.map((e) => (
          <div key={e.id} style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            gap: 10,
            padding: "10px 14px",
            background: "rgba(255,255,255,.03)",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.06)",
            alignItems: "center",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: CATEGORY_COLORS[e.event_category] ?? "#bfb7a3", textTransform: "uppercase" }}>
                {e.event_category}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: SEVERITY_COLORS[e.severity] ?? "#bfb7a3", textTransform: "uppercase" }}>
                {e.severity}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--portal-muted)", marginBottom: 2 }}>{e.event_type}</div>
              <div style={{ fontSize: 13 }}>{e.summary}</div>
              {e.resource_type && (
                <div style={{ fontSize: 11, color: "var(--portal-muted)", marginTop: 2 }}>
                  {e.resource_type}{e.resource_id ? ` › ${e.resource_id}` : ""}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--portal-muted)", textAlign: "right", whiteSpace: "nowrap" }}>
              {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
