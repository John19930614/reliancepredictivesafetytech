"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { PROGRAM_OPTIONS } from "@/lib/legal/options";
import type { ResearchRunInput, StructuredResearchResult } from "@/lib/legal/types";
import { StructuredResultView } from "@/components/legal-register/StructuredResultView";

const inputStyle: React.CSSProperties = {
  background: "var(--portal-bg)", border: "1px solid var(--portal-border)", borderRadius: 6,
  padding: "8px 10px", fontSize: "0.85rem", color: "inherit",
};

export function ProgramResearchAssistant() {
  const [program, setProgram] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StructuredResearchResult | null>(null);

  async function run() {
    if (!program) { setError("Select a program to research."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const body: ResearchRunInput = { program, state, title: `${program} program research`, question: `Identify all compliance requirements for the ${program} program${state ? ` in ${state}` : ""}.` };
      const res = await fetch("/api/legal-research/structured", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");
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
      <div style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "18px 20px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--portal-muted)", display: "block", marginBottom: 4 }}>Program</label>
          <select value={program} onChange={(e) => setProgram(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
            <option value="">Select a program…</option>
            {PROGRAM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ width: 140 }}>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--portal-muted)", display: "block", marginBottom: 4 }}>State</label>
          <input value={state} onChange={(e) => setState(e.target.value)} placeholder="optional" style={{ ...inputStyle, width: "100%" }} />
        </div>
        <button onClick={run} disabled={loading} style={{ background: "var(--portal-gold)", color: "#000", border: "none", borderRadius: 6, padding: "9px 18px", fontWeight: 700, fontSize: "0.85rem", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", gap: 8 }}>
          {loading ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Researching…</> : <><Search size={14} /> Research Program</>}
        </button>
      </div>

      {error && <div style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 6, padding: "10px 14px", marginTop: 14, fontSize: "0.85rem", color: "#ef4444", display: "flex", gap: 8 }}><AlertTriangle size={16} /> {error}</div>}
      {result && <StructuredResultView result={result} />}
    </>
  );
}
