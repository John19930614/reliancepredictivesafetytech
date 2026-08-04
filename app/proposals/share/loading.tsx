/**
 * Loading state for the public share route (CLAUDE.md: async data pages must
 * export a loading.tsx or use Suspense). It is deliberately content-free — the
 * skeleton must not hint at whether a document is about to appear.
 */
export default function ProposalShareLoading() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 20px" }}>
      <div className="form-panel">
        <p style={{ color: "var(--portal-muted)", margin: 0 }}>Loading…</p>
      </div>
    </main>
  );
}
