// The invoice's one view model. Both renderers (pdf.ts, docx.ts) consume this
// — never raw Supabase rows — so the two output formats cannot drift on what
// a figure or a label actually says. Mirrors the proposal module's own
// buildProposalDocumentModel() / ProposalDocumentModel split.

import type { CompanyProfile } from "@/lib/company/profile";

export interface InvoiceDocumentLine {
  description: string;
  qty: string;
  unit: string;
  unitAmount: string;
  lineTotal: string;
  /**
   * When the work was actually performed, e.g. "Aug 16, 2026".
   *
   * The column has existed on client_invoice_line_items since the invoice
   * model landed and the editor has always offered it, but neither renderer
   * printed it — so a client asking "what date was this training?" could not
   * answer it from the invoice. Steve asked for it on 2026-08-31. Null when the
   * line has no date set, and then nothing prints.
   */
  serviceDate: string | null;
}

export interface InvoiceDocumentModel {
  invoiceNumber: string;
  proposalNumber: string | null;
  statusLabel: string;
  kindLabel: string;
  issueDate: string | null;
  dueDate: string | null;
  jobName: string | null;
  consultantName: string | null;
  paymentTerms: string | null;
  clientAgreementRef: string | null;
  preparedBy: string | null;
  notes: string | null;
  seller: { name: string; addressLines: string[]; email: string; phone: string; website: string };
  billTo: { name: string; addressLines: string[] };
  lines: InvoiceDocumentLine[];
  subtotal: string;
  tax: string;
  total: string;
}

export interface InvoiceDocumentSourceLine {
  description: string;
  quantity: number | string;
  unit_amount: number | string;
  line_total: number | string;
  unit?: string | null;
  service_date?: string | null;
}

export interface InvoiceDocumentSource {
  invoice_number: string | null;
  status: string;
  kind: string | null;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  subtotal: number | string | null;
  tax_amount: number | string | null;
  total: number | string | null;
  job_name: string | null;
  consultant_name: string | null;
  payment_terms: string | null;
  client_agreement_ref: string | null;
  prepared_by: string | null;
  notes: string | null;
}

function money(value: number | string | null | undefined, currency: string): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
}

function addressLines(o: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): string[] {
  const line1 = [o.address_line1, o.address_line2].filter(Boolean).join(", ");
  const line2 = [o.city, o.state, o.postal_code].filter(Boolean).join(", ");
  return [line1, line2, o.country && o.country !== "US" && o.country !== "USA" ? o.country : ""].filter((line) => line && line.trim() !== "");
}

export function buildInvoiceDocumentModel(input: {
  invoice: InvoiceDocumentSource;
  lines: InvoiceDocumentSourceLine[];
  seller: CompanyProfile;
  billTo: { name: string; address_line1?: string | null; address_line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null } | null;
  statusLabel: string;
  kindLabel: string;
  proposalNumber?: string | null;
}): InvoiceDocumentModel {
  const currency = input.invoice.currency || "USD";

  return {
    invoiceNumber: input.invoice.invoice_number ?? "DRAFT",
    proposalNumber: input.proposalNumber ?? null,
    statusLabel: input.statusLabel,
    kindLabel: input.kindLabel,
    issueDate: formatDate(input.invoice.issue_date),
    dueDate: formatDate(input.invoice.due_date),
    jobName: input.invoice.job_name,
    consultantName: input.invoice.consultant_name,
    paymentTerms: input.invoice.payment_terms,
    clientAgreementRef: input.invoice.client_agreement_ref,
    preparedBy: input.invoice.prepared_by,
    notes: input.invoice.notes,
    seller: {
      name: input.seller.display_name || input.seller.legal_name || "Reliance Predictive Safety Technologies",
      addressLines: addressLines(input.seller),
      email: input.seller.email,
      phone: input.seller.phone,
      website: input.seller.website,
    },
    billTo: {
      name: input.billTo?.name || "",
      addressLines: input.billTo
        ? addressLines({
            address_line1: input.billTo.address_line1 ?? undefined,
            address_line2: input.billTo.address_line2 ?? undefined,
            city: input.billTo.city ?? undefined,
            state: input.billTo.state ?? undefined,
            postal_code: input.billTo.postal_code ?? undefined,
            country: input.billTo.country ?? undefined,
          })
        : [],
    },
    lines: input.lines.map((line) => ({
      description: line.description,
      qty: (typeof line.quantity === "string" ? Number(line.quantity) : line.quantity).toLocaleString("en-US", { maximumFractionDigits: 2 }),
      unit: line.unit || "",
      unitAmount: money(line.unit_amount, currency),
      lineTotal: money(line.line_total, currency),
      serviceDate: formatDate(line.service_date ?? null),
    })),
    subtotal: money(input.invoice.subtotal, currency),
    tax: money(input.invoice.tax_amount, currency),
    total: money(input.invoice.total, currency),
  };
}
