"use server";

// Raising an invoice that has no proposal behind it.
//
// The sibling of createInvoiceFromProposal in the client workflow actions, and
// deliberately written to the same rules: the same access helper, the same
// result shape, the same audit event, the same rollback when the lines fail.
// The one difference is where the figures come from — a proposal-derived
// invoice is priced from an accepted revision, and this one is priced from what
// an operator typed. That is exactly why nothing here does arithmetic:
// validateManualInvoice owns every amount, and this file only writes what it
// returns.
//
// NEVER SETS invoice_number. allocate_client_invoice_number() mints
// RPS-INV-{YYYY}-{NNNN} from a per-year counter when proposal_id is null;
// a number chosen here would collide with the counter that owns it.

import { revalidatePath } from "next/cache";
import { buildDataAuditEvent, recordAuditEvent } from "@/lib/audit/events";
import { friendlyError } from "@/lib/friendly-error";
import { validateManualInvoice, type NewManualInvoiceInput } from "@/lib/invoices/manual";
import { getPipelineAccess } from "@/lib/pipeline/access";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";

export interface ManualInvoiceResult {
  ok: boolean;
  error?: string;
  /** Every validation problem at once, so a form can list them all. */
  errors?: string[];
  invoiceId?: string;
  invoiceNumber?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SIGNED_OUT = "You must be signed in.";
const SCHEMA_BEHIND = "Invoicing is not set up in Supabase yet. Apply the latest database migrations and try again.";

/**
 * True when the database is behind the code. Mirrors the helper of the same
 * name in the workflow actions, for the reason documented there: "apply the
 * migrations" is something an operator can act on, and the alternative is a
 * missing column surfacing as "could not raise the invoice".
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

/** Every surface that renders this client's invoices, plus the new ledger. */
function revalidateInvoiceSurfaces(clientId: string): void {
  revalidatePath("/employee/invoices");
  revalidatePath(`/employee/clients/${clientId}/workflow`);
  revalidatePath(`/employee/clients/${clientId}`);
  revalidatePath("/employee/finance");
}

/**
 * Raises a draft invoice against a client with no proposal behind it.
 *
 * Created in `draft`, like every other invoice: raising it and issuing it are
 * two acts, and only the second one asks anyone for money. That is also what
 * the RLS policy "Employees can create draft invoices" insists on — draft,
 * unissued, unpaid, created_by = auth.uid() — so the insert below names all
 * four rather than relying on column defaults.
 *
 * No contract-value cap applies here and none is invented: guard_client_invoice_total()
 * returns early when proposal_id is null, because there is no contract value to
 * cap against. The ceiling that does apply is maxInvoiceAmount, enforced in the
 * pure validator.
 */
export async function createManualInvoice(input: NewManualInvoiceInput): Promise<ManualInvoiceResult> {
  const { supabase, userId, role, canDraftInvoice } = await getPipelineAccess();

  // Returns before any query is issued: a signed-out caller never reaches the
  // database, the same posture as createGrantOpportunity.
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT };
  if (!canDraftInvoice) return { ok: false, error: "You do not have permission to raise invoices." };

  const checked = validateManualInvoice(input, new Date());
  if (!checked.ok) {
    return { ok: false, error: checked.errors[0], errors: checked.errors };
  }
  const invoice = checked.value;

  // Checked after validation so the operator sees the fixable problems first,
  // and separately from it so the pure module stays free of route-shaped rules.
  if (!UUID.test(invoice.clientId)) return { ok: false, error: "Malformed client reference." };

  // Read for the audit description, and so a client that was deleted or is out
  // of reach is reported as such rather than as a foreign-key violation.
  const { data: client, error: clientError } = await supabase
    .from("company_clients")
    .select("id, name")
    .eq("id", invoice.clientId)
    .maybeSingle();

  if (clientError && isSchemaBehindError(clientError)) return { ok: false, error: SCHEMA_BEHIND };
  if (!client) return { ok: false, error: "Client not found or you do not have permission to invoice it." };

  const { data: created, error: insertError } = await supabase
    .from("client_invoices")
    .insert({
      client_id: invoice.clientId,
      // The whole point of this action. A null proposal is what makes the
      // numbering trigger fall back to the yearly counter and what makes the
      // contract-value guard stand down.
      proposal_id: null,
      status: "draft",
      // `kind` is left unset on purpose: the column was retired to nullable with
      // no default, and a manual invoice is not a deposit, a full or a balance
      // of anything.
      issue_date: invoice.issueDate,
      due_date: invoice.dueDate,
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      tax_amount: invoice.taxAmount,
      total: invoice.total,
      notes: invoice.notes,
      consultant_name: invoice.consultantName,
      job_name: invoice.jobName,
      payment_terms: invoice.paymentTerms,
      client_agreement_ref: invoice.clientAgreementRef,
      prepared_by: invoice.preparedBy,
      // Named rather than left to the defaults: the INSERT policy tests all
      // three, so an omitted column that ever gains a non-null default would
      // turn into an RLS denial nobody could explain.
      issued_at: null,
      paid_at: null,
      created_by: userId,
    })
    .select("id, invoice_number")
    .single();

  if (insertError || !created) {
    if (isSchemaBehindError(insertError)) return { ok: false, error: SCHEMA_BEHIND };
    return { ok: false, error: friendlyError(insertError, "Could not raise the invoice.") };
  }

  const { error: lineError } = await supabase.from("client_invoice_line_items").insert(
    invoice.lines.map((line) => ({
      invoice_id: created.id,
      description: line.description,
      quantity: line.quantity,
      unit_amount: line.unitAmount,
      // Computed by lineTotalFor from the quantity, the price and the basis.
      // Never a figure the browser displayed.
      line_total: line.lineTotal,
      sort_order: line.sortOrder,
      unit: line.unit,
      qty_basis: line.qtyBasis,
      service_date: line.serviceDate,
    })),
  );

  if (lineError) {
    // An invoice with no lines is worse than no invoice: it carries a spent
    // number off the yearly counter and a total nothing explains. Roll it back —
    // and CHECK that the rollback happened, because PostgREST reports no error
    // for a DELETE that RLS filtered to zero rows.
    const { data: removed } = await supabase.from("client_invoices").delete().eq("id", created.id).select("id");

    if (!Array.isArray(removed) || removed.length === 0) {
      return {
        ok: false,
        error: `The invoice lines could not be written, and draft ${created.invoice_number} could not be withdrawn. Ask an admin to void it.`,
      };
    }

    if (isSchemaBehindError(lineError)) return { ok: false, error: SCHEMA_BEHIND };
    return { ok: false, error: friendlyError(lineError, "Could not write the invoice lines.") };
  }

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "create",
      "client_invoice",
      created.id,
      userId,
      `Raised manual invoice ${created.invoice_number} for ${invoice.total.toFixed(2)} against ${client.name}`,
      null,
      {
        client_id: invoice.clientId,
        proposal_id: null,
        total: invoice.total,
        currency: invoice.currency,
        lines: invoice.lines.length,
      },
    ),
    event_category: "billing",
    actor_role: role,
  });

  revalidateInvoiceSurfaces(invoice.clientId);
  return { ok: true, invoiceId: created.id, invoiceNumber: created.invoice_number };
}
