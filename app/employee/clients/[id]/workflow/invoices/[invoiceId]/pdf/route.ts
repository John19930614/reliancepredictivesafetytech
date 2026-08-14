// GET /employee/clients/[id]/workflow/invoices/[invoiceId]/pdf — the
// client-ready invoice PDF.
//
// This is the file a seller attaches to an email asking a client for money.
// Until now an invoice existed only as a `client_invoices` row rendered as one
// line of text in the workflow's billing panel — there was no document at all.
//
// Modelled on app/employee/proposals/[id]/pdf/route.ts, and for the same
// reasons: the permission wall runs before anything is read, the failure paths
// answer as JSON rather than letting Next's HTML error page be saved into the
// client's ".pdf", and the file is generated server-side so the only thing in
// the page margin is what lib/invoices/pdf.ts draws — never the internal route
// the browser's own print footer would stamp there.
//
// The DOCX sibling next door repeats this resolution rather than sharing it,
// exactly as the two proposal export routes do. The duplication is deliberate:
// each download route is a self-contained read, and neither can silently change
// what the other sends.

import { NextResponse } from "next/server";
import { getPipelineAccess } from "@/lib/pipeline/access";
import { loadCompanyProfile } from "@/lib/proposals/company-server";
import { companyDocumentName } from "@/lib/company/profile";
import { formatAddressLines } from "@/lib/proposals/client-contacts";
import { buildInvoiceDocumentModel, invoiceDownloadFilename } from "@/lib/invoices/document-model";
import type { InvoiceLineInput, InvoiceQtyBasis } from "@/lib/invoices/document-model";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
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
 * `client_invoices.created_by` is a uuid, and an early column may carry one
 * here too. A uuid printed under "Invoice Prepared By:" is worse than the blank
 * rule the document falls back to, and resolving the DOWNLOADER's name instead
 * would put a false claim on the page — the preparer is whoever raised the
 * invoice, not whoever exported it.
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
  // role, so no read below happens for an anonymous caller. Its client is typed
  // `any` on purpose (see lib/pipeline/access.ts) — which is what makes the
  // untyped queries below compile; see the schema-cache note further down.
  const { supabase, canRead } = await getPipelineAccess();
  if (!supabase || !canRead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!UUID.test(id) || !UUID.test(invoiceId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // `select("*")` rather than a column list, for two reasons that both point the
  // same way:
  //
  //   1. `client_invoices` is ABSENT from lib/supabase/types.ts — the generated
  //      types have never been regenerated since the table shipped — so this
  //      query is untyped either way and a named column list buys no safety.
  //   2. The invoice-document columns (consultant, job name, payment terms, the
  //      client's agreement reference, sales tax) land in a migration that is
  //      still in flight. Naming a column that does not exist yet makes
  //      PostgREST answer 42703 with data: null, which would turn every invoice
  //      download into a 404 on any environment running one migration behind.
  //      app/employee/clients/[id]/workflow/page.tsx documents the same trap.
  //
  // Scoped by BOTH ids: an invoice uuid belonging to a different client must not
  // render under this client's workflow.
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

  // The proposal this invoice bills against, read only when the invoice does not
  // already carry its own snapshot of the number. A sent invoice must keep
  // saying what it said when it was sent, so the stored value wins.
  let referenceProposalNumber = text(row.reference_proposal_number);
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
    // INV-7. Read straight through. A $0.00 line is goodwill work Steve
    // performed and did not charge for, and the client is meant to see it —
    // there is no filter here and there must never be one.
    lineTotal: num(lineRow.line_total),
  }));

  const subtotal = num(row.subtotal);
  const total = num(row.total);

  const model = buildInvoiceDocumentModel({
    invoiceNumber: text(row.invoice_number),
    issueDate: date(row.issue_date) ?? date(row.created_at) ?? "",
    // Null, not "", when there is genuinely no proposal — the document prints
    // the labelled row either way, with a dash for the value.
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
    consultant: text(row.consultant),
    jobName: text(row.job_name) || proposalTitle,
    paymentTerms: text(row.payment_terms),
    dueDate: date(row.due_date),
    lines,
    subtotal,
    // Until the sales_tax column lands, the SALES TAX row shows the residual
    // between the stored subtotal and total — which is what makes the three
    // total rows add up on the face of the document. A proposal-level DISCOUNT
    // currently surfaces here as a negative residual; that needs its own row and
    // is flagged rather than hidden.
    salesTax: row.sales_tax === undefined || row.sales_tax === null ? total - subtotal : num(row.sales_tax),
    total,
    preparedBy: preparedByName(row.prepared_by),
    // THE CLIENT'S OWN agreement / PO number. Never our proposal number, never
    // our invoice number — see the field's doc comment in document-model.ts.
    clientAgreementRef: text(row.client_agreement_ref),
    currency: text(row.currency) || "USD",
  });

  // A throw here would be answered with Next's HTML error page — and because the
  // link that reaches this route carries `download`, the browser would write
  // that HTML straight into "Invoice ….pdf". The seller would get a file that
  // opens blank rather than an error they can act on.
  let bytes: Uint8Array;
  try {
    bytes = await renderInvoicePdf({ model });
  } catch (error) {
    console.error("Could not render the invoice PDF.", error);
    return NextResponse.json({ error: "This invoice could not be rendered as a PDF." }, { status: 500 });
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      // Decision D-6: "Invoice <full invoice number> <MM-DD-YYYY>.pdf". The
      // helper strips quotes and control characters, so a hand-edited invoice
      // number cannot inject a second response header from inside this value.
      "Content-Disposition": `attachment; filename="${invoiceDownloadFilename(
        model.invoiceNumber,
        model.issueDate,
        "pdf",
      )}"`,
      // An invoice is per-client and revisable up to the moment it is issued; a
      // cached copy served to the wrong reader, or a stale one after an edit,
      // are both unacceptable.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
