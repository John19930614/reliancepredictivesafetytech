import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, FileText, PencilLine } from "lucide-react";
import { getProposalAccess } from "@/lib/proposals/access";
import { canEditProposalContent, isProposalUuid } from "@/lib/proposals/policy";
import { isGeneratorState, type GeneratorState } from "@/lib/proposals/generator-state";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import { ProposalDocument } from "@/components/proposals/ProposalDocument";
import {
  ProposalControlPanel,
  ProposalRevisionHistory,
  type WorkspaceProposal,
} from "@/components/proposals/ProposalWorkspace";
import { ProposalStatusBadge } from "@/components/proposals/ProposalStatusBadge";
import {
  ProposalReviewPanel,
  type ProposalApprovalSummary,
} from "@/components/proposals/ProposalReviewPanel";
import { ProposalAiReviewPanel } from "@/components/proposals/ProposalAiReviewPanel";
import { resolveApprovalState } from "@/lib/proposals/approval";
import { loadApprovalRecords } from "@/lib/proposals/approval-server";
import {
  ProposalSharePanel,
  type ShareLinkListItem,
  type ShareableRevision,
} from "@/components/proposals/ProposalSharePanel";
import {
  ProposalDocusignPanel,
  type ProposalDocusignEnvelope,
} from "@/components/proposals/ProposalDocusignPanel";
import {
  ProposalTimeline,
  type TimelineAcceptance,
  type TimelineShareLink,
} from "@/components/proposals/ProposalTimeline";
import { getDocusignConfigStatus } from "@/lib/docusign/config";
import { parseClientContacts } from "@/lib/proposals/client-contacts";
import { resolveDocumentExtras } from "@/lib/proposals/team-server";
import { canShareProposal } from "@/app/employee/proposals/share-link-policy";
import type { ProposalRevisionRow, ProposalStatus } from "@/lib/proposals/types";
import { ProposalPaymentsPanel } from "@/components/proposals/ProposalPaymentsPanel";
import { getStripeConfigStatus } from "@/lib/stripe/config";
import type { ScheduleInvoice } from "@/components/proposals/ProposalPaymentsInteractive";

/**
 * READ-ONLY document view. The generator lives on /edit, so the edit gate is
 * decided before any work is typed into an iframe that would refuse to save it.
 */
