import { requireClient } from "@/lib/supabase/server";

async function getPlatformMetrics() {
  const supabase = await requireClient();

  const [sprints, releases, testPlans, packages] = await Promise.all([
    supabase.from("platform_sprints").select("status, velocity_points, capacity_points"),
    supabase.from("platform_releases").select("status, environment, deployed_at"),
    supabase.from("platform_test_plans").select("status, total_scenarios, passed_scenarios, failed_scenarios"),
    supabase.from("platform_vertical_packages").select("status, scenario_test_count"),
  ]);

  const allSprints = sprints.data ?? [];
  const allReleases = releases.data ?? [];
  const allPlans = testPlans.data ?? [];
  const allPackages = packages.data ?? [];

  const completedSprints = allSprints.filter((s) => s.status === "completed");
  const avgVelocity = completedSprints.length
    ? Math.round(completedSprints.reduce((sum, s) => sum + (s.velocity_points ?? 0), 0) / completedSprints.length)
    : 0;

  const deployedReleases = allReleases.filter((r) => r.status === "deployed");
  const rolledBack = allReleases.filter((r) => r.status === "rolled_back").length;
  const deploySuccessRate = deployedReleases.length + rolledBack > 0
    ? Math.round((deployedReleases.length / (deployedReleases.length + rolledBack)) * 100)
    : 100;

  const completedPlans = allPlans.filter((p) => p.status === "completed");
  const totalPassed = completedPlans.reduce((s, p) => s + (p.passed_scenarios ?? 0), 0);
  const totalScenarios = completedPlans.reduce((s, p) => s + (p.total_scenarios ?? 0), 0);
  const testPassRate = totalScenarios > 0 ? Math.round((totalPassed / totalScenarios) * 100) : 0;

  return {
    totalSprints: allSprints.length,
    activeSprints: allSprints.filter((s) => s.status === "active").length,
    avgVelocity,
    totalReleases: allReleases.length,
    deployedToProduction: allReleases.filter((r) => r.environment === "production" && r.status === "deployed").length,
    deploySuccessRate,
    rolledBack,
    testPlans: allPlans.length,
    testPassRate,
    verticalPackages: allPackages.length,
    prodPackages: allPackages.filter((p) => p.status === "production").length,
  };
}

export default async function MetricsPage() {
  const m = await getPlatformMetrics();

  const stats = [
    { label: "Total Sprints", value: m.totalSprints, sub: `${m.activeSprints} active` },
    { label: "Avg Velocity", value: `${m.avgVelocity} pts`, sub: "per completed sprint" },
    { label: "Deploy Success Rate", value: `${m.deploySuccessRate}%`, sub: `${m.rolledBack} rolled back` },
    { label: "Total Releases", value: m.totalReleases, sub: `${m.deployedToProduction} in production` },
    { label: "Test Pass Rate", value: `${m.testPassRate}%`, sub: `${m.testPlans} plans total` },
    { label: "Vertical Packages", value: m.verticalPackages, sub: `${m.prodPackages} in production` },
  ];

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>Platform Metrics &amp; Health</h1>
          <p>Monitor platform performance, deployment frequency, error rates, and team productivity.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {stats.map((s) => (
          <div key={s.label} className="platform-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>{s.value}</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>{s.label}</div>
            <div style={{ fontSize: 12, color: "var(--portal-muted)", marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="platform-card" style={{ marginTop: 14, padding: 20 }}>
        <h3 style={{ margin: "0 0 12px" }}>Build Value Chain Status</h3>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {["Sprint Planning", "Feature Dev", "Unit Testing", "Code Review", "Integration Testing", "Staging Deploy", "Pilot Release", "QA Sign-off", "Production Deploy", "Monitoring", "Feedback Loop"].map((step, i, arr) => (
            <span key={step} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ padding: "6px 12px", borderRadius: 10, background: "rgba(212,175,55,.08)", border: "1px solid rgba(212,175,55,.2)", fontSize: 12, fontWeight: 700 }}>{step}</span>
              {i < arr.length - 1 && <span style={{ color: "var(--portal-gold, #d4af37)" }}>→</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
