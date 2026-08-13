import "server-only";

// Delivers proposal-lifecycle news to the owners: an in-app notification plus
// an email, from the three code paths that already know the event happened
// (the employee status change, the client's share-link decision, and the
// DocuSign webhook).
//
// BEST-EFFORT BY CONTRACT, exactly like acceptance-filing.ts. The business
// event is the status change; telling someone about it is a convenience. This
// module never throws and its failures must never turn a successful acceptance
// into a reported failure — a client who accepted has accepted whether or not
// the email left the building.
//
// Runs on the service-role client because two of the three callers have no
// session at all (an anonymous client holding a share token, and a webhook).
// Nothing here is caller-supplied: every value is read back from the proposal
// row, and the recipient list comes from user_roles, never from input.

import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, NOTIFICATION_FROM } from "@/lib/email/resend";
import { ProposalEventEmail } from "@/emails/proposal-event";
import { portalOwnerRoles } from "@/lib/user-management";
import {
  buildProposalNotificationContent,
  type ProposalEventContext,
  type ProposalEventKind,
} from "@/lib/proposals/notifications";

/** Same convention as the rest of the proposals module (see access.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/** Postgres unique_violation — the dedupe index doing its job. */
const UNIQUE_VIOLATION = "23505";

const EVENT_LABELS: Record<ProposalEventKind, string> = {
  submitted_for_review: "Awaiting approval",
  accepted: "Accepted",
  declined: "Declined",
};

function siteUrl(): string {
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, "")}`
    : null;

  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    productionUrl ||
    "https://reliancepredictivesafetytechnologies.com"
  ).replace(/\/$/, "");
}

export interface ProposalRecipient {
  userId: string;
  email: string | null;
}

/**
 * The owners — the only people who approve and send proposals, per the module's
 * maker-checker rules. Read from user_roles rather than a hardcoded list so a
 * future third owner is included the day their role is set.
 */
export async function loadProposalNotificationRecipients(db: LooseClient): Promise<ProposalRecipient[]> {
  const { data: roles } = await db
    .from("user_roles")
    .select("user_id")
    .in("role", [...portalOwnerRoles])
    .eq("account_status", "active");

  const userIds = [...new Set((roles ?? []).map((row: { user_id: string }) => row.user_id).filter(Boolean))];
  if (userIds.length === 0) return [];

  const { data: profiles } = await db
    .from("employee_profiles")
    .select("user_id, email")
    .in("user_id", userIds);

  const emailByUserId = new Map(
    (profiles ?? []).map((profile: { user_id: string; email: string | null }) => [profile.user_id, profile.email]),
  );

  return (userIds as string[]).map((userId) => ({
    userId,
    email: (emailByUserId.get(userId) as string | null) ?? null,
  }));
}

/**
 * Reads the quotable facts about a proposal back from the database.
 *
 * Callers pass an id and the few things only they know (who acted, why they
 * declined, which channel), rather than each widening its own select — two of
 * the three call sites run without a session and none of them should have to
 * learn the client-name join to send a notification.
 */
export async function loadProposalEventContext(
  db: LooseClient,
  proposalId: string,
  extra: Partial<ProposalEventContext> = {},
): Promise<ProposalEventContext | null> {
  const { data: proposal } = await db
    .from("client_proposals")
    .select("id, title, proposal_number, proposal_value, client_id, current_revision")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return null;

  let clientName: string | null = null;
  if (proposal.client_id) {
    const { data: client } = await db
      .from("company_clients")
      .select("name")
      .eq("id", proposal.client_id)
      .maybeSingle();
    clientName = (client?.name as string | null) ?? null;
  }

  return {
    proposalId,
    title: (proposal.title as string) || "Proposal",
    proposalNumber: (proposal.proposal_number as string | null) ?? null,
    proposalValue:
      proposal.proposal_value === null || proposal.proposal_value === undefined
        ? null
        : Number(proposal.proposal_value),
    clientName,
    revisionNumber: Number(proposal.current_revision ?? 1),
    ...extra,
  };
}

/**
 * Loads the context and delivers the event in one call, swallowing a missing
 * proposal. This is what the workflow call sites use.
 */
export async function notifyProposalEventById(
  kind: ProposalEventKind,
  proposalId: string,
  extra: Partial<ProposalEventContext> = {},
  options: { excludeUserId?: string | null } = {},
): Promise<NotifyProposalEventResult> {
  try {
    const db: LooseClient | null = createAdminClient();
    if (!db) return { ok: false, error: "Service-role credentials are not configured." };

    const context = await loadProposalEventContext(db, proposalId, extra);
    if (!context) return { ok: false, error: "Proposal not found." };

    return await notifyProposalEvent(kind, context, options);
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "Unexpected failure while sending proposal notifications.",
    };
  }
}

export interface NotifyProposalEventResult {
  ok: boolean;
  error?: string;
  notified?: number;
  emailed?: number;
}

export async function notifyProposalEvent(
  kind: ProposalEventKind,
  context: ProposalEventContext,
  options: { excludeUserId?: string | null } = {},
): Promise<NotifyProposalEventResult> {
  try {
    const db: LooseClient | null = createAdminClient();
    if (!db) return { ok: false, error: "Service-role credentials are not configured." };

    const content = buildProposalNotificationContent(kind, context);
    const recipients = (await loadProposalNotificationRecipients(db)).filter(
      // The person who just clicked the button does not need to be told what
      // they did. Only ever set for the employee-initiated paths — a share-link
      // or webhook event has no signed-in actor to exclude.
      (recipient) => recipient.userId !== options.excludeUserId,
    );
    if (recipients.length === 0) return { ok: true, notified: 0, emailed: 0 };

    let notified = 0;
    for (const recipient of recipients) {
      const { error } = await db.from("portal_notifications").insert({
        recipient_user_id: recipient.userId,
        title: content.title,
        body: content.body,
        priority: content.priority,
        source_type: "client_proposal",
        source_id: context.proposalId,
        action_href: content.actionHref,
        dedupe_key: content.dedupeKey,
      });
      // A duplicate means this news is already sitting unread in their inbox,
      // which is the outcome we wanted — not a failure to report.
      if (!error) notified += 1;
      else if (typeof error.code === "string" && error.code !== UNIQUE_VIOLATION) {
        return { ok: false, error: error.message, notified, emailed: 0 };
      }
    }

    let emailed = 0;
    const resend = getResendClient();
    if (resend) {
      const proposalUrl = `${siteUrl()}${content.actionHref}`;
      for (const recipient of recipients) {
        if (!recipient.email) continue;
        const { error } = await resend.emails.send({
          from: NOTIFICATION_FROM,
          to: recipient.email,
          subject: content.emailSubject,
          react: ProposalEventEmail({
            headline: content.title,
            message: content.body,
            proposalUrl,
            eventLabel: EVENT_LABELS[kind],
          }),
        });
        if (!error) emailed += 1;
      }
    }

    return { ok: true, notified, emailed };
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "Unexpected failure while sending proposal notifications.",
    };
  }
}
