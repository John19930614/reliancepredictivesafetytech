"use client";

import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { RiskBadge } from "@/components/legal-register/badges";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuditItem = Record<string, any>;

const cellHead: React.CSSProperties = {
  textAlign: "left", padding: "10px 12px", fontWeight: 600, color: "var(--portal-muted)",
  fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
};

export function AuditChecklistBuilder({ items }: { items: AuditItem[] }) {
  const [program, setProgram] = useState("");
  const programs = useMemo(() => [...new Set(items.map((i) => i.program).filter(Boolean))].sort(), [items]);
  const filtered = program ? items.filter((i) => i.program === program) : items;

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--portal-muted)", background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10 }}>
        <ClipboardList size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontWeight: 600 }}>No audit checklist items yet</div>
        <div style={{ fontSize: "0.85rem" }}>Run a research run — checklist items are generated automatically from findings.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <select value={program} onChange={(e) => setProgram(e.target.value)} style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 6, padding: "7px 10px", fontSize: "0.82rem", color: "inherit" }}>
          <option value="">All programs</option>
          {programs.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <span style={{ fontSize: "0.8rem", color: "var(--portal-muted)" }}>{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div style={{ border: "1px solid var(--portal-border)", borderRadius: 10, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
          <thead>
            <tr style={{ background: "var(--portal-surface)", borderBottom: "1px solid var(--portal-border)" }}>
              <th style={cellHead}>Checklist Item / Question</th>
              <th style={cellHead}>Program</th>
              <th style={cellHead}>Answer</th>
              <th style={cellHead}>Evidence</th>
              <th style={cellHead}>Risk</th>
              <th style={cellHead}>Responsible</th>
              <th style={cellHead}>Frequency</th>
              <th style={cellHead}>Module</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid var(--portal-border)" }}>
                <td style={{ padding: "10px 12px", minWidth: 220 }}>
                  <div style={{ fontWeight: 600 }}>{a.checklist_item ?? a.question_text}</div>
                  {a.question_text && a.checklist_item && <div style={{ fontSize: "0.78rem", color: "var(--portal-muted)" }}>{a.question_text}</div>}
                  {a.citation && <div style={{ fontSize: "0.74rem", color: "var(--portal-gold)", fontFamily: "monospace" }}>{a.citation}</div>}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--portal-muted)" }}>{a.program ?? "—"}</td>
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{a.answer_type ?? "Yes/No/NA"}</td>
                <td style={{ padding: "10px 12px", color: "var(--portal-muted)" }}>{a.evidence_required ?? "—"}</td>
                <td style={{ padding: "10px 12px" }}><RiskBadge level={a.risk_level} /></td>
                <td style={{ padding: "10px 12px", color: "var(--portal-muted)" }}>{a.responsible_role ?? "—"}</td>
                <td style={{ padding: "10px 12px", color: "var(--portal-muted)" }}>{a.frequency ?? "—"}</td>
                <td style={{ padding: "10px 12px", color: "var(--portal-muted)" }}>{a.module_assignment ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
