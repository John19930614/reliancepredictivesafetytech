export default function TimeCardsLoading() {
  return (
    <>
      <div className="portal-topline">
        <div>
          <span className="skeleton skeleton-eyebrow" />
          <span className="skeleton skeleton-h1" />
          <span className="skeleton skeleton-p" />
        </div>
        <span className="skeleton skeleton-badge" />
      </div>

      <section className="portal-card" style={{ padding: 20, marginBottom: 16 }}>
        <span className="skeleton skeleton-row" style={{ width: "30%", marginBottom: 14 }} />
        <span className="skeleton skeleton-block" style={{ height: 160 }} />
      </section>

      <section className="portal-card" style={{ padding: 20 }}>
        <span className="skeleton skeleton-row" style={{ width: "40%", marginBottom: 14 }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <span className="skeleton skeleton-row" key={i} style={{ width: `${60 + (i % 3) * 12}%` }} />
        ))}
      </section>
    </>
  );
}
