"use client";

import { useState, useTransition } from "react";
import { Check, Save } from "lucide-react";
import { updatePromptTemplate } from "@/app/employee/legal-register/actions";
import { HumanReviewBadge } from "@/components/legal-register/badges";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PromptTemplate = Record<string, any>;

export function PromptTemplateEditor({ templates, isAdmin }: { templates: PromptTemplate[]; isAdmin: boolean }) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(templates.map((t) => [t.id, t.template_text])));
  const [pending, startTransition] = useTransition();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await updatePromptTemplate(id, drafts[id] ?? "");
      if (!res.ok) { setError(res.error ?? "Save failed"); return; }
      setSavedId(id);
      setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), 2000);
    });
  }

  if (templates.length === 0) {
    return <div style={{ padding: "20px", color: "var(--portal-muted)", fontSize: "0.85rem" }}>No prompt templates configured.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && <div style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 8, padding: "10px 14px", fontSize: "0.85rem", color: "#ef4444" }}>{error}</div>}
      {templates.map((t) => (
        <div key={t.id} style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 8 }}>
              {t.name} {t.requires_human_review && <HumanReviewBadge required />}
            </div>
            {isAdmin && (
              <button onClick={() => save(t.id)} disabled={pending} style={{ display: "flex", alignItems: "center", gap: 6, background: savedId === t.id ? "#22c55e" : "var(--portal-gold)", color: "#000", border: "none", borderRadius: 6, padding: "5px 12px", fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" }}>
                {savedId === t.id ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save</>}
              </button>
            )}
          </div>
          <textarea
            value={drafts[t.id] ?? ""}
            readOnly={!isAdmin}
            onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
            rows={4}
            style={{ width: "100%", background: "var(--portal-bg)", border: "1px solid var(--portal-border)", borderRadius: 6, padding: "9px 11px", fontSize: "0.82rem", color: "inherit", resize: "vertical", boxSizing: "border-box", lineHeight: 1.5 }}
          />
        </div>
      ))}
    </div>
  );
}