export default async function ProposalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locked?: string }>;
}) {
  const { id } = await params;
  const { locked } = await searchParams;
  const { supabase, canRead, canManage, isAdmin, canApprove } = await getProposalAccess();
  if (!supabase || !canRead) notFound();
  // A malformed uuid makes PostgREST raise 22P02; reject it before the query so
  // a junk URL is a clean 404 rather than a 500.
  if (!isProposalUuid(id)) notFound();

  const [{ data: proposal }, { data: revisions }, { data: clients }] = await Promise.all([
    supabase
      .from("client_proposals")
      .select(
        "id, client_id, title, status, owner, proposal_value, valid_until, summary, body_markdown, current_revision, form_data",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("client_proposal_revisions")
      .select(
        "id, proposal_id, revision_number, title, summary, body_markdown, change_note, status_at_save, form_data, created_at",
      )
      .eq("proposal_id", id)
      .order("revision_number", { ascending: false }),
    supabase.from("company_clients").select("id, name").order("name").limit(500),
  ]);

  if (!proposal) notFound();

  // ---------------------------------------------------------------------------
  // Share links + acceptance evidence.
  //
  // Queried SEPARATELY, with their errors tolerated rather than thrown. The
  // 20260804 migrations that add `client_proposal_share_links` and the
  // acceptance columns are written but not applied — CLAUDE.md gates migrations
  // behind staging rehearsal, a rollback plan and human sign-off, so a deploy
  // can legitimately reach production before them. Folding these columns into
  // the main select above would make PostgREST raise 42703 and take the whole
  // proposal page down until the migration lands. Instead the feature degrades:
  // the panel says it is unavailable and everything else keeps working.
  // ---------------------------------------------------------------------------
  const [acceptanceResult, shareLinkResult, docusignResult, invoiceResult] = await Promise.all([
    supabase
      .from("client_proposals")
      .select(
        "accepted_at, accepted_by_name, accepted_by_email, acceptance_ip, accepted_revision_id, declined_at, decline_reason",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("client_proposal_share_links")
      .select("id, revision_id, created_at, expires_at, revoked_at, first_viewed_at, last_viewed_at, view_count")
      .eq("proposal_id", id)
      .order("created_at", { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("client_proposal_docusign_envelopes")
      .select(
        "id, revision_id, envelope_id, status, recipient_name, recipient_email, sent_at, completed_at, completed_file_id",
      )
      .eq("proposal_id", id)
      .order("sent_at", { ascending: false }),
    // The Payments panel's own data — read here, alongside the panels above,
    // rather than inside that component: every panel on this page is fed by a
    // query the page itself runs (ProposalDocusignPanel, ProposalSharePanel),
    // and client_invoices has carried RLS/columns since 20260814120000, well
    // before this deploy, so no unapplied-migration tolerance is needed here.
    supabase
      .from("client_invoices")
      .select("id, invoice_number, kind, status, due_date, issue_date, total, currency")
      .eq("proposal_id", id)
      .order("created_at", { ascending: true }),
  ]);

  // Decision history. Read through the same tolerant helper the send gates use,
  // which returns [] on any error — a deploy that lands before the maker-checker
  // migration shows "Not reviewed yet" and refuses to send, rather than 500ing.
  const approvalState = resolveApprovalState(
    await loadApprovalRecords(supabase, id),
    Number(proposal.current_revision) || 1,
  );
  const approvalSummary: ProposalApprovalSummary = {
    decision: approvalState.latest?.decision ?? null,
    revisionNumber: approvalState.latest?.revisionNumber ?? null,
    note: approvalState.latest?.note ?? null,
    decidedAt: approvalState.latest?.decidedAt ?? null,
    currentRevisionApproved: approvalState.currentRevisionApproved,
    supersededByEdit: approvalState.supersededByEdit,
    lastApprovedRevision: approvalState.lastApproval?.revisionNumber ?? null,
  };

  const shareFeatureAvailable = !acceptanceResult.error && !shareLinkResult.error;
  const docusignAvailable = !docusignResult.error;
  const docusignConfig = getDocusignConfigStatus();
  const acceptanceRow = (acceptanceResult.data ?? null) as Record<string, unknown> | null;
  const shareLinkRows = (shareLinkResult.data ?? []) as Array<Record<string, unknown>>;
  const docusignRows = (docusignResult.data ?? []) as Array<Record<string, unknown>>;
  const invoiceRows = (invoiceResult.data ?? []) as Array<Record<string, unknown>>;

  const scheduleInvoices: ScheduleInvoice[] = invoiceRows.map((row) => ({
    id: String(row.id),
    invoiceNumber: (row.invoice_number ?? null) as string | null,
    kind: String(row.kind ?? "full"),
    status: String(row.status ?? "draft"),
    dueDate: (row.due_date ?? null) as string | null,
    total: Number(row.total ?? 0),
    currency: String(row.currency ?? "USD"),
  }));

  // The "what you're paying for" bullets on the summary card, sourced from the
  // NEXT DUE invoice's own line items — read in a second query rather than
  // folded into the batch above because it needs the invoice ids the first
  // query just returned. Skipped entirely when there is nothing to look up,
  // both because there is nothing to ask for and to keep this query out of
  // every proposal that has never been invoiced.
  let nextDueLineItems: string[] = [];
  if (scheduleInvoices.length > 0) {
    const dueCandidate =
      scheduleInvoices.find((invoice) => invoice.status === "issued") ??
      scheduleInvoices.find((invoice) => invoice.status === "draft") ??
      null;
    if (dueCandidate) {
      const { data: lineItems } = await supabase
        .from("client_invoice_line_items")
        .select("description")
        .eq("invoice_id", dueCandidate.id)
        .order("sort_order", { ascending: true });
      nextDueLineItems = ((lineItems ?? []) as Array<{ description?: string | null }>)
        .map((row) => (row.description ?? "").split("\n")[0].trim())
        .filter((line) => line.length > 0);
    }
  }

  const stripeStatus = getStripeConfigStatus();
  // The publishable key is public by definition (NEXT_PUBLIC_*) — read
  // directly rather than through getStripeConfig(), which throws when Stripe
  // is not fully configured and this page must still render either way.
  const stripePublishableKey = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();

  // The dropdown is capped, so make sure the company this proposal is actually
  // assigned to is always one of the options — otherwise the select would show
  // "Unassigned" and a stray change would silently detach the proposal.
  let clientOptions = (clients ?? []) as { id: string; name: string }[];
  if (proposal.client_id && !clientOptions.some((option) => option.id === proposal.client_id)) {
    const { data: assigned } = await supabase
      .from("company_clients")
      .select("id, name")
      .eq("id", proposal.client_id)
      .maybeSingle();
    if (assigned) clientOptions = [assigned as { id: string; name: string }, ...clientOptions];
  }

  const normalized: WorkspaceProposal = {
    id: proposal.id as string,
    client_id: (proposal.client_id ?? null) as string | null,
    title: proposal.title as string,
    status: proposal.status as ProposalStatus,
    owner: (proposal.owner ?? null) as string | null,
    proposal_value: proposal.proposal_value != null ? Number(proposal.proposal_value) : null,
    valid_until: (proposal.valid_until ?? null) as string | null,
    summary: (proposal.summary ?? null) as string | null,
    body_markdown: (proposal.body_markdown ?? null) as string | null,
    current_revision: Number(proposal.current_revision ?? 1),
    form_data: proposal.form_data ?? null,
  };

  // Never hand unvalidated JSON to the document renderer: a hand-edited row
  // should read as "nothing saved yet", not crash the page.
  const documentState: GeneratorState | null = isGeneratorState(normalized.form_data) ? normalized.form_data : null;
  const totals = documentState ? computeProposalTotals(documentState) : null;

  // Bios and the seller signature live outside form_data (they are profile data
  // that must stay current), so they are resolved per render. Both degrade to
  // empty if the 20260806 migration has not landed yet.
  const { team, signature } = await resolveDocumentExtras(
    documentState,
    (acceptanceRow?.accepted_at ?? null) as string | null,
  );

  const editGate = canEditProposalContent(normalized.status);
  const canEdit = canManage && editGate.ok;

  const revisionRows = (revisions ?? []) as ProposalRevisionRow[];
  const revisionNumberById = new Map(revisionRows.map((revision) => [revision.id, revision.revision_number]));

  // Newest first for the picker, so "share the latest" is the default choice.
  const shareableRevisions: ShareableRevision[] = revisionRows.map((revision) => ({
    id: revision.id,
    revision_number: revision.revision_number,
    hasContent: isGeneratorState(revision.form_data),
  }));

  const shareLinks: ShareLinkListItem[] = shareLinkRows.map((row) => ({
    id: String(row.id),
    revision_id: String(row.revision_id),
    revision_number: revisionNumberById.get(String(row.revision_id)) ?? null,
    expires_at: (row.expires_at ?? null) as string | null,
    revoked_at: (row.revoked_at ?? null) as string | null,
    first_viewed_at: (row.first_viewed_at ?? null) as string | null,
    last_viewed_at: (row.last_viewed_at ?? null) as string | null,
    view_count: Number(row.view_count ?? 0),
    created_at: (row.created_at ?? null) as string | null,
  }));

  const docusignEnvelopes: ProposalDocusignEnvelope[] = docusignRows.map((row) => ({
    id: String(row.id),
    revision_id: (row.revision_id ?? null) as string | null,
    revision_number: row.revision_id ? revisionNumberById.get(String(row.revision_id)) ?? null : null,
    envelope_id: String(row.envelope_id),
    status: String(row.status ?? "unknown"),
    recipient_name: String(row.recipient_name ?? ""),
    recipient_email: String(row.recipient_email ?? ""),
    sent_at: (row.sent_at ?? null) as string | null,
    completed_at: (row.completed_at ?? null) as string | null,
    completed_file_id: (row.completed_file_id ?? null) as string | null,
  }));

  const timelineLinks: TimelineShareLink[] = shareLinks.map((link) => ({
    id: link.id,
    revision_number: link.revision_number,
    created_at: link.created_at,
    first_viewed_at: link.first_viewed_at,
    last_viewed_at: link.last_viewed_at,
    view_count: link.view_count,
    revoked_at: link.revoked_at,
  }));

  const acceptedRevisionId = (acceptanceRow?.accepted_revision_id ?? null) as string | null;
  const acceptance: TimelineAcceptance | null = acceptanceRow
    ? {
        acceptedAt: (acceptanceRow.accepted_at ?? null) as string | null,
        acceptedByName: (acceptanceRow.accepted_by_name ?? null) as string | null,
        acceptedByEmail: (acceptanceRow.accepted_by_email ?? null) as string | null,
        acceptanceIp: (acceptanceRow.acceptance_ip ?? null) as string | null,
        acceptedRevisionNumber: acceptedRevisionId ? revisionNumberById.get(acceptedRevisionId) ?? null : null,
        declinedAt: (acceptanceRow.declined_at ?? null) as string | null,
        declineReason: (acceptanceRow.decline_reason ?? null) as string | null,
      }
    : null;

  const shareGate = canShareProposal(normalized.status);
  const primaryRecipient = documentState ? parseClientContacts(documentState.fields).find((contact) => contact.email) : null;

  const lockedMessage =
    locked === "permission"
      ? "You do not have permission to edit proposals, so the editor was not opened."
      : locked
        ? editGate.reason ?? "The editor is not available for this proposal."
        : null;

  return (
    <>
      <div className="portal-topline">
        <div>
          <Link href="/employee/proposals" className="button button-light" style={{ marginBottom: 8 }}>
            <ChevronLeft size={16} /> Back to proposals
          </Link>
          <div className="eyebrow">Proposals</div>
          <h1>{normalized.title}</h1>
          <p>
            Revision v{normalized.current_revision} · <ProposalStatusBadge status={normalized.status} />
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {/* Not the browser's Print dialog: that stamps the page URL into every
              page margin. This route generates the file itself. */}
          <a className="button button-light" href={`/employee/proposals/${normalized.id}/pdf`} download>
            <Download size={16} /> Download PDF
          </a>
          <a className="button button-light" href={`/employee/proposals/${normalized.id}/docx`} download>
            <FileText size={16} /> Download DOCX
          </a>
          {canEdit ? (
            <Link className="button button-primary" href={`/employee/proposals/${normalized.id}/edit`}>
              <PencilLine size={16} /> Edit in generator
            </Link>
          ) : null}
        </div>
      </div>

      {lockedMessage ? <div className="success-box portal-alert portal-alert-error">{lockedMessage}</div> : null}
      {!canEdit && !lockedMessage && canManage ? (
        <div className="success-box portal-alert">{editGate.reason}</div>
      ) : null}

      <div className="document-grid">
        <section>
          {documentState ? (
            <ProposalDocument
              state={documentState}
              totals={totals ?? undefined}
              team={team}
              signature={signature}
              proposal={{
                id: normalized.id,
                title: normalized.title,
                status: normalized.status,
                currentRevision: normalized.current_revision,
                validUntil: normalized.valid_until,
              }}
            />
          ) : (
            <div className="empty-state">
              This proposal has no saved generator content yet.
              {canEdit ? " Open the editor to build the document." : " Reopen it as a draft to build the document."}
            </div>
          )}
        </section>

        <ProposalReviewPanel
          proposalId={normalized.id}
          status={normalized.status}
          currentRevision={normalized.current_revision}
          canApprove={canApprove}
          approval={approvalSummary}
        />
        {/* Advisory AI review of the SAVED state — here rather than only in
            the editor so the approver deciding an in_review revision, and
            anyone looking back at a sent or accepted document, can ask for a
            second read. Findings only; nothing is applied. */}
        {canManage ? (
          <ProposalAiReviewPanel
            proposalId={normalized.id}
            status={normalized.status}
            state={documentState}
            validUntil={normalized.valid_until}
            clientAssigned={Boolean(normalized.client_id)}
          />
        ) : null}
        <ProposalControlPanel
          proposal={normalized}
          clients={clientOptions}
          isAdmin={isAdmin}
          canApprove={canApprove}
        />
      </div>

      <ProposalTimeline
        status={normalized.status}
        revisions={revisionRows.map((revision) => ({
          id: revision.id,
          revision_number: revision.revision_number,
          change_note: revision.change_note,
          status_at_save: revision.status_at_save,
          created_at: revision.created_at,
        }))}
        links={timelineLinks}
        acceptance={acceptance}
      />

      <ProposalSharePanel
        proposalId={normalized.id}
        revisions={shareableRevisions}
        links={shareLinks}
        canManage={canManage}
        shareGate={shareGate}
        available={shareFeatureAvailable}
      />

      <ProposalDocusignPanel
        proposalId={normalized.id}
        revisions={shareableRevisions}
        envelopes={docusignEnvelopes}
        canManage={canManage}
        available={docusignAvailable}
        configured={docusignConfig.configured}
        missing={docusignConfig.enabled ? docusignConfig.missing : ["DOCUSIGN_ENABLED"]}
        defaultRecipientName={primaryRecipient?.name ?? null}
        defaultRecipientEmail={primaryRecipient?.email ?? null}
      />

      {normalized.client_id ? (
        <ProposalPaymentsPanel
          clientId={normalized.client_id}
          invoices={scheduleInvoices}
          nextDueLineItems={nextDueLineItems}
          proposalId={normalized.id}
          proposalSummary={normalized.summary}
          proposalTitle={normalized.title}
          stripeConfigured={stripeStatus.configured}
          stripePublishableKey={stripePublishableKey}
        />
      ) : null}

      <div style={{ marginTop: 20 }}>
        <ProposalRevisionHistory
          proposalId={normalized.id}
          status={normalized.status}
          currentRevision={normalized.current_revision}
          currentState={documentState}
          revisions={revisionRows}
        />
      </div>
    </>
  );
}
