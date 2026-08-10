"use client";

/**
 * Segment-level boundary: catches errors from any /employee page that lacks its
 * own error.tsx, so the sidebar shell stays up instead of falling back to the
 * bare root boundary. The digest — not the raw message, which can carry ids or
 * constraint strings — is what support needs to find the server log entry.
 */
export default function EmployeeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <h2 style={{ marginBottom: 12 }}>Something went wrong loading this page</h2>
      <p style={{ color: "var(--portal-muted)", marginBottom: 20 }}>
        Try again — if it keeps happening, send the reference below to support.
      </p>
      {error.digest ? (
        <p style={{ color: "var(--portal-muted)", marginBottom: 20, fontSize: "0.8rem" }}>
          Reference: <code>{error.digest}</code>
        </p>
      ) : null}
      <button onClick={reset} style={{ padding: "8px 20px", borderRadius: 6, cursor: "pointer" }}>
        Try again
      </button>
    </div>
  );
}
