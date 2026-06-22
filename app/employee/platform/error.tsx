"use client";

import { useEffect } from "react";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Platform]", error);
  }, [error]);

  return (
    <div
      style={{
        padding: "40px 24px",
        textAlign: "center",
        maxWidth: 480,
        margin: "60px auto",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
      <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
        Platform error
      </h2>
      <p style={{ fontSize: 13, color: "var(--portal-muted)", marginBottom: 20, lineHeight: 1.6 }}>
        {error.message || "Something went wrong loading this platform page."}
      </p>
      <button
        onClick={reset}
        style={{
          padding: "8px 20px",
          borderRadius: 8,
          background: "rgba(212,175,55,.12)",
          border: "1px solid rgba(212,175,55,.3)",
          color: "var(--portal-gold, #d4af37)",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
      {error.digest && (
        <p style={{ marginTop: 16, fontSize: 10, color: "var(--portal-muted)", opacity: 0.5 }}>
          digest: {error.digest}
        </p>
      )}
    </div>
  );
}
