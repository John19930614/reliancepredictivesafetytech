/**
 * Skeleton for the sourcing review queue: the header strip, the intro band, the
 * sweeps card and the two lead columns, laid out in the same containers the real
 * page uses so nothing jumps when the leads arrive.
 */
export default function SourcingLeadsLoading() {
  return (
    <div className="talent-console">
      <div className="talent-header">
        <div className="talent-header-id">
          <span className="skeleton" style={{ width: 46, height: 46, borderRadius: 11 }} />
          <div>
            <span className="skeleton skeleton-h1" style={{ width: 190, height: 20 }} />
            <span className="skeleton skeleton-p" style={{ width: 260, height: 11 }} />
          </div>
        </div>
        <span className="skeleton skeleton-badge" style={{ width: 190 }} />
      </div>

      <div className="talent-lead-intro">
        <span className="skeleton skeleton-row" style={{ width: "88%", height: 12 }} />
        <span className="skeleton skeleton-row" style={{ width: "64%", height: 12 }} />
      </div>

      <SkeletonCard bodyHeight={120} headWidth={150} />

      <div className="talent-lead-columns">
        <SkeletonCard bodyHeight={340} headWidth={170} />
        <SkeletonCard bodyHeight={340} headWidth={170} />
      </div>
    </div>
  );
}

function SkeletonCard({ bodyHeight, headWidth }: { bodyHeight: number; headWidth: number }) {
  return (
    <div className="talent-card">
      <div className="talent-card-head">
        <span className="skeleton skeleton-row" style={{ width: headWidth, height: 12, marginBottom: 0 }} />
        <span className="skeleton skeleton-row" style={{ width: 92, height: 16, marginBottom: 0, borderRadius: 999 }} />
      </div>
      <div className="talent-card-body">
        <span className="skeleton skeleton-block" style={{ height: bodyHeight }} />
      </div>
    </div>
  );
}
