"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { deleteSource, saveSource, toggleSource, type SourceInput } from "@/app/employee/legal-register/actions";
import { legalSourceTypes } from "@/lib/legal/types";
import { SourceTypeBadge } from "@/components/legal-register/badges";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Source = Record<string, any>;

const inputStyle: React.CSSProperties = {
  background: "var(--portal-bg)", border: "1px solid var(--portal-border)", borderRadius: 6,
  padding: "7px 9px", fontSize: "0.82rem", color: "inherit",
};
const cellHead: React.CSSProperties = {
  textAlign: "left", padding: "9px 12px", fontWeight: 600, color: "var(--portal-muted)",
  fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
};

const EMPTY: SourceInput = { name: "", agency: "", source_type: "", jurisdiction: "", state: "", url: "", enabled: true, confidence_default: "" };

export function ResearchSourcesManager({ sources, isAdmin }: { sources: Source[]; isAdmin: boolean }) {
  const [form, setForm] = useState<SourceInput>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Action failed");
    });
  }

  function submit() {
    if (!form.name.trim()) { setError("Source name is required."); return; }
    act(async () => {
      const res = await saveSource(form);
      if (res.ok) { setForm(EMPTY); setShowForm(false); }
      return res;
    });
  }

  return (
    <div>
      {error && <div style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: "0.85rem", color: "#ef4444" }}>{error}</div>}

      {isAdmin && (
        <div style={{ marginBottom: 16 }}>
          {!showForm ? (
            <button onClick={() => { setForm(EMPTY); setShowForm(true); }} style={{ background: "var(--portal-gold)", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> Add Source
            </button>
          ) : (
            <div style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "16px 18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
                <input style={inputStyle} placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input style={inputStyle} placeholder="Agency" value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} />
                <select style={inputStyle} value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })}>
                  <option value="">Source type…</option>
                  {legalSourceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input style={inputStyle} placeholder="Jurisdiction" value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} />
                <input style={inputStyle} placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
                <input style={inputStyle} placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
                <input style={inputStyle} placeholder="Default confidence (high/medium/low)" value={form.confidence_default} onChange={(e) => setForm({ ...form, confidence_default: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={submit} disabled={pending} style={{ background: "var(--portal-gold)", color: "#000", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}>{form.id ? "Save" : "Add"}</button>
                <button onClick={() => { setShowForm(false); setForm(EMPTY); }} style={{ background: "none", border: "1px solid var(--portal-border)", borderRadius: 6, padding: "7px 14px", fontSize: "0.82rem", color: "inherit", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ border: "1px solid var(--portal-border)", borderRadius: 10, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
          <thead>
            <tr style={{ background: "var(--portal-surface)", borderBottom: "1px solid var(--portal-border)" }}>
              <th style={cellHead}>Source</th>
              <th style={cellHead}>Agency</th>
              <th style={cellHead}>Type</th>
              <th style={cellHead}>Jurisdiction</th>
              <th style={cellHead}>Confidence</th>
              <th style={cellHead}>Enabled</th>
              {isAdmin && <th style={cellHead}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 ? (
              <tr><td colSpan={isAdmin ? 7 : 6} style={{ padding: "28px", textAlign: "center", color: "var(--portal-muted)" }}>No sources configured.</td></tr>
            ) : (
              sources.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--portal-border)", opacity: s.enabled ? 1 : 0.55 }}>
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "var(--portal-gold)", wordBreak: "break-all" }}>{s.url}</a>}
                  </td>
                  <td style={{ padding: "9px 12px", color: "var(--portal-muted)" }}>{s.agency ?? "—"}</td>
                  <td style={{ padding: "9px 12px" }}>{s.source_type ? <SourceTypeBadge type={s.source_type} /> : "—"}</td>
                  <td style={{ padding: "9px 12px", color: "var(--portal-muted)" }}>{s.jurisdiction ?? "—"}{s.state ? ` · ${s.state}` : ""}</td>
                  <td style={{ padding: "9px 12px", color: "var(--portal-muted)" }}>{s.confidence_default ?? "—"}</td>
                  <td style={{ padding: "9px 12px" }}>
                    {isAdmin ? (
                      <input type="checkbox" checked={!!s.enabled} disabled={pending} onChange={(e) => act(() => toggleSource(s.id, e.target.checked))} />
                    ) : (s.enabled ? "Yes" : "No")}
                  </td>
                  {isAdmin && (
                    <td style={{ padding: "9px 12px" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => { setForm({ id: s.id, name: s.name, agency: s.agency ?? "", source_type: s.source_type ?? "", jurisdiction: s.jurisdiction ?? "", state: s.state ?? "", url: s.url ?? "", enabled: s.enabled, confidence_default: s.confidence_default ?? "" }); setShowForm(true); }} style={{ background: "none", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "3px 8px", fontSize: "0.74rem", color: "inherit", cursor: "pointer" }}>Edit</button>
                        <button onClick={() => act(() => deleteSource(s.id))} disabled={pending} style={{ background: "none", border: "1px solid #ef444444", borderRadius: 4, padding: "3px 8px", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center" }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
