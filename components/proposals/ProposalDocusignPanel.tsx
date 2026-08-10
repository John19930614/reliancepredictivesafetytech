"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, PenLine, Send } from "lucide-react";
import { sendProposalToDocusign } from "@/app/employee/proposals/actions";
import type { ShareableRevision } from "./ProposalSharePanel";

export interface ProposalDocusignEnvelope {
  id: string;
  revision_id: string | null;
  revision_number: number | null;
  envelope_id: string;
  status: string;
  recipient_name: string;
  recipient_email: string;
  sent_at: string | null;
  completed_at: string | null;
  completed_file_id: string | null;
}

const statusLabels: Record<string, string> = {
  created: "Created",
  sent: "Sent",
  delivered: "Opened",
  completed: "Completed",
  declined: "Declined",
  voided: "Voided",
  corrected: "Corrected",
  unknown: "Unknown",
};

function formatStamp(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function badgeClass(status: string): string {
  if (status === "completed") return "badge-green";
  if (status === "declined" || status === "voided") return "badge-red";
  return "badge-yellow";
}

export function ProposalDocusignPanel({
  proposalId,
  revisions,
  envelopes,
  canManage,
  available,
  configured,
  missing,
  defaultRecipientName,
  defaultRecipientEmail,
}: {
  proposalId: string;
  revisions: ShareableRevision[];
  envelopes: ProposalDocusignEnvelope[];
  canManage: boolean;
  available: boolean;
  configured: boolean;
  missing: string[];
  defaultRecipientName: string | null;
  defaultRecipientEmail: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sendable = revisions.filter((revision) => revision.hasContent);
  const [revisionId, setRevisionId] = useState(sendable[0]?.id ?? "");

  function send() {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await sendProposalToDocusign(proposalId, revisionId || null);
      if (!result.ok) {
        setError(result.error ?? "Failed to send with DocuSign.");
        return;
      }
      setNotice("Sent to DocuSign. The signed PDF will file itself when the client completes it.");
      router.refresh();
    });
  }

  return (
    <div className="form-panel" style={{ marginTop: 20 }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <PenLine size={18} color="var(--portal-gold)" /> DocuSign signature
      </h2>
      <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 8 }}>
        Send one proposal revision for signature. When DocuSign reports it completed, the signed PDF is automatically
        saved into the client&apos;s File Center under Proposals and the proposal is marked accepted.
      </p>

      {!available ? (
        <div className="success-box portal-alert" style={{ marginTop: 12 }}>
          DocuSign tracking is not available yet — apply the database migration for this feature first.
        </div>
      ) : null}

      {available && !configured ? (
        <div className="success-box portal-alert" style={{ marginTop: 12 }}>
          DocuSign is not fully configured for this environment
          {missing.length > 0 ? ` (${missing.join(", ")}).` : "."}
        </div>
      ) : null}

      {error ? (
        <div className="success-box portal-alert portal-alert-error" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="success-box portal-alert" style={{ marginTop: 12 }}>
          {notice}
        </div>
      ) : null}

      {canManage && available && configured ? (
        sendable.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 12 }}>
            No revision has saved document content yet, so there is nothing to send.
          </div>
        ) : defaultRecipientEmail ? (
          <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 12 }}>
            <div className="field">
              <label>Signer</label>
              <input
                value={`${defaultRecipientName ?? defaultRecipientEmail} <${defaultRecipientEmail}>`}
                readOnly
                aria-label="DocuSign signer"
              />
              <span className="help-text">This comes from the first client contact email saved in the proposal.</span>
            </div>
            <div className="field">
              <label htmlFor="docusign-revision">Revision to send</label>
              <select
                id="docusign-revision"
                value={revisionId}
                disabled={isPending}
                onChange={(event) => setRevisionId(event.target.value)}
              >
                {sendable.map((revision) => (
                  <option key={revision.id} value={revision.id}>
                    v{revision.revision_number}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button className="button button-primary" type="button" disabled={isPending || !revisionId} onClick={send}>
                <Send size={16} /> {isPending ? "Sending…" : "Send with DocuSign"}
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-state" style={{ marginTop: 12 }}>
            Add a client contact with an email address in the proposal editor before sending with DocuSign.
          </div>
        )
      ) : null}

      {envelopes.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 16 }}>
          No DocuSign envelopes have been sent for this proposal.
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Revision</th>
                <th>Status</th>
                <th>Signer</th>
                <th>Sent</th>
                <th>Completed</th>
                <th>Signed file</th>
              </tr>
            </thead>
            <tbody>
              {envelopes.map((envelope) => (
                <tr key={envelope.id}>
                  <td>{envelope.revision_number != null ? `v${envelope.revision_number}` : "—"}</td>
                  <td>
                    <span className={`badge ${badgeClass(envelope.status)}`}>
                      {statusLabels[envelope.status] ?? envelope.status}
                    </span>
                  </td>
                  <td>
                    {envelope.recipient_name}
                    <br />
                    <span style={{ color: "var(--portal-muted)", fontSize: "0.8rem" }}>
                      {envelope.recipient_email}
                    </span>
                  </td>
                  <td>{formatStamp(envelope.sent_at)}</td>
                  <td>{formatStamp(envelope.completed_at)}</td>
                  <td>
                    {envelope.completed_file_id ? (
                      <a className="button button-light" href="/employee/files">
                        <CheckCircle2 size={14} /> File Center <ExternalLink size={12} />
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
