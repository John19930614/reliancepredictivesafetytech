import { describe, expect, it } from "vitest";
import type { ProposalLineItem, ProposalTotals } from "@/lib/proposals/pricing";
import { addDays, buildDraftInvoice, defaultNetDays, isEmptyDraft } from "./draft";

function line(over: Partial<ProposalLineItem> = {}): ProposalLineItem {
  return {
    source: "service",
    key: "audit",
    name: "Site Safety Audit",
    desc: "",
    unit: "Session",
    qty: 2,
    price: 1500,
    amount: 3000,
    ...over,
  } as ProposalLineItem;
}

function totals(over: Partial<ProposalTotals> = {}): ProposalTotals {
  return {
    lineItems: [line()],
    subtotal: 3000,
    discount: 0,
    tax: 0,
    total: 3000,
    deposit: 0,
    ...over,
  };
}

const ISSUE = "2026-08-14";

describe("addDays", () => {
  it("adds days inside a month", () => {
    expect(addDays("2026-08-14", 30)).toBe("2026-09-13");
  });

  it("crosses a year boundary correctly", () => {
    expect(addDays("2026-12-20", 30)).toBe("2027-01-19");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(addDays("not-a-date", 30)).toBe("not-a-date");
  });
});

describe("buildDraftInvoice — full", () => {
  it("bills every fee-table row at the stored amounts", () => {
    const draft = buildDraftInvoice({ totals: totals(), kind: "full", issueDate: ISSUE });

    expect(draft.kind).toBe("full");
    expect(draft.lineItems).toHaveLength(1);
    expect(draft.lineItems[0]).toMatchObject({
      description: "Site Safety Audit (per Session)",
      quantity: 2,
      unitAmount: 1500,
      lineTotal: 3000,
      sortOrder: 10,
    });
    expect(draft.subtotal).toBe(3000);
    expect(draft.total).toBe(3000);
  });

  it("dates the invoice and defaults to net 30", () => {
    const draft = buildDraftInvoice({ totals: totals(), kind: "full", issueDate: ISSUE });
    expect(draft.issueDate).toBe(ISSUE);
    expect(draft.dueDate).toBe(addDays(ISSUE, defaultNetDays));
  });

  it("honours explicit payment terms", () => {
    const draft = buildDraftInvoice({ totals: totals(), kind: "full", issueDate: ISSUE, netDays: 14 });
    expect(draft.dueDate).toBe("2026-08-28");
  });

  it("treats a negative netDays as the default rather than back-dating the due date", () => {
    const draft = buildDraftInvoice({ totals: totals(), kind: "full", issueDate: ISSUE, netDays: -10 });
    expect(draft.dueDate).toBe(addDays(ISSUE, defaultNetDays));
  });

  // The client can add the lines up. When the total does not match the sum,
  // the document has to say why on its face.
  it("explains a discount and tax that move the total off the line sum", () => {
    const draft = buildDraftInvoice({
      totals: totals({ subtotal: 3000, discount: 300, tax: 189, total: 2889 }),
      kind: "full",
      issueDate: ISSUE,
    });
    expect(draft.subtotal).toBe(3000);
    expect(draft.total).toBe(2889);
    expect(draft.notes).toContain("300.00 discount");
    expect(draft.notes).toContain("189.00 tax");
  });

  it("carries no note when the total is simply the line sum", () => {
    expect(buildDraftInvoice({ totals: totals(), kind: "full", issueDate: ISSUE }).notes).toBeNull();
  });

  it("omits the unit from the description when a row has none", () => {
    const draft = buildDraftInvoice({
      totals: totals({ lineItems: [line({ name: "Platform Services", unit: "", qty: 1, amount: 12000 })] }),
      kind: "full",
      issueDate: ISSUE,
    });
    expect(draft.lineItems[0].description).toBe("Platform Services");
  });

  // A quantity of zero would divide by zero deriving the unit price.
  it("survives a zero-quantity row without producing Infinity", () => {
    const draft = buildDraftInvoice({
      totals: totals({ lineItems: [line({ qty: 0, amount: 500 })], subtotal: 500, total: 500 }),
      kind: "full",
      issueDate: ISSUE,
    });
    expect(draft.lineItems[0].quantity).toBe(1);
    expect(draft.lineItems[0].unitAmount).toBe(500);
    expect(Number.isFinite(draft.lineItems[0].unitAmount)).toBe(true);
  });

  it("numbers the lines in document order", () => {
    const draft = buildDraftInvoice({
      totals: totals({ lineItems: [line({ name: "A" }), line({ name: "B" }), line({ name: "C" })] }),
      kind: "full",
      issueDate: ISSUE,
    });
    expect(draft.lineItems.map((row) => row.sortOrder)).toEqual([10, 20, 30]);
  });
});

describe("buildDraftInvoice — deposit", () => {
  it("bills only the deposit, and says what it is a deposit against", () => {
    const draft = buildDraftInvoice({
      totals: totals({ deposit: 900, total: 3000 }),
      kind: "deposit",
      issueDate: ISSUE,
    });

    expect(draft.lineItems).toHaveLength(1);
    expect(draft.lineItems[0].description).toBe("Deposit due on acceptance");
    expect(draft.total).toBe(900);
    expect(draft.notes).toContain("3000.00");
  });

  // Better to tell the operator there is nothing to bill than to raise an
  // invoice for zero, which still spends an invoice number.
  it("produces an empty draft when the proposal has no deposit", () => {
    const draft = buildDraftInvoice({ totals: totals({ deposit: 0 }), kind: "deposit", issueDate: ISSUE });
    expect(draft.lineItems).toHaveLength(0);
    expect(isEmptyDraft(draft)).toBe(true);
  });
});

describe("buildDraftInvoice — balance", () => {
  it("bills the contract total less the deposit", () => {
    const draft = buildDraftInvoice({
      totals: totals({ total: 3000, deposit: 900 }),
      kind: "balance",
      issueDate: ISSUE,
    });
    expect(draft.total).toBe(2100);
    expect(draft.lineItems[0].description).toBe("Balance due");
  });

  it("is empty when the deposit already covered the contract", () => {
    const draft = buildDraftInvoice({
      totals: totals({ total: 3000, deposit: 3000 }),
      kind: "balance",
      issueDate: ISSUE,
    });
    expect(isEmptyDraft(draft)).toBe(true);
  });

  // A deposit larger than the total is bad data; the invoice must not go
  // negative, which the column CHECK would reject anyway.
  it("floors at zero rather than going negative", () => {
    const draft = buildDraftInvoice({
      totals: totals({ total: 1000, deposit: 4000 }),
      kind: "balance",
      issueDate: ISSUE,
    });
    expect(draft.total).toBe(0);
    expect(isEmptyDraft(draft)).toBe(true);
  });
});

describe("isEmptyDraft", () => {
  it("is false for a draft that actually bills something", () => {
    expect(isEmptyDraft(buildDraftInvoice({ totals: totals(), kind: "full", issueDate: ISSUE }))).toBe(false);
  });

  it("is true when the proposal prices out at zero", () => {
    const draft = buildDraftInvoice({
      totals: totals({ lineItems: [], subtotal: 0, total: 0 }),
      kind: "full",
      issueDate: ISSUE,
    });
    expect(isEmptyDraft(draft)).toBe(true);
  });
});
