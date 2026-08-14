"use server";

// Server actions for the Client Lifecycle.
//
// Every move an opportunity makes goes through here: Next Step, Skip to Step,
// the three Exit Paths, and reopening.
//
// Opening a lead CREATES its company (see createOpportunity), because a lead is
// a company as far as the rest of the platform is concerned and a deal with
// none can hold no proposal, invoice or file. Nothing here writes
// company_clients.lifecycle_stage, though — the sales board keeps that field to
// itself, so the two systems never fight over which stage a company is on.
//
// EVERY WRITE IS COMPARE-AND-SET on the (step, status) the caller read.
// PostgREST reports no error for an UPDATE that matched zero rows, so each
// mutation asks for the affected ids back and treats an empty result as a
// concurrent change rather than a success.
//
// EVERY MOVE IS RECORDED. opportunity_stage_events is append-only and carries
// the reason for anything that is not an ordinary one-step advance, which is
// what makes "who skipped Discovery on this deal, and why" answerable at all.

import { revalidatePath } from "next/cache";
import { buildDataAuditEvent, recordAuditEvent } from "@/lib/audit/events";
import { friendlyError } from "@/lib/friendly-error";
import { getLifecycleAccess } from "@/lib/lifecycle/access";
import { provisionClient, provisionWarning } from "@/lib/clients/provision";
import { checkExitInput, isClosed, lifecycleExit } from "@/lib/lifecycle/exits";
import {
  finalStepKey,
  firstStepKey,
  isLifecycleStepKey,
  lifecycleStep,
  nextStepKey,
  stepDistance,
} from "@/lib/lifecycle/steps";
import {
  checkQualificationInput,
  qualificationState,
  suggestedProbability,
  type QualificationInput,
} from "@/lib/lifecycle/qualification";
import { opportunitySelect, type StageEventKind } from "@/lib/lifecycle/types";

export interface LifecycleActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SIGNED_OUT = "You must be signed in.";
const NOT_FOUND = "Opportunity not found or you do not have permission to change it.";
const MOVED = "This opportunity changed while you were looking at it. Reload and try again.";
const MIN_REASON = 10;

const lifecyclePath = "/employee/lifecycle";

function revalidateLifecycle(opportunityId?: string): void {
  revalidatePath(lifecyclePath);
  if (opportunityId) revalidatePath(`${lifecyclePath}/${opportunityId}`);
}

interface MoveRow {
  id: string;
  name: string;
  step: string;
  status: string;
  client_id: string | null;
}

const moveSelect = "id, name, step, status, client_id";

/* -------------------------------------------------------------------------- */
/* Shared move writer                                                         */
/* -------------------------------------------------------------------------- */

interface ApplyMoveInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  role: string | null;
  before: MoveRow;
  toStep: string;
  toStatus: string;
  kind: StageEventKind;
  reason: string | null;
  /** Extra columns to set alongside the move (exit evidence, for instance). */
  patch?: Record<string, unknown>;
  summary: string;
  severity?: "info" | "warn";
}

async function applyMove(input: ApplyMoveInput): Promise<LifecycleActionResult> {
  const { supabase, userId, role, before } = input;

  const { data: updated, error: updateError } = await supabase
    .from("opportunities")
    .update({ step: input.toStep, status: input.toStatus, ...(input.patch ?? {}) })
    .eq("id", before.id)
    // Compare-and-set on both axes: another operator may have moved the step OR
    // exited the deal since this page rendered.
    .eq("step", before.step)
    .eq("status", before.status)
    .select("id");

  if (updateError) return { ok: false, error: friendlyError(updateError, "Could not move this opportunity.") };
  if (!Array.isArray(updated) || updated.length === 0) return { ok: false, error: MOVED };

  const distance = stepDistance(before.step, input.toStep);

  // History first. A failure here must not report the move as failed — the step
  // has already changed — but it must be visible in the logs.
  const { error: eventError } = await supabase.from("opportunity_stage_events").insert({
    opportunity_id: before.id,
    from_step: before.step,
    to_step: input.toStep,
    from_status: before.status,
    to_status: input.toStatus,
    kind: input.kind,
    reason: input.reason,
    steps_skipped: Math.max(0, Math.abs(distance) - (input.kind === "advance" ? 1 : 0)),
    changed_by: userId,
  });
  if (eventError) {
    console.error("Could not record the lifecycle stage event.", eventError);
  }

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "opportunity",
      before.id,
      userId,
      input.summary,
      { step: before.step, status: before.status },
      { step: input.toStep, status: input.toStatus, kind: input.kind, reason: input.reason },
    ),
    severity: input.severity ?? "info",
    actor_role: role,
  });

  revalidateLifecycle(before.id);
  return { ok: true };
}

