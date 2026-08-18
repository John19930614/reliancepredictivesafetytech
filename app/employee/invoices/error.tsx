"use client";

/**
 * A thrown error's `message` can carry query text, ids, or a raw Postgres
 * constraint string — none of which help the reader and some of which should
 * not be on screen, least of all on a page about money. The user gets a plain
 * explanation; the digest is what support needs to find the matching server log
 * entry.
 */
export default function InvoicesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: "40px 24px", textAlign: "center" }}>
      <h2 style={{ marginBottom: 12 }}>Failed to load the invoice ledger</h2>
      <p style={{ color: "var(--portal-muted)", marginBottom: 20 }}>
        Something went wrong while loading this page. No invoice was changed. Try again — if it keeps happening, send
        the reference below to support.
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
