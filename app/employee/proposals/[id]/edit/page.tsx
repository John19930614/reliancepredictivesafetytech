import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProposalAccess } from "@/lib/proposals/access";
import { canEditProposalContent, isProposalUuid } from "@/lib/proposals/policy";
import {
  ProposalWorkspace,
  type WorkspaceClientDetail,
  type WorkspaceProposal,
} from "@/components/proposals/ProposalWorkspace";
import { loadTeamRoster } from "@/lib/proposals/team-server";
import type { ProposalStatus } from "@/lib/proposals/types";

/**
 * The generator editor.
 *
 * The gate is re-checked HERE, server-side, on every load: hiding the "Edit"
 * button on the document view is a convenience, not a control, and a bookmarked
 * /edit URL for an accepted proposal must not open an editor that will refuse
 * the save twenty minutes later.
 */
export default async function ProposalEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, canRead, canManage } = await getProposalAccess();
  if (!supabase || !canRead) notFound();
  if (!isProposalUuid(id)) notFound();

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select(
      "id, client_id, title, status, owner, proposal_value, valid_until, summary, body_markdown, current_revision, form_data",
    )
    .eq("id", id)
    .maybeSingle();

  if (!proposal) notFound();

  const status = proposal.status as ProposalStatus;
  if (!canManage) redirect(`/employee/proposals/${id}?locked=permission`);
  if (!canEditProposalContent(status).ok) redirect(`/employee/proposals/${id}?locked=status`);

  let assignedClient: WorkspaceClientDetail | null = null;
  if (proposal.client_id) {
    const { data: clientRow } = await supabase
      .from("company_clients")
      .select("name, contact_name, email")
      .eq("id", proposal.client_id)
      .maybeSingle();
    if (clientRow) {
      assignedClient = {
        name: (clientRow.name ?? null) as string | null,
        contact_name: (clientRow.contact_name ?? null) as string | null,
        email: (clientRow.email ?? null) as string | null,
      };
    }
  }

  // Read with the caller's own client so the roster obeys the bios table's RLS.
  // Returns [] if the 20260806 migration has not been applied here yet, and the
  // picker then explains how to publish a bio rather than erroring.
  const roster = await loadTeamRoster(supabase);

  const normalized: WorkspaceProposal = {
    id: proposal.id as string,
    client_id: (proposal.client_id ?? null) as string | null,
    title: proposal.title as string,
    status,
    owner: (proposal.owner ?? null) as string | null,
    proposal_value: proposal.proposal_value != null ? Number(proposal.proposal_value) : null,
    valid_until: (proposal.valid_until ?? null) as string | null,
    summary: (proposal.summary ?? null) as string | null,
    body_markdown: (proposal.body_markdown ?? null) as string | null,
    current_revision: Number(proposal.current_revision ?? 1),
    form_data: proposal.form_data ?? null,
  };

  return (
    <>
      <div className="portal-topline">
        <div>
          <Link href={`/employee/proposals/${normalized.id}`} className="button button-light" style={{ marginBottom: 8 }}>
            <ChevronLeft size={16} /> Back to the document
          </Link>
          <div className="eyebrow">Proposals</div>
          <h1>{normalized.title}</h1>
          <p>Build the proposal in the generator. Edits autosave to the working copy; revisions are explicit.</p>
        </div>
      </div>

      <ProposalWorkspace proposal={normalized} assignedClient={assignedClient} roster={roster} />
    </>
  );
}