/** Loads the row a move will act on, or returns the failure to report. */
async function readMoveTarget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opportunityId: string,
): Promise<{ ok: true; row: MoveRow } | { ok: false; error: string }> {
  const { data } = await supabase.from("opportunities").select(moveSelect).eq("id", opportunityId).maybeSingle();
  if (!data) return { ok: false, error: NOT_FOUND };
  return { ok: true, row: data as MoveRow };
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

export interface CreateOpportunityInput {
  name: string;
  clientId?: string | null;
  demoRequestId?: string | null;
  value?: number | null;
  source?: string | null;
  industry?: string | null;
  region?: string | null;
  productInterest?: string | null;
  expectedCloseDate?: string | null;
  notes?: string | null;
}

/**
 * Opens a new opportunity at step 1.
 *
 * It always starts at Lead Captured and open — the RLS insert policy enforces
 * the same thing, so a deal cannot be conjured straight into Commit / Contract.
 */
export async function createOpportunity(
  input: CreateOpportunityInput,
): Promise<LifecycleActionResult & { opportunityId?: string; warning?: string }> {
  const { supabase, userId, role, canManage } = await getLifecycleAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canManage) return { ok: false, error: "You do not have permission to open opportunities." };

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length === 0) {
    return { ok: false, error: "Give this opportunity a name.", fieldErrors: { name: "A name is required." } };
  }
  if (name.length > 200) {
    return { ok: false, error: "That name is too long.", fieldErrors: { name: "Keep it under 200 characters." } };
  }

  if (input.clientId && !UUID.test(input.clientId)) return { ok: false, error: "Malformed client reference." };
  if (input.demoRequestId && !UUID.test(input.demoRequestId)) return { ok: false, error: "Malformed lead reference." };

  const value = typeof input.value === "number" && Number.isFinite(input.value) && input.value > 0
    ? Math.round(input.value * 100) / 100
    : 0;

  const expectedCloseDate =
    typeof input.expectedCloseDate === "string" && ISO_DATE.test(input.expectedCloseDate)
      ? input.expectedCloseDate
      : null;

  // A lead IS a company, as far as the rest of the platform is concerned — the
  // sales board has always created a company_clients row at stage Lead. The
  // lifecycle was the outlier in allowing a deal with nothing behind it, and a
  // deal with no company cannot hold a proposal, an invoice or a file.
  //
  // So a lead with no company named gets one, along with its checklist, its
  // File Center folders and an empty profile for the estimator to fill.
  let clientId = input.clientId || null;
  let provisionNote: string | null = null;

  if (!clientId) {
    const provisioned = await provisionClient(supabase, userId, {
      name,
      source: input.source ?? null,
      notes: input.notes ?? null,
      companyType: input.industry ?? null,
    });

    if (!provisioned.ok) {
      return { ok: false, error: provisioned.error ?? "Could not create the company for this lead." };
    }
    clientId = provisioned.clientId ?? null;
    // Best-effort pieces report rather than fail: the deal and its company both
    // exist, and a missing folder is a ten-second fix for whoever is told.
    provisionNote = provisionWarning(provisioned);
  }

  const { data: created, error } = await supabase
    .from("opportunities")
    .insert({
      name,
      client_id: clientId,
      demo_request_id: input.demoRequestId || null,
      step: firstStepKey,
      status: "open",
      value,
      expected_close_date: expectedCloseDate,
      source: input.source?.trim() || null,
      industry: input.industry?.trim() || null,
      region: input.region?.trim() || null,
      product_interest: input.productInterest?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !created) return { ok: false, error: friendlyError(error, "Could not open the opportunity.") };

  await recordAuditEvent({
    ...buildDataAuditEvent("create", "opportunity", created.id, userId, `Opened opportunity "${name}"`, null, {
      client_id: clientId,
      // Distinguishes a deal opened against an existing account from one that
      // brought its company into existence.
      company_provisioned: !input.clientId,
      demo_request_id: input.demoRequestId || null,
      value,
    }),
    actor_role: role,
  });

  revalidateLifecycle(created.id);
  if (clientId) revalidatePath(`/employee/clients/${clientId}`);
  return { ok: true, opportunityId: created.id, warning: provisionNote ?? undefined };
}

/* -------------------------------------------------------------------------- */
/* Next Step                                                                  */
/* -------------------------------------------------------------------------- */

/** Moves an opportunity forward exactly one step. */
export async function advanceOpportunity(opportunityId: string): Promise<LifecycleActionResult> {
  const { supabase, userId, role, canAdvance } = await getLifecycleAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canAdvance) return { ok: false, error: "You do not have permission to move opportunities." };
  if (!UUID.test(opportunityId)) return { ok: false, error: "Malformed opportunity reference." };

  const target = await readMoveTarget(supabase, opportunityId);
  if (!target.ok) return { ok: false, error: target.error };
  const before = target.row;

  if (isClosed(before.status)) {
    return { ok: false, error: "This opportunity has left the lifecycle. Reopen it before moving it on." };
  }

  const to = nextStepKey(before.step);
  if (!to) {
    return {
      ok: false,
      error: isLifecycleStepKey(before.step)
        ? "This opportunity is already at the last step of the lifecycle."
        : "This opportunity is on a step that is not part of the lifecycle.",
    };
  }

  return applyMove({
    supabase,
    userId,
    role,
    before,
    toStep: to,
    toStatus: before.status,
    kind: "advance",
    reason: null,
    summary: `Advanced "${before.name}" from ${lifecycleStep(before.step)?.label ?? before.step} to ${lifecycleStep(to)?.label ?? to}`,
  });
}

