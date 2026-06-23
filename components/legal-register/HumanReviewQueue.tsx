"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, X } from "lucide-react";
import {
  approveEntry,
  archiveEntry,
  assignReviewerRole,
  markNotApplicableEntry,
  rejectEntry,
  requestChangesEntry,
  type ActionResult,
} from "@/app/employee/legal-register/actions";
import { REVIEW_ROLE_OPTIONS } from "@/lib/legal/options";
import { jurisdictionLabels, type LegalRegisterItem } from "@/lib/legal/types";
import { ConfidenceBadge, ReviewStatusBadge, RiskBadge } from "@/components/legal-register/badges";

const cellHead: React.CSSProperties = {
  textAlign: "left", padding: "10px 12px", fontWeight: 600, color: "var(--portal-muted)",
  fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
};

const actionBtn = (color: string): React.CSSProperties => ({
  fontSize: "0.74rem", fontWeight: 600, padding: "4px 9px", borderRadius: 4, cursor: "pointer",
  background: `color-mix(in srgb, ${color} 14%, transparent)`, color,
  border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`, whiteSpace: "nowrap",
});

export function HumanReviewQueue({ initialItems, canReview }: { initialItems: LegalRegisterItem[]; canReview: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function run(id: string, fn: () => Promise<ActionResult>, successText: string) {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) {
        setError(res.error ?? "Action failed");
        return;
      }
      setMsg(successText);
      setItems((prev) => prev.filter((i) => i.id !== id));
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--portal-muted)", background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10 }}>
        <CheckCircle2 size={36} style={{ marginBottom: 12, opacity: 0.5, color: "#22c55e" }} />
        <div style={{ fontWeight: 600 }}>Nothing awaiting review</div>
        <div style={{ fontSize: "0.85rem" }}>AI findings flagged for human review will appear here.</div>
      </div>
    );
  }

  return (
    <div>
      {msg && <div style={{ background: "#22c55e22", border: "1px solid #22c55e44", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: "0.85rem", color: "#22c55e", display: "flex", justifyContent: "space-between" }}><span>{msg}</span><button onClick={() => setMsg(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#22c55e" }}><X size={14} /></button></div>}
      {error && <div style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: "0.85rem", color: "#ef4444" }}>{error}</div>}

      <div style={{ border: "1px solid var(--portal-border)", borderRadius: 10, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
          <thead>
            <tr style={{ background: "var(--portal-surface)", borderBottom: "1px solid var(--portal-border)" }}>
              <th style={cellHead}>Title / Citation</th>
              <th style={cellHead}>Program</th>
              <th style={cellHead}>Jurisdiction</th>
              <th style={cellHead}>Risk</th>
              <th style={cellHead}>Confidence</th>
              <th style={cellHead}>Review Role</th>
              <th style={cellHead}>Submitted</th>
              <th style={cellHead}>Status</th>
              {canReview && <th style={cellHead}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid var(--portal-border)", opacity: busyId === item.id ? 0.5 : 1 }}>
                <td style={{ padding: "12px", minWidth: 200 }}>
                  <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{item.title}</div>
                  {item.citation && <div style={{ fontSize: "0.74rem", color: "var(--portal-gold)", fontFamily: "monospace" }}>{item.citation}</div>}
                </td>
                <td style={{ padding: "12px", color: "var(--portal-muted)" }}>{item.program ?? "—"}</td>
                <td style={{ padding: "12px", color: "var(--portal-muted)", whiteSpace: "nowrap" }}>{jurisdictionLabels[item.jurisdiction]}{item.jurisdiction_state ? ` · ${item.jurisdiction_state}` : ""}</td>
                <td style={{ padding: "12px" }}><RiskBadge level={item.risk_level} /></td>
                <td style={{ padding: "12px" }}><ConfidenceBadge level={item.confidence_level} /></td>
                <td style={{ padding: "12px", color: "var(--portal-muted)" }}>
                  {canReview ? (
                    <select
                      defaultValue={item.review_role_needed ?? ""}
                      disabled={pending}
                      onChange={(e) => e.target.value && run(item.id, () => assignReviewerRole(item.id, e.target.value), "Reviewer assigned")}
                      style={{ background: "var(--portal-bg)", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "3px 6px", fontSize: "0.75rem", color: "inherit" }}
                    >
                      <option value="">Assign…</option>
                      {REVIEW_ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (item.review_role_needed ?? "—")}
                </td>
                <td style={{ padding: "12px", whiteSpace: "nowrap", color: "var(--portal-muted)" }}>{new Date(item.created_at).toLocaleDateString()}</td>
                <td style={{ padding: "12px" }}><ReviewStatusBadge status={item.review_status} /></td>
                {canReview && (
                  <td style={{ padding: "12px" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button disabled={pending} style={actionBtn("#22c55e")} onClick={() => run(item.id, () => approveEntry(item.id), "Entry approved")}>
                        {busyId === item.id && pending ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : "Approve"}
                      </button>
                      <button disabled={pending} style={actionBtn("#ef4444")} onClick={() => run(item.id, () => rejectEntry(item.id), "Entry rejected")}>Reject</button>
                      <button disabled={pending} style={actionBtn("#f97316")} onClick={() => run(item.id, () => requestChangesEntry(item.id), "Changes requested")}>Changes</button>
                      <button disabled={pending} style={actionBtn("#a7a7a7")} onClick={() => run(item.id, () => markNotApplicableEntry(item.id), "Marked N/A")}>N/A</button>
                      <button disabled={pending} style={actionBtn("#6b7280")} onClick={() => run(item.id, () => archiveEntry(item.id), "Entry archived")}>Archive</button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
