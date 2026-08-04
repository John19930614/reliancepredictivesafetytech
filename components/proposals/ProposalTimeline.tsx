// Vertical status timeline for a proposal.
//
// This is the first consumer of `client_proposal_revisions.status_at_save`,
// which has been written on every revision since the module shipped and read by
// nothing. Combined with the acceptance columns and the share-link view
// tracking, it answers the question the module could not previously answer:
// what happened to this proposal, when, and on whose evidence.
//
// A server component on purpose — it is pure presentation over data the page
// already fetched, so it costs no client JavaScript. Timestamps therefore go
// through the deterministic `formatDocumentDate` rather than
// `toLocaleString()`, which on the server would print the SERVER's locale and
// timezone rather than the reader's.

import { CheckCircle2, Eye, FileClock, Link2, Ban, XCircle } from "lucide-react";
import { proposalStatusLabels, type ProposalStatus } from "@/lib/proposals/types";
import { ProposalStatusBadge } from "./ProposalStatusBadge";
import { formatDocumentDate } from "./proposal-document-model";

export interface TimelineRevision {
  id: string;
  revision_number: number;
  change_note: string | null;
  status_at_save: string | null;
  created_at: string;
}

export interface TimelineShareLink {
  id: string;
  revision_number: number | null;
  created_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  revoked_at: string | null;
}

export interface TimelineAcceptance {
  acceptedAt: string | null;
  acceptedByName: string | null;
  acceptedByEmail: string | null;
  acceptanceIp: string | null;
  acceptedRevisionNumber: number | null;
  declinedAt: string | null;
  declineReason: string | null;
}

type EventIcon = "revision" | "status" | "link" | "view" | "revoked" | "accepted" | "declined";

interface TimelineEvent {
  key: string;
  at: string | null;
  icon: EventIcon;
  title: string;
  detail?: string | null;
  status?: ProposalStatus | null;
}

function iconFor(icon: EventIcon) {
  const size = 15;
  switch (icon) {
    case "revision":
      return <FileClock size={size} color="var(--portal-muted)" />;
    case "link":
      return <Link2 size={size} color="var(--portal-gold)" />;
    case "view":
      return <Eye size={size} color="var(--portal-gold)" />;
    case "revoked":
      return <Ban size={size} color="var(--portal-muted)" />;
    case "accepted":
      return <CheckCircle2 size={size} color="var(--portal-gold)" />;
    case "declined":
      return <XCircle size={size} color="var(--portal-muted)" />;
    default:
      return <FileClock size={size} color="var(--portal-gold)" />;
  }
}

