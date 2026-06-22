export default function PlatformLoading() {
  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <span className="skeleton skeleton-h1" style={{ width: 220 }} />
          <span className="skeleton skeleton-p" style={{ width: 340, marginTop: 8 }} />
        </div>
        <span className="skeleton skeleton-badge" style={{ width: 80, height: 28 }} />
      </div>

      <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="platform-card"
              style={{ padding: 16, height: 72 }}
            >
              <span className="skeleton skeleton-row" style={{ width: "60%", marginBottom: 8 }} />
              <span className="skeleton skeleton-row" style={{ width: "40%" }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 44,
              borderRadius: 10,
              background: "rgba(255,255,255,.03)",
              border: "1px solid rgba(255,255,255,.06)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
