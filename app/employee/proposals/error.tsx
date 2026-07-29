"use client";

export default function ProposalsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <h2 style={{ marginBottom: 12 }}>Failed to load Proposals</h2>
      <p style={{ color: "var(--portal-muted)", marginBottom: 20 }}>{error.message}</p>
      <button onClick={reset} style={{ padding: "8px 20px", borderRadius: 6, cursor: "pointer" }}>
        Try again
      </button>
    </div>
  );
}
