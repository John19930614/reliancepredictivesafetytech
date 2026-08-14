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
import { isLifecycleStage, nextStage } from "@/lib/pipeline/stages";
import {
  buildDraftInvoice,
  checkInvoiceLineEdit,
  invoiceTotalsFrom,
  isEmptyDraft,
  isQuantityBasis,
  defaultQuantityBasis,
  maxInvoiceAmount,
  netDaysFromPaymentTerms,
  type EditableInvoiceLine,
  type InvoiceKind,
  type InvoiceLineEdit,
} from "@/lib/invoices/draft";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
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

/**
 * Loads the facts and evaluates the gate, turning a read failure into a result
 * rather than an exception.
 *
 * loadClientWorkflowFacts re-throws anything that is not a missing relation, and
 * it does so inside a Promise.all, so one transient error on any of six tables
 * rejects the whole thing. Without this the rejection escapes the server action
 * entirely and the step card — which is built around showing the operator a
 * message — shows nothing at all. The read happens strictly before the write, so
 * a failure here can never leave a stage half-moved.
 */
async function readGateFacts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  client: ClientRow,
): Promise<{ ok: boolean; gate?: ReturnType<typeof evaluateStageGate>; error?: string }> {
  try {
    const { facts } = await loadClientWorkflowFacts(supabase, client);
    return { ok: true, gate: evaluateStageGate(facts) };
  } catch (caught) {
    console.error("Could not read the client workflow facts.", caught);
    return { ok: false, error: "Could not check this client's outstanding steps just now. Try again in a moment." };
  }
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
  const { supabase, userId, role, userEmail, canAdvance } = await getPipelineAccess();
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

  const loaded = await readGateFacts(supabase, current);
  if (!loaded.ok || !loaded.gate) return { ok: false, error: loaded.error };
  const gate = loaded.gate;

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
    userEmail,
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
  const { supabase, userId, role, userEmail, canOverride } = await getPipelineAccess();
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

  const loaded = await readGateFacts(supabase, current);
  if (!loaded.ok || !loaded.gate) return { ok: false, error: loaded.error };
  const gate = loaded.gate;

  // Nothing outstanding: this is an ordinary advance wearing an override's
  // clothes. Recording it as a forced move would put a false entry in the
  // history of who skipped what.
  if (gate.canAdvance) {
    return applyStageMove({
      supabase,
      userId,
      role,
      userEmail,
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
    userEmail,
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
  userEmail: string | null;
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
    // A person, not a role. company_sales_activities.owner is rendered as a
    // name across the client record; app/m/actions.ts writes user.email here.
    owner: input.userEmail,
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

  const requested = kind as InvoiceKind;

  // Nothing stopped an operator raising "Deposit only" and then leaving the
  // dropdown on its default and raising "Full contract" — and `full` bills the
  // whole contract INCLUDING the deposit, so that is 200% of the deal across two
  // valid numbered documents. recordAcceptanceIncome guards the same way against
  // filing a schedule twice; billing needs it more, not less. The partial unique
  // index on (proposal_id, kind) is the backstop if this check is bypassed.
  const { data: liveInvoices } = await supabase
    .from("client_invoices")
    .select("kind, invoice_number")
    .eq("proposal_id", proposalId)
    .neq("status", "void")
    .limit(20);

  const live: Array<{ kind: string; invoice_number: string }> = Array.isArray(liveInvoices) ? liveInvoices : [];
  const clash = live.find((invoice) => invoice.kind === requested);
  if (clash) {
    return {
      ok: false,
      error: `This proposal already has a ${requested} invoice (${clash.invoice_number}). Void it first if it was raised in error.`,
    };
  }
  if (requested === "full" && live.length > 0) {
    return {
      ok: false,
      error: `This proposal has already been partly billed (${live.map((i) => i.invoice_number).join(", ")}). Raise the balance instead of the full contract.`,
    };
  }
  if (requested !== "full" && live.some((invoice) => invoice.kind === "full")) {
    return {
      ok: false,
      error: "The full contract has already been invoiced for this proposal, so there is nothing further to bill.",
    };
  }

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
    kind: requested,
    issueDate,
    // The contract's own payment-terms clause, which the client-facing document
    // prints verbatim. Without this every invoice silently defaulted to Net 30,
    // so a proposal reading "Due upon receipt" produced an invoice due in a
    // month — contradicting the contract it was derived from.
    netDays: netDaysFromPaymentTerms(
      typeof state.fields?.paymentTerms === "string" ? state.fields.paymentTerms : null,
    ),
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
      kind: draft.kind,
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

  const legacyLines = draft.lineItems.map((line) => ({
    invoice_id: created.id,
    description: line.description,
    quantity: line.quantity,
    unit_amount: line.unitAmount,
    line_total: line.lineTotal,
    sort_order: line.sortOrder,
  }));

  // unit and qty_basis are written from the outset, not left to the column
  // defaults. The default is 'flat' — correct for a line whose basis nobody
  // knows, and wrong for every fee-table row that was priced per seat or per
  // hour. A class booked for 12 seats that files itself as flat cannot be
  // corrected to 10 later, because a flat line ignores its quantity; that is
  // precisely the edit this whole change exists to allow.
  const { error: lineError } = await (async () => {
    const attempt = await supabase.from("client_invoice_line_items").insert(
      draft.lineItems.map((line, index) => ({
        ...legacyLines[index],
        unit: line.unit,
        qty_basis: line.qtyBasis,
      })),
    );

    // An environment whose migrations are one behind should still be able to
    // raise an invoice, exactly as the workflow page still renders without
    // client_invoices. The lines land with the default basis and can be
    // corrected once the migration is applied.
    if (attempt.error && isSchemaBehindError(attempt.error)) {
      return supabase.from("client_invoice_line_items").insert(legacyLines);
    }
    return attempt;
  })();

  if (lineError) {
    // An invoice with no lines is worse than no invoice: it carries a spent
    // number and a total nothing explains. Roll it back — and CHECK that the
    // rollback happened. PostgREST reports no error for a DELETE that RLS
    // filtered to zero rows, so an unchecked delete here reported failure to the
    // operator while leaving the orphan in place.
    const { data: removed } = await supabase
      .from("client_invoices")
      .delete()
      .eq("id", created.id)
      .select("id");

    if (!Array.isArray(removed) || removed.length === 0) {
      return {
        ok: false,
        error: `The invoice lines could not be written, and draft ${created.invoice_number} could not be withdrawn. Ask an admin to void it.`,
      };
    }

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

/* -------------------------------------------------------------------------- */
/* Editing a draft invoice                                                    */
/* -------------------------------------------------------------------------- */

/**
 * WHY THIS EXISTS. A class is quoted at 12 seats x $105 = $1,260 and ten people
 * turn up. The invoice has to say $1,050. Before this, the only routes to that
 * number were voiding the invoice and re-raising it from a proposal that still
 * said 12, or editing the figure in whatever document had been exported — one
 * spends an invoice number to fix a quantity, the other puts a number on a
 * client's desk that no record in this system agrees with.
 *
 * The rules the editor keeps, all of them enforced HERE and not only in the UI:
 *
 *   - Only a draft may be edited. An issued invoice has been seen by the client;
 *     changing what it says after that is a credit note, not an edit.
 *   - Amounts are computed, never accepted. The browser sends quantities; the
 *     server multiplies. A posted total has nowhere to enter.
 *   - The invoice header is recomputed from the stored lines afterwards, so what
 *     the invoice says it costs can never disagree with what it itemises.
 */

/** Bounds every read and write below; an invoice with 200 lines is pathological. */
const invoiceLineLimit = 200;

const INVOICE_NOT_DRAFT = "Only a draft invoice can be edited.";
const INVOICE_CHANGED = "This invoice changed while you were looking at it. Reload and try again.";
const SCHEMA_BEHIND =
  "Invoice editing is not set up in Supabase yet. Apply the latest database migrations and try again.";

/**
 * True when the database is behind the code — the table or a column this action
 * needs is not in the schema cache.
 *
 * Distinguished from an ordinary failure on purpose: "apply the migrations" is
 * something an operator can act on, and the alternative is a missing-column
 * error surfacing as "invoice not found", which sends them looking for a record
 * that is sitting right in front of them.
 */
function isSchemaBehindError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (isMissingSchemaRelationError(error)) return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (message.includes("could not find the") && message.includes("column"))
  );
}

interface EditableInvoiceRow {
  id: string;
  client_id: string;
  invoice_number: string;
  status: string;
  currency: string;
  subtotal: number;
  total: number;
  tax_amount: number;
}

const invoiceColumns =
  "id, client_id, invoice_number, status, currency, subtotal, total, tax_amount, consultant_name, job_name, payment_terms, client_agreement_ref, prepared_by";

const lineColumns = "id, description, quantity, unit_amount, unit, qty_basis, service_date, line_total, sort_order";

function toNumber(value: unknown): number {
  // PostgREST returns numeric columns as strings often enough that reading them
  // as numbers without this is a silent NaN in a money total.
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A stored row in the shape the pure editor works in. */
function toEditableLine(row: Record<string, unknown>): EditableInvoiceLine {
  return {
    id: String(row.id),
    description: typeof row.description === "string" ? row.description : "",
    quantity: toNumber(row.quantity),
    unitAmount: toNumber(row.unit_amount),
    unit: typeof row.unit === "string" ? row.unit : "",
    // A row written before the column existed reads as flat, which is the basis
    // that cannot re-price anything on its own.
    qtyBasis: isQuantityBasis(row.qty_basis) ? row.qty_basis : defaultQuantityBasis,
    serviceDate: typeof row.service_date === "string" ? row.service_date : null,
    lineTotal: toNumber(row.line_total),
  };
}

/**
 * Reads the invoice and refuses anything that is not an editable draft.
 *
 * The status check is deliberately duplicated with the RLS policy on
 * client_invoice_line_items, which already refuses a write whose parent is not a
 * draft. The policy is the backstop; this is the one that can say WHY in a
 * sentence, and it stops the action doing five reads and a partial write before
 * the database declines the last of them.
 */
async function readDraftInvoiceForEdit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  invoiceId: string,
): Promise<{ ok: boolean; error?: string; invoice?: EditableInvoiceRow }> {
  const { data, error } = await supabase
    .from("client_invoices")
    .select(invoiceColumns)
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    if (isSchemaBehindError(error)) return { ok: false, error: SCHEMA_BEHIND };
    return { ok: false, error: friendlyError(error, "Could not read this invoice.") };
  }
  if (!data) return { ok: false, error: INVOICE_MISSING };

  const invoice: EditableInvoiceRow = {
    id: String(data.id),
    client_id: String(data.client_id),
    invoice_number: String(data.invoice_number),
    status: String(data.status),
    currency: typeof data.currency === "string" ? data.currency : "USD",
    subtotal: toNumber(data.subtotal),
    total: toNumber(data.total),
    tax_amount: toNumber(data.tax_amount),
  };

  if (invoice.status !== "draft") {
    return {
      ok: false,
      error: `${INVOICE_NOT_DRAFT} ${invoice.invoice_number} is ${invoice.status} — void it and raise a replacement instead.`,
    };
  }

  return { ok: true, invoice };
}

/** Reads the lines of one invoice, in document order. */
async function readInvoiceLines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  invoiceId: string,
): Promise<{ ok: boolean; error?: string; lines?: EditableInvoiceLine[] }> {
  const { data, error } = await supabase
    .from("client_invoice_line_items")
    .select(lineColumns)
    .eq("invoice_id", invoiceId)
    .order("sort_order", { ascending: true })
    .limit(invoiceLineLimit);

  if (error) {
    if (isSchemaBehindError(error)) return { ok: false, error: SCHEMA_BEHIND };
    return { ok: false, error: friendlyError(error, "Could not read the invoice lines.") };
  }

  const rows: Array<Record<string, unknown>> = Array.isArray(data) ? data : [];
  return { ok: true, lines: rows.map(toEditableLine) };
}

export interface InvoiceLineView {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number;
  unit: string;
  qtyBasis: string;
  serviceDate: string | null;
  lineTotal: number;
}

export interface InvoiceLinesResult extends WorkflowActionResult {
  lines?: InvoiceLineView[];
  taxAmount?: number;
  subtotal?: number;
  total?: number;
  editable?: boolean;
}

/**
 * Reads one invoice's lines for the billing panel.
 *
 * A READ, served by a server action rather than a browser query, because
 * CLAUDE.md keeps Supabase out of client components — the panel is a client
 * component and the workflow page does not fetch lines. Auth-gated like every
 * other action here: RLS would refuse a stranger anyway, but an action that
 * skipped the check would be reporting "no lines" where it means "not allowed".
 */
export async function loadInvoiceLines(invoiceId: string): Promise<InvoiceLinesResult> {
  const { supabase, userId, canRead, isAdmin } = await getPipelineAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canRead) return { ok: false, error: "You do not have permission to view invoices." };
  if (!UUID.test(invoiceId)) return { ok: false, error: "Malformed invoice reference." };

  const { data: invoiceRow, error: invoiceError } = await supabase
    .from("client_invoices")
    .select("id, status, subtotal, total, tax_amount")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError && isSchemaBehindError(invoiceError)) return { ok: false, error: SCHEMA_BEHIND };
  if (invoiceError) return { ok: false, error: friendlyError(invoiceError, "Could not read this invoice.") };
  if (!invoiceRow) return { ok: false, error: INVOICE_MISSING };

  const read = await readInvoiceLines(supabase, invoiceId);
  if (!read.ok || !read.lines) return { ok: false, error: read.error };

  return {
    ok: true,
    lines: read.lines,
    taxAmount: toNumber(invoiceRow.tax_amount),
    subtotal: toNumber(invoiceRow.subtotal),
    total: toNumber(invoiceRow.total),
    // The panel greys the inputs on this; the action refuses on its own copy of
    // the same two facts, so a stale `true` here buys nobody anything.
    editable: invoiceRow.status === "draft" && isAdmin,
  };
}

