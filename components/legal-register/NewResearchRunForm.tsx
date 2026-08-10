"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Search, X } from "lucide-react";
import { INDUSTRY_OPTIONS, PROGRAM_OPTIONS } from "@/lib/legal/options";
import { requirementTypeLabels, riskLabels, type ResearchFinding, type ResearchRunInput, type StructuredResearchResult } from "@/lib/legal/types";
import { ConfidenceBadge, HumanReviewBadge, RequirementTypeBadge, RiskBadge } from "@/components/legal-register/badges";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--portal-bg)",
  border: "1px solid var(--portal-border)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: "0.85rem",
  color: "inherit",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--portal-muted)",
  marginBottom: 4,
  display: "block",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const EMPTY: ResearchRunInput = {
  title: "",
  industry: "",
  program: "",
  work_activity: "",
  state: "",
  jurisdiction: "",
  federal_only: false,
  include_state_local: true,
  scope: "",
  equipment: "",
  chemicals_materials: "",
  vehicle_type: "",
  employee_type: "",
  contractor_type: "",
  risk_level: "",
  existing_program_text: "",
  question: "",
};

export function NewResearchRunForm() {
  const router = useRouter();
  const [form, setForm] = useState<ResearchRunInput>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(StructuredResearchResult & { runId: string }) | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  function setField<K extends keyof ResearchRunInput>(key: K, value: ResearchRunInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleRun() {
    setLoading(true);
    setError(null);
    setResult(null);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/legal-research/structured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");
      const r = { ...(data.result as StructuredResearchResult), runId: data.runId as string };
      setResult(r);
      setSelected(new Set(r.findings.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!result) return;
    const findings = result.findings.filter((_, i) => selected.has(i));
    if (findings.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/legal-research/structured", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: result.runId, query: result.query, program: form.program, findings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSaveMsg(
        `${data.saved} finding${data.saved !== 1 ? "s" : ""} saved to the register` +
          (data.needsReview ? ` · ${data.needsReview} sent to the review queue.` : "."),
      );
      setResult(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {saveMsg && (
        <div style={{ background: "#22c55e22", border: "1px solid #22c55e44", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: "0.875rem", color: "#22c55e", display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={16} /> {saveMsg}
        </div>
      )}

      <div style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "20px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 16 }}>
          <Field label="Research title">
            <input style={inputStyle} value={form.title ?? ""} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. Fuel transport across state lines" />
          </Field>
          <Field label="Industry">
            <select style={inputStyle} value={form.industry ?? ""} onChange={(e) => setField("industry", e.target.value)}>
              <option value="">Select industry…</option>
              {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Program type">
            <select style={inputStyle} value={form.program ?? ""} onChange={(e) => setField("program", e.target.value)}>
              <option value="">Select program…</option>
              {PROGRAM_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Work activity">
            <input style={inputStyle} value={form.work_activity ?? ""} onChange={(e) => setField("work_activity", e.target.value)} />
          </Field>
          <Field label="State">
            <input style={inputStyle} value={form.state ?? ""} onChange={(e) => setField("state", e.target.value)} placeholder="e.g. TX, WI" />
          </Field>
          <Field label="Jurisdiction">
            <input style={inputStyle} value={form.jurisdiction ?? ""} onChange={(e) => setField("jurisdiction", e.target.value)} placeholder="federal / state / local" />
          </Field>
          <Field label="Equipment involved">
            <input style={inputStyle} value={form.equipment ?? ""} onChange={(e) => setField("equipment", e.target.value)} />
          </Field>
          <Field label="Chemicals / materials">
            <input style={inputStyle} value={form.chemicals_materials ?? ""} onChange={(e) => setField("chemicals_materials", e.target.value)} />
          </Field>
          <Field label="Vehicle type (DOT)">
            <input style={inputStyle} value={form.vehicle_type ?? ""} onChange={(e) => setField("vehicle_type", e.target.value)} />
          </Field>
          <Field label="Employee type">
            <input style={inputStyle} value={form.employee_type ?? ""} onChange={(e) => setField("employee_type", e.target.value)} />
          </Field>
          <Field label="Contractor type">
            <input style={inputStyle} value={form.contractor_type ?? ""} onChange={(e) => setField("contractor_type", e.target.value)} />
          </Field>
          <Field label="Risk level">
            <select style={inputStyle} value={form.risk_level ?? ""} onChange={(e) => setField("risk_level", e.target.value)}>
              <option value="">—</option>
              {Object.entries(riskLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>

        <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem" }}>
            <input type="checkbox" checked={form.federal_only ?? false} onChange={(e) => setField("federal_only", e.target.checked)} />
            Federal only
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem" }}>
            <input type="checkbox" checked={form.include_state_local ?? false} onChange={(e) => setField("include_state_local", e.target.checked)} />
            Include state / local
          </label>
        </div>

        <Field label="Scope of work">
          <textarea style={{ ...inputStyle, marginBottom: 14, resize: "vertical" }} rows={2} value={form.scope ?? ""} onChange={(e) => setField("scope", e.target.value)} />
        </Field>
        <Field label="Free-text question">
          <textarea style={{ ...inputStyle, marginBottom: 14, resize: "vertical" }} rows={2} value={form.question ?? ""} onChange={(e) => setField("question", e.target.value)} placeholder="e.g. What regulations apply to small trucks carrying fuel in the bed while crossing state lines?" />
        </Field>
        <Field label="Existing program to compare (optional — populates gap analysis)">
          <textarea style={{ ...inputStyle, marginBottom: 14, resize: "vertical" }} rows={3} value={form.existing_program_text ?? ""} onChange={(e) => setField("existing_program_text", e.target.value)} />
        </Field>

        {error && (
          <div style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 6, padding: "10px 14px", marginBottom: 12, fontSize: "0.85rem", color: "#ef4444", display: "flex", gap: 8 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{error}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleRun} disabled={loading} style={{ background: "var(--portal-gold)", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, fontSize: "0.875rem", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", gap: 8 }}>
            {loading ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Researching… (30–60 s)</> : <><Search size={15} /> Run Deep Research</>}
          </button>
          <button onClick={() => { setForm(EMPTY); setResult(null); setError(null); setSaveMsg(null); }} disabled={loading} style={{ background: "none", color: "inherit", border: "1px solid var(--portal-border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}>
            Clear Form
          </button>
        </div>
      </div>

      {result && <ResearchFindings result={result} selected={selected} setSelected={setSelected} onSave={handleSave} saving={saving} onDismiss={() => setResult(null)} />}
    </>
  );
}

function ResearchFindings({
  result, selected, setSelected, onSave, saving, onDismiss,
}: {
  result: StructuredResearchResult & { runId: string };
  selected: Set<number>;
  setSelected: (s: Set<number>) => void;
  onSave: () => void;
  saving: boolean;
  onDismiss: () => void;
}) {
  return (
    <div style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10, marginTop: 24, overflow: "hidden" }}>
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--portal-border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 4 }}>Research Complete — {result.findings.length} findings</div>
          <div style={{ fontSize: "0.82rem", color: "var(--portal-muted)" }}>{result.research_summary}</div>
        </div>
        <button type="button" aria-label="Dismiss findings" onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={18} /></button>
      </div>

      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--portal-border)", display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={() => setSelected(selected.size === result.findings.length ? new Set() : new Set(result.findings.map((_, i) => i)))} style={{ fontSize: "0.8rem", background: "none", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", color: "inherit" }}>
          {selected.size === result.findings.length ? "Deselect all" : "Select all"}
        </button>
        <span style={{ fontSize: "0.8rem", color: "var(--portal-muted)" }}>{selected.size} selected</span>
        <button onClick={onSave} disabled={saving || selected.size === 0} style={{ marginLeft: "auto", background: "var(--portal-gold)", color: "#000", border: "none", borderRadius: 6, padding: "6px 16px", fontWeight: 700, fontSize: "0.8rem", cursor: saving || selected.size === 0 ? "not-allowed" : "pointer", opacity: saving || selected.size === 0 ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
          {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />} Save to Register
        </button>
      </div>

      <div style={{ maxHeight: 520, overflowY: "auto" }}>
        {result.findings.map((f: ResearchFinding, i) => (
          <div key={i} style={{ borderBottom: "1px solid var(--portal-border)", padding: "12px 24px", opacity: selected.has(i) ? 1 : 0.5 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <input type="checkbox" checked={selected.has(i)} onChange={() => { const n = new Set(selected); n.has(i) ? n.delete(i) : n.add(i); setSelected(n); }} style={{ marginTop: 3, cursor: "pointer", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{f.title}</span>
                  {f.citation && <span style={{ fontSize: "0.75rem", color: "var(--portal-gold)", fontFamily: "monospace" }}>{f.citation}</span>}
                  {f.agency && <span style={{ fontSize: "0.75rem", color: "var(--portal-muted)" }}>{f.agency}</span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <RequirementTypeBadge type={f.requirement_type} />
                  <RiskBadge level={f.risk_level} />
                  <ConfidenceBadge level={f.confidence_level} />
                  <HumanReviewBadge required={f.human_review_required} />
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--portal-muted)", margin: "0 0 4px", lineHeight: 1.5 }}>{f.summary}</p>
                {f.applicability && <p style={{ fontSize: "0.78rem", margin: 0, lineHeight: 1.5 }}><strong>Applicability:</strong> {f.applicability}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
