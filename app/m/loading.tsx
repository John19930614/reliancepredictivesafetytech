export default function MobileLoading() {
  return (
    <div className="m-skeleton-wrap" role="status" aria-live="polite">
      <span className="m-visually-hidden">Loading</span>
      <div className="m-skeleton m-skeleton-title" />
      <div className="m-skeleton m-skeleton-line" />
      <div className="m-skeleton-grid">
        <div className="m-skeleton m-skeleton-card" />
        <div className="m-skeleton m-skeleton-card" />
      </div>
      <div className="m-skeleton m-skeleton-row" />
      <div className="m-skeleton m-skeleton-row" />
      <div className="m-skeleton m-skeleton-row" />
    </div>
  );
}