/* -------------------------------------------------------------------------- */
/* Skip to Step                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Jumps to any step, forwards or backwards, with a written reason.
 *
 * Admin-only, and backed by RLS. Skipping asserts the intervening work was not
 * needed, and moving back rewrites the record of how far a deal got — both are
 * claims somebody should have to sign their name to.
 */
export async function skipOpportunityToStep(
  opportunityId: string,
  toStep: string,
  reason: string,
): Promise<LifecycleActionResult> {
  const { supabase, userId, role, canSkip } = await getLifecycleAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canSkip) return { ok: false, error: "Admin role required to skip or reverse steps." };
  if (!UUID.test(opportunityId)) return { ok: false, error: "Malformed opportunity reference." };
  if (!isLifecycleStepKey(toStep)) return { ok: false, error: "Choose a valid step." };

  const cleaned = typeof reason === "string" ? reason.trim() : "";
  if (cleaned.length < MIN_REASON) {
    return {
      ok: false,
      error: "Say why this opportunity is jumping steps.",
      fieldErrors: { reason: "A reason of at least 10 characters is required." },
    };
  }
  if (cleaned.length > 1000) {
    return { ok: false, error: "Keep the reason under 1000 characters.", fieldErrors: { reason: "Too long." } };
  }

  const target = await readMoveTarget(supabase, opportunityId);
  if (!target.ok) return { ok: false, error: target.error };
  const before = target.row;

  if (isClosed(before.status)) {
    return { ok: false, error: "This opportunity has left the lifecycle. Reopen it before moving it." };
  }
  if (before.step === toStep) {
    return { ok: false, error: "This opportunity is already on that step." };
  }

  const distance = stepDistance(before.step, toStep);

  return applyMove({
    supabase,
    userId,
    role,
    before,
    toStep,
    toStatus: before.status,
    kind: distance < 0 ? "back" : "skip",
    reason: cleaned,
    summary:
      distance < 0
        ? `Moved "${before.name}" back to ${lifecycleStep(toStep)?.label ?? toStep}: ${cleaned}`
        : `Skipped "${before.name}" to ${lifecycleStep(toStep)?.label ?? toStep}: ${cleaned}`,
    // A jump is the event a pipeline reviewer goes looking for.
    severity: "warn",
  });
}

/* -------------------------------------------------------------------------- */
/* Exit Paths                                                                 */
/* -------------------------------------------------------------------------- */

export interface ExitOpportunityInput {
  status: string;
  reason: string;
  competitor?: string | null;
  holdUntil?: string | null;
}

/**
 * Takes an opportunity out of the lifecycle: Closed Lost, On Hold, or
 * Disqualified.
 *
 * Deliberately NOT admin-only. A rep who has just been told the deal is dead
 * has to be able to say so — routing that through an admin is how pipelines
 * fill with stale open deals nobody trusts. Reopening is the admin act.
 *
 * The step is left exactly where it was: "lost at Negotiation" and "lost at
 * Discovery" are different problems, and collapsing them loses the only useful
 * thing a dead deal has left.
 */
export async function exitOpportunity(
  opportunityId: string,
  input: ExitOpportunityInput,
): Promise<LifecycleActionResult> {
  const { supabase, userId, role, canExit } = await getLifecycleAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canExit) return { ok: false, error: "You do not have permission to close opportunities." };
  if (!UUID.test(opportunityId)) return { ok: false, error: "Malformed opportunity reference." };

  const checked = checkExitInput(input);
  if (!checked.ok || !checked.value) {
    return { ok: false, error: checked.error, fieldErrors: checked.fieldErrors };
  }
  const exit = checked.value;

  const target = await readMoveTarget(supabase, opportunityId);
  if (!target.ok) return { ok: false, error: target.error };
  const before = target.row;

  if (isClosed(before.status)) {
    return { ok: false, error: "This opportunity has already left the lifecycle." };
  }

  const label = lifecycleExit(exit.status)?.label ?? exit.status;

  return applyMove({
    supabase,
    userId,
    role,
    before,
    toStep: before.step,
    toStatus: exit.status,
    kind: "exit",
    reason: exit.reason,
    patch: {
      exit_reason: exit.reason,
      exit_competitor: exit.competitor,
      hold_until: exit.holdUntil,
      exited_at: new Date().toISOString(),
      exited_by: userId,
    },
    summary:
      `Marked "${before.name}" ${label} at ${lifecycleStep(before.step)?.label ?? before.step}: ${exit.reason}` +
      (exit.competitor ? ` (lost to ${exit.competitor})` : ""),
    severity: "warn",
  });
}

