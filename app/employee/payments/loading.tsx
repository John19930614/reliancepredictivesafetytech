export default function PaymentsLoading() {
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

      <div className="kpi-strip" style={{ marginBottom: 16 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <section className="kpi-card" key={index}>
            <span className="skeleton skeleton-row" style={{ width: "40%" }} />
            <span className="skeleton skeleton-row" style={{ width: "70%" }} />
            <span className="skeleton skeleton-row" style={{ width: "55%" }} />
          </section>
        ))}
      </div>

      <section className="portal-card" style={{ padding: 20 }}>
        <span className="skeleton skeleton-row" style={{ width: "30%", marginBottom: 14 }} />
        <span className="skeleton skeleton-block" style={{ height: 260 }} />
      </section>
    </>
  );
}
