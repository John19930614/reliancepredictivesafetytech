import { getPromptTemplates, getModelRegistry, getGatewayLog, getFeedbackEntries, createPromptTemplate, updateModelStatus, submitFeedback } from "./actions";

const MODEL_STATUS_COLORS: Record<string, string> = {
  production: "#42d392",
  staging: "#7db8ff",
  development: "#c8a2ff",
  deprecated: "#ff6b6b",
};

const VALIDATION_COLORS: Record<string, string> = {
  pass: "#42d392",
  warn: "#f5a623",
  fail: "#ff6b6b",
  blocked: "#ff2020",
  pending: "#bfb7a3",
};

export default async function AIServicesPage() {
  const [templates, models, gatewayLog, feedback] = await Promise.all([
    getPromptTemplates(),
    getModelRegistry(),
    getGatewayLog(20),
    getFeedbackEntries(20),
  ]);

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>AI &amp; Intelligence Services</h1>
          <p>Prompt registry, model pipeline, AI gateway log, and feedback improvement loop.</p>
        </div>
      </div>

      {/* Prompt Registry */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Prompt &amp; Tool Registry</h2>
          <span style={{ fontSize: 12, color: "var(--portal-muted)" }}>{templates.length} templates</span>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {templates.map((t) => (
            <div key={t.id} className="platform-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  <strong>{t.name}</strong>
                  <code style={{ fontSize: 11, marginLeft: 8, color: "var(--portal-muted)" }}>{t.prompt_key}</code>
                  <span style={{ marginLeft: 8, fontSize: 11, textTransform: "uppercase", color: "#c8a2ff" }}>{t.category}</span>
                  {t.requires_human_review && <span style={{ marginLeft: 8, fontSize: 11, color: "#f5a623" }}> Human review required</span>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "var(--portal-muted)" }}>v{t.version}</span>
                  <span style={{ fontSize: 11, color: t.is_active ? "#42d392" : "#ff6b6b" }}>{t.is_active ? "Active" : "Inactive"}</span>
                  <span style={{ fontSize: 11, color: "var(--portal-muted)" }}>threshold: {((t.confidence_threshold ?? 0.7) * 100).toFixed(0)}%</span>
                </div>
              </div>
              {t.description && <p style={{ fontSize: 12, color: "var(--portal-muted)", margin: "6px 0 0" }}>{t.description}</p>}
              <pre style={{ margin: "8px 0 0", fontSize: 11, color: "var(--portal-muted)", background: "rgba(0,0,0,.3)", padding: "8px 10px", borderRadius: 8, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 100, overflow: "auto" }}>
                {t.template_text}
              </pre>
            </div>
          ))}
        </div>

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--portal-muted)" }}>+ Add Prompt Template</summary>
          <form action={createPromptTemplate} style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input name="prompt_key" placeholder="prompt_key (unique)" required className="platform-input" style={{ width: 180 }} />
              <input name="name" placeholder="Display name" required className="platform-input" style={{ width: 200 }} />
              <select name="category" className="platform-input" style={{ width: 130 }}>
                {["classification", "extraction", "generation", "validation", "routing", "general"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input name="confidence_threshold" type="number" step="0.05" min="0" max="1" placeholder="0.70" className="platform-input" style={{ width: 80 }} />
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, color: "var(--portal-muted)" }}>
                <input name="requires_human_review" type="checkbox" /> Human review
              </label>
            </div>
            <textarea name="template_text" placeholder="Prompt template text (use {{variable}} for slots)" required className="platform-input" style={{ minHeight: 80, resize: "vertical" }} />
            <button type="submit" className="platform-btn platform-btn-primary" style={{ width: "fit-content" }}>Register Prompt</button>
          </form>
        </details>
      </section>

      {/* Model Registry */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Predictive Model Pipeline</h2>
          <span style={{ fontSize: 12, color: "var(--portal-muted)" }}>{models.length} models</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {models.map((m) => (
            <div key={m.id} className="platform-card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong>{m.name}</strong>
                  <div style={{ fontSize: 11, color: "var(--portal-muted)", marginTop: 2 }}>{m.provider} › {m.model_id} v{m.version}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: MODEL_STATUS_COLORS[m.status], textTransform: "uppercase" }}>{m.status}</span>
              </div>
              {m.description && <p style={{ fontSize: 12, color: "var(--portal-muted)", margin: "8px 0 0" }}>{m.description}</p>}
              {(m.accuracy_score || m.f1_score) && (
                <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 12 }}>
                  {m.accuracy_score && <span>Accuracy: <strong>{(m.accuracy_score * 100).toFixed(1)}%</strong></span>}
                  {m.f1_score && <span>F1: <strong>{(m.f1_score * 100).toFixed(1)}%</strong></span>}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {["development", "staging", "production", "deprecated"].filter((s) => s !== m.status).map((s) => (
                  <form key={s} action={updateModelStatus.bind(null, m.id, s)}>
                    <button type="submit" className="platform-btn platform-btn-xs" style={{ color: MODEL_STATUS_COLORS[s] }}>→ {s}</button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* AI Gateway Log */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>AI Gateway Validation Log</h2>
        {gatewayLog.length === 0 && <div className="platform-empty">No gateway log entries yet. Entries are written when AI output passes through the validation pipeline.</div>}
        <div style={{ display: "grid", gap: 8 }}>
          {gatewayLog.map((entry) => (
            <div key={entry.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)" }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: VALIDATION_COLORS[entry.validation_status], minWidth: 60 }}>{entry.validation_status}</span>
              <code style={{ fontSize: 11, color: "var(--portal-muted)" }}>{entry.prompt_key ?? "—"}</code>
              <span style={{ flex: 1, fontSize: 12 }}>{entry.output_summary ?? "—"}</span>
              {entry.required_human_review && <span style={{ fontSize: 11, color: "#f5a623" }}> needs review</span>}
              <span style={{ fontSize: 11, color: "var(--portal-muted)", whiteSpace: "nowrap" }}>{entry.created_at ? new Date(entry.created_at).toLocaleString() : "—"}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Feedback Loop */}
      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Feedback &amp; Improvement Loop</h2>
        <form action={submitFeedback} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input name="prompt_key" placeholder="Prompt key (optional)" className="platform-input" style={{ width: 180 }} />
            <select name="feedback_type" required className="platform-input" style={{ width: 150 }}>
              {["false_positive", "false_negative", "override", "rejection", "correction", "approval"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <textarea name="original_output" placeholder="Original AI output" className="platform-input" style={{ minHeight: 60, resize: "vertical" }} />
          <textarea name="corrected_output" placeholder="Corrected output (if applicable)" className="platform-input" style={{ minHeight: 60, resize: "vertical" }} />
          <input name="rejection_reason" placeholder="Rejection reason (if applicable)" className="platform-input" />
          <button type="submit" className="platform-btn platform-btn-primary" style={{ width: "fit-content" }}>Submit Feedback</button>
        </form>

        {feedback.length === 0 && <div className="platform-empty">No feedback entries yet.</div>}
        <div style={{ display: "grid", gap: 8 }}>
          {feedback.map((f) => (
            <div key={f.id} style={{ padding: "10px 14px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#c8a2ff" }}>{f.feedback_type}</span>
                {f.prompt_key && <code style={{ fontSize: 11, color: "var(--portal-muted)" }}>{f.prompt_key}</code>}
                {f.included_in_retrain && <span style={{ fontSize: 11, color: "#42d392" }}> included in retrain</span>}
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--portal-muted)" }}>{f.submitted_at ? new Date(f.submitted_at).toLocaleString() : "—"}</span>
              </div>
              {f.rejection_reason && <div style={{ fontSize: 12, color: "#ff6b6b" }}>{f.rejection_reason}</div>}
              {f.notes && <div style={{ fontSize: 12, color: "var(--portal-muted)" }}>{f.notes}</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