/**
 * Brings an exited opportunity back into the lifecycle at the step it left.
 *
 * Admin-only: an exit is a reported outcome, and numbers have already been read
 * off it. Un-reporting it should leave a name behind.
 */
export async function reopenOpportunity(opportunityId: string, reason: string): Promise<LifecycleActionResult> {
  const { supabase, userId, role, canReopen } = await getLifecycleAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canReopen) return { ok: false, error: "Admin role required to reopen a closed opportunity." };
  if (!UUID.test(opportunityId)) return { ok: false, error: "Malformed opportunity reference." };

  const cleaned = typeof reason === "string" ? reason.trim() : "";
  if (cleaned.length < MIN_REASON) {
    return {
      ok: false,
      error: "Say why this opportunity is being reopened.",
      fieldErrors: { reason: "A reason of at least 10 characters is required." },
    };
  }

  const target = await readMoveTarget(supabase, opportunityId);
  if (!target.ok) return { ok: false, error: target.error };
  const before = target.row;

  if (!isClosed(before.status)) {
    return { ok: false, error: "This opportunity is already open." };
  }

  return applyMove({
    supabase,
    userId,
    role,
    before,
    toStep: before.step,
    toStatus: "open",
    kind: "reopen",
    reason: cleaned,
    // The exit evidence is cleared so the record cannot claim both states at
    // once, but the stage event keeps the whole history of what it said.
    patch: { exit_reason: null, exit_competitor: null, hold_until: null, exited_at: null, exited_by: null },
    summary: `Reopened "${before.name}" at ${lifecycleStep(before.step)?.label ?? before.step}: ${cleaned}`,
    severity: "warn",
  });
}

/* -------------------------------------------------------------------------- */
/* Field edits                                                                */
/* -------------------------------------------------------------------------- */

export interface UpdateOpportunityInput {
  ownerUserId?: string | null;
  value?: number | null;
  probability?: number | null;
  expectedCloseDate?: string | null;
  nextAction?: string | null;
  nextActionDue?: string | null;
  notes?: string | null;
}

/**
 * Edits the deal facts every lifecycle screen reads: owner, value, probability,
 * close date and next action.
 *
 * Only the keys actually supplied are written, so an unrelated edit cannot
 * blank a field the caller never saw.
 */
export async function updateOpportunity(
  opportunityId: string,
  input: UpdateOpportunityInput,
): Promise<LifecycleActionResult> {
  const { supabase, userId, role, canManage } = await getLifecycleAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canManage) return { ok: false, error: "You do not have permission to edit opportunities." };
  if (!UUID.test(opportunityId)) return { ok: false, error: "Malformed opportunity reference." };

  const patch: Record<string, unknown> = {};

  if (input.ownerUserId !== undefined) {
    if (input.ownerUserId !== null && !UUID.test(input.ownerUserId)) {
      return { ok: false, error: "Malformed owner reference." };
    }
    patch.owner_user_id = input.ownerUserId;
    // The SLA clock the concept starts at Assign Owner hangs off this.
    patch.assigned_at = input.ownerUserId ? new Date().toISOString() : null;
  }

  if (input.value !== undefined) {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, error: "Enter a deal value of zero or more.", fieldErrors: { value: "Invalid amount." } };
    }
    patch.value = Math.round(value * 100) / 100;
  }

  if (input.probability !== undefined) {
    const probability = Number(input.probability);
    if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
      return {
        ok: false,
        error: "Probability has to be between 0 and 100.",
        fieldErrors: { probability: "0 to 100." },
      };
    }
    patch.probability = Math.round(probability);
  }

  if (input.expectedCloseDate !== undefined) {
    if (input.expectedCloseDate !== null && !ISO_DATE.test(input.expectedCloseDate)) {
      return { ok: false, error: "Enter the close date as YYYY-MM-DD." };
    }
    patch.expected_close_date = input.expectedCloseDate;
  }

  if (input.nextActionDue !== undefined) {
    if (input.nextActionDue !== null && !ISO_DATE.test(input.nextActionDue)) {
      return { ok: false, error: "Enter the due date as YYYY-MM-DD." };
    }
    patch.next_action_due = input.nextActionDue;
  }

  if (input.nextAction !== undefined) {
    const action = input.nextAction?.trim() ?? "";
    if (action.length > 500) return { ok: false, error: "That next action is too long." };
    patch.next_action = action || null;
  }

  if (input.notes !== undefined) {
    const notes = input.notes?.trim() ?? "";
    if (notes.length > 8000) return { ok: false, error: "Those notes are too long." };
    patch.notes = notes || null;
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  const { data: before } = await supabase
    .from("opportunities")
    .select(moveSelect)
    .eq("id", opportunityId)
    .maybeSingle();
  if (!before) return { ok: false, error: NOT_FOUND };

  const { data: updated, error } = await supabase
    .from("opportunities")
    .update(patch)
    .eq("id", opportunityId)
    .select("id");

  if (error) return { ok: false, error: friendlyError(error, "Could not save this opportunity.") };
  if (!Array.isArray(updated) || updated.length === 0) return { ok: false, error: NOT_FOUND };

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "opportunity",
      opportunityId,
      userId,
      `Updated ${Object.keys(patch).join(", ")} on "${(before as MoveRow).name}"`,
      null,
      patch,
    ),
    actor_role: role,
  });

  revalidateLifecycle(opportunityId);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Sales Review — the human decision on the AI's triage                       */
