import Link from "next/link";
import { reviewStatusLabels, riskColors, type ReviewStatus, type RiskLevel } from "@/lib/legal/types";
import { ReviewStatusBadge, RiskBadge } from "@/components/legal-register/badges";

export interface DashboardData {
  totalEntries: number;
  applicable: number;
  needingReview: number;
  highRisk: number;
  criticalRisk: number;
  openGaps: number;
  programsResearched: number;
  statesCovered: number;
  sourcesUsed: number;
  lastRunAt: string | null;
  recentlyChanged: number;
  byProgram: { label: string; count: number }[];
  byJurisdiction: { label: string; count: number }[];
  byRisk: { label: string; count: number }[];
  byStatus: { label: string; count: number }[];
  recentRuns: {
    id: string;
    created_at: string;
    query: string | null;
    program: string | null;
    jurisdiction: string | null;
    total_findings: number;
    high_risk_count: number;
    needs_review_count: number;
    status: string;
  }[];
}

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: "1.7rem", fontWeight: 850, color: accent ?? "var(--portal-gold)", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: "0.74rem", color: "var(--portal-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function DistributionCard({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--portal-muted)", marginBottom: 12 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: "0.82rem", color: "var(--portal-muted)" }}>No data yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <div key={r.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: 3 }}>
                <span>{r.label}</span>
                <span style={{ color: "var(--portal-muted)" }}>{r.count}</span>
              </div>
              <div style={{ height: 6, background: "var(--portal-border)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${(r.count / max) * 100}%`, height: "100%", background: "var(--portal-gold)" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LegalRegisterDashboard({ data }: { data: DashboardData }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <MetricCard label="Total Entries" value={data.totalEntries} />
        <MetricCard label="Applicable" value={data.applicable} />
        <MetricCard label="Needs Review" value={data.needingReview} accent="#f59e0b" />
        <MetricCard label="High Risk" value={data.highRisk} accent={riskColors.high} />
        <MetricCard label="Critical Risk" value={data.criticalRisk} accent={riskColors.critical} />
        <MetricCard label="Open Gaps" value={data.openGaps} />
        <MetricCard label="Programs Researched" value={data.programsResearched} />
        <MetricCard label="States Covered" value={data.statesCovered} />
        <MetricCard label="Sources Used" value={data.sourcesUsed} />
        <MetricCard label="Recently Changed" value={data.recentlyChanged} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>
        <DistributionCard title="Requirements by Program" rows={data.byProgram} />
        <DistributionCard title="Requirements by Jurisdiction" rows={data.byJurisdiction} />
        <DistributionCard title="Requirements by Risk" rows={data.byRisk} />
        <DistributionCard title="Requirements by Status" rows={data.byStatus} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: "1rem", margin: 0 }}>Recent Research Runs</h2>
        <span style={{ fontSize: "0.78rem", color: "var(--portal-muted)" }}>
          {data.lastRunAt ? `Last run ${new Date(data.lastRunAt).toLocaleString()}` : "No runs yet"}
        </span>
      </div>

      <div style={{ border: "1px solid var(--portal-border)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
          <thead>
            <tr style={{ background: "var(--portal-surface)", borderBottom: "1px solid var(--portal-border)" }}>
              {["Date", "Query", "Program", "Jurisdiction", "Findings", "High Risk", "Needs Review", "Status"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, color: "var(--portal-muted)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.recentRuns.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: "28px", textAlign: "center", color: "var(--portal-muted)" }}>
                No research runs yet. <Link href="/employee/legal-register/new-research" style={{ color: "var(--portal-gold)" }}>Start one →</Link>
              </td></tr>
            ) : (
              data.recentRuns.map((run) => (
                <tr key={run.id} style={{ borderBottom: "1px solid var(--portal-border)" }}>
                  <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{new Date(run.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: "10px 12px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.query ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{run.program ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{run.jurisdiction ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{run.total_findings}</td>
                  <td style={{ padding: "10px 12px" }}>{run.high_risk_count > 0 ? <RiskBadge level={"high" as RiskLevel} /> : "—"} {run.high_risk_count || ""}</td>
                  <td style={{ padding: "10px 12px" }}>{run.needs_review_count}</td>
                  <td style={{ padding: "10px 12px" }}><ReviewStatusBadge status={(run.status as ReviewStatus) in reviewStatusLabels ? (run.status as ReviewStatus) : undefined} /> {run.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
