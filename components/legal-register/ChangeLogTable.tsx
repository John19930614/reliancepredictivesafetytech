import { History } from "lucide-react";

export interface ChangeLogRow {
  id: string;
  entry_id: string | null;
  entry_title?: string | null;
  change_type: string;
  old_value: string | null;
  new_value: string | null;
  change_reason: string | null;
  created_at: string;
}

const cellHead: React.CSSProperties = {
  textAlign: "left", padding: "10px 12px", fontWeight: 600, color: "var(--portal-muted)",
  fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
};

export function ChangeLogTable({ rows }: { rows: ChangeLogRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--portal-muted)", background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10 }}>
        <History size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontWeight: 600 }}>No changes recorded yet</div>
        <div style={{ fontSize: "0.85rem" }}>Edits, approvals, and status changes will be tracked here.</div>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--portal-border)", borderRadius: 10, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
        <thead>
          <tr style={{ background: "var(--portal-surface)", borderBottom: "1px solid var(--portal-border)" }}>
            <th style={cellHead}>Date</th>
            <th style={cellHead}>Entry</th>
            <th style={cellHead}>Change Type</th>
            <th style={cellHead}>Old → New</th>
            <th style={cellHead}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid var(--portal-border)" }}>
              <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "var(--portal-muted)" }}>{new Date(r.created_at).toLocaleString()}</td>
              <td style={{ padding: "10px 12px" }}>{r.entry_title ?? (r.entry_id ? r.entry_id.slice(0, 8) : "—")}</td>
              <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.change_type}</td>
              <td style={{ padding: "10px 12px", color: "var(--portal-muted)" }}>
                {r.old_value || r.new_value ? `${r.old_value ?? "—"} → ${r.new_value ?? "—"}` : "—"}
              </td>
              <td style={{ padding: "10px 12px", color: "var(--portal-muted)" }}>{r.change_reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
