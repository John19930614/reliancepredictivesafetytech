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
// {SLUG}-{YYYY}-INV-{NN} from the client's OWN per-year counter when
// proposal_id is null; a number chosen here would collide with the counter that
// owns it. That also means the client's company_slug must already be in place
// when the row is inserted — the BEFORE INSERT trigger reads it — which is why
// this action checks for it rather than letting it surface as a raw database
// exception the operator cannot act on.
//
// BILLING AGAINST A PROPOSAL is optional and, when it is used, changes both of
// those facts. The trigger numbers the row {PROPOSAL_NUMBER}-{NN} off the
// parent instead, so the client's slug is not what names this invoice and is no
// longer required; and guard_client_invoice_total() stops standing down, so the
// live invoices against that proposal may not exceed its value. Both are the
// point of naming a proposal, not side effects to be worked around.
//
// The one thing that CANNOT be taken from the browser is the pairing. A
// proposal id is a uuid posted by a form, and a form that named another
// client's proposal would file this invoice under that client's contract and
// spend a number off it. So the row is read back and its client_id compared
// with the client actually being invoiced, exactly as the client row itself is
// read rather than trusted.

import { revalidatePath } from "next/cache";
import { buildDataAuditEvent, recordAuditEvent } from "@/lib/audit/events";
import { friendlyError } from "@/lib/friendly-error";
import { validateManualInvoice, type NewManualInvoiceInput } from "@/lib/invoices/manual";
import { getPipelineAccess } from "@/lib/pipeline/access";
import {
  companySlugRule,
  formatManualInvoiceNumber,
  normalizeCompanySlug,
} from "@/lib/proposals/company-slug";
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

/**
 * The contract-value guard's own refusal, phrased for the operator — or null
 * when this error is something else.
 *
 * guard_client_invoice_total() raises with errcode check_violation, and
 * friendlyError() maps every 23514 to "One of the values is not accepted",
 * which here is worse than useless: the value that is not accepted is the
 * TOTAL, the reason is a contract value the operator can look up, and the fix
 * (void or reprice an existing invoice, or raise the proposal value) is in the
 * exception's own hint. Passing the database's sentence through is the only
 * version of this message that tells them what happened.
 */
