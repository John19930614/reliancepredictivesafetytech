// POST /api/proposals/[id]/narrative — draft figure corrections for the prose.
//
// The Proposal Builder derives every structured number at render time, but the
// executive summary, the assumptions block and the per-line scope paragraphs are
// stored free text. Change Included Users from 20 to 50 and the pills update
// while the prose keeps saying 20 — the defect this endpoint exists to close.
//
// It RETURNS A DRAFT AND NOTHING ELSE. Nothing is written to client_proposals,
// no revision is minted, and the seller applies the wording in the editor after
// reading a before/after diff. That is the Human Authority Rule in CLAUDE.md:
// AI output must not reach a record until a human has approved it.

import { NextResponse } from "next/server";
import { getProposalAccess } from "@/lib/proposals/access";
import { canEditProposalContent, isProposalUuid } from "@/lib/proposals/policy";
import { isGeneratorState } from "@/lib/proposals/generator-state";
import {
  collectNarrativeRegions,
  collectProposalFacts,
  regionsWithFindings,
  scanProposalConsistency,
} from "@/lib/proposals/consistency";
import { generateProposalNarrative, NarrativeUnavailableError } from "@/lib/proposals/narrative";
import { validateAIOutput } from "@/lib/ai/gateway";
import { recordAuditEvent } from "@/lib/audit/events";
import type { ProposalStatus } from "@/lib/proposals/types";

export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { supabase, userId, canManage } = await getProposalAccess();
  if (!supabase || !userId) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!canManage) {
    return NextResponse.json({ error: "You do not have access to edit proposals." }, { status: 403 });
  }
  if (!isProposalUuid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // RLS decides visibility; a proposal this user cannot read comes back empty.
  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, status, form_data")
    .eq("id", id)
    .maybeSingle();

  if (!proposal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A sent/accepted/archived proposal is locked. Drafting wording for one the
  // seller cannot then apply would be spend with nowhere to land.
  const editGate = canEditProposalContent(proposal.status as ProposalStatus);
  if (!editGate.ok) {
    return NextResponse.json({ error: editGate.reason ?? "This proposal is locked." }, { status: 409 });
  }

  // The editor posts its LIVE state so the rewrite matches what is on screen
  // rather than the last autosave. It is validated the same way a save is, and
  // it is only ever read — the response is a suggestion, not a write.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const posted = (body as { formData?: unknown } | null)?.formData;
  const state = isGeneratorState(posted)
    ? posted
    : isGeneratorState(proposal.form_data)
      ? proposal.form_data
      : null;

  if (!state) {
    return NextResponse.json({ error: "This proposal has no form data to review yet." }, { status: 400 });
  }

  const facts = collectProposalFacts(state);
  const findings = scanProposalConsistency(state);
  const regions = regionsWithFindings(collectNarrativeRegions(state), findings);

  if (regions.length === 0) {
    return NextResponse.json({
      revisions: [],
      findingCount: 0,
      message: "Every figure in the narrative already matches the proposal's fields.",
    });
  }

  try {
    const outcome = await generateProposalNarrative({ facts, regions, findings, userId });

    if (outcome.skippedReason) {
      return NextResponse.json({ error: outcome.skippedReason }, { status: 429 });
    }

    // AI Gateway — everything entering an official workflow is screened. The
    // whole draft is validated as one body: a blocked passage taints the batch.
    const gateway = validateAIOutput({
      promptKey: "proposal_narrative",
      rawOutput: outcome.revisions.map((revision) => revision.text).join("\n\n"),
    });

    if (gateway.status === "blocked") {
      await recordAuditEvent({
        event_type: "ai.gateway_validation",
        event_category: "ai",
        severity: "error",
        actor_id: userId,
        resource_type: "client_proposal",
        resource_id: id,
        summary: `AI Gateway BLOCKED a proposal narrative rewrite (${gateway.blockedReason ?? "no reason given"})`,
        after_state: { status: gateway.status, confidence: gateway.overallConfidence },
      });
      return NextResponse.json(
        { error: "The rewrite was blocked by the AI safety gateway. Nothing was changed." },
        { status: 422 },
      );
    }

    const byId = new Map(regions.map((region) => [region.id, region]));
    const revisions = outcome.revisions
      .map((revision) => {
        const region = byId.get(revision.regionId);
        if (!region) return null;
        return {
          regionId: revision.regionId,
          kind: region.kind,
          target: region.target,
          label: region.label,
          before: region.text,
          after: revision.text,
          note: revision.note,
          changed: revision.text.trim() !== region.text.trim(),
        };
      })
      .filter((revision): revision is NonNullable<typeof revision> => revision !== null);

    await recordAuditEvent({
      event_type: "ai.proposal_narrative_drafted",
      event_category: "ai",
      severity: gateway.status === "pass" ? "info" : "warn",
      actor_id: userId,
      resource_type: "client_proposal",
      resource_id: id,
      summary:
        `Drafted figure corrections for ${revisions.filter((r) => r.changed).length} passage(s) ` +
        `on proposal ${id} (gateway: ${gateway.status}, model: ${outcome.model}). Not applied.`,
      after_state: {
        gatewayStatus: gateway.status,
        confidence: gateway.overallConfidence,
        model: outcome.model,
        findingCount: findings.length,
        regionIds: revisions.map((revision) => revision.regionId),
      },
    });

    return NextResponse.json({
      revisions,
      findingCount: findings.length,
      gatewayStatus: gateway.status,
      // Always true. The seller applies each passage deliberately; this flag is
      // what the panel renders its "review before applying" notice from.
      requiresHumanReview: true,
      model: outcome.model,
    });
  } catch (caught) {
    if (caught instanceof NarrativeUnavailableError) {
      return NextResponse.json({ error: caught.message }, { status: 503 });
    }
    const message = caught instanceof Error ? caught.message : "The rewrite failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
