import { getTestPlans, createTestPlan, addTestResult, updateTestResult, updateTestPlanStatus } from "./actions";

const RESULT_COLORS: Record<string, string> = {
  pass: "#42d392",
  fail: "#ff6b6b",
  blocked: "#f5a623",
  pending: "#bfb7a3",
  skipped: "#7db8ff",
};

export default async function QAPage() {
  const plans = await getTestPlans();

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>QA &amp; Testing Framework</h1>
          <p>Coordinate test planning, execution, defect tracking, and acceptance sign-off.</p>
        </div>
        <form action={createTestPlan}>
          <div style={{ display: "flex", gap: 8 }}>
            <input name="title" placeholder="Test plan title" required className="platform-input" style={{ width: 240 }} />
            <button type="submit" className="platform-btn platform-btn-primary">+ New Plan</button>
          </div>
        </form>
      </div>

      {plans.length === 0 && <div className="platform-empty">No test plans yet.</div>}

      {plans.map((plan) => {
        const results = (plan.platform_test_results ?? []) as Array<{ id: string; scenario: string; acceptance_criteria: string | null; result: string }>;
        const total = results.length;
        const passed = results.filter((r) => r.result === "pass").length;
        const failed = results.filter((r) => r.result === "fail").length;

        return (
          <section key={plan.id} className="platform-card">
            <div className="platform-card-header">
              <div>
                <strong>{plan.title}</strong>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: "#42d392" }}>{passed} passed</span>
                  <span style={{ fontSize: 12, color: "#ff6b6b" }}>{failed} failed</span>
                  <span style={{ fontSize: 12, color: "var(--portal-muted)" }}>{total - passed - failed} pending</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`platform-status platform-status-${plan.status}`}>{plan.status}</span>
                {plan.status === "draft" && (
                  <form action={updateTestPlanStatus.bind(null, plan.id, "active")}>
                    <button type="submit" className="platform-btn platform-btn-sm">Activate</button>
                  </form>
                )}
                {plan.status === "active" && (
                  <form action={updateTestPlanStatus.bind(null, plan.id, "completed")}>
                    <button type="submit" className="platform-btn platform-btn-sm">Complete</button>
                  </form>
                )}
              </div>
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {results.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)" }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{r.scenario}</span>
                  {r.acceptance_criteria && <span style={{ fontSize: 11, color: "var(--portal-muted)", maxWidth: 200 }}>{r.acceptance_criteria}</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: RESULT_COLORS[r.result], minWidth: 60 }}>{r.result}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {["pass", "fail", "blocked", "skipped"].filter((s) => s !== r.result).map((s) => (
                      <form key={s} action={updateTestResult.bind(null, r.id, s)}>
                        <button type="submit" className="platform-btn platform-btn-xs" style={{ color: RESULT_COLORS[s] }}>{s}</button>
                      </form>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <form action={addTestResult} style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <input type="hidden" name="test_plan_id" value={plan.id} />
              <input name="scenario" placeholder="Test scenario description" required className="platform-input" style={{ width: 280 }} />
              <input name="acceptance_criteria" placeholder="Acceptance criteria" className="platform-input" style={{ width: 220 }} />
              <button type="submit" className="platform-btn platform-btn-sm">+ Add Scenario</button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
