"use server";

// Server actions for the client workflow: moving a client through the journey,
// and raising the invoice that the Invoicing step exists to produce.
//
// These replace the browser-side writes the sales board has always used
// (SalesPipelineManager.updateStage wrote company_clients directly from the
// client, with no audit and no revalidation). CLAUDE.md forbids client-side
// mutation; app/m/actions.ts:updateMobileLeadStage is the compliant reference
// this file follows — validate the stage, log the activity, audit, revalidate
// every surface that renders the value.
//
// EVERY WRITE IS COMPARE-AND-SET. PostgREST reports no error for an UPDATE that
// matched zero rows, so each mutation names the state it read and asks for the
// affected ids back. Two people advancing the same client at once means the
// second one is told the stage moved, rather than both being told it worked.

import { revalidatePath } from "next/cache";
import { buildDataAuditEvent, recordAuditEvent } from "@/lib/audit/events";
import { friendlyError } from "@/lib/friendly-error";
import { getPipelineAccess } from "@/lib/pipeline/access";
import { evaluateStageGate, describeBlockers } from "@/lib/pipeline/gates";
import { loadClientWorkflowFacts } from "@/lib/pipeline/facts";
import { checkOverrideReason } from "@/lib/pipeline/policy";
import { isLifecycleStage, nextStage, stageDetail } from "@/lib/pipeline/stages";
import { buildDraftInvoice, isEmptyDraft, type InvoiceKind } from "@/lib/invoices/draft";
import { isGeneratorState } from "@/lib/proposals/generator-state";
import { computeProposalTotals } from "@/lib/proposals/pricing";

export interface WorkflowActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SIGNED_OUT = "You must be signed in.";
const CLIENT_MISSING = "Client not found or you do not have permission to change it.";
const STAGE_MOVED = "This client's stage changed while you were looking at it. Reload and try again.";
const INVOICE_MISSING = "Invoice not found or you do not have permission to change it.";

/** Every surface that renders a client's stage or invoices. */
function revalidateClient(clientId: string): void {
  revalidatePath(`/employee/clients/${clientId}/workflow`);
  revalidatePath(`/employee/clients/${clientId}`);
  revalidatePath("/employee/sales");
  revalidatePath("/employee/active-companies");
  revalidatePath("/employee/finance");
  revalidatePath("/m/leads");
  revalidatePath(`/m/leads/${clientId}`);
}

interface ClientRow {
  id: string;
  name: string;
  lifecycle_stage: string;
  owner: string | null;
}

/* -------------------------------------------------------------------------- */
/* Stage movement                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Moves a client to the next stage, refusing when the current step is not
 * finished.
 *
 * The gate is re-evaluated here from a fresh read rather than trusted from the
 * page: the button was rendered at some earlier moment, and a requirement can
 * be un-ticked between render and click.
 */
export async function advanceClientStage(clientId: string): Promise<WorkflowActionResult> {
  const { supabase, userId, role, canAdvance } = await getPipelineAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canAdvance) return { ok: false, error: "You do not have permission to move clients through the pipeline." };
  if (!UUID.test(clientId)) return { ok: false, error: "Malformed client reference." };

  const { data: client } = await supabase
    .from("company_clients")
    .select("id, name, lifecycle_stage, owner")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) return { ok: false, error: CLIENT_MISSING };

  const current = client as ClientRow;
  const target = nextStage(current.lifecycle_stage);
  if (!target) {
    return {
      ok: false,
      error: isLifecycleStage(current.lifecycle_stage)
        ? "This client is already at the last stage of the journey."
        : `"${current.lifecycle_stage}" is not a stage in the journey. Set a valid stage on the client record first.`,
    };
  }

  const { facts } = await loadClientWorkflowFacts(supabase, current);
  const gate = evaluateStageGate(facts);

  if (!gate.canAdvance) {
    const outstanding = describeBlockers(gate);
    return {
      ok: false,
      error: outstanding
        ? `${current.name} is not ready to leave ${current.lifecycle_stage}. ${outstanding}.`
        : `${current.name} cannot leave ${current.lifecycle_stage} yet.`,
    };
  }

  return applyStageMove({
    supabase,
    userId,
    role,
    client: current,
    target,
    wasOverride: false,
    overrideReason: null,
    blockedReasons: [],
  });
}