export interface InvoiceRepriceResult extends WorkflowActionResult {
  subtotal?: number;
  total?: number;
  /** Set when the edit changed something the operator should be told about. */
  notice?: string;
}

/**
 * Recomputes the invoice header from the stored lines and writes it back.
 *
 * Called after every line edit and after a tax change, and it re-reads the lines
 * rather than trusting what was just written: the stored rows are what the
 * client-facing document renders from, so they are what the total must be the
 * sum of. THE INVARIANT IS total = subtotal + tax_amount.
 */
async function syncInvoiceTotals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  invoice: EditableInvoiceRow,
  taxAmount: number,
  extraPatch: Record<string, unknown> = {},
): Promise<{ ok: boolean; error?: string; subtotal: number; total: number }> {
  const read = await readInvoiceLines(supabase, invoice.id);
  const lines = read.lines ?? [];
  const { subtotal, total } = invoiceTotalsFrom(lines, taxAmount);

  if (total > maxInvoiceAmount) {
    return {
      ok: false,
      error: "These lines come to more than this system will invoice. Check the figures.",
      subtotal,
      total,
    };
  }

  // Nothing to write. An UPDATE here would still fire the updated_at trigger,
  // and a financial record that reports having been touched when nobody changed
  // anything is a false trail for whoever reads it later. Note the test is
  // against the STORED figures, so a header that has drifted from its own lines
  // is still repaired.
  const alreadyCorrect =
    Object.keys(extraPatch).length === 0 &&
    subtotal === invoice.subtotal &&
    total === invoice.total &&
    taxAmount === invoice.tax_amount;
  if (alreadyCorrect) return { ok: true, subtotal, total };

  const { data: updated, error } = await supabase
    .from("client_invoices")
    .update({ ...extraPatch, subtotal, total, tax_amount: taxAmount })
    .eq("id", invoice.id)
    // Compare-and-set on the status we read. If somebody issued this invoice
    // while the edit was in flight, the header write matches zero rows and is
    // reported rather than applied to a document the client has already seen.
    .eq("status", "draft")
    .select("id");

  if (error) return { ok: false, error: friendlyError(error, "Could not update the invoice total."), subtotal, total };
  if (!Array.isArray(updated) || updated.length === 0) {
    return { ok: false, error: INVOICE_CHANGED, subtotal, total };
  }

  return { ok: true, subtotal, total };
}