/* -------------------------------------------------------------------------- */

/**
 * Records a person's decision on the AI triage, and — only on accept — carries
 * the model's score onto the opportunity.
 *
 * THIS IS THE HUMAN AUTHORITY RULE, applied to scoring. The nightly triage job
 * writes to lead_triage_results and nowhere else; it never touches an
 * opportunity. The score reaches the deal record here, because a person pressed
 * accept, and not before. Dismissing records the decision and leaves the
 * opportunity unscored — which is the honest state, since nobody has agreed
 * with the model.
 *
 * Deliberately does not advance the step. Deciding and moving on are two acts,
 * and an operator who accepts the score may still want to look at the lead
 * before assigning it.
 */
export async function applyTriageDecision(
  opportunityId: string,
  decision: "accepted" | "dismissed",
): Promise<LifecycleActionResult> {
  const { supabase, userId, role, canManage } = await getLifecycleAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canManage) return { ok: false, error: "You do not have permission to review lead scoring." };
  if (!UUID.test(opportunityId)) return { ok: false, error: "Malformed opportunity reference." };
  if (decision !== "accepted" && decision !== "dismissed") {
    return { ok: false, error: "Choose accept or dismiss." };
  }

  const { data: opportunityRow } = await supabase
    .from("opportunities")
    .select("id, name, status, demo_request_id")
    .eq("id", opportunityId)
    .maybeSingle();

  if (!opportunityRow) return { ok: false, error: NOT_FOUND };

  const opportunity = opportunityRow as {
    id: string;
    name: string;
    status: string;
    demo_request_id: string | null;
  };

  if (isClosed(opportunity.status)) {
    return { ok: false, error: "This opportunity has left the lifecycle." };
  }
  if (!opportunity.demo_request_id) {
    return { ok: false, error: "This opportunity has no inbound lead behind it, so there is no triage to review." };
  }

  const { data: triageRows } = await supabase
    .from("lead_triage_results")
    .select("id, priority_score, segment, next_step, rationale, confidence, status")
    .eq("lead_id", opportunity.demo_request_id)
    .order("created_at", { ascending: false })
    .limit(1);

  const triage = Array.isArray(triageRows) ? triageRows[0] : null;
  if (!triage) return { ok: false, error: "This lead has not been triaged yet." };
  if (triage.status !== "suggested") {
    return { ok: false, error: `This suggestion was already ${triage.status}.` };
  }

  // The decision is recorded first. If the score write below fails, the record
  // still shows a human acted — the opposite order could leave a scored
  // opportunity with no decision behind it.
  const { data: acted, error: actError } = await supabase
    .from("lead_triage_results")
    .update({ status: decision, acted_by: userId, acted_at: new Date().toISOString() })
    .eq("id", triage.id)
    .eq("status", "suggested")
    .select("id");

  if (actError) return { ok: false, error: friendlyError(actError, "Could not record that decision.") };
  if (!Array.isArray(acted) || acted.length === 0) {
    return { ok: false, error: "Someone else acted on this suggestion. Reload and try again." };
  }

  // lead_triage_results.priority_score is numeric(5,2) and the model routinely
  // returns a fraction; opportunities.ai_score is an integer. Postgres refuses
  // 82.50 for an integer column outright (22P02), and because the decision above
  // is already committed, the retry path is closed — the deal would sit
  // permanently unscored under a triage row saying a human accepted it. Round at
  // the boundary rather than widening the column: a score is a rank, and its
  // second decimal place was never meaningful.
  const score =
    typeof triage.priority_score === "number" && Number.isFinite(triage.priority_score)
      ? Math.round(triage.priority_score)
      : null;

  if (decision === "accepted") {
    const { data: scored, error: scoreError } = await supabase
      .from("opportunities")
      .update({
        ai_score: score,
        ai_confidence: triage.confidence,
        ai_recommendation: [triage.segment, triage.next_step, triage.rationale].filter(Boolean).join(" — "),
        ai_scored_at: new Date().toISOString(),
      })
      .eq("id", opportunityId)
      .select("id");

    // The row count was asked for; it has to be read. RLS filters an exited deal
    // out of the employee UPDATE policy, and PostgREST reports that as 200 with
    // an empty array — so without this check the action returns ok, audits
    // "applied a score of 82", and leaves ai_score null with the suggestion
    // already marked accepted and therefore unretryable.
    const scoreMissed = !scoreError && (!Array.isArray(scored) || scored.length === 0);

    if (scoreError || scoreMissed) {
      // The decision stands; only the copy onto the deal failed. It still gets
      // an audit line — a human authorised this, the record now says so, and an
      // early return that skipped the trail would leave the platform's own
      // Human Authority gate unrecorded precisely when something went wrong.
      await recordAuditEvent({
        event_type: "lifecycle.triage_accepted",
        event_category: "ai",
        severity: "warn",
        actor_id: userId,
        actor_role: role,
        resource_type: "opportunity",
        resource_id: opportunityId,
        summary: `Accepted the AI triage for "${opportunity.name}" but the score could not be applied to the deal`,
        after_state: { decision, triage_result_id: triage.id, score, score_applied: false },
      });
      revalidateLifecycle(opportunityId);
      return {
        ok: false,
        error: scoreMissed
          ? "The decision was recorded, but this deal changed while you were looking at it, so the score was not applied. Reload and check it."
          : friendlyError(scoreError, "The decision was recorded, but the score could not be applied."),
      };
    }
  }

  await recordAuditEvent({
    event_type: `lifecycle.triage_${decision}`,
    event_category: "ai",
    severity: "info",
    actor_id: userId,
    actor_role: role,
    resource_type: "opportunity",
    resource_id: opportunityId,
    summary:
      decision === "accepted"
        ? `Accepted the AI triage for "${opportunity.name}" and applied a score of ${triage.priority_score}`
        : `Dismissed the AI triage for "${opportunity.name}"`,
    after_state: {
      decision,
      lead_id: opportunity.demo_request_id,
      triage_result_id: triage.id,
      score: decision === "accepted" ? triage.priority_score : null,
    },
  });

  revalidateLifecycle(opportunityId);
  revalidatePath("/employee/inbox");
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Steps 5 & 6 — Discovery and Qualification                                  */
/* -------------------------------------------------------------------------- */

