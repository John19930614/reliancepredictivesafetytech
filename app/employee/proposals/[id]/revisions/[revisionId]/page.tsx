import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, FileText } from "lucide-react";
import { ProposalDocument } from "@/components/proposals/ProposalDocument";
import { formatDocumentDate } from "@/components/proposals/proposal-document-model";
import { getProposalAccess } from "@/lib/proposals/access";
import { isGeneratorState } from "@/lib/proposals/generator-state";
import { isProposalUuid } from "@/lib/proposals/policy";
import { resolveDocumentExtras } from "@/lib/proposals/team-server";
import type { ProposalStatus } from "@/lib/proposals/types";

/**
 * Read-only render of a single saved revision.
 *
 * The revision is looked up by BOTH `proposal_id` and `id`: a revision id alone
 * would let anyone who learns one uuid render it under an arbitrary proposal's
 * heading, and the URL's proposal is what the reader believes they are looking
 * at. RLS still gates the read; this scoping stops a valid-but-unrelated id from
 * being displayed as this proposal's history.
 */
export default async function ProposalRevisionPage({
  params,
}: {
  params: Promise<{ id: string; revisionId: string }>;
}) {
  const { id, revisionId } = await params;
  const { supabase, canRead } = await getProposalAccess();
  if (!supabase || !canRead) notFound();

  // A malformed uuid makes PostgREST raise 22P02; reject it before the query so
  // a junk URL is a clean 404 rather than a 500.
  if (!isProposalUuid(id) || !isProposalUuid(revisionId)) notFound();

  const [{ data: proposal }, { data: revision }] = await Promise.all([
    supabase
      .from("client_proposals")
      .select("id, title, status, valid_until, current_revision")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("client_proposal_revisions")
      .select("id, proposal_id, revision_number, title, change_note, status_at_save, form_data, created_at")
      .eq("proposal_id", id)
      .eq("id", revisionId)
      .maybeSingle(),
  ]);

  if (!proposal || !revision) notFound();

  const revisionNumber = Number(revision.revision_number ?? 0);
  const subject = {
    id: proposal.id as string,
    title: (revision.title as string) || (proposal.title as string),
    status: proposal.status as ProposalStatus,
    currentRevision: Number(proposal.current_revision ?? 1),
    validUntil: (proposal.valid_until ?? null) as string | null,
  };

  const state = isGeneratorState(revision.form_data) ? revision.form_data : null;
  // Bios and the signature are resolved live rather than snapshotted into the
  // revision: they are profile data, and a stale headshot-era bio on an old
  // revision would be a worse record than the current one.
  const { team, signature } = await resolveDocumentExtras(state);

  return (
    <>
      <div className="portal-topline rp-doc-noprint">
        <div>
          <Link href={`/employee/proposals/${id}`} className="button button-light" style={{ marginBottom: 8 }}>
            <ChevronLeft size={16} /> Back to proposal
          </Link>
          <div className="eyebrow">Proposals · Revision history</div>
          <h1>
            {subject.title} — v{revisionNumber}
          </h1>
          <p>
            {/* Deterministic on purpose: a server-rendered toLocaleString() would
                print the SERVER's timezone and locale, not the reader's. */}
            Saved {formatDocumentDate(revision.created_at as string)}
            {revision.change_note ? ` · ${revision.change_note}` : ""}
            {" · "}Read-only snapshot.
          </p>
        </div>
        {state ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a className="button button-light" href={`/employee/proposals/${id}/pdf?revision=${revisionId}`} download>
              <Download size={16} /> Download PDF
            </a>
            <a className="button button-light" href={`/employee/proposals/${id}/docx?revision=${revisionId}`} download>
              <FileText size={16} /> Download DOCX
            </a>
          </div>
        ) : null}
      </div>

      {state ? (
        <ProposalDocument
          state={state}
          proposal={subject}
          revisionNumber={revisionNumber}
          team={team}
          signature={signature}
        />
      ) : (
        <div className="empty-state">
          This revision has no saved document state, so there is nothing to render. It was saved before the generator
          started persisting its form data, or its stored data no longer matches the expected shape.
        </div>
      )}
    </>
  );
}
