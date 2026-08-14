// GET /employee/clients/[id]/workflow/invoices/[invoiceId]/docx — the editable
// Word invoice.
//
// Mirrors the PDF route next door: same permission wall, same client-scoped
// read, same InvoiceDocumentModel. The output is Word-native DOCX so a
// bookkeeper can correct a description or add a PO number without rebuilding
// the invoice — which is how Steve's original one-pager is maintained today.
//
// The resolution below is repeated from the PDF route rather than shared, in the
// same shape as the two proposal export routes. Each download is a
// self-contained read, and neither route can silently change what the other
// sends.

import { NextResponse } from "next/server";
import { getPipelineAccess } from "@/lib/pipeline/access";
import { loadCompanyProfile } from "@/lib/proposals/company-server";
import { companyDocumentName } from "@/lib/company/profile";
import { formatAddressLines } from "@/lib/proposals/client-contacts";
import { buildInvoiceDocumentModel, invoiceDownloadFilename } from "@/lib/invoices/document-model";
import type { InvoiceLineInput, InvoiceQtyBasis } from "@/lib/invoices/document-model";
import { renderInvoiceDocx } from "@/lib/invoices/docx";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bound, so a corrupt invoice cannot turn this into an unbounded read. */
const lineLimit = 200;

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function date(value: unknown): string | null {
  const raw = text(value);
  return raw === "" ? null : raw.slice(0, 10);
}

/**
 * A stored `prepared_by` value, but only when it is a NAME.
 *
 * `client_invoices.created_by` is a uuid, and an early column may carry one here
 * too. A uuid printed under "Invoice Prepared By:" is worse than the blank rule
 * the document falls back to, and resolving the DOWNLOADER's name instead would
 * put a false claim on the page.
 */
function preparedByName(value: unknown): string {
  const raw = text(value);
  return UUID.test(raw) ? "" : raw;
}

const qtyBases = new Set<InvoiceQtyBasis>(["session", "attendee", "hour", "flat"]);

function qtyBasis(value: unknown): InvoiceQtyBasis {
  const raw = text(value).toLowerCase();
  return qtyBases.has(raw as InvoiceQtyBasis) ? (raw as InvoiceQtyBasis) : "flat";
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  const { id, invoiceId } = await params;

  // getPipelineAccess() calls supabase.auth.getUser() before it resolves any
  // role, so nothing below is read for an anonymous caller.
  const { supabase, canRead } = await getPipelineAccess();
  if (!supabase || !canRead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!UUID.test(id) || !UUID.test(invoiceId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // `select("*")` rather than a column list: `client_invoices` is ABSENT from
  // lib/supabase/types.ts (never regenerated since the table shipped), so the
  // query is untyped either way — and the invoice-document columns land in a
  // migration still in flight, where naming a column that does not exist yet
  // makes PostgREST answer 42703 with data: null and turns every download into a
  // spurious 404. See the same trap documented in the workflow page.
  //
  // Scoped by BOTH ids, so an invoice belonging to another client cannot be
  // rendered under this one.
  const { data: invoice, error: invoiceError } = await supabase
    .from("client_invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("client_id", id)
    .maybeSingle();

  if (isMissingSchemaRelationError(invoiceError)) {
    return NextResponse.json(
      { error: "Invoicing is not set up in Supabase yet. Apply the latest database migrations and try again." },
      { status: 409 },
    );
  }
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = invoice as Row;

  const [lineResult, clientResult, firm] = await Promise.all([
    supabase
      .from("client_invoice_line_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true })
      .limit(lineLimit),
    supabase
      .from("company_clients")
      .select("name, contact_name, email, address_line1, address_line2, city, state, postal_code, country")
      .eq("id", id)
      .maybeSingle(),
    loadCompanyProfile(supabase),
  ]);

  // The invoice's own snapshot of the proposal number wins over the live row: a
  // sent invoice must keep saying what it said when it was sent.
  // Read live from the proposal record — see the note in the sibling pdf route:
  // snapshotting the number belongs with the Phase 2 numbering change.
  let referenceProposalNumber = "";
  let proposalTitle = "";
  if (row.proposal_id) {
    const { data: proposal } = await supabase
      .from("client_proposals")
      .select("proposal_number, title")
      .eq("id", row.proposal_id)
      .maybeSingle();
    const proposalRow = (proposal ?? {}) as Row;
    if (referenceProposalNumber === "") referenceProposalNumber = text(proposalRow.proposal_number);
    proposalTitle = text(proposalRow.title);
  }

  const client = (clientResult?.data ?? {}) as Row;
  const lineRows: Row[] = Array.isArray(lineResult?.data) ? (lineResult.data as Row[]) : [];

  const lines: InvoiceLineInput[] = lineRows.map((lineRow) => ({
    serviceDate: date(lineRow.service_date),
    description: text(lineRow.description),
    unitPrice: num(lineRow.unit_amount),
    quantity: num(lineRow.quantity),
    unit: text(lineRow.unit),
    qtyBasis: qtyBasis(lineRow.qty_basis),
    // INV-7. Read straight through — no filter on a zero total, here or
    // anywhere downstream. A no-charge line is the client's record that the work
    // was done and given away.
    lineTotal: num(lineRow.line_total),
  }));

  const subtotal = num(row.subtotal);
  const total = num(row.total);

  const model = buildInvoiceDocumentModel({
    invoiceNumber: text(row.invoice_number),
    issueDate: date(row.issue_date) ?? date(row.created_at) ?? "",
    referenceProposalNumber: referenceProposalNumber === "" ? null : referenceProposalNumber,
    firm: {
      name: companyDocumentName(firm),
      addressLines: formatAddressLines(firm),
      phone: firm.phone,
      email: firm.email,
    },
    billTo: {
      name: text(client.name),
      addressLines: formatAddressLines(client as never),
      contactName: text(client.contact_name),
      email: text(client.email),
    },
    consultant: text(row.consultant_name),
    jobName: text(row.job_name) || proposalTitle,
    paymentTerms: text(row.payment_terms),
    dueDate: date(row.due_date),
    lines,
    subtotal,
    // Until the sales_tax column lands, the SALES TAX row carries the residual
    // between the stored subtotal and total, so the three total rows add up on
    // the face of the document.
    salesTax: row.tax_amount === undefined || row.tax_amount === null ? total - subtotal : num(row.tax_amount),
    total,
    preparedBy: preparedByName(row.prepared_by),
    // THE CLIENT'S OWN agreement / PO number — never our proposal number and
    // never our invoice number. See the field's doc comment in document-model.ts.
    clientAgreementRef: text(row.client_agreement_ref),
    currency: text(row.currency) || "USD",
  });

  // Same reasoning as the PDF route: the link carries `download`, so an uncaught
  // throw would be saved as "Invoice ….docx" containing Next's HTML error page —
  // a file Word opens as empty or refuses outright.
  let bytes: Buffer;
  try {
    bytes = await renderInvoiceDocx(model);
  } catch (error) {
    console.error("Could not render the invoice DOCX.", error);
    return NextResponse.json({ error: "This invoice could not be rendered as a Word document." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // Decision D-6: "Invoice <full invoice number> <MM-DD-YYYY>.docx".
      "Content-Disposition": `attachment; filename="${invoiceDownloadFilename(
        model.invoiceNumber,
        model.issueDate,
        "docx",
      )}"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
