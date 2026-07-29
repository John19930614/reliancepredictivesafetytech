"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2, Upload } from "lucide-react";
import {
  deleteProposal,
  restoreProposalRevision,
  saveProposalRevision,
  setProposalStatus,
  updateProposalMeta,
} from "@/app/employee/proposals/actions";
import {
  buildPrefillState,
  deriveSummaryFromState,
  deriveTitleFromState,
  isGeneratorState,
} from "@/lib/proposals/generator-state";
import { proposalStatusLabels, type ProposalRevisionRow, type ProposalStatus } from "@/lib/proposals/types";
import { ProposalStatusBadge } from "./ProposalStatusBadge";

interface ClientOption {
  id: string;
  name: string;
}

export interface WorkspaceProposal {
  id: string;
  client_id: string | null;
  title: string;
  status: ProposalStatus;
  owner: string | null;
  proposal_value: number | null;
  valid_until: string | null;
  summary: string | null;
  body_markdown: string | null;
  current_revision: number;
  form_data: unknown;
}

export interface WorkspaceClientDetail {
  name: string | null;
  contact_name: string | null;
  email: string | null;
}

const statusActions: Record<ProposalStatus, { to: ProposalStatus; label: string }[]> = {
  draft: [
    { to: "in_review", label: "Send for review" },
    { to: "sent", label: "Mark as sent" },
    { to: "archived", label: "Archive" },
  ],
  in_review: [
    { to: "sent", label: "Mark as sent" },
    { to: "draft", label: "Back to draft" },
    { to: "archived", label: "Archive" },
  ],
  sent: [
    { to: "accepted", label: "Mark accepted" },
    { to: "declined", label: "Mark declined" },
    { to: "draft", label: "Reopen for revision" },
    { to: "archived", label: "Archive" },
  ],
  accepted: [{ to: "archived", label: "Archive" }],
  declined: [
    { to: "draft", label: "Reopen for revision" },
    { to: "archived", label: "Archive" },
  ],
  archived: [{ to: "draft", label: "Restore to draft" }],
};

