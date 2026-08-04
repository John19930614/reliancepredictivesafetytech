"use client";

// Client share links for a proposal: issue, copy, revoke, and see engagement.
//
// The one thing this panel must get right is the RAW TOKEN. Only its SHA-256
// hash is stored, so the token is displayed exactly once, immediately after
// creation, with an unmissable warning — there is no "show again", because the
// platform genuinely cannot reproduce it. Everything else here is read-only
// reporting on rows the server already fetched.
//
// It imports only from ./share-link-policy (pure), never from ./share-token,
// which pulls in node:crypto and must not reach the browser bundle.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Link2, Ban, Eye } from "lucide-react";
import { createProposalShareLink, revokeProposalShareLink } from "@/app/employee/proposals/actions";
import {
  defaultShareLinkDays,
  evaluateShareLink,
  maxShareLinkDays,
  minShareLinkDays,
  shareLinkStateLabels,
  type ShareLinkState,
} from "@/app/employee/proposals/share-link-policy";

export interface ShareLinkListItem {
  id: string;
  revision_id: string;
  /** Resolved server-side from the bound revision. Null if it could not be read. */
  revision_number: number | null;
  expires_at: string | null;
  revoked_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  created_at: string | null;
}

export interface ShareableRevision {
  id: string;
  revision_number: number;
  /** False when the revision stored no generator state — it cannot be shared. */
  hasContent: boolean;
}

const stateBadgeClass: Record<ShareLinkState, string> = {
  valid: "badge-green",
  expired: "badge-yellow",
  revoked: "badge-yellow",
  unknown: "badge-yellow",
};

function formatStamp(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

export function ProposalSharePanel({
  proposalId,
  revisions,
  links,
  canManage,
  shareGate,
  /**
   * False when the share-link tables are not reachable yet — the 20260804
   * migrations are written but gated behind staging rehearsal and human
   * sign-off, so a deploy can legitimately land before they are applied. The
   * panel says so rather than throwing.
   */
  available,
}: {
  proposalId: string;
  revisions: ShareableRevision[];
  links: ShareLinkListItem[];
  canManage: boolean;
  shareGate: { ok: boolean; reason?: string };
  available: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [issued, setIssued] = useState<{ url: string; expiresAt?: string } | null>(null);

  const shareable = revisions.filter((revision) => revision.hasContent);
  const [revisionId, setRevisionId] = useState(shareable[0]?.id ?? "");
  const [days, setDays] = useState(String(defaultShareLinkDays));

  function create() {
    setError("");
    setNotice("");
    setCopied(false);
    startTransition(async () => {
      const result = await createProposalShareLink(proposalId, {
        revisionId,
        expiresInDays: Number(days),
      });
      if (!result.ok || !result.url) {
        setError(result.error ?? "Failed to create the share link.");
        return;
      }
      // The ONLY moment this value exists outside the client's inbox.
      setIssued({ url: result.url, expiresAt: result.expiresAt });
      router.refresh();
    });
  }

  function revoke(linkId: string) {
    if (!window.confirm("Revoke this link? Anyone holding it loses access immediately and permanently.")) return;
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await revokeProposalShareLink(linkId);
      if (!result.ok) {
        setError(result.error ?? "Failed to revoke the link.");
        return;
      }
      setNotice("Link revoked.");
      router.refresh();
    });
  }

  return (
    <div className="form-panel" style={{ marginTop: 20 }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link2 size={18} color="var(--portal-gold)" /> Client share links
      </h2>
      <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 8 }}>
        A share link shows a client ONE specific revision at a public URL, and records the acceptance against that same
        revision. It never exposes the price book, the revision history, or anything else in the portal.
      </p>

      {!available ? (
        <div className="success-box portal-alert" style={{ marginTop: 12 }}>
          Share links are not available yet — the database migration for this feature has not been applied to this
          environment.
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

      {issued ? (
        <div
          className="success-box portal-alert"
          style={{ marginTop: 12, borderLeft: "3px solid var(--portal-gold)" }}
        >
          <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={16} color="var(--portal-gold)" /> Copy this link now — you will not see it again.
          </strong>
          <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", margin: "8px 0" }}>
            Only a one-way hash of the link is stored, so it cannot be shown again by anyone, including an
            administrator. If you lose it, revoke the link and issue a new one.
            {issued.expiresAt ? ` This link expires ${formatStamp(issued.expiresAt)}.` : ""}
          </p>
          <code
            style={{
              display: "block",
              wordBreak: "break-all",
              padding: "8px 10px",
              borderRadius: 6,
              background: "var(--portal-muted-bg, rgba(0,0,0,0.04))",
              fontSize: "0.85rem",
            }}
          >
            {issued.url}
          </code>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              className="button button-primary"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(issued.url);
                  setCopied(true);
                } catch {
                  setError("Could not copy automatically — select the link above and copy it manually.");
                }
              }}
            >
              <Copy size={16} /> {copied ? "Copied" : "Copy link"}
            </button>
            <button className="button button-light" type="button" onClick={() => setIssued(null)}>
              I have copied it — hide
            </button>
          </div>
        </div>
      ) : null}

      {canManage && available ? (
        shareGate.ok ? (
          shareable.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 12 }}>
              No revision has saved document content yet, so there is nothing a client could be shown.
            </div>
          ) : (
            <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 12 }}>
              <div className="field">
                <label htmlFor="share-revision">Revision to share</label>
                <select
                  id="share-revision"
                  value={revisionId}
                  disabled={isPending}
                  onChange={(event) => setRevisionId(event.target.value)}
                >
                  {shareable.map((revision) => (
                    <option key={revision.id} value={revision.id}>
                      v{revision.revision_number}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="share-days">Expires after (days)</label>
                <input
                  id="share-days"
                  type="number"
                  min={minShareLinkDays}
                  max={maxShareLinkDays}
                  value={days}
                  disabled={isPending}
                  onChange={(event) => setDays(event.target.value)}
                />
              </div>
              <div>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={isPending || !revisionId}
                  onClick={create}
                >
                  <Link2 size={16} /> {isPending ? "Creating…" : "Create share link"}
                </button>
              </div>
            </div>
          )
        ) : (
          <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 12 }}>{shareGate.reason}</p>
        )
      ) : null}

      {links.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 16 }}>
          No share links have been issued for this proposal.
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Revision</th>
                <th>State</th>
                <th>Expires</th>
                <th>Views</th>
                <th>First opened</th>
                <th>Last opened</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => {
                const state = evaluateShareLink(link);
                return (
                  <tr key={link.id}>
                    <td>{link.revision_number != null ? `v${link.revision_number}` : "—"}</td>
                    <td>
                      <span className={`badge ${stateBadgeClass[state]}`}>{shareLinkStateLabels[state]}</span>
                    </td>
                    <td>{formatStamp(link.expires_at)}</td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Eye size={14} color="var(--portal-muted)" />
                        {Number.isFinite(link.view_count) ? link.view_count : 0}
                      </span>
                    </td>
                    <td>{formatStamp(link.first_viewed_at)}</td>
                    <td>{formatStamp(link.last_viewed_at)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {canManage && state === "valid" ? (
                        <button
                          className="button button-light"
                          type="button"
                          disabled={isPending}
                          onClick={() => revoke(link.id)}
                        >
                          <Ban size={14} /> Revoke
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
