"use client";

import { useState, useTransition } from "react";
import { Boxes } from "lucide-react";
import { updateModuleBuildStatus } from "@/app/employee/legal-register/actions";
import { moduleBuildStatuses, moduleBuildStatusLabels } from "@/lib/legal/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ModuleRec = Record<string, any>;

const REQUIRED_FIELDS: { key: string; label: string }[] = [
  { key: "required_forms", label: "Forms" },
  { key: "required_permits", label: "Permits" },
  { key: "required_inspections", label: "Inspections" },
  { key: "required_training", label: "Training" },
  { key: "required_dashboards", label: "Dashboards" },
  { key: "required_alerts", label: "Alerts" },
  { key: "required_reports", label: "Reports" },
  { key: "required_corrective_actions", label: "Corrective Actions" },
  { key: "required_document_control", label: "Document Control" },
  { key: "required_approval_workflow", label: "Approval Workflow" },
];

export function ModuleRecommendationBuilder({ recs, isAdmin }: { recs: ModuleRec[]; isAdmin: boolean }) {
  const [items, setItems] = useState(recs);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function changeStatus(id: string, status: string) {
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, build_status: status } : m)));
    setError(null);
    startTransition(async () => {
      const res = await updateModuleBuildStatus(id, status);
      if (!res.ok) setError(res.error ?? "Update failed");
    });
  }

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--portal-muted)", background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10 }}>
        <Boxes size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
        <div style={{ fontWeight: 600 }}>No module recommendations yet</div>
        <div style={{ fontSize: "0.85rem" }}>Run a research run — recommended modules are generated from findings.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && <div style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 8, padding: "10px 14px", fontSize: "0.85rem", color: "#ef4444" }}>{error}</div>}
      {items.map((m) => (
        <div key={m.id} style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{m.module_name}</div>
              {m.priority_level && <div style={{ fontSize: "0.76rem", color: "var(--portal-muted)" }}>Priority: {m.priority_level}</div>}
            </div>
            {isAdmin ? (
              <select value={m.build_status ?? "planned"} disabled={pending} onChange={(e) => changeStatus(m.id, e.target.value)} style={{ background: "var(--portal-bg)", border: "1px solid var(--portal-border)", borderRadius: 6, padding: "5px 10px", fontSize: "0.8rem", color: "inherit", fontWeight: 600 }}>
                {moduleBuildStatuses.map((s) => <option key={s} value={s}>{moduleBuildStatusLabels[s]}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--portal-gold)" }}>{moduleBuildStatusLabels[(m.build_status as keyof typeof moduleBuildStatusLabels)] ?? m.build_status}</span>
            )}
          </div>
          {m.reason_needed && <p style={{ fontSize: "0.84rem", color: "var(--portal-muted)", margin: "8px 0 12px", lineHeight: 1.55 }}>{m.reason_needed}</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {REQUIRED_FIELDS.filter((f) => m[f.key]).map((f) => (
              <div key={f.key}>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--portal-muted)", marginBottom: 2 }}>{f.label}</div>
                <div style={{ fontSize: "0.8rem" }}>{m[f.key]}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