function time(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

/**
 * Builds the event list. Exported so the derivation can be reasoned about (and
 * tested) independently of the markup.
 *
 * `status_at_save` is the status the proposal was IN when a revision was saved,
 * not a transition record — so a difference between consecutive revisions is
 * evidence that a transition happened somewhere in between. That is stated
 * honestly rather than dressed up as a precise transition timestamp.
 */
export function buildProposalTimeline(
  revisions: TimelineRevision[],
  links: TimelineShareLink[],
  acceptance: TimelineAcceptance | null,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  const ordered = [...revisions].sort((a, b) => a.revision_number - b.revision_number);

  ordered.forEach((revision, index) => {
    const previous = index > 0 ? ordered[index - 1] : null;
    events.push({
      key: `rev-${revision.id}`,
      at: revision.created_at,
      icon: "revision",
      title: index === 0 ? `Created as revision v${revision.revision_number}` : `Revision v${revision.revision_number} saved`,
      detail: revision.change_note,
      status: (revision.status_at_save as ProposalStatus | null) ?? null,
    });

    if (previous && previous.status_at_save && revision.status_at_save && previous.status_at_save !== revision.status_at_save) {
      events.push({
        key: `status-${revision.id}`,
        at: revision.created_at,
        icon: "status",
        title: `Status moved from ${proposalStatusLabels[previous.status_at_save as ProposalStatus] ?? previous.status_at_save} to ${proposalStatusLabels[revision.status_at_save as ProposalStatus] ?? revision.status_at_save}`,
        detail: `Recorded between v${previous.revision_number} and v${revision.revision_number}.`,
        status: revision.status_at_save as ProposalStatus,
      });
    }
  });

  for (const link of links) {
    const label = link.revision_number != null ? `v${link.revision_number}` : "a revision";
    events.push({
      key: `link-${link.id}`,
      at: link.created_at,
      icon: "link",
      title: `Client share link issued for ${label}`,
      detail: null,
    });
    if (link.first_viewed_at) {
      events.push({
        key: `link-first-${link.id}`,
        at: link.first_viewed_at,
        icon: "view",
        title: `Client opened ${label} for the first time`,
        detail:
          link.view_count > 1
            ? `${link.view_count} opens in total, most recently ${formatDocumentDate(link.last_viewed_at)}.`
            : null,
      });
    }
    if (link.revoked_at) {
      events.push({
        key: `link-revoked-${link.id}`,
        at: link.revoked_at,
        icon: "revoked",
        title: `Share link for ${label} revoked`,
        detail: null,
      });
    }
  }

  if (acceptance?.acceptedAt) {
    // `accepted_by_email` is the discriminator: present means a client submitted
    // it through a share link, absent means an employee recorded it by hand.
    const clientVerified = Boolean(acceptance.acceptedByEmail);
    const who = acceptance.acceptedByName
      ? `${acceptance.acceptedByName}${acceptance.acceptedByEmail ? ` (${acceptance.acceptedByEmail})` : ""}`
      : null;
    const bound =
      acceptance.acceptedRevisionNumber != null ? `Bound to revision v${acceptance.acceptedRevisionNumber}.` : null;
    events.push({
      key: "accepted",
      at: acceptance.acceptedAt,
      icon: "accepted",
      title: clientVerified ? "Accepted by the client" : "Marked accepted internally",
      detail: [
        who,
        bound,
        acceptance.acceptanceIp ? `Recorded from ${acceptance.acceptanceIp}.` : null,
        clientVerified ? null : "No client-side evidence was captured for this acceptance.",
      ]
        .filter(Boolean)
        .join(" "),
      status: "accepted",
    });
  }

  if (acceptance?.declinedAt) {
    events.push({
      key: "declined",
      at: acceptance.declinedAt,
      icon: "declined",
      title: "Declined",
      detail: acceptance.declineReason,
      status: "declined",
    });
  }

  return events.sort((a, b) => time(a.at) - time(b.at));
}

export function ProposalTimeline({
  status,
  revisions,
  links,
  acceptance,
}: {
  status: ProposalStatus;
  revisions: TimelineRevision[];
  links: TimelineShareLink[];
  acceptance: TimelineAcceptance | null;
}) {
  const events = buildProposalTimeline(revisions, links, acceptance);

  return (
    <div className="form-panel" style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Timeline</h2>
        <ProposalStatusBadge status={status} />
      </div>

      {events.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 12 }}>
          Nothing has been recorded for this proposal yet.
        </div>
      ) : (
        <ol
          style={{
            listStyle: "none",
            margin: "16px 0 0",
            padding: 0,
            borderLeft: "2px solid var(--portal-line, #dbe2e9)",
          }}
        >
          {events.map((event) => (
            <li key={event.key} style={{ position: "relative", padding: "0 0 18px 20px" }}>
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: -9,
                  top: 2,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "var(--portal-surface, #fff)",
                }}
              >
                {iconFor(event.icon)}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: "0.92rem" }}>{event.title}</strong>
                {event.status ? <ProposalStatusBadge status={event.status} /> : null}
              </div>
              <div style={{ color: "var(--portal-muted)", fontSize: "0.82rem", marginTop: 2 }}>
                {formatDocumentDate(event.at)}
                {event.detail ? ` · ${event.detail}` : ""}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
