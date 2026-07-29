import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProposalAccess } from "@/lib/proposals/access";
import { ProposalWorkspace, type WorkspaceProposal } from "@/components/proposals/ProposalWorkspace";
import type { ProposalRevisionRow, ProposalStatus } from "@/lib/proposals/types";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, isAdmin } = await getProposalAccess();
  if (!supabase) notFound();

  const [{ data: proposal }, { data: revisions }, { data: clients }] = await Promise.all([
    supabase
      .from("client_proposals")
      .select("id, client_id, title, status, owner, proposal_value, valid_until, summary, body_markdown, current_revision")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("client_proposal_revisions")
      .select("id, proposal_id, revision_number, title, summary, body_markdown, change_note, status_at_save, created_at")
      .eq("proposal_id", id)
      .order("revision_number", { ascending: false }),
    supabase.from("company_clients").select("id, name").order("name"),
  ]);

  if (!proposal) notFound();

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
  };

  return (
    <>
      <div className="portal-topline">
        <div>
          <Link href="/employee/proposals" className="button button-light" style={{ marginBottom: 8 }}>
            <ChevronLeft size={16} /> Back to proposals
          </Link>
          <div className="eyebrow">Proposals</div>
          <h1>{normalized.title}</h1>
          <p>Edit the proposal, assign it to a company, and track every revision.</p>
        </div>
      </div>

      <ProposalWorkspace
        proposal={normalized}
        revisions={(revisions ?? []) as ProposalRevisionRow[]}
        clients={(clients ?? []) as { id: string; name: string }[]}
        isAdmin={isAdmin}
      />
    </>
  );
}
