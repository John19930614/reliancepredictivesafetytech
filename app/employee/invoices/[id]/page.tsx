import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, Download, FileText } from "lucide-react";
import { getInvoiceAccess } from "@/lib/invoices/access";
import { invoiceKindLabel, invoiceStatusLabel, invoiceStatusTone } from "@/lib/invoices/invoice";
import { InvoiceHeaderForm } from "@/components/invoices/InvoiceHeaderForm";
import { InvoiceLineItemsEditor, type EditableLine } from "@/components/invoices/InvoiceLineItemsEditor";
import { InvoiceDeleteButton } from "@/components/invoices/InvoiceDeleteButton";
import { proposalLabel, type ProposalRow } from "@/lib/invoices/proposal-link";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

function formatMoney(value: number, currency = "USD") {
  return value.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
}

/** Loose uuid check so a junk URL 404s instead of PostgREST raising 22P02. */
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId, canSeeMoney, isAdmin } = await getInvoiceAccess();
  if (!supabase || !isUuid(id)) notFound();

  if (!canSeeMoney) {
    return (
      <div className="empty-state">
        <AlertTriangle size={20} />
        <p>
          Invoices are restricted to finance-authorised users and owners. This is a permission boundary, not a missing
          invoice — ask an owner to grant finance access if you need it.
        </p>
        <Link className="button button-light" href="/employee/invoices">
          Back to invoices
        </Link>
      </div>
    );
  }

  const { data: invoice } = await (supabase as LooseClient)
    .from("client_invoices")
    .select(
      "id, client_id, proposal_id, invoice_number, status, kind, issue_date, due_date, currency, subtotal, tax_amount, total, job_name, consultant_name, payment_terms, client_agreement_ref, prepared_by, notes, variance_reason, void_reason, created_by",
    )
    .eq("id", id)
    .maybeSingle();
  if (!invoice) notFound();

  const [{ data: lineRows }, { data: client }, proposalResult, provenanceResult] = await Promise.all([
    supabase
      .from("client_invoice_line_items")
      .select("id, description, quantity, unit_amount, line_total, unit, qty_basis, service_date, sort_order")
      .eq("invoice_id", id)
      .order("sort_order", { ascending: true }),
    invoice.client_id ? supabase.from("company_clients").select("id, name").eq("id", invoice.client_id).maybeSingle() : Promise.resolve({ data: null }),
    invoice.proposal_id
      ? supabase
          .from("client_proposals")
          .select("id, client_id, title, status, proposal_number, accepted_at")
          .eq("id", invoice.proposal_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Kept separate from the main line query so a deployment that reaches the
    // app before the provenance migration still renders legacy invoices.
    (supabase as LooseClient)
      .from("client_invoice_line_items")
      .select("id, source_proposal_line_key")
      .eq("invoice_id", id),
  ]);

  const proposal = (proposalResult.data ?? null) as ProposalRow | null;
  const editableLines: EditableLine[] = (lineRows ?? []).map((row: LooseClient) => ({
    description: row.description ?? "",
    quantity: Number(row.quantity ?? 0),
    unit_amount: Number(row.unit_amount ?? 0),
    unit: row.unit ?? "",
    qty_basis: row.qty_basis ?? "flat",
    service_date: row.service_date ?? null,
  }));

  const isDraft = invoice.status === "draft";
  const hasProposalAllocations = !provenanceResult.error &&
    ((provenanceResult.data ?? []) as Array<{ source_proposal_line_key?: string | null }>).some(
      (row) => Boolean(row.source_proposal_line_key),
    );

  return (
    <>
      <div className="portal-topline">
        <div>
          <Link href="/employee/invoices" className="button button-light" style={{ marginBottom: 8 }}>
            <ChevronLeft size={16} /> Back to invoices
          </Link>
          <div className="eyebrow">Invoices</div>
          <h1>{invoice.invoice_number ?? "Unnumbered draft"}</h1>
          <p>
            <span className={`grant-pill grant-pill-${invoiceStatusTone(invoice.status)}`}>
              {invoiceStatusLabel(invoice.status)}
            </span>{" "}
            · {invoiceKindLabel(invoice.kind)} · {(client as { name?: string } | null)?.name ?? "No client linked"}
          </p>
          {proposal ? (
            <p>
              Raised from{" "}
              <Link className="grant-link" href={`/employee/proposals/${proposal.id}`}>
                {proposalLabel(proposal)}
              </Link>
            </p>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <a className="button button-light" href={`/employee/invoices/${invoice.id}/pdf`} download>
            <Download size={16} /> Download PDF
          </a>
          <a className="button button-light" href={`/employee/invoices/${invoice.id}/docx`} download>
            <FileText size={16} /> Download DOCX
          </a>
          <span className="badge">{formatMoney(Number(invoice.total ?? 0), invoice.currency)}</span>
        </div>
      </div>

      {invoice.void_reason ? (
        <div className="success-box portal-alert portal-alert-error">
          <strong>Voided: </strong>
          {invoice.void_reason}
        </div>
      ) : null}

      {!isDraft ? (
        <div className="success-box portal-alert">
          This invoice is {invoiceStatusLabel(invoice.status).toLowerCase()}, so its details and line items are read-only.
        </div>
      ) : null}

      <div className="document-grid">
        <section>
          <InvoiceLineItemsEditor
            invoiceId={invoice.id}
            initialLines={editableLines}
            editable={isDraft && !hasProposalAllocations}
            lockedReason={
              hasProposalAllocations
                ? "These lines are fixed to the accepted proposal revision. Delete this draft and generate a new selection to change them."
                : null
            }
            taxAmount={Number(invoice.tax_amount ?? 0)}
            currency={invoice.currency}
          />
        </section>
        <InvoiceHeaderForm
          invoiceId={invoice.id}
          editable={isDraft && isAdmin}
          initial={{
            kind: invoice.kind,
            issue_date: invoice.issue_date,
            due_date: invoice.due_date,
            currency: invoice.currency,
            tax_amount: Number(invoice.tax_amount ?? 0),
            notes: invoice.notes,
            consultant_name: invoice.consultant_name,
            job_name: invoice.job_name,
            payment_terms: invoice.payment_terms,
            client_agreement_ref: invoice.client_agreement_ref,
            prepared_by: invoice.prepared_by,
            variance_reason: invoice.variance_reason ?? null,
          }}
        />
      </div>

      {isAdmin || (isDraft && invoice.created_by === userId) ? (
        <InvoiceDeleteButton invoiceId={invoice.id} invoiceNumber={invoice.invoice_number ?? "this draft"} />
      ) : null}
    </>
  );
}
