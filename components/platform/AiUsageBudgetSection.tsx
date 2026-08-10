import { updateAiBudgets, type AiUsageSummary } from "@/app/employee/platform/ai-services/actions";

const ENFORCEMENT_COLORS: Record<string, string> = {
  log_only: "#7db8ff",
  enforce: "#f5a623",
  kill_switch: "#ff6b6b",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function barColor(fraction: number): string {
  if (fraction >= 1) return "#ff6b6b";
  if (fraction >= 0.8) return "#f5a623";
  return "#42d392";
}

export default function AiUsageBudgetSection({ usage }: { usage: AiUsageSummary }) {
  const hasUsage = usage.features.some((f) => f.todayCalls > 0 || f.fourteenDayCostCents > 0);

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Usage &amp; Budget</h2>
        {usage.settings && (
          <span style={{ fontSize: 12, color: "var(--portal-muted)" }}>
            Today {formatCents(usage.todayTotalCents)} of {formatCents(usage.settings.dailyCapCents)} ·{" "}
            <span style={{ fontWeight: 700, textTransform: "uppercase", color: ENFORCEMENT_COLORS[usage.settings.enforcement] ?? "var(--portal-muted)" }}>
              {usage.settings.enforcement}
            </span>
          </span>
        )}
      </div>

      {!usage.available ? (
        <div className="platform-empty">No usage recorded yet.</div>
      ) : (
        <>
          {!hasUsage && <div className="platform-empty">No usage recorded yet.</div>}
          {hasUsage && (
            <div style={{ display: "grid", gap: 8 }}>
              {usage.features.map((f) => (
                <div key={f.featureKey} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)" }}>
                  <code style={{ fontSize: 11, color: "var(--portal-muted)", minWidth: 140 }}>{f.featureKey}</code>
                  {!f.enabled && <span style={{ fontSize: 11, color: "#ff6b6b" }}>disabled</span>}
                  {f.modelOverride && <span style={{ fontSize: 11, color: "#c8a2ff" }}>→ {f.modelOverride}</span>}
                  <span style={{ fontSize: 12 }}>{f.todayCalls} calls today</span>
                  <span style={{ fontSize: 11, color: "var(--portal-muted)" }}>{f.todayInputTokens.toLocaleString()} in / {f.todayOutputTokens.toLocaleString()} out</span>
                  <span style={{ fontSize: 11, color: "var(--portal-muted)", marginLeft: "auto", whiteSpace: "nowrap" }}>14d {formatCents(f.fourteenDayCostCents)}</span>
                  <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {formatCents(f.todayCostCents)}
                    {f.capCents !== null && <span style={{ color: "var(--portal-muted)" }}> / {formatCents(f.capCents)}</span>}
                  </span>
                  {f.capCents !== null && f.capCents > 0 && (
                    <span style={{ width: 90, height: 6, borderRadius: 3, background: "rgba(255,255,255,.08)", overflow: "hidden", flexShrink: 0 }}>
                      <span style={{ display: "block", height: "100%", borderRadius: 3, width: `${Math.min(100, (f.todayCostCents / f.capCents) * 100)}%`, background: barColor(f.todayCostCents / f.capCents) }} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {hasUsage && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--portal-muted)" }}>
              Last 14 days: <strong>{formatCents(usage.fourteenDayTotalCents)}</strong> across all features.
            </div>
          )}

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--portal-muted)" }}>Edit caps &amp; enforcement</summary>
            {/* Inline wrapper: updateAiBudgets returns a result for its tests,
                which React 19's <form action> typing does not accept directly. */}
            <form
              action={async (formData: FormData) => {
                "use server";
                await updateAiBudgets(formData);
              }}
              style={{ marginTop: 10, display: "grid", gap: 8 }}
            >
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ fontSize: 12, color: "var(--portal-muted)" }}>
                  Platform cap (¢/day){" "}
                  <input name="platform_daily_cap_cents" type="number" min="0" step="1" required defaultValue={usage.settings?.dailyCapCents ?? 500} className="platform-input" style={{ width: 90 }} />
                </label>
                <label style={{ fontSize: 12, color: "var(--portal-muted)" }}>
                  Enforcement{" "}
                  <select name="enforcement" defaultValue={usage.settings?.enforcement ?? "log_only"} className="platform-input" style={{ width: 130 }}>
                    {["log_only", "enforce", "kill_switch"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                  </select>
                </label>
              </div>
              {usage.features.map((f) => (
                <div key={f.featureKey} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <code style={{ fontSize: 11, color: "var(--portal-muted)", minWidth: 140 }}>{f.featureKey}</code>
                  <input name={`cap_${f.featureKey}`} type="number" min="0" step="1" required defaultValue={f.capCents ?? 100} className="platform-input" style={{ width: 80 }} aria-label={`${f.featureKey} cap (¢/day)`} />
                  <input name={`model_${f.featureKey}`} placeholder="model override" defaultValue={f.modelOverride ?? ""} maxLength={80} className="platform-input" style={{ width: 160 }} />
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, color: "var(--portal-muted)" }}>
                    <input name={`enabled_${f.featureKey}`} type="checkbox" defaultChecked={f.enabled} /> enabled
                  </label>
                </div>
              ))}
              <button type="submit" className="platform-btn platform-btn-primary" style={{ width: "fit-content" }}>Save Budgets</button>
            </form>
          </details>
        </>
      )}
    </section>
  );
}
