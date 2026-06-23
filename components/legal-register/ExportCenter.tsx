"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { exportExcel, exportPdf, type ExportColumn, type ExportMeta, type ExportSheet } from "@/lib/legal/export";
import { jurisdictionLabels } from "@/lib/legal/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export interface ExportBundles {
  register: Row[];
  gaps: Row[];
  audits: Row[];
  modules: Row[];
  sources: Row[];
  changeLog: Row[];
  reviewQueue: Row[];
}

interface ExportDef {
  key: string;
  label: string;
  description: string;
  columns: ExportColumn[];
  rows: Row[];
}

function jur(r: Row): string {
  const base = jurisdictionLabels[r.jurisdiction as keyof typeof jurisdictionLabels] ?? r.jurisdiction ?? "";
  return r.jurisdiction_state ? `${base} · ${r.jurisdiction_state}` : base;
}

export function ExportCenter({ bundles, meta }: { bundles: ExportBundles; meta: ExportMeta }) {
  const [busy, setBusy] = useState<string | null>(null);

  const defs: ExportDef[] = [
    {
      key: "legal-register",
      label: "Legal Register",
      description: "All register entries with risk, confidence, review and compliance status.",
      columns: [
        { header: "Title", key: "title" }, { header: "Citation", key: "citation" }, { header: "Agency", key: "issuing_body" },
        { header: "Program", key: "program" }, { header: "Jurisdiction", key: "jurisdiction" }, { header: "Risk", key: "risk_level" },
        { header: "Confidence", key: "confidence_level" }, { header: "Review", key: "review_status" }, { header: "Compliance", key: "compliance_status" },
        { header: "Required Action", key: "required_action" }, { header: "Module", key: "module_assignment" },
      ],
      rows: bundles.register.map((r) => ({ ...r, jurisdiction: jur(r) })),
    },
    {
      key: "gap-analysis",
      label: "Gap Analysis",
      description: "Existing-vs-required findings with recommended updates.",
      columns: [
        { header: "Status", key: "status" }, { header: "Finding", key: "finding" }, { header: "Gap", key: "gap_description" },
        { header: "Recommended Update", key: "recommended_update" }, { header: "Risk", key: "risk_level" }, { header: "Module", key: "module_assignment" },
      ],
      rows: bundles.gaps,
    },
    {
      key: "audit-checklist",
      label: "Audit Checklist",
      description: "Yes/No/NA checklist items with evidence and frequency.",
      columns: [
        { header: "Program", key: "program" }, { header: "Checklist Item", key: "checklist_item" }, { header: "Question", key: "question_text" },
        { header: "Answer Type", key: "answer_type" }, { header: "Evidence", key: "evidence_required" }, { header: "Risk", key: "risk_level" },
        { header: "Responsible", key: "responsible_role" }, { header: "Frequency", key: "frequency" }, { header: "Module", key: "module_assignment" },
      ],
      rows: bundles.audits,
    },
    {
      key: "module-recommendations",
      label: "Module Recommendations",
      description: "Recommended modules and build status.",
      columns: [
        { header: "Module", key: "module_name" }, { header: "Reason", key: "reason_needed" },
        { header: "Priority", key: "priority_level" }, { header: "Build Status", key: "build_status" },
      ],
      rows: bundles.modules,
    },
    {
      key: "source-list",
      label: "Source List",
      description: "Research source library.",
      columns: [
        { header: "Name", key: "name" }, { header: "Agency", key: "agency" }, { header: "Type", key: "source_type" },
        { header: "Jurisdiction", key: "jurisdiction" }, { header: "Confidence", key: "confidence_default" }, { header: "Enabled", key: "enabled" },
      ],
      rows: bundles.sources.map((s) => ({ ...s, enabled: s.enabled ? "Yes" : "No" })),
    },
    {
      key: "change-log",
      label: "Change Log",
      description: "Audit trail of register changes.",
      columns: [
        { header: "Date", key: "date" }, { header: "Entry", key: "entry_title" }, { header: "Change Type", key: "change_type" },
        { header: "Old → New", key: "delta" }, { header: "Reason", key: "change_reason" },
      ],
      rows: bundles.changeLog.map((c) => ({
        ...c,
        date: c.created_at ? new Date(c.created_at).toLocaleString() : "",
        delta: c.old_value || c.new_value ? `${c.old_value ?? "—"} → ${c.new_value ?? "—"}` : "",
      })),
    },
    {
      key: "review-queue",
      label: "Review Queue",
      description: "Items awaiting human review.",
      columns: [
        { header: "Title", key: "title" }, { header: "Program", key: "program" }, { header: "Jurisdiction", key: "jurisdiction" },
        { header: "Risk", key: "risk_level" }, { header: "Confidence", key: "confidence_level" }, { header: "Review Role", key: "review_role_needed" }, { header: "Status", key: "review_status" },
      ],
      rows: bundles.reviewQueue.map((r) => ({ ...r, jurisdiction: jur(r) })),
    },
  ];

  function sheetFor(def: ExportDef): ExportSheet {
    return { name: def.label, title: def.label, columns: def.columns, rows: def.rows };
  }

  async function run(def: ExportDef, kind: "pdf" | "excel") {
    setBusy(`${def.key}-${kind}`);
    try {
      const sheet = sheetFor(def);
      if (kind === "pdf") exportPdf(sheet, meta);
      else await exportExcel(def.key, [sheet], meta);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
      {defs.map((def) => (
        <div key={def.key} style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "16px 18px" }}>
          <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>{def.label}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--portal-muted)", margin: "4px 0 12px", lineHeight: 1.5 }}>{def.description}</div>
          <div style={{ fontSize: "0.74rem", color: "var(--portal-muted)", marginBottom: 10 }}>{def.rows.length} row{def.rows.length === 1 ? "" : "s"}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => run(def, "pdf")} disabled={def.rows.length === 0 || busy !== null} style={btn(def.rows.length === 0)}>
              {busy === `${def.key}-pdf` ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <FileText size={13} />} PDF
            </button>
            <button onClick={() => run(def, "excel")} disabled={def.rows.length === 0 || busy !== null} style={btn(def.rows.length === 0)}>
              {busy === `${def.key}-excel` ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <FileSpreadsheet size={13} />} Excel
            </button>
          </div>
        </div>
      ))}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function btn(disabled: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 6, background: "var(--portal-bg)", border: "1px solid var(--portal-border)",
    borderRadius: 6, padding: "6px 14px", fontSize: "0.8rem", fontWeight: 600, color: "inherit",
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
  };
}
