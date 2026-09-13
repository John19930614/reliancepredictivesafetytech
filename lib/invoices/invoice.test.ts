import { describe, expect, it } from "vitest";
import {
  ageingBucketFor,
  computeTotals,
  daysOverdue,
  invoiceKindLabel,
  invoiceKinds,
  invoiceStatusLabel,
  invoiceStatuses,
  isOutstanding,
  lineQtyBases,
  lineTotal,
  sortInvoices,
  summariseInvoices,
  validateInvoice,
  type InvoiceRow,
} from "@/lib/invoices/invoice";

const NOW = new Date("2026-08-18T12:00:00.000Z");

function inv(o: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: Math.random().toString(36).slice(2),
    invoice_number: "INV-2026-0001",
    status: "issued",
    kind: "full",
    issue_date: "2026-08-01",
    due_date: "2026-08-31",
    currency: "USD",
    subtotal: "1000",
    tax_amount: "0",
    total: "1000",
    ...o,
  };
}

describe("vocabulary mirrors the database CHECK constraints", () => {
  it("has the four statuses", () => {
    expect([...invoiceStatuses]).toEqual(["draft", "issued", "paid", "void"]);
  });

  it("has the three kinds", () => {
    expect([...invoiceKinds]).toEqual(["deposit", "full", "balance"]);
  });

  it("has the four quantity bases", () => {
    expect([...lineQtyBases]).toEqual(["session", "attendee", "hour", "flat"]);
  });

  it("labels everything, and says so when it cannot", () => {
    for (const s of invoiceStatuses) expect(invoiceStatusLabel(s)).not.toBe("Unknown status");
    for (const k of invoiceKinds) expect(invoiceKindLabel(k)).not.toBe("Unknown kind");
    expect(invoiceKindLabel(null)).toBe("Proposal billing");
    expect(invoiceStatusLabel("posted")).toBe("Unknown status");
    expect(invoiceKindLabel("partial")).toBe("Unknown kind");
  });

  it("counts only an issued invoice as money owed", () => {
    expect(isOutstanding("issued")).toBe(true);
    for (const s of ["draft", "paid", "void"]) expect(isOutstanding(s)).toBe(false);
  });
});

describe("money", () => {
  it("rounds each line to cents so the lines sum to the subtotal a client is charged", () => {
    const lines = [
      { description: "Training", quantity: 3, unit_amount: 33.333 },
      { description: "Travel", quantity: 1, unit_amount: 0.005 },
    ];

    expect(lineTotal(lines[0])).toBe(100);
    expect(lineTotal(lines[1])).toBe(0.01);
    expect(computeTotals(lines).subtotal).toBe(100.01);
  });

  it("adds tax on top of the subtotal", () => {
    const totals = computeTotals([{ description: "Work", quantity: 2, unit_amount: 500 }], "82.50");

    expect(totals).toEqual({ subtotal: 1000, tax: 82.5, total: 1082.5 });
  });

  it("treats a string, a number and a null alike", () => {
    expect(lineTotal({ description: "x", quantity: "2", unit_amount: "10" })).toBe(20);
    expect(computeTotals([], null)).toEqual({ subtotal: 0, tax: 0, total: 0 });
  });
});

describe("validateInvoice", () => {
  const base = {
    status: "draft",
    kind: "full",
    currency: "USD",
    issue_date: null,
    issued_at: null,
    paid_at: null,
    lines: [{ description: "Safety training", quantity: 1, unit_amount: 500 }],
  };

  it("passes a well-formed draft", () => {
    expect(validateInvoice(base)).toEqual([]);
  });

  it("accepts proposal billing after the legacy kind field was retired", () => {
    expect(validateInvoice({ ...base, kind: null })).toEqual([]);
  });

  it("refuses an issued invoice with no dates, matching client_invoices_issued_has_date", () => {
    const problems = validateInvoice({ ...base, status: "issued" });

    expect(problems.map((p) => p.field)).toContain("issue_date");
  });

  it("refuses a paid invoice with no paid date, matching client_invoices_paid_has_date", () => {
    const problems = validateInvoice({ ...base, status: "paid" });

    expect(problems.map((p) => p.field)).toContain("paid_at");
  });

  it("refuses a currency that is not three letters", () => {
    expect(validateInvoice({ ...base, currency: "US" }).map((p) => p.field)).toContain("currency");
  });

  it("refuses an invoice with no lines", () => {
    expect(validateInvoice({ ...base, lines: [] }).map((p) => p.field)).toContain("lines");
  });

  it("refuses an empty or over-long description", () => {
    expect(validateInvoice({ ...base, lines: [{ description: "   ", quantity: 1, unit_amount: 1 }] })).toHaveLength(1);
    expect(validateInvoice({ ...base, lines: [{ description: "x".repeat(501), quantity: 1, unit_amount: 1 }] })).toHaveLength(1);
  });

  it("refuses a non-positive quantity and a negative amount", () => {
    expect(validateInvoice({ ...base, lines: [{ description: "x", quantity: 0, unit_amount: 1 }] })).toHaveLength(1);
    expect(validateInvoice({ ...base, lines: [{ description: "x", quantity: 1, unit_amount: -1 }] })).toHaveLength(1);
  });

  it("refuses a basis outside the four the database allows", () => {
    const problems = validateInvoice({ ...base, lines: [{ description: "x", quantity: 1, unit_amount: 1, qty_basis: "day" }] });

    expect(problems[0].field).toBe("lines[0].qty_basis");
  });

  it("names every problem rather than stopping at the first", () => {
    const problems = validateInvoice({ ...base, status: "nope", kind: "nope", currency: "X", lines: [] });

    expect(problems.length).toBeGreaterThanOrEqual(4);
  });
});

