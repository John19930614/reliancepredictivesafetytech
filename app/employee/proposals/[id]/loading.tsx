export default function ProposalDetailLoading() {
  return (
    <>
      <div className="portal-topline">
        <div>
          <span className="skeleton skeleton-badge" style={{ width: 150, height: 32, marginBottom: 10 }} />
          <span className="skeleton skeleton-eyebrow" />
          <span className="skeleton skeleton-h1" />
          <span className="skeleton skeleton-p" />
        </div>
      </div>

      <div className="document-grid">
        <section>
          <div className="portal-card" style={{ padding: 20 }}>
            <span className="skeleton skeleton-row" style={{ width: "55%", marginBottom: 14 }} />
            <span className="skeleton skeleton-row" style={{ width: "80%" }} />
            <span className="skeleton skeleton-block" style={{ height: 60, marginTop: 12 }} />
          </div>

          <span className="skeleton skeleton-block" style={{ display: "block", height: 480, marginTop: 16 }} />

          <div className="portal-card" style={{ padding: 20, marginTop: 20 }}>
            <span className="skeleton skeleton-row" style={{ width: "35%", marginBottom: 14 }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <span className="skeleton skeleton-row" key={i} style={{ width: `${60 + (i % 3) * 12}%` }} />
            ))}
          </div>
        </section>

        <aside>
          {Array.from({ length: 2 }).map((_, i) => (
            <div className="portal-card" key={i} style={{ padding: 20, marginTop: i === 0 ? 0 : 20 }}>
              <span className="skeleton skeleton-row" style={{ width: "40%", marginBottom: 14 }} />
              <span className="skeleton skeleton-block" style={{ height: 140 }} />
            </div>
          ))}
        </aside>
      </div>
    </>
  );
}
