// GET /employee/proposals/[id]/pdf — the client-ready PDF.
//
// This is the download a seller sends to a client. It exists because "Print /
// Save as PDF" puts the browser's own header and footer — including the page's
// URL — into every page margin, and that is a print-dialog setting no
// stylesheet can turn off. Here the only thing in the margin is the footer
// lib/proposals/pdf.ts draws.
//
// `?revision=<uuid>` renders a specific saved revision instead of the working
// copy, scoped by proposal id so a revision uuid from another proposal cannot
// be rendered under this one's heading.

import { NextResponse } from "next/server";
import { getProposalAccess } from "@/lib/proposals/access";
import { isProposalUuid } from "@/lib/proposals/policy";
import { isGeneratorState } from "@/lib/proposals/generator-state";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import { renderProposalPdf } from "@/lib/proposals/pdf";
import { resolveDocumentExtras } from "@/lib/proposals/team-server";
import { buildProposalDocumentModel } from "@/components/proposals/proposal-document-model";
import { proposalDownloadFilename } from "@/lib/proposals/downloads";
import type { ProposalStatus } from "@/lib/proposals/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, canRead } = await getProposalAccess();
  if (!supabase || !canRead) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isProposalUuid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, title, status, current_revision, valid_until, form_data, accepted_at")
    .eq("id", id)
    .maybeSingle();

  if (!proposal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requestedRevision = new URL(request.url).searchParams.get("revision");
  let state: unknown = proposal.form_data;
  let revisionNumber: number | undefined;

  if (requestedRevision) {
    if (!isProposalUuid(requestedRevision)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Scoped by BOTH ids: a valid revision uuid belonging to a different
    // proposal must not render under this proposal's title.
    const { data: revision } = await supabase
      .from("client_proposal_revisions")
      .select("revision_number, form_data")
      .eq("proposal_id", id)
      .eq("id", requestedRevision)
      .maybeSingle();
    if (!revision) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    state = revision.form_data;
    // Coerced defensively: a null or non-numeric revision_number would otherwise
    // reach the filename as "-vNaN.pdf".
    const parsed = Number(revision.revision_number);
    revisionNumber = Number.isFinite(parsed) ? parsed : undefined;
  }

  if (!isGeneratorState(state)) {
    return NextResponse.json(
      { error: "This proposal has no saved document content to export yet." },
      { status: 409 },
    );
  }

  const currentRevision = Number(proposal.current_revision ?? 1);
  const { team, signature } = await resolveDocumentExtras(
    state,
    (proposal.accepted_at ?? null) as string | null,
  );

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

  // A throw here would be answered with Next's HTML error page — and because the
  // link that reaches this route carries `download`, the browser would write
  // that HTML straight into "<client>-v3.pdf". The seller would get a file that
  // opens blank rather than an error they can act on, so the failure is caught
  // and answered as JSON with the real content type.
  let bytes: Uint8Array;
  try {
    bytes = await renderProposalPdf({ model, documentTitle: model.headline });
  } catch (error) {
    console.error("Could not render the proposal PDF.", error);
    return NextResponse.json({ error: "This proposal could not be rendered as a PDF." }, { status: 500 });
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${proposalDownloadFilename(
        proposal.title as string,
        revisionNumber ?? currentRevision,
        "pdf",
      )}"`,
      // A proposal is per-client and revisable; a cached copy served to the
      // wrong reader, or a stale one after an edit, are both unacceptable.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
