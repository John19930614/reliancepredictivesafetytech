import { notFound } from "next/navigation";
import { getTaskDetail } from "@/lib/dev-command/repo";
import { decideApproval, runNextStage } from "@/app/employee/platform/dev-command/actions";
import { APPROVAL_STATUS_COLORS, APPROVAL_TYPE_LABELS, formatStageLabel, RISK_LEVEL_COLORS } from "@/lib/dev-command/labels";
import { isGate, isTerminal, WORKFLOW_STAGES } from "@/lib/dev-command/workflow";

export default async function DevTaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const detail = await getTaskDetail(taskId);

  if (!detail.task) {
    notFound();
  }

  const { task, runs, artifacts, fileChangePlans, approvals, testResults, securityReviews, experienceReviews, auditLog } = detail;
  const pendingApproval = approvals.find((approval) => approval.status === "pending");
  const stagePosition = WORKFLOW_STAGES.indexOf(task.stage as (typeof WORKFLOW_STAGES)[number]);

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>{task.title}</h1>
          <p>{task.description || "No description provided."}</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20, fontSize: 12, color: "var(--portal-muted)" }}>
        <span>Stage: <strong style={{ color: "var(--portal-gold, #d4af37)" }}>{formatStageLabel(task.stage)}</strong></span>
        <span>Status: <strong>{task.status.replace(/_/g, " ")}</strong></span>
        <span>Risk: <strong style={{ color: RISK_LEVEL_COLORS[task.risk_level] }}>{task.risk_level}</strong></span>
        {stagePosition >= 0 && <span>Progress: {stagePosition + 1} / {WORKFLOW_STAGES.length}</span>}
      </div>

      {!isTerminal(task.stage) && !isGate(task.stage) && (
        <form action={runNextStage.bind(null, task.id)} style={{ marginBottom: 24 }}>
          <button type="submit" className="platform-btn platform-btn-primary">Run Next Step →</button>
        </form>
      )}

      {isGate(task.stage) && pendingApproval && (
        <section className="platform-card" style={{ padding: 16, marginBottom: 24, borderColor: "rgba(245,166,35,.4)" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>⚠ Approval Required</h2>
          <p style={{ fontSize: 13, color: "var(--portal-muted)", marginBottom: 10 }}>{pendingApproval.plain_english_summary || pendingApproval.summary}</p>
          <div style={{ fontSize: 12, marginBottom: 12 }}>
            Type: <strong>{APPROVAL_TYPE_LABELS[pendingApproval.approval_type] ?? pendingApproval.approval_type}</strong>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <form action={decideApproval.bind(null, pendingApproval.id, "approved", undefined)}>
              <button type="submit" className="platform-btn" style={{ color: "#42d392" }}>Approve</button>
            </form>
            <form action={decideApproval.bind(null, pendingApproval.id, "rejected", undefined)}>
              <button type="submit" className="platform-btn" style={{ color: "#ff6b6b" }}>Reject</button>
            </form>
          </div>
        </section>
      )}

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Artifacts &amp; Drafts</h2>
        {artifacts.length === 0 && <div className="platform-empty">No artifacts yet — run the next step to generate one.</div>}
        <div style={{ display: "grid", gap: 8 }}>
          {artifacts.map((artifact) => (
            <div key={artifact.id} className="platform-card" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                <strong>{artifact.title ?? artifact.kind}</strong>
                <span style={{ color: "var(--portal-muted)" }}>{artifact.status}</span>
              </div>
              <pre style={{ margin: 0, fontSize: 11, color: "var(--portal-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{artifact.content}</pre>
            </div>
          ))}
        </div>
      </section>

      {fileChangePlans.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Proposed File Changes</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {fileChangePlans.map((plan) => (
              <div key={plan.id} className="platform-card" style={{ padding: 12, fontSize: 12 }}>
                <code>{plan.file_path}</code> — {plan.change_type} <span style={{ color: RISK_LEVEL_COLORS[plan.risk_level] }}>({plan.risk_level})</span>
                {plan.rationale && <div style={{ color: "var(--portal-muted)", marginTop: 4 }}>{plan.rationale}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {(testResults.length > 0 || securityReviews.length > 0 || experienceReviews.length > 0) && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Reviews</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {testResults.map((result) => (
              <div key={result.id} className="platform-card" style={{ padding: 12, fontSize: 12 }}>
                <strong>QA</strong> — {result.status} — {result.summary}
              </div>
            ))}
            {securityReviews.map((review) => (
              <div key={review.id} className="platform-card" style={{ padding: 12, fontSize: 12 }}>
                <strong>Security</strong> — {review.verdict} — {review.summary}
              </div>
            ))}
            {experienceReviews.map((review) => (
              <div key={review.id} className="platform-card" style={{ padding: 12, fontSize: 12 }}>
                <strong>Experience ({review.perspective})</strong> — {review.verdict} — {review.summary}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Audit Log</h2>
        {auditLog.length === 0 && <div className="platform-empty">No audit entries yet.</div>}
        <div style={{ display: "grid", gap: 6 }}>
          {auditLog.map((entry) => (
            <div key={entry.id} style={{ display: "flex", gap: 10, fontSize: 12, padding: "6px 10px", background: "rgba(255,255,255,.03)", borderRadius: 8 }}>
              <span style={{ color: "#c8a2ff", textTransform: "uppercase", fontWeight: 700, minWidth: 60 }}>{entry.actor_type}</span>
              <span style={{ flex: 1 }}>{entry.action.replace(/_/g, " ")}</span>
              <span style={{ color: "var(--portal-muted)" }}>{entry.created_at ? new Date(entry.created_at).toLocaleString() : "—"}</span>
            </div>
          ))}
        </div>
      </section>

      {runs.length > 0 && (
        <p style={{ marginTop: 24, fontSize: 11, color: "var(--portal-muted)" }}>{runs.length} agent run{runs.length === 1 ? "" : "s"} recorded for this task.</p>
      )}
    </div>
  );
}
