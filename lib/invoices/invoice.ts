/**
 * The invoice generator's vocabulary and arithmetic.
 *
 * client_invoices, client_invoice_line_items and client_invoice_counters have
 * existed since 14 August with everything except a screen: twenty-one check
 * constraints, RLS that lets employees draft but only admins settle, a
 * SECURITY DEFINER allocate_client_invoice_number() for per-year sequences, and
 * a guard_client_invoice_total() trigger. This module is the pure half.
 *
 * Every list below mirrors the database's own CHECK constraint. If they drift,
 * a row the database accepts renders as "Unknown" here, so these lists are the
 * contract and the tests assert them.
 */

export const invoiceStatuses = ["draft", "issued", "paid", "void"] as const;
export const invoiceKinds = ["deposit", "full", "balance"] as const;
export const lineQtyBases = ["session", "attendee", "hour", "flat"] as const;

export type InvoiceStatus = (typeof invoiceStatuses)[number];
export type InvoiceKind = (typeof invoiceKinds)[number];
export type LineQtyBasis = (typeof lineQtyBases)[number];

const statusLabels: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  paid: "Paid",
  void: "Void",
};

const kindLabels: Record<InvoiceKind, string> = {
  deposit: "Deposit",
  full: "Full",
  balance: "Balance",
};

const statusTones: Record<InvoiceStatus, string> = {
  draft: "muted",
  issued: "open",
  paid: "good",
  void: "dead",
};

export function isInvoiceStatus(v: unknown): v is InvoiceStatus {
  return typeof v === "string" && invoiceStatuses.includes(v as InvoiceStatus);
}

export function invoiceStatusLabel(status: string): string {
  return isInvoiceStatus(status) ? statusLabels[status] : "Unknown status";
}

export function invoiceStatusTone(status: string): string {
  return isInvoiceStatus(status) ? statusTones[status] : "muted";
}

export function invoiceKindLabel(kind: string | null | undefined): string {
  if (kind == null || kind === "") return "Proposal billing";

  return invoiceKinds.includes(kind as InvoiceKind) ? kindLabels[kind as InvoiceKind] : "Unknown kind";
}

/** Only an issued invoice is money anyone is waiting on. */
export function isOutstanding(status: string): boolean {
  return status === "issued";
}

export type InvoiceLine = {
  description: string;
  quantity: number | string;
  unit_amount: number | string;
  line_total?: number | string | null;
  unit?: string | null;
  qty_basis?: string | null;
};

export type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string;
  kind: string | null;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  subtotal: number | string | null;
  tax_amount: number | string | null;
  total: number | string | null;
};

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);

  return Number.isFinite(n) ? n : 0;
}

/**
 * A line's total. Money is rounded to cents at the line, not at the end, so the
 * sum of what a client reads on each line equals the subtotal they are charged.
 */
export function lineTotal(line: InvoiceLine): number {
  return Math.round(num(line.quantity) * num(line.unit_amount) * 100) / 100;
}

export type InvoiceTotals = { subtotal: number; tax: number; total: number };

