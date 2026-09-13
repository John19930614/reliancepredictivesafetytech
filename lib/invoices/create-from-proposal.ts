import "server-only";

// Raises a draft invoice exclusively from the proposal revision the client
// accepted. Unlike acceptance-income.ts this is a direct user action (there is
// a button for it), not a best-effort side effect of another event, so it
// reports its errors instead of swallowing them.
//
// Runs on the service-role client for the same reason acceptance-income.ts
// does: every value it writes is derived server-side from the proposal's own
// saved fee table, never from a number the caller posted, so a session-scoped
// client buys no extra safety here — it would only add the header UPDATE gap
// client_invoices' RLS deliberately leaves for admins to close (see
// lib/invoices/draft.ts).

import { createAdminClient } from "@/lib/supabase/admin";
import { isGeneratorState } from "@/lib/proposals/generator-state";
import { computeProposalTotals, type ProposalLineItem, type ProposalTotals } from "@/lib/proposals/pricing";
import { lookupService } from "@/lib/proposals/catalog";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";
import { type InvoiceKind, type LineQtyBasis } from "@/lib/invoices/invoice";
import {
  buildProposalBillingSummary,
  priceProposalBillingSelections,
  proposalBillingLineKey,
  roundInvoiceMoney,
  type ProposalBillingSelection,
} from "@/lib/invoices/proposal-billing";

/**
 * Catalog group, shortened to a one-word (or short) heading. A line whose
 * category is known prints as two lines — the category, then the specific
 * item, e.g. "Training" over "First Aid / CPR / AED Training" — rather than
 * just the bare name, so a client scanning the invoice sees what kind of
 * thing each line is without reading every description.
 */
const CATEGORY_LABELS: Record<string, string> = {
  "Platform & Licensing": "Platform",
  "Implementation & Consulting": "Implementation",
  "Safety Documents & Programs": "Safety Document",
  "Training Catalog": "Training",
  "Audits & Field Support": "Audit",
  "Travel & Expenses": "Travel",
  Custom: "Service",
};

/**
 * The two-line description an invoice line prints, when the row's category
 * is known. Only "service" rows carry a catalog group (packages and phases
 * don't), and only a catalog key resolves one — a hand-typed custom service
 * has no group to look up, so it stays a single line, same as before.
 */
