/**
 * Skeleton for the Talent Engine console: the header strip, the six KPI tiles
 * and the three columns, laid out in the same grid the real page uses so the
 * content does not jump when it arrives.
 */
export default function TalentEngineLoading() {
  return (
    <div className="talent-console">
      <div className="talent-header">
        <div className="talent-header-id">
          <span className="skeleton" style={{ width: 46, height: 46, borderRadius: 11 }} />
          <div>
            <span className="skeleton skeleton-h1" style={{ width: 220, height: 20 }} />
            <span className="skeleton skeleton-p" style={{ width: 300, height: 11 }} />
          </div>
        </div>
        <span className="skeleton skeleton-badge" style={{ width: 250 }} />
      </div>

      <div className="talent-kpis">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="talent-kpi" key={index}>
            <span className="skeleton skeleton-row" style={{ width: "70%", height: 10 }} />
            <span className="skeleton skeleton-row" style={{ width: "45%", height: 24, marginTop: 6 }} />
            <span className="skeleton skeleton-row" style={{ width: "60%", height: 10 }} />
          </div>
        ))}
      </div>

      <div className="talent-grid">
        <div className="talent-col">
          <SkeletonCard bodyHeight={190} />
          <SkeletonCard bodyHeight={190} />
        </div>
        <div className="talent-col">
          <SkeletonCard bodyHeight={430} />
          <SkeletonCard bodyHeight={190} />
        </div>
        <div className="talent-col">
          <SkeletonCard bodyHeight={140} />
          <SkeletonCard bodyHeight={190} />
          <SkeletonCard bodyHeight={150} />
        </div>
      </div>
    </div>
  );
}

function SkeletonCard({ bodyHeight }: { bodyHeight: number }) {
  return (
    <div className="talent-card">
      <div className="talent-card-head">
        <span className="skeleton skeleton-row" style={{ width: 170, height: 12, marginBottom: 0 }} />
        <span className="skeleton skeleton-row" style={{ width: 62, height: 16, marginBottom: 0, borderRadius: 999 }} />
      </div>
      <div className="talent-card-body">
        <span className="skeleton skeleton-block" style={{ height: bodyHeight }} />
      </div>
    </div>
  );
}
