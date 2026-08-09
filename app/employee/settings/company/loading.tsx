export default function CompanyProfileLoading() {
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
        <span className="skeleton skeleton-row" style={{ width: "30%", marginBottom: 14 }} />
        <span className="skeleton skeleton-block" style={{ height: 320 }} />
      </section>
    </>
  );
}