/**
 * Applies operator edits to the lines of a draft invoice.
 *
 * ADMIN ONLY, and not because editing is grand: client_invoices carries a single
 * UPDATE policy ("Admins can settle invoices") and nothing else may write its
 * subtotal or total. A non-admin allowed in here would edit the lines — RLS
 * permits that while the parent is a draft — and then be refused the header
 * write, leaving an invoice whose total contradicts its own body. Claiming a
 * permission the database will decline halfway through is worse than declining
 * it up front. See the note in the report: widening this needs an RLS policy,
 * which is a STOP CONDITION and a decision for a human.
 */
export async function updateDraftInvoiceLines(
  invoiceId: string,
  edits: InvoiceLineEdit[],
): Promise<InvoiceRepriceResult> {
  const { supabase, userId, role, isAdmin } = await getPipelineAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!isAdmin) {
    return { ok: false, error: "Admin role required to change what an invoice bills." };
  }
  if (!UUID.test(invoiceId)) return { ok: false, error: "Malformed invoice reference." };

  if (!Array.isArray(edits) || edits.length === 0) {
    return { ok: false, error: "Nothing to save." };
  }
  if (edits.length > invoiceLineLimit) {
    return { ok: false, error: "Too many lines in one save. Save them in smaller batches." };
  }

  const seen = new Set<string>();
  for (const edit of edits) {
    if (!edit || typeof edit.id !== "string" || !UUID.test(edit.id)) {
      return { ok: false, error: "Malformed line reference." };
    }
    // Two edits to one line is an ambiguous instruction, and the last-wins
    // reading is the one that quietly loses somebody's change.
    if (seen.has(edit.id)) return { ok: false, error: "The same line was sent twice. Reload and try again." };
    seen.add(edit.id);
  }

  const loaded = await readDraftInvoiceForEdit(supabase, invoiceId);
  if (!loaded.ok || !loaded.invoice) return { ok: false, error: loaded.error };
  const invoice = loaded.invoice;

  const read = await readInvoiceLines(supabase, invoiceId);
  if (!read.ok || !read.lines) return { ok: false, error: read.error };
  const stored = new Map(read.lines.map((line) => [line.id, line]));

  // VALIDATE EVERYTHING BEFORE WRITING ANYTHING. A batch that is half-applied
  // and then rejected leaves an invoice nobody meant to raise; refusing the
  // whole batch leaves the document exactly as the operator last saw it.
  const fieldErrors: Record<string, string> = {};
  const pending: EditableInvoiceLine[] = [];

  for (const edit of edits) {
    const current = stored.get(edit.id);
    if (!current) {
      // Also the guard against editing another invoice's line: the id has to be
      // on THIS invoice, whatever RLS would have allowed on its own.
      return { ok: false, error: "That line is not on this invoice. Reload and try again." };
    }

    const checked = checkInvoiceLineEdit(current, edit);
    if (!checked.ok || !checked.line) {
      fieldErrors[edit.id] = checked.error ?? "That value is not accepted.";
      continue;
    }
    pending.push(checked.line);
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: Object.values(fieldErrors)[0], fieldErrors };
  }

  const changed = pending.filter((line) => {
    const current = stored.get(line.id);
    if (!current) return false;
    return (
      current.description !== line.description ||
      current.quantity !== line.quantity ||
      current.unitAmount !== line.unitAmount ||
      current.unit !== line.unit ||
      current.qtyBasis !== line.qtyBasis ||
      current.serviceDate !== line.serviceDate ||
      current.lineTotal !== line.lineTotal
    );
  });

  let writeError: string | null = null;

  for (const line of changed) {
    const { data: updated, error } = await supabase
      .from("client_invoice_line_items")
      .update({
        description: line.description,
        quantity: line.quantity,
        unit_amount: line.unitAmount,
        // Computed by lineTotalFor from the quantity, the price and the basis.
        // Never the figure the browser displayed.
        line_total: line.lineTotal,
        unit: line.unit,
        qty_basis: line.qtyBasis,
        service_date: line.serviceDate,
      })
      .eq("id", line.id)
      // Belt and braces with the check above: the row must belong to THIS
      // invoice, so a swapped id cannot reprice somebody else's document.
      .eq("invoice_id", invoiceId)
      .select("id");

    if (error) {
      writeError = isSchemaBehindError(error) ? SCHEMA_BEHIND : friendlyError(error, "Could not save the invoice line.");
      break;
    }
    // RLS refuses a line write once the parent invoice leaves draft, and
    // PostgREST reports no error for an update that matched nothing.
    if (!Array.isArray(updated) || updated.length === 0) {
      writeError = INVOICE_CHANGED;
      break;
    }
  }

  // Re-total EVEN IF a line write failed. A half-applied batch has already
  // changed what the document bills, and an invoice whose header no longer
  // matches its body is the one state this must never be left in.
  const synced = await syncInvoiceTotals(supabase, invoice, invoice.tax_amount);

  if (changed.length > 0) {
    await recordAuditEvent({
      ...buildDataAuditEvent(
        "update",
        "client_invoice",
        invoiceId,
        userId,
        `Repriced draft invoice ${invoice.invoice_number}: ${changed.length} line${changed.length === 1 ? "" : "s"} edited, total ${invoice.total.toFixed(2)} → ${synced.total.toFixed(2)}`,
        { subtotal: invoice.subtotal, total: invoice.total },
        {
          subtotal: synced.subtotal,
          total: synced.total,
          tax_amount: invoice.tax_amount,
          lines: changed.map((line) => ({
            id: line.id,
            quantity: line.quantity,
            unit_amount: line.unitAmount,
            qty_basis: line.qtyBasis,
            line_total: line.lineTotal,
          })),
        },
      ),
      event_category: "billing",
      actor_role: role,
    });
  }

  if (writeError) return { ok: false, error: writeError };
  if (!synced.ok) return { ok: false, error: synced.error };

  revalidateClient(invoice.client_id);

  return {
    ok: true,
    subtotal: synced.subtotal,
    total: synced.total,
    // The proposal's discount was folded into the invoice total when it was
    // raised, and there is no discount column to fold it into again. Once the
    // lines are the source of truth the discount is gone, so say so rather than
    // let an operator discover it on the client's copy.
    notice: adjustmentLostNotice(invoice, synced.total),
  };
}

