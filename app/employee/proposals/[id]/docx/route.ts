// GET /employee/proposals/[id]/docx — editable Word download for a proposal.
//
// Mirrors the PDF route: same permission wall, same revision scoping, same
// ProposalDocumentModel. The output is Word-native DOCX so a client or internal
// reviewer can redline it without rebuilding the proposal from scratch.

import { NextResponse } from "next/server";
import { buildProposalDocumentModel } from "@/components/proposals/proposal-document-model";
import { getProposalAccess } from "@/lib/proposals/access";
import { proposalDownloadFilename } from "@/lib/proposals/downloads";
import { renderProposalDocx } from "@/lib/proposals/docx";
import { isGeneratorState } from "@/lib/proposals/generator-state";
import { isProposalUuid } from "@/lib/proposals/policy";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import { resolveDocumentExtras } from "@/lib/proposals/team-server";
import type { ProposalStatus } from "@/lib/proposals/types";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, canRead } = await getProposalAccess();
  if (!supabase || !canRead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isProposalUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, title, status, current_revision, valid_until, form_data, accepted_at")
    .eq("id", id)
    .maybeSingle();

  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const requestedRevision = new URL(request.url).searchParams.get("revision");
  let state: unknown = proposal.form_data;
  let revisionNumber: number | undefined;

  if (requestedRevision) {
    if (!isProposalUuid(requestedRevision)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data: revision } = await supabase
      .from("client_proposal_revisions")
      .select("revision_number, form_data")
      .eq("proposal_id", id)
      .eq("id", requestedRevision)
      .maybeSingle();
    if (!revision) return NextResponse.json({ error: "Not found" }, { status: 404 });
    state = revision.form_data;
    // Coerced defensively: a null or non-numeric revision_number would otherwise
    // reach the filename as "-vNaN.docx".
    const parsed = Number(revision.revision_number);
    revisionNumber = Number.isFinite(parsed) ? parsed : undefined;
  }

  if (!isGeneratorState(state)) {
    return NextResponse.json({ error: "This proposal has no saved document content to export yet." }, { status: 409 });
  }

  const currentRevision = Number(proposal.current_revision ?? 1);
  const { team, signature } = await resolveDocumentExtras(state, (proposal.accepted_at ?? null) as string | null);
  const model = buildProposalDocumentModel({
    state,
    totals: computeProposalTotals(state),
    proposal: {
      id: proposal.id as string,
      title: proposal.title as string,
      status: proposal.status as ProposalStatus,
      currentRevision,
      validUntil: (proposal.valid_until ?? null) as string | null,
    },
    revisionNumber,
    team,
    signature,
  });

  // Same reasoning as the PDF route: the link carries `download`, so an
  // uncaught throw would be saved as "<client>-v3.docx" containing Next's HTML
  // error page — a file Word opens as empty or refuses outright.
  let bytes: Buffer;
  try {
    bytes = await renderProposalDocx(model);
  } catch (error) {
    console.error("Could not render the proposal DOCX.", error);
    return NextResponse.json({ error: "This proposal could not be rendered as a Word document." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${proposalDownloadFilename(
        proposal.title as string,
        revisionNumber ?? currentRevision,
        "docx",
      )}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
