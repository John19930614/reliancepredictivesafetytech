/**
 * Skeleton for the lifecycle index: the header, the KPI strip and the step
 * groups, in the same containers the real page uses so nothing jumps.
 */
export default function LifecycleIndexLoading() {
  return (
    <>
      <div className="portal-topline">
        <div>
          <span className="skeleton skeleton-row" style={{ width: 130, height: 11 }} />
          <span className="skeleton skeleton-h1" style={{ width: 320, height: 26 }} />
          <span className="skeleton skeleton-p" style={{ width: 380, height: 12 }} />
        </div>
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

      <div className="lc-index">
        <div className="lc-index-main">
          <span className="skeleton skeleton-block" style={{ height: 220 }} />
          <span className="skeleton skeleton-block" style={{ height: 180 }} />
        </div>
        <div className="lc-index-side">
          <span className="skeleton skeleton-block" style={{ height: 320 }} />
        </div>
      </div>
    </>
  );
}
