"use server";

import { revalidatePath } from "next/cache";
import { getInvoiceAccess } from "@/lib/invoices/access";
import { createInvoiceFromProposal } from "@/lib/invoices/create-from-proposal";
import { updateDraftInvoiceLines, type DraftInvoiceLineInput } from "@/lib/invoices/draft";
import { invoiceKinds, validateInvoice, type InvoiceKind, type InvoiceLine } from "@/lib/invoices/invoice";
import type { ProposalBillingSelection } from "@/lib/invoices/proposal-billing";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * PostgREST returns no error for an UPDATE that matched zero rows — whether
 * the id does not exist or RLS filtered it out. Every mutation here that goes
 * through the session-scoped client therefore asks for the affected ids back
 * and treats an empty result as a failure.
 */
const NO_ROWS_MESSAGE = "Invoice not found, or you do not have permission to change it.";

function revalidateInvoices(invoiceId?: string, proposalId?: string | null) {
  revalidatePath("/employee/invoices");
  if (invoiceId) revalidatePath(`/employee/invoices/${invoiceId}`);
  if (proposalId) revalidatePath(`/employee/proposals/${proposalId}`);
}

export async function generateInvoiceFromProposal(
  proposalId: string,
  generationKey: string,
  selections: readonly ProposalBillingSelection[],
): Promise<ActionResult & { invoiceId?: string }> {
  const { userId, role, canSeeMoney } = await getInvoiceAccess();
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (!canSeeMoney) return { ok: false, error: "Invoices are restricted to finance-authorised users and owners." };

  const result = await createInvoiceFromProposal({
    proposalId,
    generationKey,
    selections,
    actorUserId: userId,
    actorRole: role,
  });
  if (!result.ok || !result.invoiceId) {
    return { ok: false, error: result.error ?? "Could not create the invoice." };
  }

  revalidateInvoices(result.invoiceId, proposalId);
  return { ok: true, invoiceId: result.invoiceId };
}

const EDITABLE_HEADER_FIELDS = [
  "kind",
  "issue_date",
  "due_date",
  "currency",
  "tax_amount",
  "notes",
  "consultant_name",
  "job_name",
  "payment_terms",
  "client_agreement_ref",
  "prepared_by",
  "variance_reason",
] as const;

export interface InvoiceHeaderPatch {
  kind?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  currency?: string;
  tax_amount?: number;
  notes?: string | null;
  consultant_name?: string | null;
  job_name?: string | null;
  payment_terms?: string | null;
  client_agreement_ref?: string | null;
  prepared_by?: string | null;
  /**
   * Why this invoice differs from the signed proposal's value. The database
   * requires it before invoices against a proposal may exceed that value —
   * editing the signed proposal to fit is not on offer (2026-08-31).
   */
  variance_reason?: string | null;
}

/**
 * Header edits — everything except status. Gated on isAdmin because the
 * database only lets an admin UPDATE client_invoices ("Admins can settle
 * invoices"); a non-admin's own draft would fail this silently at the RLS
 * layer, so the check is surfaced here as a clear message instead.
 */
export async function updateInvoiceHeader(invoiceId: string, patch: InvoiceHeaderPatch): Promise<ActionResult> {
  const { supabase, userId, role, canSeeMoney, isAdmin } = await getInvoiceAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canSeeMoney) return { ok: false, error: "Invoices are restricted to finance-authorised users and owners." };
  if (!isAdmin) return { ok: false, error: "Only a portal admin can edit invoice details." };

  if (patch.kind !== undefined && patch.kind !== null && !invoiceKinds.includes(patch.kind as InvoiceKind)) {
    return { ok: false, error: "Kind must be proposal billing, deposit, full or balance." };
  }
  if (patch.currency !== undefined && patch.currency.length !== 3) {
    return { ok: false, error: "Currency must be a three-letter code." };
  }

  const safePatch: Record<string, unknown> = {};
  for (const key of EDITABLE_HEADER_FIELDS) {
    if (key in patch) safePatch[key] = (patch as Record<string, unknown>)[key];
  }

  const { data: before } = await supabase
    .from("client_invoices")
    .select("id, proposal_id, subtotal")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!before) return { ok: false, error: NO_ROWS_MESSAGE };

  // Tax moved: keep total = subtotal + tax_amount rather than leaving a stale
  // total on the row until the lines are next touched.
  let updatePayload = safePatch;
  if ("tax_amount" in safePatch) {
    const subtotal = Number(before.subtotal ?? 0);
    const tax = Number(safePatch.tax_amount) || 0;
    updatePayload = { ...safePatch, total: Math.round((subtotal + tax) * 100) / 100 };
  }

  const { data: updated, error } = await supabase.from("client_invoices").update(updatePayload).eq("id", invoiceId).select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordAuditEvent({
    ...buildDataAuditEvent("update", "client_invoice", invoiceId, userId, "Updated invoice details.", null, safePatch),
    actor_role: role,
  });

  revalidateInvoices(invoiceId, before.proposal_id as string | null);
  return { ok: true };
}

/**
 * Replaces a draft invoice's line items wholesale. Open to any finance-
 * authorised employee (not just admins) — matches the RLS grant on
 * client_invoice_line_items, which lets any drafting employee manage lines
 * while the invoice is still a draft.
 */