/**
 * Saves discovery notes and the BANT boxes.
 *
 * Upserted on opportunity_id, which is the primary key: most opportunities
 * reach step 5 with no qualification record at all, and making the caller know
 * whether to insert or update is how half of them end up with neither.
 *
 * Only the supplied keys are written, so saving the BANT boxes cannot blank a
 * discovery note the caller never saw.
 */
export async function saveOpportunityQualification(
  opportunityId: string,
  input: QualificationInput,
): Promise<LifecycleActionResult> {
  const { supabase, userId, role, canManage } = await getLifecycleAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canManage) return { ok: false, error: "You do not have permission to edit opportunities." };
  if (!UUID.test(opportunityId)) return { ok: false, error: "Malformed opportunity reference." };

  const checked = checkQualificationInput(input);
  if (!checked.ok || !checked.patch) {
    return { ok: false, error: checked.error, fieldErrors: checked.fieldErrors };
  }

  const { data: opportunityRow } = await supabase
    .from("opportunities")
    .select("id, name, status")
    .eq("id", opportunityId)
    .maybeSingle();

  if (!opportunityRow) return { ok: false, error: NOT_FOUND };
  if (isClosed((opportunityRow as { status: string }).status)) {
    // The RLS policy says the same thing; refusing here gives a message rather
    // than a silent zero-row write.
    return { ok: false, error: "This opportunity has left the lifecycle, so its qualification is now history." };
  }

  const { error } = await supabase
    .from("opportunity_qualification")
    .upsert({ opportunity_id: opportunityId, ...checked.patch, updated_by: userId }, { onConflict: "opportunity_id" });

  if (error) return { ok: false, error: friendlyError(error, "Could not save the qualification.") };

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "opportunity_qualification",
      opportunityId,
      userId,
      `Updated ${Object.keys(checked.patch).join(", ")} on "${(opportunityRow as { name: string }).name}"`,
      null,
      checked.patch,
    ),
    actor_role: role,
  });

  revalidateLifecycle(opportunityId);
  return { ok: true };
}

/**
 * Records that a person has judged this a real opportunity, and — only if they
 * ask for it — sets the probability the BANT count suggests.
 *
 * The suggested figure is never applied on its own. Probability drives the
 * weighted pipeline number, and a figure that moved itself whenever somebody
 * ticked a box would quietly restate the forecast without anyone deciding to.
 */
