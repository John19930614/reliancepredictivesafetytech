import { getVerticalPackages, createVerticalPackage, updatePackageStatus } from "./actions";

const STATUS_COLORS: Record<string, string> = {
  development: "#7db8ff",
  pilot: "#f5a623",
  production: "#42d392",
  deprecated: "#ff6b6b",
};

export default async function PackagesPage() {
  const packages = await getVerticalPackages();

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>Vertical Package Management</h1>
          <p>Manage vertical packages (SafePredict, domain modules), versions, deployments, and pilot flags.</p>
        </div>
        <form action={createVerticalPackage}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input name="name" placeholder="Package name" required className="platform-input" style={{ width: 160 }} />
            <input name="vertical_key" placeholder="vertical_key" required className="platform-input" style={{ width: 140 }} />
            <input name="current_version" placeholder="0.1.0" className="platform-input" style={{ width: 90 }} />
            <button type="submit" className="platform-btn platform-btn-primary">+ Register</button>
          </div>
        </form>
      </div>

      {packages.length === 0 && <div className="platform-empty">No vertical packages registered.</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
        {packages.map((pkg) => (
          <div key={pkg.id} className="platform-card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong style={{ fontSize: 16 }}>{pkg.name}</strong>
                <code style={{ fontSize: 12, display: "block", color: "var(--portal-muted)", marginTop: 2 }}>{pkg.vertical_key}</code>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <code style={{ fontSize: 13 }}>{pkg.current_version}</code>
                <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLORS[pkg.status], textTransform: "uppercase" }}>{pkg.status}</span>
              </div>
            </div>
            {pkg.description && <p style={{ fontSize: 13, color: "var(--portal-muted)", margin: "8px 0 0" }}>{pkg.description}</p>}
            {pkg.changelog && <p style={{ fontSize: 12, color: "var(--portal-muted)", margin: "6px 0 0" }}>{pkg.changelog}</p>}
            <div style={{ fontSize: 12, color: "var(--portal-muted)", margin: "8px 0 0" }}>
              {pkg.scenario_test_count ?? 0} test scenarios
              {(pkg.scenario_test_count ?? 0) < 20 && <span style={{ color: "#f5a623", marginLeft: 6 }}>(minimum 20 required)</span>}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {["development", "pilot", "production", "deprecated"].filter((s) => s !== pkg.status).map((s) => (
                <form key={s} action={updatePackageStatus.bind(null, pkg.id, s)}>
                  <button type="submit" className="platform-btn platform-btn-xs" style={{ color: STATUS_COLORS[s] }}>
                    → {s}
                  </button>
                </form>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