/**
 * Moves a client forward past a step that is NOT finished, on an admin's word.
 *
 * The escape hatch exists because the board it replaces had no gates at all,
 * and a process that can strand a real deal gets worked around rather than
 * followed. What it does not do is hide the fact: the failing requirements are
 * frozen into the transition record alongside the reason, so the row still
 * means something after somebody later ticks the boxes.
 */
export async function overrideClientStage(clientId: string, reason: string): Promise<WorkflowActionResult> {
  const { supabase, userId, role, canOverride } = await getPipelineAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canOverride) {
    return { ok: false, error: "Admin role required to move a client past an unfinished step." };
  }
  if (!UUID.test(clientId)) return { ok: false, error: "Malformed client reference." };

  const checked = checkOverrideReason(reason);
  if (!checked.ok || !checked.reason) {
    return { ok: false, error: checked.error, fieldErrors: { reason: checked.error ?? "" } };
  }

  const { data: client } = await supabase
    .from("company_clients")
    .select("id, name, lifecycle_stage, owner")
    .eq("id", clientId)
    .maybeSingle();

  if (!client) return { ok: false, error: CLIENT_MISSING };

  const current = client as ClientRow;
  const target = nextStage(current.lifecycle_stage);
  if (!target) {
    return {
      ok: false,
      error: isLifecycleStage(current.lifecycle_stage)
        ? "This client is already at the last stage of the journey."
        : `"${current.lifecycle_stage}" is not a stage in the journey. Set a valid stage on the client record first.`,
    };
  }

  const { facts } = await loadClientWorkflowFacts(supabase, current);
  const gate = evaluateStageGate(facts);

  // Nothing outstanding: this is an ordinary advance wearing an override's
  // clothes. Recording it as a forced move would put a false entry in the
  // history of who skipped what.
  if (gate.canAdvance) {
    return applyStageMove({
      supabase,
      userId,
      role,
      client: current,
      target,
      wasOverride: false,
      overrideReason: null,
      blockedReasons: [],
    });
  }

  return applyStageMove({
    supabase,
    userId,
    role,
    client: current,
    target,
    wasOverride: true,
    overrideReason: checked.reason,
    blockedReasons: gate.blockers.map((blocker) => ({ code: blocker.code, label: blocker.label })),
  });
}

interface ApplyStageMoveInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  role: string | null;
  client: ClientRow;
  target: string;
  wasOverride: boolean;
  overrideReason: string | null;
  blockedReasons: Array<{ code: string; label: string }>;
}

/** The write shared by the advance and override paths. */
async function applyStageMove(input: ApplyStageMoveInput): Promise<WorkflowActionResult> {
  const { supabase, userId, role, client, target } = input;
  const movedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("company_clients")
    .update({ lifecycle_stage: target, stage_changed_at: movedAt })
    .eq("id", client.id)
    // Compare-and-set on the stage we read, so a concurrent move is refused
    // rather than silently overwritten.
    .eq("lifecycle_stage", client.lifecycle_stage)
    .select("id");

  if (updateError) return { ok: false, error: friendlyError(updateError, "Could not move this client.") };
  if (!Array.isArray(updated) || updated.length === 0) return { ok: false, error: STAGE_MOVED };

  // History first, then the softer activity log. A failure to write either must
  // not report the move as failed — the stage has already changed.
  const { error: transitionError } = await supabase.from("client_stage_transitions").insert({
    client_id: client.id,
    from_stage: client.lifecycle_stage,
    to_stage: target,
    was_override: input.wasOverride,
    override_reason: input.overrideReason,
    blocked_reasons: input.blockedReasons,
    changed_by: userId,
    changed_at: movedAt,
  });
  if (transitionError) {
    console.error("Could not record the client stage transition.", transitionError);
  }

  const { error: activityError } = await supabase.from("company_sales_activities").insert({
    client_id: client.id,
    activity_type: "Stage Change",
    title: `Stage moved to ${target}`,
    notes: input.wasOverride
      ? `Moved past unfinished step. Reason: ${input.overrideReason}`
      : `Advanced from ${client.lifecycle_stage}.`,
    activity_date: movedAt.slice(0, 10),
    owner: role ?? null,
  });
  if (activityError) {
    console.error("Could not log the client stage change.", activityError);
  }

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "company_clients",
      client.id,
      userId,
      input.wasOverride
        ? `Forced ${client.name} from ${client.lifecycle_stage} to ${target} past ${input.blockedReasons.length} unfinished requirement${input.blockedReasons.length === 1 ? "" : "s"}: ${input.overrideReason}`
        : `Advanced ${client.name} from ${client.lifecycle_stage} to ${target}`,
      { lifecycle_stage: client.lifecycle_stage },
      {
        lifecycle_stage: target,
        was_override: input.wasOverride,
        blocked_reasons: input.blockedReasons.map((blocker) => blocker.code),
      },
    ),
    // A forced move is the event a reviewer goes looking for; it must not sit
    // at the same severity as an ordinary advance.
    severity: input.wasOverride ? "warn" : "info",
    actor_role: role,
  });

  revalidateClient(client.id);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Invoicing                                                                  */
