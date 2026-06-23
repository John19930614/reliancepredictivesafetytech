import { LegalRegisterDashboard, type DashboardData } from "@/components/legal-register/LegalRegisterDashboard";
import { getLegalAccess } from "@/lib/legal/access";
import { jurisdictionLabels, reviewStatusLabels, riskLabels } from "@/lib/legal/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function tally(rows: Row[], key: string, labels?: Record<string, string>): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = r[key];
    if (!v) continue;
    counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([k, count]) => ({ label: labels?.[k] ?? k, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export default async function DashboardPage() {
  const { supabase } = await getLegalAccess();

  const empty: DashboardData = {
    totalEntries: 0, applicable: 0, needingReview: 0, highRisk: 0, criticalRisk: 0, openGaps: 0,
    programsResearched: 0, statesCovered: 0, sourcesUsed: 0, lastRunAt: null, recentlyChanged: 0,
    byProgram: [], byJurisdiction: [], byRisk: [], byStatus: [], recentRuns: [],
  };

  if (!supabase) {
    return <DashboardShell data={empty} />;
  }

  const [itemsRes, runsRes, gapsRes, sourcesRes, changesRes] = await Promise.all([
    supabase.from("legal_register_items").select("*").eq("archived", false),
    supabase.from("research_runs").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("gap_analysis_results").select("status"),
    supabase.from("legal_register_sources").select("id").eq("enabled", true),
    supabase.from("legal_register_change_log").select("id").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()),
  ]);

  const items: Row[] = itemsRes.data ?? [];
  const runs: Row[] = runsRes.data ?? [];
  const gaps: Row[] = gapsRes.data ?? [];
  const openGapStatuses = new Set(["missing", "changed", "outdated", "needs_review"]);

  const data: DashboardData = {
    totalEntries: items.length,
    applicable: items.filter((i) => i.applies_to_us !== false && i.applicability_status !== "does_not_apply").length,
    needingReview: items.filter((i) => i.review_status === "needs_review").length,
    highRisk: items.filter((i) => i.risk_level === "high").length,
    criticalRisk: items.filter((i) => i.risk_level === "critical").length,
    openGaps: gaps.filter((g) => openGapStatuses.has(g.status)).length,
    programsResearched: new Set(runs.map((r) => r.program).filter(Boolean)).size,
    statesCovered: new Set(items.map((i) => i.jurisdiction_state).filter(Boolean)).size,
    sourcesUsed: sourcesRes.data?.length ?? 0,
    lastRunAt: runs[0]?.created_at ?? null,
    recentlyChanged: changesRes.data?.length ?? 0,
    byProgram: tally(items, "program"),
    byJurisdiction: tally(items, "jurisdiction", jurisdictionLabels),
    byRisk: tally(items, "risk_level", riskLabels),
    byStatus: tally(items, "review_status", reviewStatusLabels),
    recentRuns: runs.slice(0, 10).map((r) => ({
      id: r.id, created_at: r.created_at, query: r.query, program: r.program, jurisdiction: r.jurisdiction,
      total_findings: r.total_findings ?? 0, high_risk_count: r.high_risk_count ?? 0,
      needs_review_count: r.needs_review_count ?? 0, status: r.status,
    })),
  };

  return <DashboardShell data={data} />;
}

function DashboardShell({ data }: { data: DashboardData }) {
  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Legal Register</div>
          <h1>Intelligence Center</h1>
          <p>A high-level view of your compliance legal register, research activity, gaps, and review status.</p>
        </div>
      </div>
      <LegalRegisterDashboard data={data} />
    </>
  );
}