export async function markOpportunityQualified(
  opportunityId: string,
  applySuggestedProbability: boolean,
): Promise<LifecycleActionResult> {
  const { supabase, userId, role, canManage } = await getLifecycleAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canManage) return { ok: false, error: "You do not have permission to qualify opportunities." };
  if (!UUID.test(opportunityId)) return { ok: false, error: "Malformed opportunity reference." };

  const [{ data: opportunityRow }, { data: qualificationRow }] = await Promise.all([
    supabase.from("opportunities").select("id, name, status").eq("id", opportunityId).maybeSingle(),
    supabase
      .from("opportunity_qualification")
      .select("opportunity_id, has_budget, has_authority, has_need, has_timeline, qualified_at")
      .eq("opportunity_id", opportunityId)
      .maybeSingle(),
  ]);

  if (!opportunityRow) return { ok: false, error: NOT_FOUND };
  if (isClosed((opportunityRow as { status: string }).status)) {
    return { ok: false, error: "This opportunity has left the lifecycle." };
  }
  if (!qualificationRow) {
    return { ok: false, error: "Record the discovery findings before qualifying this opportunity." };
  }

  const state = qualificationState(qualificationRow as never);
  if (!state.complete) {
    return {
      ok: false,
      error: `${state.outstanding.map((test) => test.label).join(", ")} not yet established. Confirm all four before qualifying.`,
    };
  }

  const { error } = await supabase
    .from("opportunity_qualification")
    .update({ qualified_at: new Date().toISOString(), qualified_by: userId, updated_by: userId })
    .eq("opportunity_id", opportunityId)
    // Idempotent: qualifying twice should not restamp who did it first.
    .is("qualified_at", null);

  if (error) return { ok: false, error: friendlyError(error, "Could not qualify this opportunity.") };

  if (applySuggestedProbability) {
    await supabase
      .from("opportunities")
      .update({ probability: suggestedProbability(state.met) })
      .eq("id", opportunityId);
  }

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "opportunity_qualification",
      opportunityId,
      userId,
      `Qualified "${(opportunityRow as { name: string }).name}" on all four BANT tests` +
        (applySuggestedProbability ? ` and set probability to ${suggestedProbability(state.met)}%` : ""),
      null,
      { met: state.met, applied_probability: applySuggestedProbability },
    ),
    actor_role: role,
  });

  revalidateLifecycle(opportunityId);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Steps 7-10 — the proposal that prices this deal                            */
/* -------------------------------------------------------------------------- */

/**
 * Attaches a company to an opportunity.
 *
 * Steps 1-3 happen before anyone has decided a lead is worth a company record,
 * so client_id is nullable — but a proposal cannot be written without one, which
 * makes this the gate into step 7.
 *
 * Attaching only, never re-pointing: once a deal belongs to a company, moving it
 * to another one would strand its proposals, its invoices and its legal review
 * on the old account without a word. Detaching and re-attaching is not a gap to
 * fill here either — that is a different, louder decision than this screen makes.
 */
export async function linkOpportunityToClient(
  opportunityId: string,
  clientId: string,
): Promise<LifecycleActionResult> {
  const { supabase, userId, role, canManage } = await getLifecycleAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canManage) return { ok: false, error: "You do not have permission to edit opportunities." };
  if (!UUID.test(opportunityId) || !UUID.test(clientId)) return { ok: false, error: "Malformed reference." };

  const [{ data: opportunityRow }, { data: clientRow }] = await Promise.all([
    supabase.from("opportunities").select("id, name, status, client_id").eq("id", opportunityId).maybeSingle(),
    supabase.from("company_clients").select("id, name").eq("id", clientId).maybeSingle(),
  ]);

  if (!opportunityRow) return { ok: false, error: NOT_FOUND };
  if (!clientRow) return { ok: false, error: "That company was not found." };

  const existing = opportunityRow as { name: string; status: string; client_id: string | null };
  if (isClosed(existing.status)) {
    return { ok: false, error: "This opportunity has left the lifecycle." };
  }
  if (existing.client_id === clientId) return { ok: true };
  if (existing.client_id) {
    return { ok: false, error: "This opportunity already belongs to another company." };
  }

  const { data: updated, error } = await supabase
    .from("opportunities")
    .update({ client_id: clientId })
    .eq("id", opportunityId)
    // Compare-and-set on the column being written: a concurrent attach wins and
    // this one is told, rather than overwriting it.
    .is("client_id", null)
    .select("id");

  if (error) return { ok: false, error: friendlyError(error, "Could not attach the company.") };
  if (!Array.isArray(updated) || updated.length === 0) {
    return { ok: false, error: "This opportunity was attached to a company while you were looking at it. Reload and try again." };
  }

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "opportunity",
      opportunityId,
      userId,
      `Attached "${existing.name}" to ${(clientRow as { name: string }).name}`,
      { client_id: null },
      { client_id: clientId },
    ),
    actor_role: role,
  });

  revalidateLifecycle(opportunityId);
  return { ok: true };
}

/**
 * Links a proposal to this deal, or unlinks it.
 *
 * A proposal may only be linked to an opportunity for the SAME company — the
 * alternative is a deal quietly priced by another account's contract, which is
 * both wrong and hard to notice.
 *
 * Nothing here writes proposal content. The proposal module owns drafting,
 * review, sending and acceptance, including its maker-checker gate; this only
 * records which deal a proposal belongs to.
 */
