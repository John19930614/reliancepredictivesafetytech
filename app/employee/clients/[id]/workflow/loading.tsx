/**
 * Skeleton for the client workflow: the header, the stage rail, the current
 * step card and the side column, laid out in the same containers the real page
 * uses so nothing jumps when the client arrives.
 */
export default function ClientWorkflowLoading() {
  return (
    <>
      <div className="portal-topline">
        <div>
          <span className="skeleton skeleton-row" style={{ width: 130, height: 11 }} />
          <span className="skeleton skeleton-h1" style={{ width: 260, height: 26 }} />
          <span className="skeleton skeleton-p" style={{ width: 320, height: 12 }} />
        </div>
        <span className="skeleton skeleton-badge" style={{ width: 210 }} />
      </div>

      <div className="wf-rail-wrap">
        <span className="skeleton skeleton-block" style={{ height: 64 }} />
      </div>

      <div className="wf-layout">
        <div className="wf-step-card">
          <span className="skeleton skeleton-row" style={{ width: 150, height: 11 }} />
          <span className="skeleton skeleton-h1" style={{ width: 300, height: 22 }} />
          <span className="skeleton skeleton-row" style={{ width: "90%", height: 12 }} />
          <span className="skeleton skeleton-row" style={{ width: "72%", height: 12 }} />
          <span className="skeleton skeleton-block" style={{ height: 92, marginTop: 14 }} />
        </div>

        <div className="wf-side">
          <div className="wf-panel">
            <span className="skeleton skeleton-row" style={{ width: 110, height: 13 }} />
            <span className="skeleton skeleton-block" style={{ height: 150 }} />
          </div>
          <div className="wf-panel">
            <span className="skeleton skeleton-row" style={{ width: 130, height: 13 }} />
            <span className="skeleton skeleton-block" style={{ height: 120 }} />
          </div>
        </div>
      </div>
    </>
  );
}
