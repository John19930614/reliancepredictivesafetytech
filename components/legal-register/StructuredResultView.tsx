import type { StructuredResearchResult } from "@/lib/legal/types";
import { ConfidenceBadge, GapStatusBadge, HumanReviewBadge, RequirementTypeBadge, RiskBadge } from "@/components/legal-register/badges";

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: "0.9rem", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
        {title} <span style={{ fontSize: "0.74rem", color: "var(--portal-muted)", fontWeight: 400 }}>({count})</span>
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 8, padding: "12px 14px",
};

/** Read-only renderer for a full structured research result (doc §14 sections). */
export function StructuredResultView({ result }: { result: StructuredResearchResult }) {
  return (
    <div>
      {result.research_summary && (
        <p style={{ fontSize: "0.86rem", color: "var(--portal-muted)", lineHeight: 1.55, marginTop: 4 }}>{result.research_summary}</p>
      )}

      <Section title="Findings" count={result.findings.length}>
        {result.findings.map((f, i) => (
          <div key={i} style={card}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
              <span style={{ fontWeight: 600, fontSize: "0.86rem" }}>{f.title}</span>
              {f.citation && <span style={{ fontSize: "0.74rem", color: "var(--portal-gold)", fontFamily: "monospace" }}>{f.citation}</span>}
              {f.agency && <span style={{ fontSize: "0.74rem", color: "var(--portal-muted)" }}>{f.agency}</span>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              <RequirementTypeBadge type={f.requirement_type} />
              <RiskBadge level={f.risk_level} />
              <ConfidenceBadge level={f.confidence_level} />
              <HumanReviewBadge required={f.human_review_required} />
            </div>
            <p style={{ fontSize: "0.8rem", margin: 0, color: "var(--portal-muted)", lineHeight: 1.5 }}>{f.summary}</p>
          </div>
        ))}
      </Section>

      <Section title="Gap Analysis" count={result.gap_analysis.length}>
        {result.gap_analysis.map((g, i) => (
          <div key={i} style={card}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 5 }}>
              <GapStatusBadge status={g.status} />
              <RiskBadge level={g.risk_level} />
              <HumanReviewBadge required={g.human_review_required} />
              <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>{g.finding}</span>
            </div>
            {g.gap_description && <p style={{ fontSize: "0.8rem", margin: "0 0 4px", color: "var(--portal-muted)" }}>{g.gap_description}</p>}
            {g.recommended_update && <p style={{ fontSize: "0.8rem", margin: 0 }}><strong>Recommended:</strong> {g.recommended_update}</p>}
          </div>
        ))}
      </Section>

      <Section title="Module Recommendations" count={result.module_recommendations.length}>
        {result.module_recommendations.map((m, i) => (
          <div key={i} style={card}>
            <div style={{ fontWeight: 600, fontSize: "0.86rem", marginBottom: 4 }}>{m.module_name}{m.priority_level ? ` · ${m.priority_level}` : ""}</div>
            {m.reason_needed && <p style={{ fontSize: "0.8rem", margin: 0, color: "var(--portal-muted)" }}>{m.reason_needed}</p>}
          </div>
        ))}
      </Section>

      <Section title="Audit Checklist Items" count={result.audit_checklist_items.length}>
        {result.audit_checklist_items.map((a, i) => (
          <div key={i} style={card}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
              <RiskBadge level={a.risk_level} />
              <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>{a.checklist_item || a.question_text}</span>
            </div>
            {a.question_text && <p style={{ fontSize: "0.8rem", margin: 0, color: "var(--portal-muted)" }}>{a.question_text}</p>}
          </div>
        ))}
      </Section>

      {result.human_review_notes.length > 0 && (
        <Section title="Human Review Notes" count={result.human_review_notes.length}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.82rem", color: "var(--portal-muted)" }}>
            {result.human_review_notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </Section>
      )}
    </div>
  );
}
