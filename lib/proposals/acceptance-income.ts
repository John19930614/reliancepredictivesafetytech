import "server-only";

// When a proposal is accepted, records what the company now expects to be paid
// and moves the client onto the won stage of the pipeline.
//
// CALLED FROM ALL THREE ACCEPTANCE PATHS — the employee status change, the
// client's own share-link acceptance, and the DocuSign webhook. Like
// acceptance-filing.ts it runs on the service-role client, because two of those
// three have no session at all, and every value it writes is derived
// server-side from the proposal row.
//
// BEST-EFFORT BY CONTRACT. The acceptance is the business event; the receivable
// and the pipeline stage are bookkeeping that follows it. This module never
// throws, and a failure here must never be reported to a client as a failed
// acceptance — callers audit it as a warning, exactly as they do for filing.
//
// IDEMPOTENT. Keyed on related_proposal_id: a proposal that already has income
// rows gets none added, so a redelivered webhook, a retried acceptance, or a
// proposal reopened and re-accepted cannot bill the client twice.

import { createAdminClient } from "@/lib/supabase/admin";
import { isGeneratorState } from "@/lib/proposals/generator-state";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import { parseProposalTerm } from "@/lib/proposals/term";
import { buildIncomeSchedule } from "@/lib/proposals/income-schedule";
import { isAtOrPastStage } from "@/lib/pipeline/stages";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";

/** Same convention as the rest of the proposals module (see access.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/** The lifecycle stage a won deal belongs in (lib/company-data.ts). */
export const wonLifecycleStage = "Signed / Won";

/**
 * Whether the client has already reached "won". Past this point the stage is
 * not walked backwards by a later acceptance — a company already Onboarding
 * must not be dragged back to Signed / Won because a second proposal closed.
 *
 * Derived from the ordered stage list rather than a hand-maintained set. The
 * set this replaces listed the four stages that followed "won" at the time it
 * was written, so inserting Invoicing between Signed / Won and Onboarding
 * (2026-08-14) silently made it wrong: a client mid-billing whose second
 * proposal was accepted would have been dragged back a step.
 */
function isAtOrPastWon(stage: string): boolean {
  return isAtOrPastStage(stage, wonLifecycleStage);
}

/** Finance category these rows land under (lib/company-data.ts). */
const INCOME_CATEGORY = "Sales / Revenue";

export interface RecordAcceptanceIncomeInput {
  proposalId: string;
  /** The revision that was accepted, when the caller knows it. */
  revisionId?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
}

export interface RecordAcceptanceIncomeResult {
  ok: boolean;
  error?: string;
  /** Rows written. Zero is a legitimate outcome — see `skipped`. */
  created?: number;
  /** True when this proposal already had a schedule on file. */
  skipped?: boolean;
  /** True when the client's pipeline stage was advanced. */
  advancedStage?: boolean;
}