/* -------------------------------------------------------------------------- */

const INVOICE_KINDS = new Set<InvoiceKind>(["deposit", "full", "balance"]);

/**
 * Raises a draft invoice from an accepted proposal.
 *
 * Every figure is recomputed from the accepted revision's stored state, never
 * taken from the caller — the browser has no say in what a client is billed.
 * The invoice is created in `draft`: raising it and issuing it are two acts,
 * and only the second one asks anyone for money.
 */
export async function createInvoiceFromProposal(
  clientId: string,
  proposalId: string,
  kind: string,
): Promise<WorkflowActionResult & { invoiceId?: string; invoiceNumber?: string }> {
  const { supabase, userId, role, canDraftInvoice } = await getPipelineAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canDraftInvoice) return { ok: false, error: "You do not have permission to raise invoices." };
  if (!UUID.test(clientId) || !UUID.test(proposalId)) return { ok: false, error: "Malformed reference." };
  if (!INVOICE_KINDS.has(kind as InvoiceKind)) return { ok: false, error: "Choose a valid invoice type." };

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, title, proposal_number, client_id, status, form_data, accepted_revision_id")
    .eq("id", proposalId)
    .maybeSingle();

  if (!proposal) return { ok: false, error: "Proposal not found." };
  if (proposal.client_id !== clientId) {
    return { ok: false, error: "That proposal belongs to a different client." };
  }
  if (proposal.status !== "accepted") {
    return { ok: false, error: "Only an accepted proposal can be invoiced." };
  }

  // Price the revision the client actually accepted, not the working copy,
  // which may have moved on since. Same rule as recordAcceptanceIncome.
  let state: unknown = proposal.form_data;
  if (proposal.accepted_revision_id) {
    const { data: revision } = await supabase
      .from("client_proposal_revisions")
      .select("form_data")
      .eq("id", proposal.accepted_revision_id)
      .eq("proposal_id", proposalId)
      .maybeSingle();
    if (revision?.form_data) state = revision.form_data;
  }

  if (!isGeneratorState(state)) {
    return { ok: false, error: "This proposal has no saved content, so no invoice could be derived from it." };
  }

  const issueDate = new Date().toISOString().slice(0, 10);
  const draft = buildDraftInvoice({
    totals: computeProposalTotals(state),
    kind: kind as InvoiceKind,
    issueDate,
  });

  if (isEmptyDraft(draft)) {
    return {
      ok: false,
      error:
        draft.kind === "deposit"
          ? "This proposal has no deposit, so there is nothing to invoice yet. Raise the full invoice instead."
          : "This proposal prices out at zero, so there is nothing to invoice.",
    };
  }

  const reference = [proposal.proposal_number, proposal.title].filter(Boolean).join(" — ") || "Proposal";

  const { data: created, error: insertError } = await supabase
    .from("client_invoices")
    .insert({
      client_id: clientId,
      proposal_id: proposalId,
      status: "draft",
      issue_date: draft.issueDate,
      due_date: draft.dueDate,
      subtotal: draft.subtotal,
      total: draft.total,
      notes: [reference, draft.notes].filter(Boolean).join(" · "),
      created_by: userId,
    })
    .select("id, invoice_number")
    .single();

  if (insertError || !created) {
    return { ok: false, error: friendlyError(insertError, "Could not raise the invoice.") };
  }

  const { error: lineError } = await supabase.from("client_invoice_line_items").insert(
    draft.lineItems.map((line) => ({
      invoice_id: created.id,
      description: line.description,
      quantity: line.quantity,
      unit_amount: line.unitAmount,
      line_total: line.lineTotal,
      sort_order: line.sortOrder,
    })),
  );

  if (lineError) {
    // An invoice with no lines is worse than no invoice: it carries a spent
    // number and a total nothing explains. Roll it back.
    await supabase.from("client_invoices").delete().eq("id", created.id);
    return { ok: false, error: friendlyError(lineError, "Could not write the invoice lines.") };
  }

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "create",
      "client_invoice",
      created.id,
      userId,
      `Raised ${draft.kind} invoice ${created.invoice_number} for ${draft.total.toFixed(2)} against ${reference}`,
      null,
      { client_id: clientId, proposal_id: proposalId, kind: draft.kind, total: draft.total },
    ),
    event_category: "billing",
    actor_role: role,
  });

  revalidateClient(clientId);
  return { ok: true, invoiceId: created.id, invoiceNumber: created.invoice_number };
}