function describeLine(row: ProposalLineItem): string {
  if (row.source !== "service") return row.name || row.desc || "Line item";

  const group = lookupService(row.key)?.group;
  const category = group ? CATEGORY_LABELS[group] : null;

  return category ? `${category}\n${row.name}` : row.name || row.desc || "Line item";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateInvoiceFromProposalInput {
  proposalId: string;
  generationKey: string;
  selections: readonly ProposalBillingSelection[];
  actorUserId: string;
  actorRole: string | null;
}

export interface CreateInvoiceFromProposalResult {
  ok: boolean;
  error?: string;
  invoiceId?: string;
  invoiceNumber?: string | null;
}

/** Exported for unit testing — the arithmetic that decides what a generated invoice bills. */
export function amountForKind(kind: InvoiceKind, totals: { total: number; deposit: number } | null, fallbackTotal: number) {
  if (!totals) {
    return kind === "full" ? fallbackTotal : 0;
  }

  if (kind === "deposit") return totals.deposit;
  if (kind === "balance") return Math.round((totals.total - totals.deposit) * 100) / 100;
  return totals.total;
}

interface DraftLine {
  description: string;
  quantity: number;
  unit_amount: number;
  line_total: number;
  unit: string;
  qty_basis: LineQtyBasis;
  sort_order: number;
}

/**
 * A count that doesn't matter numerically (qty === 1) gets 'flat' — simplest
 * to read. Anything that actually scales gets a basis that multiplies, so a
 * later edit through lib/invoices/draft.ts (lineTotalFor) recomputes the same
 * total this insert wrote. The specific label (hour/session/attendee) is
 * cosmetic beyond that; the printed Unit column carries the proposal's own
 * free-text unit regardless of which multiplying basis was picked.
 */
/** Exported for unit testing. */
export function qtyBasisFor(unit: string, qty: number): LineQtyBasis {
  if (qty === 1) return "flat";
  const u = unit.toLowerCase();
  if (u.includes("hour")) return "hour";
  if (u.includes("session")) return "session";
  return "attendee";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Full amount: one invoice line per proposal fee-table row (package, phases,
 * services) rather than a single lump sum, so the client sees the same
 * breakdown the proposal itself printed. A proposal-level discount has no
 * column to land in on client_invoice_line_items — unit_amount and line_total
 * are both CHECK >= 0, so a negative "discount" row is not possible — instead
 * every line's price is scaled down by the same factor the discount removes
 * from the subtotal, keeping Σ(line_total) equal to the discounted subtotal
 * and total = subtotal + tax_amount equal to the proposal's own total.
 *
 * Deposit and balance are NOT itemized: a deposit is a percentage of
 * everything, not a subset of specific lines, so one summary line is more
 * honest than pretending it maps to particular services (matches
 * lib/proposals/income-schedule.ts's own "Deposit due" / "Balance due" rows).
 */
/** Exported for unit testing. */
export function buildFullLines(totals: ProposalTotals, reference: string): { lines: DraftLine[]; subtotal: number; tax: number } {
  const subtotalRaw = totals.lineItems.reduce((sum, row) => sum + row.amount, 0);
  const scale = totals.discount > 0 && subtotalRaw > 0 ? (subtotalRaw - totals.discount) / subtotalRaw : 1;

  const lines: DraftLine[] = totals.lineItems.map((row, index) => {
    const qty = row.qty > 0 ? row.qty : 1;
    const unitAmount = round2(row.price * scale);
    const lineTotal = round2(row.amount * scale);

    return {
      description: describeLine(row).slice(0, 500),
      quantity: qty,
      unit_amount: unitAmount,
      line_total: lineTotal,
      unit: (row.unit || "").slice(0, 60),
      qty_basis: qtyBasisFor(row.unit || "", qty),
      sort_order: (index + 1) * 10,
    };
  });

  if (lines.length === 0) {
    lines.push({
      description: `Full amount — ${reference}`.slice(0, 500),
      quantity: 1,
      unit_amount: round2(totals.total - totals.tax),
      line_total: round2(totals.total - totals.tax),
      unit: "",
      qty_basis: "flat",
      sort_order: 100,
    });
  }

  const subtotal = round2(lines.reduce((sum, line) => sum + line.line_total, 0));
  return { lines, subtotal, tax: totals.tax };
}

interface ProposalInvoiceRpcLine extends DraftLine {
  line_key: string;
}

function rpcInvoiceRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

export async function createInvoiceFromProposal(
  input: CreateInvoiceFromProposalInput,
): Promise<CreateInvoiceFromProposalResult> {
  const proposalId = typeof input.proposalId === "string" ? input.proposalId.trim() : "";
  const generationKey = typeof input.generationKey === "string" ? input.generationKey.trim() : "";
  if (!proposalId) return { ok: false, error: "A proposal is required." };
  if (!UUID_PATTERN.test(generationKey)) {
    return { ok: false, error: "Invoice generation key must be a UUID." };
  }
  if (!Array.isArray(input.selections)) return { ok: false, error: "Select at least one proposal line to invoice." };

  const db: LooseClient | null = createAdminClient();
  if (!db) return { ok: false, error: "Service-role credentials are not configured." };

  const { data: proposal, error: proposalError } = await db
    .from("client_proposals")
    .select("id, title, proposal_number, client_id, accepted_revision_id")
    .eq("id", proposalId)
    .maybeSingle();
  if (proposalError || !proposal) {
    return { ok: false, error: proposalError?.message ?? "Proposal not found." };
  }

  const clientId = (proposal.client_id as string | null) ?? null;
  if (!clientId) {
    return { ok: false, error: "This proposal has no client assigned yet — assign one before raising an invoice." };
  }

  const revisionId = typeof proposal.accepted_revision_id === "string" ? proposal.accepted_revision_id.trim() : "";
  if (!revisionId) {
    return {
      ok: false,
      error: "Billing is unavailable until this proposal has an accepted revision.",
    };
  }

  const { data: revision, error: revisionError } = await db
    .from("client_proposal_revisions")
    .select("id, proposal_id, form_data")
    .eq("id", revisionId)
    .eq("proposal_id", proposalId)
    .maybeSingle();
  if (revisionError || !revision) {
    return { ok: false, error: revisionError?.message ?? "The accepted proposal revision could not be found." };
  }
  if (!isGeneratorState(revision.form_data)) {
    return { ok: false, error: "The accepted proposal revision has no billable fee table." };
  }

  // Idempotent browser retries must succeed even though the first successful
  // request has now committed the selected quantities. Check request identity
  // before remaining-quantity validation, after re-establishing that the
  // proposal still has a real accepted revision.
  const { data: existingInvoice, error: existingError } = await db
    .from("client_invoices")
    .select("id, invoice_number")
    .eq("proposal_id", proposalId)
    .eq("generation_key", generationKey)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };
  if (existingInvoice?.id) {
    return {
      ok: true,
      invoiceId: existingInvoice.id as string,
      invoiceNumber: (existingInvoice.invoice_number as string | null) ?? null,
    };
  }

  const totals = computeProposalTotals(revision.form_data);
  const lineKeys = totals.lineItems.map((_, index) => proposalBillingLineKey(revisionId, index));
  if (lineKeys.length === 0) return { ok: false, error: "The accepted proposal revision has no billable lines." };

  const { data: invoiceRows, error: invoiceError } = await db
    .from("client_invoices")
    .select("id, tax_amount")
    .eq("proposal_id", proposalId)
    .neq("status", "void");
  if (invoiceError) return { ok: false, error: invoiceError.message };

  const invoiceTax = new Map<string, number>();
  for (const invoice of invoiceRows ?? []) {
    if (typeof invoice.id === "string") invoiceTax.set(invoice.id, Number(invoice.tax_amount ?? 0));
  }

  const invoiceIds = [...invoiceTax.keys()];
  let committedRows: Array<{ invoice_id: string; source_proposal_line_key: string; quantity: number | string }> = [];
  if (invoiceIds.length > 0) {
    const { data, error } = await db
      .from("client_invoice_line_items")
      .select("invoice_id, source_proposal_line_key, quantity")
      .in("invoice_id", invoiceIds)
      .in("source_proposal_line_key", lineKeys);
    if (error) return { ok: false, error: error.message };
    committedRows = data ?? [];
  }

  const committedInvoiceIds = new Set(committedRows.map((row) => row.invoice_id));
  const committedTax = roundInvoiceMoney(
    [...committedInvoiceIds].reduce((sum, invoiceId) => sum + (invoiceTax.get(invoiceId) ?? 0), 0),
  );
  const billing = buildProposalBillingSummary(
    revisionId,
    totals,
    committedRows.map((row) => ({ lineKey: row.source_proposal_line_key, quantity: row.quantity })),
    committedTax,
  );
  const priced = priceProposalBillingSelections(billing, input.selections);
  if (!priced.ok) return { ok: false, error: priced.problems[0]?.message ?? "The selected lines cannot be invoiced." };

  const rpcLines: ProposalInvoiceRpcLine[] = priced.lines.map((line) => {
    const source = totals.lineItems[line.lineOrder];
    return {
      line_key: line.lineKey,
      description: describeLine(source).slice(0, 500),
      quantity: line.quantity,
      unit_amount: line.unitAmount,
      line_total: line.lineTotal,
      unit: (source.unit || "").slice(0, 60),
      // Whether a proposal line is divisible comes from the accepted source
      // quantity, not the size of this invoice slice. One of ten hours is
      // still an hourly charge; calling it flat would make later slices bill
      // the full unit amount without multiplication.
      qty_basis: qtyBasisFor(source.unit || "", source.qty),
      sort_order: (line.lineOrder + 1) * 10,
    };
  });

  const { data: rpcResult, error: rpcError } = await db.rpc("generate_client_invoice_from_proposal", {
    p_proposal_id: proposalId,
    p_revision_id: revisionId,
    p_created_by: input.actorUserId,
    p_generation_key: generationKey,
    p_lines: rpcLines,
    p_tax_amount: priced.tax,
  });

  if (rpcError) {
    if (rpcError.code === "23514" || rpcError.code === "40001") {
      return { ok: false, error: "Those quantities are no longer available. Refresh the proposal and try again." };
    }
    return { ok: false, error: rpcError.message };
  }

  const invoice = rpcInvoiceRow(rpcResult);
  const invoiceId = typeof invoice?.invoice_id === "string"
    ? invoice.invoice_id
    : typeof invoice?.id === "string"
      ? invoice.id
      : null;
  if (!invoiceId) return { ok: false, error: "The invoice was created but its identifier was not returned." };
  const invoiceNumber = typeof invoice?.invoice_number === "string" ? invoice.invoice_number : null;
  const reference = [proposal.proposal_number, proposal.title].filter(Boolean).join(" — ") || "Proposal";

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "create",
      "client_invoice",
      invoiceId,
      input.actorUserId,
      `Raised invoice${invoiceNumber ? ` ${invoiceNumber}` : ""} from accepted revision of ${reference} (${rpcLines.length} line${rpcLines.length === 1 ? "" : "s"})`,
      null,
      { proposal_id: proposalId, revision_id: revisionId, client_id: clientId, amount: priced.total, lines: rpcLines.length },
    ),
    actor_role: input.actorRole,
  });

  return { ok: true, invoiceId, invoiceNumber };
}
