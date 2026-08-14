/**
 * Skeleton for a lifecycle record: header, rail, KPI tiles and the panel grid,
 * in the same containers the real screen uses.
 */
export default function LifecycleRecordLoading() {
  return (
    <div className="lc-shell">
      <div className="lc-head">
        <div>
          <span className="skeleton skeleton-row" style={{ width: 190, height: 11 }} />
          <span className="skeleton skeleton-h1" style={{ width: 260, height: 24 }} />
          <span className="skeleton skeleton-p" style={{ width: 420, height: 12 }} />
        </div>
        <span className="skeleton skeleton-badge" style={{ width: 320 }} />
      </div>

      <div className="lc-rail-wrap">
        <span className="skeleton skeleton-block" style={{ height: 58 }} />
      </div>

      <div className="lc-kpis">
        {[0, 1, 2, 3].map((key) => (
          <div className="lc-kpi" key={key}>
            <span className="skeleton" style={{ width: 42, height: 42, borderRadius: 10 }} />
            <div style={{ flex: 1 }}>
              <span className="skeleton skeleton-row" style={{ width: "70%", height: 10 }} />
              <span className="skeleton skeleton-row" style={{ width: "45%", height: 18, marginBottom: 0 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="lc-grid">
        <span className="skeleton skeleton-block" style={{ height: 210 }} />
        <span className="skeleton skeleton-block" style={{ height: 210 }} />
        <span className="skeleton skeleton-block" style={{ height: 210 }} />
      </div>
    </div>
  );
}
