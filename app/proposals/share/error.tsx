"use client";

/**
 * Error boundary for the PUBLIC share route.
 *
 * Stricter than the employee boundary on purpose: the reader here is an
 * unauthenticated visitor, so nothing about the failure is shown. No message,
 * no stack, not even the digest — a digest is a server-log correlation id and
 * publishing it to an anonymous caller is free reconnaissance. Internal support
 * can correlate from the server log side.
 */
export default function ProposalShareError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 20px" }}>
      <div className="form-panel">
        <h1 style={{ marginTop: 0 }}>This proposal could not be displayed</h1>
        <p style={{ color: "var(--portal-muted)" }}>
          Something went wrong loading this page. Try again — if it keeps happening, contact the representative who
          sent you the link.
        </p>
        <button className="button button-light" type="button" onClick={reset} style={{ marginTop: 8 }}>
          Try again
        </button>
      </div>
    </main>
  );
}