type InvoiceSettlement = "issued" | "paid" | "void";

/**
 * Issues a draft invoice, marks an issued one paid, or voids either.
 *
 * Admin-only: issuing asks a client for money, and voiding retires a numbered
 * financial record. The legal moves are draft→issued, issued→paid, and
 * draft|issued→void; anything else is refused rather than quietly applied, so
 * a paid invoice cannot be walked back to draft.
 */
export async function settleInvoice(
  invoiceId: string,
  settlement: string,
  reason?: string,
): Promise<WorkflowActionResult> {
  const { supabase, userId, role, canSettleInvoice } = await getPipelineAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canSettleInvoice) {
    return { ok: false, error: "Admin role required to issue, settle, or void an invoice." };
  }
  if (!UUID.test(invoiceId)) return { ok: false, error: "Malformed invoice reference." };

  const target = settlement as InvoiceSettlement;
  if (target !== "issued" && target !== "paid" && target !== "void") {
    return { ok: false, error: "Choose a valid invoice action." };
  }

  const { data: invoice } = await supabase
    .from("client_invoices")
    .select("id, client_id, invoice_number, status, total, issue_date")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return { ok: false, error: INVOICE_MISSING };

  const allowed: Record<string, InvoiceSettlement[]> = {
    draft: ["issued", "void"],
    issued: ["paid", "void"],
    paid: [],
    void: [],
  };

  if (!(allowed[invoice.status] ?? []).includes(target)) {
    return {
      ok: false,
      error: `An invoice that is ${invoice.status} cannot be marked ${target}.`,
    };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: target };

  if (target === "issued") {
    patch.issued_at = now;
    patch.issued_by = userId;
    // The CHECK constraint requires an issue_date on an issued invoice; a draft
    // raised without one would otherwise fail at the database with a 23514.
    if (!invoice.issue_date) patch.issue_date = now.slice(0, 10);
  }
  if (target === "paid") {
    patch.paid_at = now;
    patch.paid_by = userId;
  }
  if (target === "void") {
    const trimmed = typeof reason === "string" ? reason.trim() : "";
    if (trimmed.length === 0) {
      return { ok: false, error: "Give a reason for voiding this invoice.", fieldErrors: { reason: "Give a reason." } };
    }
    if (trimmed.length > 1000) {
      return { ok: false, error: "Keep the void reason under 1000 characters." };
    }
    patch.voided_at = now;
    patch.void_reason = trimmed;
  }

  const { data: updated, error: updateError } = await supabase
    .from("client_invoices")
    .update(patch)
    .eq("id", invoiceId)
    .eq("status", invoice.status)
    .select("id");

  if (updateError) return { ok: false, error: friendlyError(updateError, "Could not update the invoice.") };
  if (!Array.isArray(updated) || updated.length === 0) {
    return { ok: false, error: "This invoice changed while you were looking at it. Reload and try again." };
  }

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "client_invoice",
      invoiceId,
      userId,
      `Invoice ${invoice.invoice_number} marked ${target}` + (target === "void" ? `: ${patch.void_reason}` : ""),
      { status: invoice.status },
      { status: target, total: invoice.total },
    ),
    event_category: "billing",
    severity: target === "void" ? "warn" : "info",
    actor_role: role,
  });

  revalidateClient(invoice.client_id);
  return { ok: true };
}

/**
 * The advance label for a stage, for a client component that should not import
 * the stage table just to render a button.
 *
 * Exported as an async function because a `"use server"` file may only export
 * async functions — a plain const here throws at module evaluation the first
 * time any action in this file runs (see lib/guardrails/use-server-exports).
 */
export async function getStageAdvanceLabel(stage: string): Promise<string> {
  return stageDetail(stage)?.advanceLabel ?? "Advance";
}
