export default function EmployeePageLoading() {
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
            <span className="skeleton skeleton-row" style={{ width: "55%" }} />
            <span className="skeleton skeleton-row" style={{ width: "80%" }} />
            <span className="skeleton skeleton-row" style={{ width: "40%" }} />
            <span className="skeleton skeleton-block" style={{ marginTop: 12 }} />
          </section>
        ))}
      </div>

      <section className="portal-card" style={{ padding: 20 }}>
        <span className="skeleton skeleton-row" style={{ width: "30%", marginBottom: 16 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <span className="skeleton skeleton-row" key={i} style={{ width: `${70 + (i % 3) * 10}%` }} />
        ))}
      </section>
    </>
  );
}