/** Subtotal from the lines, plus whatever tax the invoice carries. */
export function computeTotals(lines: InvoiceLine[], taxAmount: number | string | null = 0): InvoiceTotals {
  const subtotal = Math.round(lines.reduce((sum, line) => sum + lineTotal(line), 0) * 100) / 100;
  const tax = Math.round(num(taxAmount) * 100) / 100;

  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

export type InvoiceProblem = { field: string; message: string };

/**
 * The same rules the database enforces, checked before a round trip so a person
 * sees a sentence instead of a constraint name. This does not replace the
 * constraints — it just fails earlier and more kindly.
 */
export function validateInvoice(input: {
  status: string;
  kind: string | null;
  currency: string;
  issue_date: string | null;
  issued_at: string | null;
  paid_at: string | null;
  lines: InvoiceLine[];
}): InvoiceProblem[] {
  const problems: InvoiceProblem[] = [];

  if (!isInvoiceStatus(input.status)) {
    problems.push({ field: "status", message: "Status must be draft, issued, paid or void." });
  }

  if (input.kind !== null && !invoiceKinds.includes(input.kind as InvoiceKind)) {
    problems.push({ field: "kind", message: "Kind must be proposal billing, deposit, full or balance." });
  }

  if ((input.currency ?? "").length !== 3) {
    problems.push({ field: "currency", message: "Currency must be a three-letter code." });
  }

  if (input.status === "issued" && (!input.issued_at || !input.issue_date)) {
    problems.push({ field: "issue_date", message: "An issued invoice needs both an issue date and an issued-at timestamp." });
  }

  if (input.status === "paid" && !input.paid_at) {
    problems.push({ field: "paid_at", message: "A paid invoice needs the date it was paid." });
  }

  if (input.lines.length === 0) {
    problems.push({ field: "lines", message: "An invoice needs at least one line." });
  }

  input.lines.forEach((line, index) => {
    const description = (line.description ?? "").trim();

    if (description.length < 1 || description.length > 500) {
      problems.push({ field: `lines[${index}].description`, message: "Each line needs a description of 1 to 500 characters." });
    }

    if (num(line.quantity) <= 0) {
      problems.push({ field: `lines[${index}].quantity`, message: "Quantity must be greater than zero." });
    }

    if (num(line.unit_amount) < 0) {
      problems.push({ field: `lines[${index}].unit_amount`, message: "Unit amount cannot be negative." });
    }

    if (line.qty_basis && !lineQtyBases.includes(line.qty_basis as LineQtyBasis)) {
      problems.push({ field: `lines[${index}].qty_basis`, message: "Basis must be session, attendee, hour or flat." });
    }
  });

  return problems;
}

/** Whole calendar days a due date is past, or null if it is not overdue. */
export function daysOverdue(invoice: InvoiceRow, now: Date): number | null {
  if (!isOutstanding(invoice.status) || !invoice.due_date) {
    return null;
  }

  const due = new Date(`${invoice.due_date.slice(0, 10)}T00:00:00.000Z`);

  if (!Number.isFinite(due.getTime())) {
    return null;
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((today - due.getTime()) / 86_400_000);

  return days > 0 ? days : null;
}

export type AgeingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export const ageingBuckets: readonly AgeingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

export function ageingBucketFor(invoice: InvoiceRow, now: Date): AgeingBucket | null {
  if (!isOutstanding(invoice.status)) {
    return null;
  }

  const overdue = daysOverdue(invoice, now);

  if (overdue === null) return "current";
  if (overdue <= 30) return "1-30";
  if (overdue <= 60) return "31-60";
  if (overdue <= 90) return "61-90";

  return "90+";
}

export type InvoiceSummary = {
  count: number;
  drafts: number;
  outstanding: number;
  outstandingValue: number;
  paidValue: number;
  overdueCount: number;
  ageing: Record<AgeingBucket, number>;
};

export function summariseInvoices(rows: InvoiceRow[], now: Date): InvoiceSummary {
  const ageing: Record<AgeingBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  let drafts = 0;
  let outstanding = 0;
  let outstandingValue = 0;
  let paidValue = 0;
  let overdueCount = 0;

  for (const row of rows) {
    const total = num(row.total);

    if (row.status === "draft") drafts += 1;
    if (row.status === "paid") paidValue += total;

    if (isOutstanding(row.status)) {
      outstanding += 1;
      outstandingValue += total;

      const bucket = ageingBucketFor(row, now);
      if (bucket) ageing[bucket] += total;
      if (daysOverdue(row, now) !== null) overdueCount += 1;
    }
  }

  return {
    count: rows.length,
    drafts,
    outstanding,
    outstandingValue: Math.round(outstandingValue * 100) / 100,
    paidValue: Math.round(paidValue * 100) / 100,
    overdueCount,
    ageing,
  };
}

/** Newest and most urgent first: overdue, then issued, then drafts, then settled. */
export function sortInvoices<T extends InvoiceRow>(rows: T[], now: Date): T[] {
  const rank = (row: T) => {
    if (isOutstanding(row.status)) return daysOverdue(row, now) !== null ? 0 : 1;
    if (row.status === "draft") return 2;

    return 3;
  };

  return [...rows].sort(
    (a, b) => rank(a) - rank(b) || (b.issue_date ?? "").localeCompare(a.issue_date ?? "") || (b.invoice_number ?? "").localeCompare(a.invoice_number ?? ""),
  );
}
