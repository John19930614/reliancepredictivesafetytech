// POST /api/proposals/[id]/review — advisory AI review at ANY workflow stage.
//
// The narrative endpoint fixes figures and is therefore gated on the proposal
// being editable. This endpoint is different on purpose: review has to be
// available through the WHOLE process — the seller drafting, the approver
// deciding on an in_review revision, and a look back at a sent, accepted or
// declined document. It never writes, so no stage needs to be locked out.
//
// Two layers, degrading gracefully:
//   1. Deterministic readiness checks (lib/proposals/review-checks.ts) ALWAYS
//      run and always return — no API key, no budget, no model required.
//   2. The AI reviewer (lib/proposals/review.ts) adds judgment when it can;
//      when it cannot (key missing, budget spent, model error, gateway block)
//      the response still carries layer 1 plus the reason.
//
// It RETURNS FINDINGS AND DRAFT EDITS, AND WRITES NOTHING. The `edits` in the
// response are proposed rewrites of narrative regions, mapped to before/after
// diffs exactly like the narrative endpoint's — nothing is written to
// client_proposals, no revision is minted, no status changes. Applying a
// ticked edit is the PANEL's job, through the same gated save path the editor
// uses, after a human has read the diff. That click is the Human Authority
// Rule in CLAUDE.md, and the reason requiresHumanReview is hardcoded true in
// every response.

import { NextResponse } from "next/server";
import { validateAIOutput } from "@/lib/ai/gateway";
import { recordAuditEvent } from "@/lib/audit/events";
import { collectNarrativeRegions } from "@/lib/proposals/consistency";
import { getProposalAccess } from "@/lib/proposals/access";
import { isGeneratorState } from "@/lib/proposals/generator-state";
import { isProposalUuid } from "@/lib/proposals/policy";
import { generateProposalReview } from "@/lib/proposals/review";
import { collectReadinessFindings } from "@/lib/proposals/review-checks";
import { proposalStatuses, type ProposalStatus } from "@/lib/proposals/types";

export const maxDuration = 120;

/** Same clock as proposal creation: company time, not UTC. */
function todayInCompanyTimezone(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { supabase, userId, canManage } = await getProposalAccess();
  if (!supabase || !userId) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!canManage) {
    return NextResponse.json({ error: "You do not have access to review proposals." }, { status: 403 });
  }
  if (!isProposalUuid(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // RLS decides visibility; a proposal this user cannot read comes back empty.
  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, status, form_data, valid_until, client_id")
    .eq("id", id)
    .maybeSingle();

  if (!proposal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const status: ProposalStatus = (proposalStatuses as readonly string[]).includes(proposal.status)
    ? (proposal.status as ProposalStatus)
    : "draft";

  // The editor posts its LIVE state so the review matches what is on screen
  // rather than the last autosave; every other surface reviews the saved copy.
  // Validated the same way a save is, and only ever read.
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // An empty body is fine — the detail page sends none.
  }

  const posted = (body as { formData?: unknown } | null)?.formData;
  const state = isGeneratorState(posted) ? posted : isGeneratorState(proposal.form_data) ? proposal.form_data : null;

  const deterministic = collectReadinessFindings(state, {
    status,
    validUntil: (proposal.valid_until ?? null) as string | null,
    clientAssigned: Boolean(proposal.client_id),
    today: todayInCompanyTimezone(),
  });

  // No content = nothing for a model to judge. Layer 1 already says so.
  if (!state) {
    return NextResponse.json({ deterministic, ai: null, aiSkippedReason: "There is no document content for the AI reviewer to read yet.", requiresHumanReview: true, status });
  }

  try {
    const outcome = await generateProposalReview({ state, status, deterministic, userId });

    if (outcome.skippedReason || !outcome.result) {
      return NextResponse.json({
        deterministic,
        ai: null,
        aiSkippedReason: outcome.skippedReason ?? "The AI reviewer returned nothing.",
        requiresHumanReview: true,
        status,
      });
    }

    // AI Gateway — everything entering an official workflow is screened. The
    // whole review is validated as one body, PROPOSED EDIT TEXT INCLUDED: an
    // edit is the part a human may apply to a client document, so a blocked
    // passage taints the entire run.
    const gateway = validateAIOutput({
      promptKey: "proposal_review",
      rawOutput: [
        outcome.result.summary,
        ...outcome.result.findings.map((f) => `${f.message} ${f.suggestion}`),
        ...outcome.result.edits.map((edit) => edit.text),
      ].join("\n\n"),
    });

    if (gateway.status === "blocked") {
      await recordAuditEvent({
        event_type: "ai.gateway_validation",
        event_category: "ai",
        severity: "error",
        actor_id: userId,
        resource_type: "client_proposal",
        resource_id: id,
        summary: `AI Gateway BLOCKED a proposal review (${gateway.blockedReason ?? "no reason given"})`,
        after_state: { status: gateway.status, confidence: gateway.overallConfidence },
      });
      return NextResponse.json({
        deterministic,
        ai: null,
        aiSkippedReason: "The AI review was blocked by the safety gateway. The automated checks above are unaffected.",
        gatewayStatus: gateway.status,
        requiresHumanReview: true,
        status,
      });
    }

    // Map the model's edits onto the regions the way the narrative endpoint
    // does: resolve before-text from the SAME state the model reviewed, drop
    // anything targeting a region that does not exist, and mark unchanged
    // rewrites so the panel can hide them.
    const regionById = new Map(collectNarrativeRegions(state).map((region) => [region.id, region]));
    const edits = outcome.result.edits
      .map((edit) => {
        const region = regionById.get(edit.regionId);
        if (!region) return null;
        return {
          regionId: edit.regionId,
          kind: region.kind,
          target: region.target,
          label: region.label,
          before: region.text,
          after: edit.text,
          note: edit.note,
          changed: edit.text.trim() !== region.text.trim(),
        };
      })
      .filter((edit): edit is NonNullable<typeof edit> => edit !== null);

    await recordAuditEvent({
      event_type: "ai.proposal_review_completed",
      event_category: "ai",
      severity: gateway.status === "pass" ? "info" : "warn",
      actor_id: userId,
      resource_type: "client_proposal",
      resource_id: id,
      summary:
        `AI review of proposal ${id} at status "${status}": verdict ${outcome.result.verdict}, ` +
        `${outcome.result.findings.length} finding(s), ${edits.filter((edit) => edit.changed).length} drafted edit(s), ` +
        `${deterministic.length} automated check(s) (gateway: ${gateway.status}, model: ${outcome.model}). Not applied.`,
      after_state: {
        gatewayStatus: gateway.status,
        confidence: gateway.overallConfidence,
        verdict: outcome.result.verdict,
        findingCount: outcome.result.findings.length,
        editCount: edits.filter((edit) => edit.changed).length,
        editRegionIds: edits.map((edit) => edit.regionId),
        deterministicCount: deterministic.length,
        model: outcome.model,
        proposalStatus: status,
      },
    });

    return NextResponse.json({
      deterministic,
      ai: outcome.result,
      edits,
      model: outcome.model,
      gatewayStatus: gateway.status,
      // Always true. Review output informs a human decision; the drafted edits
      // land only when a human ticks and applies them through the gated save.
      requiresHumanReview: true,
      status,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "The AI review failed.";
    // The deterministic layer is still good — return it with the failure
    // instead of a bare 500, so review stays available even when the model
    // is not.
    return NextResponse.json({ deterministic, ai: null, aiSkippedReason: message, requiresHumanReview: true, status });
  }
}
