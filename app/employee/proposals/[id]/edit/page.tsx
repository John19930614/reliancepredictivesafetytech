import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProposalAccess } from "@/lib/proposals/access";
import { canEditProposalContent, isProposalUuid } from "@/lib/proposals/policy";
import { ProposalWorkspace, type WorkspaceProposal } from "@/components/proposals/ProposalWorkspace";
import { loadTeamRoster } from "@/lib/proposals/team-server";
import {
  loadClientCompanyDetail,
  loadCompanyProfile,
  loadPreparedByName,
} from "@/lib/proposals/company-server";
import type { ProposalStatus } from "@/lib/proposals/types";

/**
 * Today's calendar date in the company's own timezone, as `YYYY-MM-DD`.
 *
 * NOT `new Date().toISOString().slice(0, 10)`: UTC is ahead of US Central, so
 * a proposal started at 7pm on the 9th would open dated the 10th. The document
 * formats calendar dates by parsing the string parts precisely to avoid this
 * class of shift, and the prefill has to hand it a date that was correct to
 * begin with. `en-CA` is the locale whose short date format is ISO order.
 */
function todayInCompanyTimezone(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

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
  const { supabase, canRead, canManage, userId } = await getProposalAccess();
  if (!supabase || !canRead) notFound();
  if (!isProposalUuid(id)) notFound();

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select(
      "id, client_id, title, status, owner, proposal_value, valid_until, summary, body_markdown, current_revision, form_data, proposal_number",
    )
    .eq("id", id)
    .maybeSingle();

  if (!proposal) notFound();

  const status = proposal.status as ProposalStatus;
  if (!canManage) redirect(`/employee/proposals/${id}?locked=permission`);
  if (!canEditProposalContent(status).ok) redirect(`/employee/proposals/${id}?locked=status`);

  // Everything the editor can fill in for the seller before they type a word.
  // All four reads go out together: they are independent, and the editor route
  // is already the slowest page in the module.
  //
  // Each loader degrades to an empty result rather than throwing, so an
  // environment where the 20260809 migrations have not been applied opens a
  // working editor with an empty company panel instead of a 500.
  const [clientCompany, companyProfile, preparedByName, roster] = await Promise.all([
    loadClientCompanyDetail(supabase, proposal.client_id as string | null),
    loadCompanyProfile(supabase),
    loadPreparedByName(supabase, userId),
    // Read with the caller's own client so the roster obeys the bios table's
    // RLS. Returns [] if the 20260806 migration has not been applied here yet,
    // and the picker then explains how to publish a bio rather than erroring.
    loadTeamRoster(supabase),
  ]);

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
    proposal_number: (proposal.proposal_number ?? null) as string | null,
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

      <ProposalWorkspace
        proposal={normalized}
        clientCompany={clientCompany}
        companyProfile={companyProfile}
        roster={roster}
        prefill={{
          company: clientCompany,
          companyProfile,
          preparedBy: preparedByName,
          proposalNumber: normalized.proposal_number,
          today: todayInCompanyTimezone(),
        }}
      />
    </>
  );
}
