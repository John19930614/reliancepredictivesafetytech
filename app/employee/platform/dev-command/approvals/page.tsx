import Link from "next/link";
import { getPendingApprovals } from "@/lib/dev-command/repo";
import { decideApproval } from "@/app/employee/platform/dev-command/actions";
import { APPROVAL_TYPE_LABELS, RISK_LEVEL_COLORS } from "@/lib/dev-command/labels";

export default async function ApprovalCenterPage() {
  const approvals = await getPendingApprovals();

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>Approval Center</h1>
          <p>Every dangerous action across every task waits here until a human decides. Nothing executes without your sign-off.</p>
        </div>
      </div>

      {approvals.length === 0 && <div className="platform-empty">No pending approvals.</div>}

      <div style={{ display: "grid", gap: 12 }}>
        {approvals.map((approval) => {
          const task = (approval as typeof approval & { dev_tasks?: { title: string } | null }).dev_tasks;
          return (
            <div key={approval.id} className="platform-card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  {approval.task_id && (
                    <Link href={`/employee/platform/dev-command/tasks/${approval.task_id}`} style={{ fontSize: 12, color: "var(--portal-muted)" }}>
                      {task?.title ?? "View task"}
                    </Link>
                  )}
                  <div style={{ fontWeight: 700, marginTop: 2 }}>{APPROVAL_TYPE_LABELS[approval.approval_type] ?? approval.approval_type}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: RISK_LEVEL_COLORS[approval.risk_level] }}>{approval.risk_level}</span>
              </div>
              <p style={{ fontSize: 13, color: "var(--portal-muted)", margin: "8px 0" }}>{approval.plain_english_summary || approval.summary}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <form action={decideApproval.bind(null, approval.id, "approved", undefined)}>
                  <button type="submit" className="platform-btn" style={{ color: "#42d392" }}>Approve</button>
                </form>
                <form action={decideApproval.bind(null, approval.id, "rejected", undefined)}>
                  <button type="submit" className="platform-btn" style={{ color: "#ff6b6b" }}>Reject</button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