export function ProposalWorkspace({
  proposal,
  revisions,
  clients,
  assignedClient,
  isAdmin,
}: {
  proposal: WorkspaceProposal;
  revisions: ProposalRevisionRow[];
  clients: ClientOption[];
  assignedClient: WorkspaceClientDetail | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [viewingRevision, setViewingRevision] = useState<ProposalRevisionRow | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const changeNoteRef = useRef(changeNote);
  changeNoteRef.current = changeNote;

  const editable = proposal.status === "draft" || proposal.status === "in_review";

  const postToGenerator = useCallback((message: object) => {
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  const run = useCallback(
    (action: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) => {
      setError("");
      setNotice("");
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          setError(result.error ?? "Something went wrong.");
          return;
        }
        setNotice(successMessage);
        router.refresh();
      });
    },
    [router],
  );

  // Bridge: the generator posts ready/save events; we answer with load/persist.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "proposal:ready") {
        const initial = isGeneratorState(proposal.form_data) ? proposal.form_data : buildPrefillState(assignedClient);
        if (initial) postToGenerator({ type: "proposal:load", state: initial });
        return;
      }

      if (msg.type === "proposal:save") {
        if (!editable) {
          setError(`This proposal is ${proposalStatusLabels[proposal.status].toLowerCase()} and locked. Reopen it as a draft to save a new revision.`);
          return;
        }
        const state = isGeneratorState(msg.state) ? msg.state : null;
        if (!state) {
          setError("The generator sent malformed data — revision not saved.");
          return;
        }
        run(
          () =>
            saveProposalRevision(proposal.id, {
              title: deriveTitleFromState(state, proposal.title),
              summary: deriveSummaryFromState(state),
              changeNote: changeNoteRef.current,
              formData: state,
            }),
          `Saved as revision v${proposal.current_revision + 1}.`,
        );
        setChangeNote("");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [proposal.id, proposal.title, proposal.status, proposal.current_revision, proposal.form_data, assignedClient, editable, postToGenerator, run]);

  function loadRevisionIntoEditor(rev: ProposalRevisionRow) {
    if (!isGeneratorState(rev.form_data)) return;
    if (!window.confirm(`Load revision v${rev.revision_number} into the editor? Unsaved edits in the editor will be replaced (nothing is saved until you click Save Draft).`)) return;
    postToGenerator({ type: "proposal:load", state: rev.form_data });
    setNotice(`Revision v${rev.revision_number} loaded into the editor — click Save Draft in the generator to keep it as a new revision.`);
  }

  return (
    <div className="document-grid">
      <section>
        {error ? <div className="error-box" style={{ marginBottom: 12 }}>{error}</div> : null}
        {notice ? (
          <div style={{ marginBottom: 12, color: "var(--portal-gold)", fontSize: "0.9rem" }}>{notice}</div>
        ) : null}

        <div className="form-panel">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Proposal editor — revision v{proposal.current_revision}</h2>
            <ProposalStatusBadge status={proposal.status} />
          </div>
          <p style={{ color: "var(--portal-muted)", marginTop: 8, fontSize: "0.9rem" }}>
            {editable
              ? "Edit below, then click Save Draft inside the generator — each save is stored as a new revision on this proposal."
              : `This proposal is ${proposalStatusLabels[proposal.status].toLowerCase()} and locked. Reopen it as a draft to save changes.`}
          </p>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="proposal-change-note">What changed? (saved with the next revision)</label>
            <input
              id="proposal-change-note"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="e.g. Updated pricing after site walk"
              disabled={isPending}
            />
          </div>
        </div>

        <iframe
          ref={iframeRef}
          src="/employee/proposals/generator"
          title="Proposal & Billing Generator"
          style={{
            width: "100%",
            height: "78vh",
            minHeight: 720,
            marginTop: 16,
            border: "1px solid var(--portal-line, #dbe2e9)",
            borderRadius: 8,
            background: "#fff",
          }}
        />

        <div className="form-panel" style={{ marginTop: 20 }}>
          <h2>Revision history</h2>
          {revisions.length === 0 ? (
            <div className="empty-state">No revisions recorded yet.</div>
          ) : (
            <table className="data-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Rev</th>
                  <th>Title</th>
                  <th>Change note</th>
                  <th>Saved</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((rev) => (
                  <tr key={rev.id}>
                    <td>v{rev.revision_number}</td>
                    <td>{rev.title}</td>
                    <td>{rev.change_note ?? "—"}</td>
                    <td>{new Date(rev.created_at).toLocaleString()}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {isGeneratorState(rev.form_data) ? (
                        <button className="button button-light" onClick={() => loadRevisionIntoEditor(rev)}>
                          <Upload size={14} /> Open in editor
                        </button>
                      ) : (
                        <button
                          className="button button-light"
                          onClick={() => setViewingRevision(viewingRevision?.id === rev.id ? null : rev)}
                        >
                          {viewingRevision?.id === rev.id ? "Hide" : "View"}
                        </button>
                      )}{" "}
                      {rev.revision_number !== proposal.current_revision ? (
                        <button
                          className="button button-light"
                          disabled={!editable || isPending}
                          title={editable ? "Copy this revision forward as the newest revision" : "Reopen as draft to restore"}
                          onClick={() =>
                            run(
                              () => restoreProposalRevision(proposal.id, rev.id),
                              `Restored v${rev.revision_number} as a new revision.`,
                            )
                          }
                        >
                          <RotateCcw size={14} /> Restore
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {viewingRevision ? (
            <div className="form-panel" style={{ marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>
                v{viewingRevision.revision_number} — {viewingRevision.title}
              </h3>
              {viewingRevision.summary ? (
                <p style={{ color: "var(--portal-muted)" }}>{viewingRevision.summary}</p>
              ) : null}
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>
                {viewingRevision.body_markdown ?? "(empty)"}
              </pre>
            </div>
          ) : null}
        </div>
      </section>

      <aside>
        <div className="form-panel">
          <h2>Workflow</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {statusActions[proposal.status].map((action) => (
              <button
                key={action.to}
                className="button button-light"
                disabled={isPending}
                onClick={() =>
                  run(() => setProposalStatus(proposal.id, action.to), `Moved to ${proposalStatusLabels[action.to]}.`)
                }
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-panel" style={{ marginTop: 20 }}>
          <h2>Assignment</h2>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 12 }}>
            <div className="field">
              <label htmlFor="proposal-client">Company</label>
              <select
                id="proposal-client"
                value={proposal.client_id ?? ""}
                disabled={isPending}
                onChange={(e) =>
                  run(
                    () => updateProposalMeta(proposal.id, { clientId: e.target.value || null }),
                    "Company assignment updated.",
                  )
                }
              >
                <option value="">Unassigned</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="proposal-owner">Owner</label>
              <input
                id="proposal-owner"
                defaultValue={proposal.owner ?? ""}
                disabled={isPending}
                onBlur={(e) => {
                  if ((e.target.value.trim() || null) !== (proposal.owner ?? null)) {
                    run(() => updateProposalMeta(proposal.id, { owner: e.target.value }), "Owner updated.");
                  }
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="proposal-value">Value (USD)</label>
              <input
                id="proposal-value"
                inputMode="decimal"
                defaultValue={proposal.proposal_value != null ? String(proposal.proposal_value) : ""}
                disabled={isPending}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  const parsed = raw ? Number(raw) : null;
                  if (raw && Number.isNaN(parsed)) {
                    setError("Proposal value must be a number.");
                    return;
                  }
                  if (parsed !== (proposal.proposal_value ?? null)) {
                    run(() => updateProposalMeta(proposal.id, { proposalValue: parsed }), "Value updated.");
                  }
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="proposal-valid-until">Valid until</label>
              <input
                id="proposal-valid-until"
                type="date"
                defaultValue={proposal.valid_until ?? ""}
                disabled={isPending}
                onChange={(e) =>
                  run(() => updateProposalMeta(proposal.id, { validUntil: e.target.value || null }), "Expiry updated.")
                }
              />
            </div>
          </div>
        </div>

        {isAdmin ? (
          <div className="form-panel" style={{ marginTop: 20 }}>
            <h2>Danger zone</h2>
            <button
              className="button button-light"
              style={{ marginTop: 12, color: "#ef4444" }}
              disabled={isPending}
              onClick={() => {
                if (!window.confirm("Delete this proposal and its entire revision history? This cannot be undone.")) return;
                setError("");
                startTransition(async () => {
                  const result = await deleteProposal(proposal.id);
                  if (!result.ok) {
                    setError(result.error ?? "Failed to delete.");
                    return;
                  }
                  router.push("/employee/proposals");
                  router.refresh();
                });
              }}
            >
              <Trash2 size={16} /> Delete proposal
            </button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