/**
 * Warns when re-totalling has dropped an adjustment that was baked into the
 * original total (a proposal-level discount, which buildDraftInvoice records
 * only in the notes because there is no column for it).
 */
function adjustmentLostNotice(invoice: EditableInvoiceRow, newTotal: number): string | undefined {
  const priorAdjustment = round2(invoice.total - (invoice.subtotal + invoice.tax_amount));
  if (priorAdjustment >= -0.005) return undefined;
  return `This invoice carried a ${Math.abs(priorAdjustment).toFixed(2)} adjustment from the proposal that is not a line. It is no longer applied — the total is now the lines plus tax (${newTotal.toFixed(2)}). Add it as a line if it still stands.`;
}

function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export interface InvoiceDetailsEdit {
  consultantName?: string | null;
  jobName?: string | null;
  paymentTerms?: string | null;
  clientAgreementRef?: string | null;
  preparedBy?: string | null;
  taxAmount?: number | null;
}

/** Column CHECK bounds, repeated here so a too-long value is a sentence not a 23514. */
const detailLimits: Record<keyof Omit<InvoiceDetailsEdit, "taxAmount">, { column: string; max: number; label: string }> =
  {
    consultantName: { column: "consultant_name", max: 200, label: "Consultant name" },
    jobName: { column: "job_name", max: 300, label: "Job name" },
    paymentTerms: { column: "payment_terms", max: 1000, label: "Payment terms" },
    clientAgreementRef: { column: "client_agreement_ref", max: 120, label: "Client agreement number" },
    preparedBy: { column: "prepared_by", max: 200, label: "Prepared by" },
  };

