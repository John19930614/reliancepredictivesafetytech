export default function PayrollLoading() {
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

      <div className="portal-grid" style={{ marginBottom: 16 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <section className="portal-card" key={i} style={{ padding: 20 }}>
            <span className="skeleton skeleton-row" style={{ width: "50%" }} />
            <span className="skeleton skeleton-row" style={{ width: "75%" }} />
            <span className="skeleton skeleton-block" style={{ marginTop: 12, height: 80 }} />
          </section>
        ))}
      </div>

      <section className="portal-card" style={{ padding: 20 }}>
        <span className="skeleton skeleton-row" style={{ width: "35%", marginBottom: 14 }} />
        <span className="skeleton skeleton-block" style={{ height: 200 }} />
      </section>
    </>
  );
}