function contractValueRefusal(
  error: { message?: string | null; hint?: string | null } | null | undefined,
  proposalNumber: string | null,
): string | null {
  const message = typeof error?.message === "string" ? error.message : "";
  // Matched on the guard's own wording rather than on 23514, which every column
  // CHECK on the table also raises.
  if (!/above its contract value/i.test(message)) return null;

  const hint = typeof error?.hint === "string" && error.hint.trim() !== "" ? ` ${error.hint.trim()}` : "";
  // The proposal number is prefixed because the guard's own sentence says "this
  // proposal" — true inside a trigger, unhelpful on a form with a dropdown.
  const prefix = proposalNumber === null ? "" : `${proposalNumber}: `;
  return `${prefix}${message}.${hint}`;
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
 * With no proposal named, no contract-value cap applies and none is invented:
 * guard_client_invoice_total() returns early when proposal_id is null, because
 * there is no contract value to cap against. The ceiling that does apply is
 * maxInvoiceAmount, enforced in the pure validator. Name a proposal and the
 * database guard takes over as well — deliberately, and its refusal is reported
 * verbatim rather than swallowed.
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
    .select("id, name, company_slug")
    .eq("id", invoice.clientId)
    .maybeSingle();

  if (clientError && isSchemaBehindError(clientError)) return { ok: false, error: SCHEMA_BEHIND };
  if (!client) return { ok: false, error: "Client not found or you do not have permission to invoice it." };

  // The slug gate, checked here rather than left to the trigger.
  //
  // A manual invoice is numbered {SLUG}-{YYYY}-INV-{NN} off this client's own
  // sequence, so with no slug there is no number to mint — and the whole point
  // of the scheme is that a human reading an invoice can tell whose it is. The
  // allocator raises in this case (migration 20260818210000), on purpose and as
  // the backstop for PostgREST and psql; letting the operator reach it would
  // trade a sentence they can act on for a constraint violation they cannot.
  //
  // NOT auto-generated, here or anywhere: the slug is a permanent prefix on
  // documents this client signs, and suggestCompanySlug() is a starting point a
  // person overtypes, never an assignment. The form assigns it explicitly,
  // ahead of this call.
  const clientName = ((client as { name?: string | null }).name ?? "").trim() || "this company";

  // The proposal gate, and it exists because the browser chose the pairing.
  //
  // A uuid arriving from a form says nothing about whose proposal it is. Taken
  // on trust, an invoice would attach itself to another client's contract:
  // it would spend a number off that proposal's invoice_seq, print that
  // client's proposal number on a document going to this one, and be counted
  // against a contract value it has nothing to do with. RLS does not save us
  // here — an employee can legitimately read both proposals — so the pairing
  // is checked rather than assumed.
  let proposalNumber: string | null = null;
  if (invoice.proposalId !== null) {
    if (!UUID.test(invoice.proposalId)) return { ok: false, error: "Malformed proposal reference." };

    const { data: proposal, error: proposalError } = await supabase
      .from("client_proposals")
      .select("id, client_id, proposal_number, title")
      .eq("id", invoice.proposalId)
      .maybeSingle();

    if (proposalError && isSchemaBehindError(proposalError)) return { ok: false, error: SCHEMA_BEHIND };
    if (!proposal) {
      return { ok: false, error: "That proposal could not be found, or you do not have permission to bill it." };
    }
    if (proposal.client_id !== invoice.clientId) {
      // Named rather than described: the operator is looking at a list that
      // was filtered by client, so this means the two got out of step — most
      // likely the client was changed after the proposal was picked.
      return {
        ok: false,
        error: `That proposal does not belong to ${clientName}. Pick a proposal listed under this client, or clear the field.`,
      };
    }
    if (typeof proposal.proposal_number !== "string" || proposal.proposal_number.trim() === "") {
      // The trigger's parent branch requires proposal_number and falls THROUGH
      // to the manual shape without it, which would mint {SLUG}-{YYYY}-INV-{NN}
      // on an invoice that does carry a proposal_id — a number that contradicts
      // its own row. Refused instead of quietly numbered the other way.
      return {
        ok: false,
        error: "That proposal has no document number yet, so an invoice cannot be numbered from it.",
      };
    }
    proposalNumber = proposal.proposal_number.trim();
  }

  // The slug gate, checked here rather than left to the trigger — and only when
  // there is no proposal to number from. An invoice billing a proposal takes
  // its number from the PARENT ({PROPOSAL}-{NN}), so the client's slug is not
  // what names it and demanding one would block a legitimate invoice against a
  // legacy-numbered proposal for a client nobody has slugged yet.
  if (proposalNumber === null && normalizeCompanySlug((client as { company_slug?: string | null }).company_slug) === "") {
    return {
      ok: false,
      error:
        `${clientName} has no company slug yet, and an invoice raised without a proposal is numbered from it — ` +
        `${formatManualInvoiceNumber("WONDFOUSA", new Date().getFullYear(), 1)}, for example. ` +
        `Set the slug on the company record first: ${companySlugRule}`,
    };
  }

  const { data: created, error: insertError } = await supabase
    .from("client_invoices")
    .insert({
      client_id: invoice.clientId,
      // Null unless the operator named one, and the null case is still the
      // normal one for this form: it is what makes the numbering trigger fall
      // back to the client's yearly counter and what makes the contract-value
      // guard stand down. A non-null value here has been proved above to belong
      // to this client.
      proposal_id: invoice.proposalId,
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
    // Checked BEFORE friendlyError, which would flatten the guard's 23514 into
    // a sentence that names neither the total nor the contract.
    const overContract = contractValueRefusal(insertError, proposalNumber);
    if (overContract) return { ok: false, error: overContract };
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
      `Raised invoice ${created.invoice_number} for ${invoice.total.toFixed(2)} against ${client.name}` +
        (proposalNumber === null ? " with no proposal behind it" : `, billing proposal ${proposalNumber}`),
      null,
      {
        client_id: invoice.clientId,
        proposal_id: invoice.proposalId,
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
