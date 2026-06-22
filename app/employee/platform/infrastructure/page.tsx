import { getDeploymentLog, getCostEntries, getSecurityScans, upsertCostEntry, addSecurityScanResult } from "./actions";
import { summarizeCosts, formatCostCents, getCurrentPeriod, getMonthLabel } from "@/lib/infra/cost-tracking";

const DEPLOY_STATUS_COLORS: Record<string, string> = {
  success: "#42d392",
  in_progress: "#7db8ff",
  failed: "#ff6b6b",
  rolled_back: "#f5a623",
};

const SCAN_STATUS_COLORS: Record<string, string> = {
  pass: "#42d392",
  warn: "#f5a623",
  fail: "#ff6b6b",
};

export default async function InfrastructurePage() {
  const currentPeriod = getCurrentPeriod();
  const [deployments, costEntries, securityScans] = await Promise.all([
    getDeploymentLog(20),
    getCostEntries(currentPeriod),
    getSecurityScans(10),
  ]);

  const costSummary = summarizeCosts(costEntries);

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>Infrastructure &amp; DevOps</h1>
          <p>Deployment pipeline, database health, cost tracking, and security compliance.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--portal-muted)" }}>CI/CD: GitHub Actions</span>
          <span style={{ fontSize: 12, padding: "3px 8px", background: "rgba(66,211,146,.1)", color: "#42d392", borderRadius: 6, border: "1px solid rgba(66,211,146,.3)" }}>Vercel Deployed</span>
        </div>
      </div>

      {/* Cost Tracking */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>
          Cost &amp; Resource Management — {getMonthLabel(currentPeriod)}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div className="platform-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{formatCostCents(costSummary.totalCents)}</div>
            <div style={{ fontSize: 12, color: "var(--portal-muted)", marginTop: 4 }}>Total this month</div>
          </div>
          {Object.entries(costSummary.byCategory).filter(([, v]) => v > 0).map(([cat, cents]) => (
            <div key={cat} className="platform-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCostCents(cents)}</div>
              <div style={{ fontSize: 12, color: "var(--portal-muted)", textTransform: "capitalize", marginTop: 4 }}>{cat}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {costEntries.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 14px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)" }}>
              <strong style={{ width: 100 }}>{e.service}</strong>
              <span style={{ fontSize: 11, color: "var(--portal-muted)", textTransform: "capitalize", width: 80 }}>{e.category}</span>
              <span style={{ fontWeight: 700, minWidth: 80 }}>{formatCostCents(e.amount_cents)}</span>
              <span style={{ fontSize: 12, color: "var(--portal-muted)", flex: 1 }}>{e.notes}</span>
            </div>
          ))}
        </div>

        <details>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--portal-muted)" }}>+ Log / Update Cost</summary>
          <form action={upsertCostEntry} style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input name="period_month" defaultValue={currentPeriod} placeholder="YYYY-MM" required className="platform-input" style={{ width: 100 }} />
            <input name="service" placeholder="Service name" required className="platform-input" style={{ width: 140 }} />
            <select name="category" className="platform-input" style={{ width: 120 }}>
              {["compute", "database", "storage", "ai", "email", "monitoring", "other"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input name="amount_dollars" type="number" step="0.01" placeholder="Amount ($)" required className="platform-input" style={{ width: 110 }} />
            <input name="notes" placeholder="Notes" className="platform-input" style={{ width: 200 }} />
            <button type="submit" className="platform-btn platform-btn-primary">Log Cost</button>
          </form>
        </details>
      </section>

      {/* Security Scans */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Security &amp; Compliance</h2>
        </div>
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {securityScans.length === 0 && <div className="platform-empty">No security scans logged yet. Run <code>npm audit</code> and log results here.</div>}
          {securityScans.map((scan) => (
            <div key={scan.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)" }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: SCAN_STATUS_COLORS[scan.status], minWidth: 40 }}>{scan.status}</span>
              <span style={{ fontSize: 12, textTransform: "uppercase", color: "var(--portal-muted)", minWidth: 130 }}>{scan.scan_type.replace(/_/g, " ")}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{scan.summary ?? "—"}</span>
              {(scan.critical_count ?? 0) > 0 && <span style={{ fontSize: 11, color: "#ff2020", fontWeight: 700 }}>{scan.critical_count} critical</span>}
              {(scan.high_count ?? 0) > 0 && <span style={{ fontSize: 11, color: "#ff6b6b", fontWeight: 700 }}>{scan.high_count} high</span>}
              <span style={{ fontSize: 11, color: "var(--portal-muted)", whiteSpace: "nowrap" }}>{scan.scanned_at ? new Date(scan.scanned_at).toLocaleDateString() : "—"}</span>
            </div>
          ))}
        </div>
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--portal-muted)" }}>+ Log Scan Result</summary>
          <form action={addSecurityScanResult} style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <select name="scan_type" required className="platform-input" style={{ width: 160 }}>
              {["dependency_audit", "sast", "secret_scan", "rls_review", "manual"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
            <select name="status" required className="platform-input" style={{ width: 90 }}>
              {["pass", "warn", "fail"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input name="findings_count" type="number" placeholder="Total findings" className="platform-input" style={{ width: 120 }} defaultValue="0" />
            <input name="critical_count" type="number" placeholder="Critical" className="platform-input" style={{ width: 80 }} defaultValue="0" />
            <input name="high_count" type="number" placeholder="High" className="platform-input" style={{ width: 70 }} defaultValue="0" />
            <input name="summary" placeholder="Summary" className="platform-input" style={{ width: 260 }} />
            <button type="submit" className="platform-btn platform-btn-primary">Log Scan</button>
          </form>
        </details>
      </section>

      {/* Deployment Log */}
      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Deployment Log</h2>
        {deployments.length === 0 && (
          <div className="platform-empty">No deployments logged. Deployments via Vercel are tracked automatically via GitHub Actions.</div>
        )}
        <div style={{ display: "grid", gap: 8 }}>
          {deployments.map((d) => (
            <div key={d.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 14px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: DEPLOY_STATUS_COLORS[d.status], minWidth: 90 }}>{d.status}</span>
              <span style={{ fontSize: 12, textTransform: "uppercase", color: "var(--portal-muted)", minWidth: 80 }}>{d.environment}</span>
              <span style={{ fontSize: 12, textTransform: "uppercase", color: "var(--portal-muted)", minWidth: 70 }}>{d.deploy_method}</span>
              {d.git_sha && <code style={{ fontSize: 11, color: "var(--portal-muted)" }}>{d.git_sha.slice(0, 8)}</code>}
              {d.git_branch && <span style={{ fontSize: 12, color: "var(--portal-muted)", flex: 1 }}>{d.git_branch}</span>}
              {d.error_message && <span style={{ fontSize: 11, color: "#ff6b6b" }}>{d.error_message}</span>}
              <span style={{ fontSize: 11, color: "var(--portal-muted)", whiteSpace: "nowrap" }}>{d.started_at ? new Date(d.started_at).toLocaleString() : "—"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
