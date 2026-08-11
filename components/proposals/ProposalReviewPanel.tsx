"use client";

// The maker–checker panel on the proposal document view.
//
// Steve writes; John reviews and sends. The two of them see DIFFERENT controls
// here, and that is the whole point — Steve gets "Send for review" and then a
// read-only account of where it stands, John gets Approve / Request changes and
// the only Send button in the application.
//
// Every control is a mirror of a server gate in lib/proposals/approval.ts, never
// a substitute for one. Hiding a button is a courtesy to the person who cannot
// use it; the server rejects the action regardless of what the page rendered.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Send, ShieldAlert, Undo2 } from "lucide-react";
import { decideProposal, setProposalStatus, submitProposalForReview } from "@/app/employee/proposals/actions";
import { decisionNoteMaxLength } from "@/lib/proposals/approval";
import type { ProposalStatus } from "@/lib/proposals/types";

/** Plain, serializable view of ApprovalState — this crosses the server boundary. */
export interface ProposalApprovalSummary {
  decision: "approved" | "changes_requested" | null;
  revisionNumber: number | null;
  note: string | null;
  decidedAt: string | null;
  /** True when the newest decision approves the revision that is current now. */
  currentRevisionApproved: boolean;
  /** True when an approval exists but a newer revision has overtaken it. */
  supersededByEdit: boolean;
  /** Revision number of the most recent approval, whatever has happened since. */
  lastApprovedRevision: number | null;
}

function formatWhen(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString();
}

export function ProposalReviewPanel({
  proposalId,
  status,
  currentRevision,
  canApprove,
  approval,
}: {
  proposalId: string;
  status: ProposalStatus;
  currentRevision: number;
  /** Whether THIS viewer holds the approver capability. */
  canApprove: boolean;
  approval: ProposalApprovalSummary;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState("");
  const [askingForChanges, setAskingForChanges] = useState(false);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "That did not work.");
      return;
    }
    setNotice(success);
    setNote("");
    setAskingForChanges(false);
    router.refresh();
  }

  const readyToSend = status === "in_review" && approval.currentRevisionApproved;

  return (
    <div className="form-panel" style={{ marginBottom: 20 }}>
      <h2>Review &amp; send</h2>

      {/* --- Where it stands ------------------------------------------------ */}
      <div style={{ marginTop: 10, fontSize: "0.88rem" }}>
        {approval.supersededByEdit ? (
          <p className="badge badge-yellow" style={{ display: "inline-flex", gap: 6 }}>
            <ShieldAlert size={14} /> v{approval.lastApprovedRevision} was approved — the proposal is now on v
            {currentRevision} and needs approving again
          </p>
        ) : approval.currentRevisionApproved ? (
          <p className="badge badge-green" style={{ display: "inline-flex", gap: 6 }}>
            <CheckCircle2 size={14} /> Approved at v{approval.revisionNumber}
            {approval.decidedAt ? ` · ${formatWhen(approval.decidedAt)}` : ""}
          </p>
        ) : approval.decision === "changes_requested" ? (
          <p className="badge badge-yellow" style={{ display: "inline-flex", gap: 6 }}>
            <Undo2 size={14} /> Changes requested at v{approval.revisionNumber}
          </p>
        ) : (
          <p className="badge" style={{ display: "inline-flex", gap: 6 }}>
            <Clock size={14} /> Not reviewed yet
          </p>
        )}

        {approval.decision === "changes_requested" && approval.note ? (
          <p style={{ marginTop: 8, color: "var(--portal-muted)" }}>
            <strong>Reviewer asked for:</strong> {approval.note}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="badge badge-red" style={{ marginTop: 10 }}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p style={{ marginTop: 10, fontSize: "0.85rem", color: "var(--portal-muted)" }}>{notice}</p>
      ) : null}

      {/* --- The maker's move ----------------------------------------------- */}
      {status === "draft" ? (
        <div style={{ marginTop: 14 }}>
          <button
            className="button button-primary"
            type="button"
            disabled={busy}
            onClick={() => void run(() => submitProposalForReview(proposalId), "Sent to the reviewer.")}
          >
            <Send size={16} /> Submit v{currentRevision} for review
          </button>
          <p style={{ color: "var(--portal-muted)", marginTop: 8, fontSize: "0.8rem" }}>
            The reviewer approves the proposal before it can go to a client.
          </p>
        </div>
      ) : null}

      {/* --- The reviewer's move -------------------------------------------- */}
      {status === "in_review" && canApprove ? (
        <div style={{ marginTop: 14 }}>
          {!askingForChanges ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="button button-primary"
                type="button"
                disabled={busy || approval.currentRevisionApproved}
                onClick={() =>
                  void run(
                    () => decideProposal(proposalId, { decision: "approved" }),
                    `Approved v${currentRevision}. It can now be sent.`,
                  )
                }
              >
                <CheckCircle2 size={16} /> Approve v{currentRevision}
              </button>
              <button
                className="button button-light"
                type="button"
                disabled={busy}
                onClick={() => setAskingForChanges(true)}
              >
                <Undo2 size={16} /> Request changes
              </button>
            </div>
          ) : (
            <div>
              <div className="field">
                <label htmlFor="proposal-change-request">What needs changing?</label>
                <textarea
                  id="proposal-change-request"
                  rows={3}
                  value={note}
                  maxLength={decisionNoteMaxLength}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="e.g. Drop the onboarding fee and re-check the user count."
                />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={busy || note.trim() === ""}
                  onClick={() =>
                    void run(
                      () => decideProposal(proposalId, { decision: "changes_requested", note }),
                      "Sent back to the author with your note.",
                    )
                  }
                >
                  Send it back
                </button>
                <button
                  className="button button-light"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAskingForChanges(false);
                    setNote("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* --- The send ------------------------------------------------------- */}
      {readyToSend && canApprove ? (
        <div style={{ marginTop: 14 }}>
          <button
            className="button button-primary"
            type="button"
            disabled={busy}
            onClick={() => void run(() => setProposalStatus(proposalId, "sent"), "Marked as sent to the client.")}
          >
            <Send size={16} /> Send v{currentRevision} to the client
          </button>
        </div>
      ) : null}

      {/* --- What the maker sees while waiting ------------------------------- */}
      {status === "in_review" && !canApprove ? (
        <p style={{ color: "var(--portal-muted)", marginTop: 14, fontSize: "0.85rem" }}>
          With the reviewer. Only a proposal approver can approve this or send it to the client. Editing it now will
          return it to draft and it will need submitting again.
        </p>
      ) : null}
    </div>
  );
}