export async function updateInvoiceLines(invoiceId: string, lines: DraftInvoiceLineInput[]): Promise<ActionResult> {
  const { supabase, userId, role, canSeeMoney } = await getInvoiceAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canSeeMoney) return { ok: false, error: "Invoices are restricted to finance-authorised users and owners." };

  const { data: before } = await supabase.from("client_invoices").select("id, proposal_id, status").eq("id", invoiceId).maybeSingle();
  if (!before) return { ok: false, error: NO_ROWS_MESSAGE };
  if (before.status !== "draft") return { ok: false, error: "Only a draft invoice's line items can be changed." };

  // Generated lines are reservations against an accepted proposal revision.
  // The legacy editor replaces every row and would otherwise erase their
  // provenance (and release/recreate quantities outside the atomic RPC).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: trackedLines, error: trackedLineError } = await (supabase as any)
    .from("client_invoice_line_items")
    .select("id")
    .eq("invoice_id", invoiceId)
    .not("source_proposal_line_key", "is", null)
    .limit(1);
  if (trackedLineError) {
    return { ok: false, error: "Could not verify this invoice's proposal-line history. Refresh and try again." };
  }
  if ((trackedLines?.length ?? 0) > 0) {
    return {
      ok: false,
      error: "Lines generated from an accepted proposal are fixed. Delete this draft and generate a new selection instead.",
    };
  }

  const problems = validateInvoice({
    status: "draft",
    kind: "full",
    currency: "USD",
    issue_date: null,
    issued_at: null,
    paid_at: null,
    lines: lines as InvoiceLine[],
  }).filter((problem) => problem.field.startsWith("lines"));
  if (problems.length > 0) return { ok: false, error: problems[0].message };

  const result = await updateDraftInvoiceLines(invoiceId, lines);
  if (!result.ok) return { ok: false, error: result.error ?? "Could not save the line items." };

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "client_invoice",
      invoiceId,
      userId,
      `Updated invoice line items (${lines.length} line${lines.length === 1 ? "" : "s"}).`,
      null,
      { lines: lines.length, totals: result.totals },
    ),
    actor_role: role,
  });

  revalidateInvoices(invoiceId, before.proposal_id as string | null);
  return { ok: true };
}

export async function issueInvoice(invoiceId: string): Promise<ActionResult> {
  const { supabase, userId, role, canSeeMoney, isAdmin } = await getInvoiceAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canSeeMoney) return { ok: false, error: "Invoices are restricted to finance-authorised users and owners." };
  if (!isAdmin) return { ok: false, error: "Only a portal admin can issue invoices." };

  const { data: invoice } = await supabase
    .from("client_invoices")
    .select("id, proposal_id, status, kind, currency, issue_date, issued_at, paid_at, total")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { ok: false, error: NO_ROWS_MESSAGE };
  if (invoice.status !== "draft") return { ok: false, error: "Only a draft invoice can be issued." };
  if (Number(invoice.total ?? 0) <= 0) return { ok: false, error: "Invoice total must be greater than zero before issuing." };

  const { data: lineRows } = await supabase
    .from("client_invoice_line_items")
    .select("description, quantity, unit_amount, line_total, unit, qty_basis")
    .eq("invoice_id", invoiceId);
  const issueDate = invoice.issue_date ?? new Date().toISOString().slice(0, 10);
  const issuedAt = new Date().toISOString();
  const problems = validateInvoice({
    status: "issued",
    kind: invoice.kind,
    currency: invoice.currency,
    issue_date: issueDate,
    issued_at: issuedAt,
    paid_at: invoice.paid_at,
    lines: (lineRows ?? []) as InvoiceLine[],
  });
  if (problems.length > 0) return { ok: false, error: problems[0].message };

  const { data: updated, error } = await supabase
    .from("client_invoices")
    .update({ status: "issued", issue_date: issueDate, issued_at: issuedAt, issued_by: userId })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "client_invoice",
      invoiceId,
      userId,
      `Issued invoice ${invoiceId}.`,
      { status: "draft" },
      { status: "issued", issue_date: issueDate, issued_at: issuedAt },
    ),
    actor_role: role,
  });

  revalidateInvoices(invoiceId, invoice.proposal_id as string | null);
  return { ok: true };
}

/**
 * Matches client_invoices' DELETE policy: an admin can delete any invoice; a
 * non-admin can only delete their own, and only while it is still a draft.
 * Checked here for a clear message, then enforced again by RLS regardless.
 */
export async function deleteInvoice(invoiceId: string): Promise<ActionResult> {
  const { supabase, userId, role, canSeeMoney, isAdmin } = await getInvoiceAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canSeeMoney) return { ok: false, error: "Invoices are restricted to finance-authorised users and owners." };

  const { data: before } = await supabase
    .from("client_invoices")
    .select("id, invoice_number, status, created_by, proposal_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!before) return { ok: false, error: NO_ROWS_MESSAGE };

  const canDelete = isAdmin || (before.status === "draft" && before.created_by === userId);
  if (!canDelete) {
    return { ok: false, error: "Only an admin, or the draft's own creator, can delete this invoice." };
  }

  const { data: deleted, error } = await supabase.from("client_invoices").delete().eq("id", invoiceId).select("id");
  if (error) return { ok: false, error: error.message };
  if (!deleted || deleted.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "delete",
      "client_invoice",
      invoiceId,
      userId,
      `Deleted invoice ${before.invoice_number ?? invoiceId}.`,
      before,
      null,
    ),
    actor_role: role,
  });

  revalidateInvoices(invoiceId, before.proposal_id as string | null);
  return { ok: true };
}
