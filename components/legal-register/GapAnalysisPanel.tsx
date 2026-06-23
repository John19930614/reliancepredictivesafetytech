"use client";

import { useState } from "react";
import { AlertTriangle, GitCompare, Loader2 } from "lucide-react";
import { PROGRAM_OPTIONS } from "@/lib/legal/options";
import type { ResearchRunInput, StructuredResearchResult } from "@/lib/legal/types";
import { StructuredResultView } from "@/components/legal-register/StructuredResultView";

const inputStyle: React.CSSProperties = {
  width: "100%", background: "var(--portal-bg)", border: "1px solid var(--portal-border)", borderRadius: 6,
  padding: "8px 10px", fontSize: "0.85rem", color: "inherit", boxSizing: "border-box",
};

export function GapAnalysisPanel() {
  const [text, setText] = useState("");
  const [program, setProgram] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StructuredResearchResult | null>(null);

  async function run() {
    if (!text.trim()) { setError("Paste your existing program text to compare."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const body: ResearchRunInput = {
        program, state, existing_program_text: text,
        title: `Gap analysis${program ? ` — ${program}` : ""}`,
        question: `Compare this existing program against current requirements and identify gaps for ${program || "the relevant program"}${state ? ` in ${state}` : ""}.`,
      };
      const res = await fetch("/api/legal-research/structured", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Comparison failed");
      setResult(data.result as StructuredResearchResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "18px 20px" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <select value={program} onChange={(e) => setProgram(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 200 }}>
            <option value="">Select program (optional)…</option>
            {PROGRAM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State (optional)" style={{ ...inputStyle, width: 160 }} />
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Paste your existing safety program / policy text here…" style={{ ...inputStyle, resize: "vertical", marginBottom: 12 }} />
        {error && <div style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 6, padding: "10px 14px", marginBottom: 12, fontSize: "0.85rem", color: "#ef4444", display: "flex", gap: 8 }}><AlertTriangle size={16} /> {error}</div>}
        <button onClick={run} disabled={loading} style={{ background: "var(--portal-gold)", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, fontSize: "0.85rem", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", gap: 8 }}>
          {loading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Comparing… (30–60 s)</> : <><GitCompare size={14} /> Compare to Requirements</>}
        </button>
      </div>
      {result && <StructuredResultView result={result} />}
    </>
  );
}
