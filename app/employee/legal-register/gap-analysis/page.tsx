import { GapAnalysisPanel } from "@/components/legal-register/GapAnalysisPanel";
import { getLegalAccess } from "@/lib/legal/access";
import { gapStatusLabels } from "@/lib/legal/types";
import { GapStatusBadge, RiskBadge } from "@/components/legal-register/badges";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GapRow = Record<string, any>;

const cellHead: React.CSSProperties = {
  textAlign: "left", padding: "10px 12px", fontWeight: 600, color: "var(--portal-muted)",
  fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap",
};

export default async function GapAnalysisPage() {
  const { supabase, isAdmin } = await getLegalAccess();

  let gaps: GapRow[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("gap_analysis_results")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    gaps = data ?? [];
  }

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Legal Register</div>
          <h1>Gap Analysis</h1>
          <p>Compare an existing program against current regulatory requirements. Findings are flagged as existing, added, changed, missing, outdated, or needs-review.</p>
        </div>
      </div>

      {isAdmin && <GapAnalysisPanel />}

      <h2 style={{ fontSize: "1rem", margin: "28px 0 12px" }}>Recent Gap Findings</h2>
      {gaps.length === 0 ? (
        <div style={{ padding: "32px", textAlign: "center", color: "var(--portal-muted)", background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10 }}>
          No gap findings yet. {isAdmin ? "Run a comparison above to populate this." : "An admin can run a comparison."}
        </div>
      ) : (
        <div style={{ border: "1px solid var(--portal-border)", borderRadius: 10, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
            <thead>
              <tr style={{ background: "var(--portal-surface)", borderBottom: "1px solid var(--portal-border)" }}>
                <th style={cellHead}>Status</th>
                <th style={cellHead}>Finding</th>
                <th style={cellHead}>Gap</th>
                <th style={cellHead}>Recommended Update</th>
                <th style={cellHead}>Risk</th>
                <th style={cellHead}>Module</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((g) => (
                <tr key={g.id} style={{ borderBottom: "1px solid var(--portal-border)" }}>
                  <td style={{ padding: "10px 12px" }}><GapStatusBadge status={g.status} /> {g.status && !(g.status in gapStatusLabels) ? g.status : ""}</td>
                  <td style={{ padding: "10px 12px", minWidth: 180 }}>{g.finding ?? "—"}</td>
                  <td style={{ padding: "10px 12px", color: "var(--portal-muted)" }}>{g.gap_description ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{g.recommended_update ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}><RiskBadge level={g.risk_level} /></td>
                  <td style={{ padding: "10px 12px", color: "var(--portal-muted)" }}>{g.module_assignment ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