export async function recordAcceptanceIncome(
  input: RecordAcceptanceIncomeInput,
): Promise<RecordAcceptanceIncomeResult> {
  try {
    const db: LooseClient | null = createAdminClient();
    if (!db) return { ok: false, error: "Service-role credentials are not configured." };

    const { data: proposal, error: proposalError } = await db
      .from("client_proposals")
      .select("id, title, proposal_number, client_id, form_data, accepted_at, accepted_revision_id")
      .eq("id", input.proposalId)
      .maybeSingle();
    if (proposalError || !proposal) {
      return { ok: false, error: proposalError?.message ?? "Proposal not found." };
    }

    // Already billed: leave it entirely alone, including the stage.
    const { data: existing } = await db
      .from("company_finance_transactions")
      .select("id")
      .eq("related_proposal_id", input.proposalId)
      .limit(1);
    if (Array.isArray(existing) && existing.length > 0) {
      return { ok: true, skipped: true, created: 0 };
    }

    // Price the revision the client actually accepted, not the working copy,
    // which may have moved on since.
    const revisionId = input.revisionId ?? ((proposal.accepted_revision_id as string | null) ?? null);
    let state: unknown = proposal.form_data;
    if (revisionId) {
      const { data: revision } = await db
        .from("client_proposal_revisions")
        .select("form_data")
        .eq("id", revisionId)
        .eq("proposal_id", input.proposalId)
        .maybeSingle();
      if (revision) state = revision.form_data;
    }

    if (!isGeneratorState(state)) {
      return { ok: false, error: "The proposal has no saved content, so no income schedule could be derived." };
    }

    const acceptedAt = (proposal.accepted_at as string | null) ?? new Date().toISOString();
    const schedule = buildIncomeSchedule({
      totals: computeProposalTotals(state),
      term: parseProposalTerm(state.fields),
      acceptedAt,
    });

    const clientId = (proposal.client_id as string | null) ?? null;
    const reference = [proposal.proposal_number, proposal.title].filter(Boolean).join(" — ") || "Proposal";

    let created = 0;
    if (schedule.length > 0) {
      const { data: inserted, error: insertError } = await db
        .from("company_finance_transactions")
        .insert(
          schedule.map((row) => ({
            transaction_type: "income",
            title: `${reference} — ${row.title}`,
            amount: row.amount,
            transaction_date: row.dueDate,
            category: INCOME_CATEGORY,
            status: "expected",
            related_client_id: clientId,
            related_proposal_id: input.proposalId,
            created_by: input.actorUserId ?? null,
            notes: "Created automatically when this proposal was accepted.",
          })),
        )
        .select("id");
      if (insertError) return { ok: false, error: insertError.message };
      created = Array.isArray(inserted) ? inserted.length : 0;
    }

    const advancedStage = clientId ? await advanceClientStage(db, clientId) : false;

    if (created > 0 || advancedStage) {
      await recordAuditEvent({
        ...buildDataAuditEvent(
          "create",
          "company_finance_transaction",
          input.proposalId,
          input.actorUserId ?? null,
          `Accepted proposal "${proposal.title}" filed ${created} expected-income row${created === 1 ? "" : "s"}` +
            (advancedStage ? ` and moved the client to ${wonLifecycleStage}` : ""),
          null,
          { proposal_id: input.proposalId, client_id: clientId, rows: created, advanced_stage: advancedStage },
        ),
        actor_role: input.actorRole ?? null,
      });
    }

    return { ok: true, created, advancedStage };
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "Unexpected failure while recording acceptance income.",
    };
  }
}

/** Moves the client to the won stage unless they are already at or past it. */
async function advanceClientStage(db: LooseClient, clientId: string): Promise<boolean> {
  const { data: client } = await db
    .from("company_clients")
    .select("lifecycle_stage")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return false;

  const current = (client.lifecycle_stage as string | null) ?? "";
  if (isAtOrPastWon(current)) return false;

  const movedAt = new Date().toISOString();

  const { data: updated } = await db
    .from("company_clients")
    .update({ lifecycle_stage: wonLifecycleStage, stage_changed_at: movedAt })
    .eq("id", clientId)
    // Conditional on what was read, so this cannot overwrite a stage someone
    // set by hand between the read and the write.
    .eq("lifecycle_stage", current)
    .select("id");

  if (!Array.isArray(updated) || updated.length === 0) return false;

  // Record the move in the workflow's own history. This path writes
  // lifecycle_stage directly — acceptance IS the evidence, so it is allowed to
  // skip the gates — but without a row here the client workflow page reports
  // "No stage moves recorded yet" for a client whose stage demonstrably moved,
  // and the automated mover is exactly the one a reviewer would look for.
  // Best-effort, like everything else in this module: the acceptance is the
  // business event and must not fail over its own bookkeeping.
  const { error: transitionError } = await db.from("client_stage_transitions").insert({
    client_id: clientId,
    from_stage: current || null,
    to_stage: wonLifecycleStage,
    was_override: false,
    override_reason: null,
    blocked_reasons: [],
    // No session on two of the three acceptance paths, so there is no user to
    // name. The audit event carries the actor where one exists.
    changed_by: null,
    changed_at: movedAt,
  });
  if (transitionError) {
    console.error("Could not record the acceptance stage transition.", transitionError);
  }

  return true;
}
