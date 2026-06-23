"use client";

import { useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import {
  categoryLabels,
  jurisdictionLabels,
  requirementTypeLabels,
  reviewStatuses,
  reviewStatusLabels,
  riskLevels,
  riskLabels,
  statusColors,
  statusLabels,
  type LegalComplianceStatus,
  type LegalRegisterItem,
  type RequirementType,
  type ReviewStatus,
  type RiskLevel,
} from "@/lib/legal/types";
import { ConfidenceBadge, HumanReviewBadge, ReviewStatusBadge, RiskBadge } from "@/components/legal-register/badges";

const cellHead: React.CSSProperties = {
  textAlign: "left", padding: "10px 12px", fontWeight: 600, color: "var(--portal-muted)",
  fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
};

const filterStyle: React.CSSProperties = {
  background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 6,
  padding: "7px 10px", fontSize: "0.82rem", color: "inherit",
};

function DetailBlock({ label, value, accent }: { label: string; value?: string | null; accent?: string }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--portal-muted)", marginBottom: 4 }}>{label}</div>
      <p style={{ fontSize: "0.84rem", margin: 0, lineHeight: 1.55, color: accent }}>{value}</p>
    </div>
  );
}

export function LegalRegisterTable({ initialItems, isAdmin }: { initialItems: LegalRegisterItem[]; isAdmin: boolean }) {
  const [items, setItems] = useState(initialItems);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (reviewFilter && i.review_status !== reviewFilter) return false;
        if (riskFilter && i.risk_level !== riskFilter) return false;
        if (!search) return true;
        const s = search.toLowerCase();
        return (
          i.title.toLowerCase().includes(s) ||
          i.citation?.toLowerCase().includes(s) ||
          i.issuing_body?.toLowerCase().includes(s) ||
          i.program?.toLowerCase().includes(s)
        );
      }),
    [items, search, reviewFilter, riskFilter],
  );

  async function handleStatusChange(id: string, status: LegalComplianceStatus) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, compliance_status: status } : i)));
    await fetch("/api/legal-research/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, compliance_status: status }),
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <input type="search" placeholder="Filter by title, citation, agency, program…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...filterStyle, flex: 1, minWidth: 240 }} />
        <select value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)} style={filterStyle}>
          <option value="">All review states</option>
          {reviewStatuses.map((s) => <option key={s} value={s}>{reviewStatusLabels[s]}</option>)}
        </select>
        <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} style={filterStyle}>
          <option value="">All risk levels</option>
          {riskLevels.map((r) => <option key={r} value={r}>{riskLabels[r]}</option>)}
        </select>
        <span style={{ fontSize: "0.8rem", color: "var(--portal-muted)" }}>{filtered.length} of {items.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--portal-muted)", background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10 }}>
          <BookOpen size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{items.length === 0 ? "Legal register is empty" : "No entries match your filters"}</div>
          <div style={{ fontSize: "0.85rem" }}>{items.length === 0 ? "Run a research run to populate your register." : "Try different filters."}</div>
        </div>
      ) : (
        <div style={{ border: "1px solid var(--portal-border)", borderRadius: 10, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
            <thead>
              <tr style={{ background: "var(--portal-surface)", borderBottom: "1px solid var(--portal-border)" }}>
                <th style={cellHead}>Title / Citation</th>
                <th style={cellHead}>Program</th>
                <th style={cellHead}>Jurisdiction</th>
                <th style={cellHead}>Type</th>
                <th style={cellHead}>Risk</th>
                <th style={cellHead}>Confidence</th>
                <th style={cellHead}>Review</th>
                <th style={cellHead}>Compliance</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <RegisterRow
                  key={item.id}
                  item={item}
                  expanded={expanded === item.id}
                  onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
                  isAdmin={isAdmin}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RegisterRow({
  item, expanded, onToggle, isAdmin, onStatusChange,
}: {
  item: LegalRegisterItem;
  expanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  onStatusChange: (id: string, status: LegalComplianceStatus) => void;
}) {
  return (
    <>
      <tr onClick={onToggle} style={{ borderBottom: "1px solid var(--portal-border)", cursor: "pointer", background: expanded ? "var(--portal-surface)" : "transparent" }}>
        <td style={{ padding: "12px", minWidth: 220 }}>
          <div style={{ fontWeight: 600, lineHeight: 1.3, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
            {item.title} <HumanReviewBadge required={item.human_review_required} />
          </div>
          {item.citation && <div style={{ fontSize: "0.74rem", color: "var(--portal-gold)", fontFamily: "monospace" }}>{item.citation}</div>}
          {item.issuing_body && <div style={{ fontSize: "0.74rem", color: "var(--portal-muted)" }}>{item.issuing_body}</div>}
        </td>
        <td style={{ padding: "12px", color: "var(--portal-muted)" }}>{item.program ?? "—"}</td>
        <td style={{ padding: "12px", whiteSpace: "nowrap", color: "var(--portal-muted)" }}>{jurisdictionLabels[item.jurisdiction]}{item.jurisdiction_state ? ` · ${item.jurisdiction_state}` : ""}</td>
        <td style={{ padding: "12px" }}>{item.requirement_type ? requirementTypeLabels[item.requirement_type as RequirementType] ?? item.requirement_type : categoryLabels[item.category]}</td>
        <td style={{ padding: "12px" }}><RiskBadge level={item.risk_level} /></td>
        <td style={{ padding: "12px" }}><ConfidenceBadge level={item.confidence_level} /></td>
        <td style={{ padding: "12px" }}><ReviewStatusBadge status={item.review_status} /></td>
        <td style={{ padding: "12px" }} onClick={(e) => e.stopPropagation()}>
          {isAdmin ? (
            <select
              value={item.compliance_status}
              onChange={(e) => onStatusChange(item.id, e.target.value as LegalComplianceStatus)}
              style={{ background: `${statusColors[item.compliance_status]}22`, color: statusColors[item.compliance_status], border: `1px solid ${statusColors[item.compliance_status]}44`, borderRadius: 4, padding: "3px 8px", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}
            >
              {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: "0.78rem", color: statusColors[item.compliance_status] }}>{statusLabels[item.compliance_status]}</span>
          )}
        </td>
        <td style={{ padding: "12px 8px", textAlign: "center", color: "var(--portal-muted)" }}>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: "1px solid var(--portal-border)", background: "var(--portal-surface)" }}>
          <td colSpan={9} style={{ padding: "16px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              <DetailBlock label="Summary" value={item.description} />
              <DetailBlock label="Applicability" value={item.applicability_notes} />
              <DetailBlock label="Required Action" value={item.required_action ?? item.compliance_requirements} />
              <DetailBlock label="Documentation Required" value={item.documentation_required} />
              <DetailBlock label="Training Required" value={item.training_required} />
              <DetailBlock label="Inspection Required" value={item.inspection_required} />
              <DetailBlock label="Permit Required" value={item.permit_required} />
              <DetailBlock label="Record Retention" value={item.record_retention} />
              <DetailBlock label="Responsible Role" value={item.responsible_role} />
              <DetailBlock label="Module Assignment" value={item.module_assignment} />
              <DetailBlock label="Penalties" value={item.penalties} accent="#f59e0b" />
            </div>
            {item.source_urls?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--portal-muted)", marginBottom: 6 }}>Sources</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {item.source_urls.map((url, j) => (
                    <a key={j} href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem", color: "var(--portal-gold)", display: "flex", alignItems: "center", gap: 5, wordBreak: "break-all" }}>
                      <ExternalLink size={11} style={{ flexShrink: 0 }} /> {url}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
