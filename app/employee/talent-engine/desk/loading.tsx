/**
 * Skeleton for the Placement Desk: the header strip, the intro band and the two
 * working columns, laid out in the same containers the real page uses so nothing
 * jumps when the matches and placements arrive.
 *
 * The money-floor card is deliberately absent here — it renders for admins only,
 * and a skeleton that promised it to everyone would flash a panel most viewers
 * never get.
 */
export default function PlacementDeskLoading() {
  return (
    <div className="talent-console">
      <div className="talent-header">
        <div className="talent-header-id">
          <span className="skeleton" style={{ width: 46, height: 46, borderRadius: 11 }} />
          <div>
            <span className="skeleton skeleton-h1" style={{ width: 200, height: 20 }} />
            <span className="skeleton skeleton-p" style={{ width: 270, height: 11 }} />
          </div>
        </div>
        <span className="skeleton skeleton-badge" style={{ width: 190 }} />
      </div>

      <div className="talent-desk-intro">
        <span className="skeleton skeleton-row" style={{ width: "92%", height: 12 }} />
        <span className="skeleton skeleton-row" style={{ width: "70%", height: 12 }} />
      </div>

      <div className="talent-desk-columns">
        <SkeletonCard bodyHeight={360} headWidth={160} />
        <SkeletonCard bodyHeight={360} headWidth={170} />
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
