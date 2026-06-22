import { getRunbooks, createRunbook, markRunbookReviewed } from "./actions";

const CATEGORIES = ["setup", "architecture", "api", "deployment", "incident", "general"] as const;
const CATEGORY_ICONS: Record<string, string> = {
  setup: "⚙️",
  architecture: "🏗️",
  api: "🔌",
  deployment: "🚀",
  incident: "🚨",
  general: "📄",
};

export default async function DocsPage() {
  const runbooks = await getRunbooks();
  const grouped = CATEGORIES.map((cat) => ({
    category: cat,
    docs: runbooks.filter((r) => r.category === cat),
  })).filter((g) => g.docs.length > 0 || g.category === "general");

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>Documentation &amp; Runbooks</h1>
          <p>Developer docs, architecture guides, runbooks, and knowledge base for platform operations.</p>
        </div>
        <form action={createRunbook}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <select name="category" className="platform-input" style={{ width: 130 }}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
            </select>
            <input name="title" placeholder="Runbook title" required className="platform-input" style={{ width: 220 }} />
            <textarea name="content" placeholder="Content (markdown supported)" className="platform-input" style={{ width: 300, height: 60, resize: "vertical" }} />
            <button type="submit" className="platform-btn platform-btn-primary">+ Add Doc</button>
          </div>
        </form>
      </div>

      {runbooks.length === 0 && (
        <div className="platform-empty">No runbooks yet. Add your first doc above.</div>
      )}

      {grouped.map(({ category, docs }) => docs.length > 0 && (
        <section key={category} style={{ marginBottom: 20 }}>
          <h3 style={{ textTransform: "capitalize", display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
            {CATEGORY_ICONS[category]} {category}
          </h3>
          <div style={{ display: "grid", gap: 10 }}>
            {docs.map((doc) => (
              <div key={doc.id} className="platform-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <strong>{doc.title}</strong>
                    {doc.last_reviewed_at && (
                      <span style={{ fontSize: 11, color: "#42d392", marginLeft: 10 }}>
                         Reviewed {new Date(doc.last_reviewed_at).toLocaleDateString()}
                      </span>
                    )}
                    {!doc.last_reviewed_at && (
                      <span style={{ fontSize: 11, color: "#f5a623", marginLeft: 10 }}> Never reviewed</span>
                    )}
                  </div>
                  <form action={markRunbookReviewed.bind(null, doc.id)}>
                    <button type="submit" className="platform-btn platform-btn-xs">Mark Reviewed</button>
                  </form>
                </div>
                {doc.content && (
                  <pre style={{ margin: "10px 0 0", fontSize: 12, color: "var(--portal-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "rgba(255,255,255,.03)", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.06)" }}>
                    {doc.content}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