export async function linkProposalToOpportunity(
  opportunityId: string,
  proposalId: string,
  link: boolean,
): Promise<LifecycleActionResult> {
  const { supabase, userId, role, canManage } = await getLifecycleAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canManage) return { ok: false, error: "You do not have permission to edit opportunities." };
  if (!UUID.test(opportunityId) || !UUID.test(proposalId)) return { ok: false, error: "Malformed reference." };

  const [{ data: opportunityRow }, { data: proposalRow }] = await Promise.all([
    supabase.from("opportunities").select("id, name, status, client_id").eq("id", opportunityId).maybeSingle(),
    supabase.from("client_proposals").select("id, title, client_id, opportunity_id").eq("id", proposalId).maybeSingle(),
  ]);

  if (!opportunityRow) return { ok: false, error: NOT_FOUND };
  if (!proposalRow) return { ok: false, error: "Proposal not found." };

  const opportunity = opportunityRow as { id: string; name: string; status: string; client_id: string | null };
  const proposal = proposalRow as { id: string; title: string; client_id: string | null; opportunity_id: string | null };

  if (isClosed(opportunity.status)) {
    return { ok: false, error: "This opportunity has left the lifecycle." };
  }

  if (link) {
    if (!opportunity.client_id) {
      return { ok: false, error: "Attach this opportunity to a company before linking a proposal." };
    }
    if (proposal.client_id !== opportunity.client_id) {
      return { ok: false, error: "That proposal belongs to a different company." };
    }
    if (proposal.opportunity_id === opportunityId) return { ok: true };
    if (proposal.opportunity_id) {
      return { ok: false, error: "That proposal is already linked to another opportunity." };
    }
  } else if (proposal.opportunity_id !== opportunityId) {
    return { ok: false, error: "That proposal is not linked to this opportunity." };
  }

  // Compare-and-set on opportunity_id itself — the column being written — so a
  // concurrent link from another deal loses instead of being overwritten. It
  // has to be `.is(null)` rather than `.eq(null)`: PostgREST renders eq.null as
  // a comparison against the literal, which matches nothing.
  const write = supabase
    .from("client_proposals")
    .update({ opportunity_id: link ? opportunityId : null })
    .eq("id", proposalId);

  const { data: updated, error } = await (link
    ? write.is("opportunity_id", null)
    : write.eq("opportunity_id", opportunityId)
  ).select("id");

  if (error) return { ok: false, error: friendlyError(error, "Could not link the proposal.") };
  if (!Array.isArray(updated) || updated.length === 0) {
    return { ok: false, error: "That proposal changed while you were looking at it. Reload and try again." };
  }

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "client_proposal",
      proposalId,
      userId,
      link
        ? `Linked proposal "${proposal.title}" to opportunity "${opportunity.name}"`
        : `Unlinked proposal "${proposal.title}" from opportunity "${opportunity.name}"`,
      { opportunity_id: proposal.opportunity_id },
      { opportunity_id: link ? opportunityId : null },
    ),
    actor_role: role,
  });

  revalidateLifecycle(opportunityId);
  revalidatePath("/employee/proposals");
  revalidatePath(`/employee/proposals/${proposalId}`);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Step 11 — closing the deal won                                             */
/* -------------------------------------------------------------------------- */

/**
 * Marks a deal won.
 *
 * Reaching step 11 and BEING won are different facts, and until now only the
 * first was recorded: advanceOpportunity carries the status forward unchanged,
 * so a deal at Closed Won & Onboarded sat there still marked open, and every
 * count of won deals read it as live. This is the act that closes it.
 *
 * Deliberately its own action rather than a side effect of the last advance. A
 * deal can reach step 11 while the contract is still being counter-signed;
 * winning is a claim somebody makes, and it changes numbers other people report
 * on. It also requires a company — a won deal with nothing to onboard is not a
 * won deal, it is a missing client record.
 */
export async function markOpportunityWon(opportunityId: string): Promise<LifecycleActionResult> {
  const { supabase, userId, role, canAdvance } = await getLifecycleAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canAdvance) return { ok: false, error: "You do not have permission to move opportunities." };
  if (!UUID.test(opportunityId)) return { ok: false, error: "Malformed opportunity reference." };

  const target = await readMoveTarget(supabase, opportunityId);
  if (!target.ok) return { ok: false, error: target.error };
  const before = target.row;

  if (before.status === "won") return { ok: true };
  if (isClosed(before.status)) {
    return { ok: false, error: "This opportunity has left the lifecycle. Reopen it before closing it won." };
  }
  if (before.step !== finalStepKey) {
    return {
      ok: false,
      error: `A deal is closed won at ${lifecycleStep(finalStepKey)?.label ?? finalStepKey}. Move it there first.`,
    };
  }
  if (!before.client_id) {
    return { ok: false, error: "Attach this opportunity to a company before closing it won." };
  }

  return applyMove({
    supabase,
    userId,
    role,
    before,
    // The step does not change: step 11 IS the won step. Only the status moves.
    toStep: before.step,
    toStatus: "won",
    kind: "won",
    reason: null,
    summary: `Closed "${before.name}" won`,
    // Reported on by other people, and reversible only by an admin reopen.
    severity: "warn",
  });
}

/** The columns a lifecycle read asks for. Re-exported so the page and the
 *  actions cannot drift; `"use server"` files may only export async functions,
 *  hence the wrapper rather than a bare const. */
export async function lifecycleSelectColumns(): Promise<string> {
  return opportunitySelect;
}
