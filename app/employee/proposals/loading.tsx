export default function ProposalsLoading() {
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

      <div className="document-grid">
        <section className="portal-card" style={{ padding: 20 }}>
          <span className="skeleton skeleton-row" style={{ width: "45%", marginBottom: 14 }} />
          <span className="skeleton skeleton-block" style={{ height: 220 }} />
        </section>

        <section className="portal-card" style={{ padding: 20 }}>
          <span className="skeleton skeleton-row" style={{ width: "35%", marginBottom: 14 }} />
          {Array.from({ length: 6 }).map((_, i) => (
            <span className="skeleton skeleton-row" key={i} style={{ width: `${58 + (i % 4) * 11}%` }} />
          ))}
        </section>
      </div>
    </>
  );
}
