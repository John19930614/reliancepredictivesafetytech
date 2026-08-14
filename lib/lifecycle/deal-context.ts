import "server-only";

// What steps 7-10 run on: the proposal, its review, the paperwork and the money.
//
// None of this is new machinery. client_proposals already has revisions, a
// maker-checker approval gate, revision-bound share links and DocuSign
// envelopes; company_legal_issues already tracks the legal review; and
// client_invoices already bills the deposit. This module gathers them for one
// opportunity so the lifecycle shows the real records rather than a second copy.
//
// Every read is bounded and tolerant of a missing relation — the lifecycle
// migrations may legitimately land after a deploy.

import { legalIssueStatuses } from "@/lib/company-data";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

const proposalLimit = 20;
const approvalLimit = 20;
const shareLinkLimit = 20;
const envelopeLimit = 10;
const invoiceLimit = 20;
const legalLimit = 20;

export interface DealProposal {
  id: string;
  title: string;
  proposal_number: string | null;
  status: string;
  proposal_value: number | null;
  valid_until: string | null;
  current_revision: number;
  accepted_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  opportunity_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealApproval {
  id: string;
  proposal_id: string;
  revision_number: number;
  decision: string;
  note: string | null;
  decided_at: string;
}

export interface DealShareLink {
  id: string;
  proposal_id: string;
  expires_at: string;
  revoked_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
}

export interface DealEnvelope {
  id: string;
  proposal_id: string;
  envelope_id: string;
  status: string;
  recipient_name: string | null;
  recipient_email: string | null;
  sent_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  voided_at: string | null;
  completed_file_id: string | null;
}

export interface DealInvoice {
  id: string;
  invoice_number: string;
  status: string;
  kind: string;
  total: number;
  currency: string;
  issue_date: string | null;
  due_date: string | null;
}

export interface DealLegalIssue {
  id: string;
  title: string;
  severity: string;
  status: string;
  owner: string | null;
  due_date: string | null;
}

export interface DealContext {
  /** Proposals linked to this opportunity, newest first. */
  proposals: DealProposal[];
  /** Proposals for the same company that are NOT linked to any opportunity. */
  linkable: DealProposal[];
  approvals: DealApproval[];
  shareLinks: DealShareLink[];
  envelopes: DealEnvelope[];
  invoices: DealInvoice[];
  legalIssues: DealLegalIssue[];
  /** True when client_proposals has no opportunity_id column yet. */
  linkUnavailable: boolean;
}

/** What steps 1-6 render with: the deal panels read it but never ask for it. */
export const emptyDealContext: DealContext = {
  proposals: [],
  linkable: [],
  approvals: [],
  shareLinks: [],
  envelopes: [],
  invoices: [],
  legalIssues: [],
  linkUnavailable: false,
};

/**
 * Reads one list. Throws unless the caller explicitly tolerates the failure.
 *
 * `tolerateMissing` is set on exactly ONE read — the opportunity_id probe, whose
 * column legitimately does not exist until this feature's migration lands.
 *
 * Everywhere else this throws, including on a missing relation. PGRST205 is
 * "could not find the table in the schema cache", which after a deploy usually
 * means a stale cache rather than an absent table — and swallowing it would
 * render "No approval decision recorded" over a proposal that was in fact
 * approved. A false statement about a maker-checker gate, made in the one place
 * somebody checks it, is worse than an error boundary.
 */
async function readList<T>(query: unknown, tolerateMissing = false): Promise<{ rows: T[]; missing: boolean }> {
  const result = (await query) as { data?: unknown; error?: unknown };
  const error = (result?.error ?? null) as { code?: string; message?: string } | null;
  if (error) {
    // 42703 is "column does not exist" — the pre-migration case for
    // opportunity_id specifically.
    if (tolerateMissing && (isMissingSchemaRelationError(error) || error.code === "42703")) {
      return { rows: [], missing: true };
    }
    throw new Error(error.message ?? "Could not read the deal context.");
  }
  return { rows: Array.isArray(result?.data) ? (result.data as T[]) : [], missing: false };
}

const proposalColumns =
  "id, title, proposal_number, status, proposal_value, valid_until, current_revision, " +
  "accepted_at, declined_at, decline_reason, opportunity_id, created_at, updated_at";

/**
 * Loads everything steps 7-10 render for one opportunity.
 *
 * `clientId` is what finds proposals that could still be linked; without a
 * company on the opportunity there is nothing to offer, which is itself the
 * honest state at step 7 for a deal nobody has attached to an account yet.
 */
export async function loadDealContext(
  supabase: LooseClient,
  opportunityId: string,
  clientId: string | null,
): Promise<DealContext> {
  const linked = await readList<DealProposal>(
    supabase
      .from("client_proposals")
      .select(proposalColumns)
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: false })
      .limit(proposalLimit),
    true,
  );

  if (linked.missing) {
    // Pre-migration: the column is not there, so nothing can be linked yet.
    return { ...emptyDealContext, linkUnavailable: true };
  }

  const proposals = linked.rows;
  const proposalIds = proposals.map((proposal) => proposal.id);

  const [linkable, approvals, shareLinks, envelopes, invoices, legalIssues] = await Promise.all([
    clientId
      ? readList<DealProposal>(
          supabase
            .from("client_proposals")
            .select(proposalColumns)
            .eq("client_id", clientId)
            .is("opportunity_id", null)
            .order("created_at", { ascending: false })
            .limit(proposalLimit),
        )
      : Promise.resolve({ rows: [] as DealProposal[], missing: false }),

    proposalIds.length > 0
      ? readList<DealApproval>(
          supabase
            .from("client_proposal_approvals")
            .select("id, proposal_id, revision_number, decision, note, decided_at")
            .in("proposal_id", proposalIds)
            .order("decided_at", { ascending: false })
            .limit(approvalLimit),
        )
      : Promise.resolve({ rows: [] as DealApproval[], missing: false }),

    proposalIds.length > 0
      ? readList<DealShareLink>(
          supabase
            .from("client_proposal_share_links")
            .select("id, proposal_id, expires_at, revoked_at, first_viewed_at, last_viewed_at, view_count")
            .in("proposal_id", proposalIds)
            .order("created_at", { ascending: false })
            .limit(shareLinkLimit),
        )
      : Promise.resolve({ rows: [] as DealShareLink[], missing: false }),

    proposalIds.length > 0
      ? readList<DealEnvelope>(
          supabase
            .from("client_proposal_docusign_envelopes")
            .select(
              "id, proposal_id, envelope_id, status, recipient_name, recipient_email, sent_at, completed_at, declined_at, voided_at, completed_file_id",
            )
            .in("proposal_id", proposalIds)
            .order("sent_at", { ascending: false })
            .limit(envelopeLimit),
        )
      : Promise.resolve({ rows: [] as DealEnvelope[], missing: false }),

    proposalIds.length > 0
      ? readList<DealInvoice>(
          supabase
            .from("client_invoices")
            .select("id, invoice_number, status, kind, total, currency, issue_date, due_date")
            .in("proposal_id", proposalIds)
            .order("created_at", { ascending: false })
            .limit(invoiceLimit),
        )
      : Promise.resolve({ rows: [] as DealInvoice[], missing: false }),

    clientId
      ? readList<DealLegalIssue>(
          supabase
            .from("company_legal_issues")
            .select("id, title, severity, status, owner, due_date")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false })
            .limit(legalLimit),
        )
      : Promise.resolve({ rows: [] as DealLegalIssue[], missing: false }),
  ]);

  return {
    proposals,
    linkable: linkable.rows,
    approvals: approvals.rows,
    shareLinks: shareLinks.rows,
    envelopes: envelopes.rows,
    invoices: invoices.rows,
    legalIssues: legalIssues.rows,
    linkUnavailable: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Derived state                                                              */
/* -------------------------------------------------------------------------- */

/** Proposal statuses that mean the document has reached the client. */
const DELIVERED = new Set(["sent", "accepted", "declined"]);

/** The proposal a lifecycle screen should lead with: accepted, else newest. */
export function leadProposal(proposals: readonly DealProposal[]): DealProposal | null {
  return proposals.find((proposal) => proposal.status === "accepted") ?? proposals[0] ?? null;
}

export function hasDeliveredProposal(proposals: readonly DealProposal[]): boolean {
  return proposals.some((proposal) => DELIVERED.has(proposal.status));
}

export function acceptedProposal(proposals: readonly DealProposal[]): DealProposal | null {
  return proposals.find((proposal) => proposal.status === "accepted") ?? null;
}

/**
 * The two terminal values from `legalIssueStatuses`. Named against that list so
 * a rename in the legal register fails the typecheck here rather than quietly
 * turning every closed issue back into a blocker on step 9.
 */
const settledLegalStatuses = new Set<(typeof legalIssueStatuses)[number]>(["Resolved", "Closed"]);

/** Open legal issues, which is what step 9 actually cares about. */
export function openLegalIssues(issues: readonly DealLegalIssue[]): DealLegalIssue[] {
  return issues.filter((issue) => !settledLegalStatuses.has(issue.status as (typeof legalIssueStatuses)[number]));
}

export interface SignatureState {
  /** The newest envelope, whatever its state. */
  latest: DealEnvelope | null;
  sent: boolean;
  completed: boolean;
  /** Declined or voided — the envelope needs re-sending. */
  stalled: boolean;
}

export function signatureState(envelopes: readonly DealEnvelope[]): SignatureState {
  const latest = envelopes[0] ?? null;
  return {
    latest,
    sent: Boolean(latest && latest.sent_at),
    completed: Boolean(latest && latest.status === "completed"),
    stalled: Boolean(latest && (latest.status === "declined" || latest.status === "voided")),
  };
}

/** Whether anything has actually been billed on this deal. */
export function billedInvoices(invoices: readonly DealInvoice[]): DealInvoice[] {
  return invoices.filter((invoice) => invoice.status === "issued" || invoice.status === "paid");
}
