// What an owner is told when a proposal moves, and how often.
//
// Pure content only — no Supabase, no Resend — so the wording, the priority and
// (most importantly) the dedupe key are unit-testable. The IO half lives in
// notifications-server.ts, matching the split this module already uses for
// approval / approval-server and share-link-policy / share-link-server.
//
// WHY THIS EXISTS: submit-for-review, client acceptance and client decline were
// all silent. The maker-checker handoff and the two events that decide whether
// the company gets paid reached nobody, so the only way to learn a deal had
// closed was to reopen the proposals list.

/** Every proposal moment worth interrupting an owner for. */
export type ProposalEventKind =
  | "submitted_for_review"
  | "accepted"
  | "declined";

export interface ProposalEventContext {
  proposalId: string;
  title: string;
  /** Human-facing reference ("PRO-0042"), when the proposal has one. */
  proposalNumber?: string | null;
  clientName?: string | null;
  /** Recomputed server-side on every save, so it is safe to quote. */
  proposalValue?: number | null;
  revisionNumber?: number | null;
  /** Who accepted or declined — a client name for share-link/DocuSign events. */
  actorName?: string | null;
  /** The client's stated reason, for declines. */
  declineReason?: string | null;
  /**
   * Distinguishes the same outcome arriving by different routes, so a DocuSign
   * completion and a share-link acceptance of the same proposal do not collapse
   * into one another via the dedupe index.
   */
  channel?: "employee" | "share_link" | "docusign";
}

export interface ProposalNotificationContent {
  title: string;
  body: string;
  priority: "low" | "medium" | "high" | "critical";
  actionHref: string;
  /**
   * Guards the unique index on (recipient_user_id, dedupe_key) for non-archived
   * rows. Keyed by proposal + event + channel and NOT by timestamp: a webhook
   * that redelivers, or a retry of the same acceptance, must not stack a second
   * copy of the same news. A proposal legitimately re-sent and re-accepted is a
   * new round whose earlier notification has been read (and so archived) by
   * then; keeping the key stable is the safer failure.
   */
  dedupeKey: string;
  /** Subject line for the email carrying the same news. */
  emailSubject: string;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** "$48,000", or null when the proposal carries no computed value. */
export function formatProposalValue(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return currency.format(value);
}

/** "PRO-0042 — Acme Corp", degrading to whichever parts exist. */
function describeProposal(context: ProposalEventContext): string {
  const parts = [context.proposalNumber?.trim(), context.title?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  return parts.join(" — ") || "Proposal";
}

function clientSuffix(context: ProposalEventContext): string {
  const client = context.clientName?.trim();
  return client ? ` for ${client}` : "";
}

export function buildProposalNotificationContent(
  kind: ProposalEventKind,
  context: ProposalEventContext,
): ProposalNotificationContent {
  const reference = describeProposal(context);
  const actionHref = `/employee/proposals/${context.proposalId}`;
  const channel = context.channel ?? "employee";
  const dedupeKey = `proposal-${kind}-${channel}-${context.proposalId}`;
  const value = formatProposalValue(context.proposalValue);
  const actor = context.actorName?.trim();

  if (kind === "submitted_for_review") {
    const revision = context.revisionNumber ? ` (v${context.revisionNumber})` : "";
    return {
      title: "Proposal ready for your review",
      body: `${reference}${clientSuffix(context)}${revision} is waiting for approval before it can be sent.`,
      // The maker cannot send without this; anything lower and the approval sits.
      priority: "high",
      actionHref,
      dedupeKey,
      emailSubject: `Review needed: ${reference}`,
    };
  }

  if (kind === "accepted") {
    const who = actor ? `${actor} accepted` : "The client accepted";
    const worth = value ? ` Value: ${value}.` : "";
    return {
      title: value ? `Proposal accepted — ${value}` : "Proposal accepted",
      body: `${who} ${reference}${clientSuffix(context)}.${worth}`,
      priority: "critical",
      actionHref,
      dedupeKey,
      emailSubject: `Accepted: ${reference}`,
    };
  }

  const who = actor ? `${actor} declined` : "The client declined";
  const reason = context.declineReason?.trim();
  return {
    title: "Proposal declined",
    body: `${who} ${reference}${clientSuffix(context)}.${reason ? ` Reason: ${reason}` : ""}`,
    // Losing is not an emergency, but it is the input to every follow-up.
    priority: "high",
    actionHref,
    dedupeKey,
    emailSubject: `Declined: ${reference}`,
  };
}
