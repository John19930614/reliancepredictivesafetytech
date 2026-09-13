import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, FileText, PencilLine } from "lucide-react";
import { getProposalAccess } from "@/lib/proposals/access";
import { getInvoiceAccess } from "@/lib/invoices/access";
import { invoiceKindLabel, invoiceStatusLabel } from "@/lib/invoices/invoice";
import {
  GenerateInvoiceButton,
  type ProposalInvoiceLine,
  type ProposalInvoiceTotals,
} from "@/components/invoices/GenerateInvoiceButton";
import { buildProposalBillingSummary, roundInvoiceMoney } from "@/lib/invoices/proposal-billing";
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
  ProposalSignatureLedger,
  type ProposalSignatureRow,
} from "@/components/proposals/ProposalSignatureLedger";
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

  const [{ data: proposal }, { data: revisions }, { data: clients }, invoiceAccess] = await Promise.all([
    supabase
      .from("client_proposals")
      .select(
        "id, client_id, title, proposal_number, status, owner, proposal_value, valid_until, summary, body_markdown, current_revision, form_data",
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
    getInvoiceAccess(),
  ]);

  if (!proposal) notFound();

  // getSessionContext() is request-memoized; invoice access starts alongside
  // the proposal reads so its two finance-specific queries do not create a
  // second page-load waterfall.
  const proposalInvoiceResult = invoiceAccess.canSeeMoney
    ? await supabase
        .from("client_invoices")
        .select("id, invoice_number, status, kind, subtotal, tax_amount, total, currency")
        .eq("proposal_id", id)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  const proposalInvoices = proposalInvoiceResult.data ?? [];

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
  const [acceptanceResult, signatureResult, shareLinkResult, docusignResult] = await Promise.all([
    supabase
      .from("client_proposals")
      .select(
        "accepted_at, accepted_by_name, accepted_by_email, acceptance_ip, accepted_revision_id, declined_at, decline_reason",
      )
      .eq("id", id)
      .maybeSingle(),
    // The append-only signature ledger. Same degrade-gracefully treatment as the
    // panels above: if the migration has not landed the panel simply does not
    // render, rather than taking the page down.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("client_proposal_signatures")
      .select("id, signed_at, signer_name, signer_email, proposal_number, proposal_title, proposal_value, revision_id")
      .eq("proposal_id", id)
      .order("signed_at", { ascending: false }),
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
  const acceptedRevisionId = (acceptanceRow?.accepted_revision_id ?? null) as string | null;
  const shareLinkRows = (shareLinkResult.data ?? []) as Array<Record<string, unknown>>;
  const docusignRows = (docusignResult.data ?? []) as Array<Record<string, unknown>>;

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
    proposal_number: (proposal.proposal_number ?? null) as string | null,
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

  let invoiceGenerationLines: ProposalInvoiceLine[] | null = null;
  let invoiceGenerationTotals: ProposalInvoiceTotals | undefined;
  let invoiceGenerationUnavailableReason: string | null = null;
  if (invoiceAccess.canSeeMoney) {
    const acceptedRevision = acceptedRevisionId
      ? revisionRows.find((revision) => revision.id === acceptedRevisionId) ?? null
      : null;
    if (acceptanceResult.error) {
      invoiceGenerationUnavailableReason = "Invoice generation is unavailable until the accepted-revision migration is applied.";
    } else if (!acceptedRevisionId) {
      invoiceGenerationUnavailableReason = "Accept a proposal revision before generating an invoice.";
    } else if (!acceptedRevision || !isGeneratorState(acceptedRevision.form_data)) {
      invoiceGenerationUnavailableReason = "The accepted revision has no billable fee table.";
    } else if (proposalInvoiceResult.error) {
      invoiceGenerationUnavailableReason = "Existing invoice allocations could not be checked. Refresh and try again.";
    } else {
      const activeInvoices = (proposalInvoices as Array<{ id: string; status: string; tax_amount?: number | string | null }>).filter(
        (invoice) => invoice.status !== "void",
      );
      const activeInvoiceIds = activeInvoices.map((invoice) => invoice.id);
      let committedRows: Array<{ invoice_id: string; source_proposal_line_key: string; quantity: number | string }> = [];
      let provenanceError: { message?: string } | null = null;

      if (activeInvoiceIds.length > 0) {
        // Kept separate and loose-typed so the rest of the proposal page still
        // works while the new provenance migration is staged but not applied.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (supabase as any)
          .from("client_invoice_line_items")
          .select("invoice_id, source_proposal_line_key, quantity")
          .in("invoice_id", activeInvoiceIds)
          .not("source_proposal_line_key", "is", null);
        committedRows = ((result.data ?? []) as typeof committedRows).filter((row) =>
          row.source_proposal_line_key.startsWith(`${acceptedRevisionId}:`),
        );
        provenanceError = result.error;
      } else {
        // Feature probe: without existing invoices there is nothing to filter,
        // but the button still must stay disabled until the provenance columns
        // and atomic RPC have reached the database.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (supabase as any)
          .from("client_invoice_line_items")
          .select("source_proposal_line_key")
          .limit(1);
        provenanceError = result.error;
      }

      if (provenanceError) {
        invoiceGenerationUnavailableReason = "Selected-line billing is unavailable until its database migration is applied.";
      } else {
        const trackedInvoiceIds = new Set(committedRows.map((row) => row.invoice_id));
        const committedTax = roundInvoiceMoney(
          activeInvoices.reduce(
            (sum, invoice) => sum + (trackedInvoiceIds.has(invoice.id) ? Number(invoice.tax_amount ?? 0) : 0),
            0,
          ),
        );
        const billing = buildProposalBillingSummary(
          acceptedRevisionId,
          computeProposalTotals(acceptedRevision.form_data),
          committedRows.map((row) => ({ lineKey: row.source_proposal_line_key, quantity: row.quantity })),
          committedTax,
        );
        invoiceGenerationLines = billing.lines.map((line) => ({
          lineKey: line.lineKey,
          description: line.name || line.description || `Proposal line ${line.lineOrder + 1}`,
          unit: line.unit,
          proposedQuantity: line.proposedQuantity,
          committedQuantity: line.committedQuantity,
          remainingQuantity: line.remainingQuantity,
          unitAmount: line.approvedUnitAmount,
        }));
        invoiceGenerationTotals = {
          proposedSubtotal: billing.proposedSubtotal,
          proposedTax: billing.proposedTax,
          remainingTax: billing.remainingTax,
        };
      }
    }
  }

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

  // Revision numbers for the ledger, resolved the same way the timeline does it.
  const signatures: ProposalSignatureRow[] = signatureResult.error
    ? []
    : ((signatureResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: row.id as string,
        signedAt: (row.signed_at ?? null) as string | null,
        signerName: (row.signer_name ?? null) as string | null,
        signerEmail: (row.signer_email ?? null) as string | null,
        proposalNumber: (row.proposal_number ?? null) as string | null,
        proposalTitle: (row.proposal_title ?? null) as string | null,
        proposalValue: row.proposal_value != null ? Number(row.proposal_value) : null,
        revisionNumber: row.revision_id ? revisionNumberById.get(row.revision_id as string) ?? null : null,
      }));

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
          {invoiceAccess.canSeeMoney && invoiceGenerationLines ? (
            <GenerateInvoiceButton
              proposalId={normalized.id}
              lines={invoiceGenerationLines}
              totals={invoiceGenerationTotals}
            />
          ) : invoiceAccess.canSeeMoney ? (
            <button type="button" className="button button-light" disabled title={invoiceGenerationUnavailableReason ?? undefined}>
              Generate invoice
            </button>
          ) : null}
        </div>
      </div>

      {invoiceAccess.canSeeMoney && invoiceGenerationUnavailableReason ? (
        <div className="success-box portal-alert">{invoiceGenerationUnavailableReason}</div>
      ) : null}

      {invoiceAccess.canSeeMoney && proposalInvoices.length > 0 ? (
        <p style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "var(--portal-muted)" }}>Invoices:</span>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {proposalInvoices.map((invoice: any) => (
            <Link key={invoice.id} className="grant-pill" href={`/employee/invoices/${invoice.id}`}>
              {invoice.invoice_number ?? "Draft"} · {invoiceKindLabel(invoice.kind)} ·{" "}
              {Number(invoice.total ?? 0).toLocaleString("en-US", {
                style: "currency",
                currency: invoice.currency ?? "USD",
                maximumFractionDigits: 2,
              })}{" "}
              · {invoiceStatusLabel(invoice.status)}
            </Link>
          ))}
        </p>
      ) : null}

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
                proposalNumber: normalized.proposal_number ?? null,
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

      <ProposalSignatureLedger signatures={signatures} currentRevision={normalized.current_revision} />

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
