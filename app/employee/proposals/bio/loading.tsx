export default function ProposalBioLoading() {
  return (
    <>
      <div className="portal-topline">
        <div>
          <span className="skeleton skeleton-eyebrow" />
          <span className="skeleton skeleton-h1" />
          <span className="skeleton skeleton-p" />
        </div>
      </div>

      <section className="portal-card" style={{ padding: 20 }}>
        <span className="skeleton skeleton-row" style={{ width: "35%", marginBottom: 14 }} />
        <span className="skeleton skeleton-block" style={{ height: 240 }} />
      </section>

      <section className="portal-card" style={{ padding: 20, marginTop: 20 }}>
        <span className="skeleton skeleton-row" style={{ width: "28%", marginBottom: 14 }} />
        <span className="skeleton skeleton-block" style={{ height: 120 }} />
      </section>
    </>
  );
}