/**
 * Edits the header fields the printed invoice needs, and the tax on it.
 *
 * Admin-only for the same reason as the line editor: client_invoices has one
 * UPDATE policy and it is the admin one.
 *
 * Tax is the only field here that touches money, and it does not get written on
 * its own — the total is recomputed from the stored lines plus the new tax, so
 * the invariant holds after this action exactly as it does after a line edit.
 */
export async function updateInvoiceDetails(
  invoiceId: string,
  details: InvoiceDetailsEdit,
): Promise<InvoiceRepriceResult> {
  const { supabase, userId, role, isAdmin } = await getPipelineAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!isAdmin) {
    return { ok: false, error: "Admin role required to change what an invoice bills." };
  }
  if (!UUID.test(invoiceId)) return { ok: false, error: "Malformed invoice reference." };
  if (!details || typeof details !== "object") return { ok: false, error: "Nothing to save." };

  const patch: Record<string, unknown> = {};

  for (const [key, limit] of Object.entries(detailLimits) as Array<
    [keyof typeof detailLimits, (typeof detailLimits)[keyof typeof detailLimits]]
  >) {
    const value = details[key];
    if (value === undefined) continue;
    if (value === null) {
      patch[limit.column] = null;
      continue;
    }
    if (typeof value !== "string") return { ok: false, error: `${limit.label} must be text.` };
    const trimmed = value.trim();
    if (trimmed.length > limit.max) {
      return {
        ok: false,
        error: `Keep ${limit.label.toLowerCase()} under ${limit.max} characters.`,
        fieldErrors: { [key]: `Under ${limit.max} characters.` },
      };
    }
    // An emptied field is a cleared field, not an empty string: the columns are
    // nullable so a renderer can tell "not recorded" from "recorded as blank".
    patch[limit.column] = trimmed.length === 0 ? null : trimmed;
  }

  const loaded = await readDraftInvoiceForEdit(supabase, invoiceId);
  if (!loaded.ok || !loaded.invoice) return { ok: false, error: loaded.error };
  const invoice = loaded.invoice;

  let taxAmount = invoice.tax_amount;
  if (details.taxAmount !== undefined && details.taxAmount !== null) {
    if (typeof details.taxAmount !== "number" || !Number.isFinite(details.taxAmount)) {
      return { ok: false, error: "Tax must be a number.", fieldErrors: { taxAmount: "Enter a number." } };
    }
    taxAmount = round2(details.taxAmount);
    if (taxAmount < 0) {
      return { ok: false, error: "Tax cannot be negative.", fieldErrors: { taxAmount: "Cannot be negative." } };
    }
    if (taxAmount > maxInvoiceAmount) {
      return { ok: false, error: "That tax figure looks wrong. Check it before billing it." };
    }
  }

  const synced = await syncInvoiceTotals(supabase, invoice, taxAmount, patch);
  if (!synced.ok) return { ok: false, error: synced.error };

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "client_invoice",
      invoiceId,
      userId,
      `Edited draft invoice ${invoice.invoice_number}${
        taxAmount !== invoice.tax_amount ? `: tax ${invoice.tax_amount.toFixed(2)} → ${taxAmount.toFixed(2)},` : ":"
      } total ${invoice.total.toFixed(2)} → ${synced.total.toFixed(2)}`,
      { subtotal: invoice.subtotal, total: invoice.total, tax_amount: invoice.tax_amount },
      { ...patch, subtotal: synced.subtotal, total: synced.total, tax_amount: taxAmount },
    ),
    event_category: "billing",
    actor_role: role,
  });

  revalidateClient(invoice.client_id);
  return { ok: true, subtotal: synced.subtotal, total: synced.total };
}
