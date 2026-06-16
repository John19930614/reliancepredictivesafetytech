export default function AICommandLoading() {
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

      <div style={{ display: "grid", gap: 16 }}>
        <section className="portal-card" style={{ padding: 20 }}>
          <span className="skeleton skeleton-row" style={{ width: "25%", marginBottom: 14 }} />
          {Array.from({ length: 3 }).map((_, i) => (
            <span className="skeleton skeleton-row" key={i} style={{ width: `${65 + i * 8}%` }} />
          ))}
        </section>

        <section className="portal-card" style={{ padding: 20 }}>
          <span className="skeleton skeleton-row" style={{ width: "35%", marginBottom: 14 }} />
          <span className="skeleton skeleton-block" />
        </section>
      </div>
    </>
  );
}