describe("ageing", () => {
  it("reports whole days past due, and nothing when not yet due", () => {
    expect(daysOverdue(inv({ due_date: "2026-08-11" }), NOW)).toBe(7);
    expect(daysOverdue(inv({ due_date: "2026-08-31" }), NOW)).toBeNull();
    expect(daysOverdue(inv({ due_date: "2026-08-18" }), NOW)).toBeNull();
  });

  it("stays quiet about anything not issued — a void invoice is not late", () => {
    expect(daysOverdue(inv({ status: "void", due_date: "2026-01-01" }), NOW)).toBeNull();
    expect(daysOverdue(inv({ status: "paid", due_date: "2026-01-01" }), NOW)).toBeNull();
    expect(ageingBucketFor(inv({ status: "draft" }), NOW)).toBeNull();
  });

  it("drops each outstanding invoice into the right bucket", () => {
    expect(ageingBucketFor(inv({ due_date: "2026-09-30" }), NOW)).toBe("current");
    expect(ageingBucketFor(inv({ due_date: "2026-08-01" }), NOW)).toBe("1-30");
    expect(ageingBucketFor(inv({ due_date: "2026-07-01" }), NOW)).toBe("31-60");
    expect(ageingBucketFor(inv({ due_date: "2026-06-01" }), NOW)).toBe("61-90");
    expect(ageingBucketFor(inv({ due_date: "2026-01-01" }), NOW)).toBe("90+");
  });
});

describe("summariseInvoices", () => {
  it("separates drafts, outstanding money and money already in", () => {
    const s = summariseInvoices(
      [
        inv({ status: "draft", total: "100" }),
        inv({ status: "issued", total: "200", due_date: "2026-09-30" }),
        inv({ status: "issued", total: "300", due_date: "2026-08-01" }),
        inv({ status: "paid", total: "400" }),
        inv({ status: "void", total: "999" }),
      ],
      NOW,
    );

    expect(s.count).toBe(5);
    expect(s.drafts).toBe(1);
    expect(s.outstanding).toBe(2);
    expect(s.outstandingValue).toBe(500);
    expect(s.paidValue).toBe(400);
    expect(s.overdueCount).toBe(1);
    expect(s.ageing.current).toBe(200);
    expect(s.ageing["1-30"]).toBe(300);
  });

  it("never counts a void invoice as money", () => {
    const s = summariseInvoices([inv({ status: "void", total: "5000" })], NOW);

    expect(s.outstandingValue).toBe(0);
    expect(s.paidValue).toBe(0);
  });

  it("returns zeroes for an empty ledger", () => {
    const s = summariseInvoices([], NOW);

    expect(s).toEqual({
      count: 0,
      drafts: 0,
      outstanding: 0,
      outstandingValue: 0,
      paidValue: 0,
      overdueCount: 0,
      ageing: { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
    });
  });
});

describe("sortInvoices", () => {
  it("puts overdue first, then issued, then drafts, then settled", () => {
    const sorted = sortInvoices(
      [
        inv({ status: "paid", invoice_number: "PAID" }),
        inv({ status: "draft", invoice_number: "DRAFT" }),
        inv({ status: "issued", due_date: "2026-09-30", invoice_number: "ISSUED" }),
        inv({ status: "issued", due_date: "2026-08-01", invoice_number: "LATE" }),
      ],
      NOW,
    );

    expect(sorted.map((r) => r.invoice_number)).toEqual(["LATE", "ISSUED", "DRAFT", "PAID"]);
  });

  it("returns an empty list unchanged", () => {
    expect(sortInvoices([], NOW)).toEqual([]);
  });
});
