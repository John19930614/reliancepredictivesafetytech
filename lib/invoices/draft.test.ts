import { describe, expect, it } from "vitest";
import type { ProposalLineItem, ProposalTotals } from "@/lib/proposals/pricing";
import {
  addDays,
  buildDraftInvoice,
  checkInvoiceLineEdit,
  defaultNetDays,
  invoiceTotalsFrom,
  isEmptyDraft,
  isQuantityBasis,
  lineTotalFor,
  maxLineQuantity,
  netDaysFromPaymentTerms,
  quantityBasisFor,
  type EditableInvoiceLine,
} from "./draft";

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

  // A quantity of zero would divide by zero deriving the unit price. The stored
  // price is preferred over that division, so the row keeps the rate the client
  // agreed to rather than a figure invented from a rounded total.
  it("survives a zero-quantity row without producing Infinity", () => {
    const draft = buildDraftInvoice({
      totals: totals({ lineItems: [line({ qty: 0, price: 1500, amount: 500 })], subtotal: 500, total: 500 }),
      kind: "full",
      issueDate: ISSUE,
    });
    expect(draft.lineItems[0].quantity).toBe(1);
    expect(draft.lineItems[0].unitAmount).toBe(1500);
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

describe("netDaysFromPaymentTerms", () => {
  it("reads the generator's own options", () => {
    expect(netDaysFromPaymentTerms("Net 15 from invoice date")).toBe(15);
    expect(netDaysFromPaymentTerms("Net 30 from invoice date")).toBe(30);
    expect(netDaysFromPaymentTerms("Due upon receipt")).toBe(0);
  });

  // The field is free text, and real proposals use it that way.
  it("reads a net figure out of free text", () => {
    expect(netDaysFromPaymentTerms("Net 45 on invoice, 20% due at acceptance")).toBe(45);
    expect(netDaysFromPaymentTerms("net7")).toBe(7);
  });

  // "Due upon receipt, Net 30 thereafter" means due on receipt.
  it("prefers due-on-receipt over a later net figure", () => {
    expect(netDaysFromPaymentTerms("Due upon receipt, Net 30 thereafter")).toBe(0);
  });

  it("falls back to the default rather than guessing", () => {
    for (const value of ["50% deposit / 50% at launch", "Monthly subscription billing", "", null, undefined]) {
      expect(netDaysFromPaymentTerms(value), String(value)).toBe(defaultNetDays);
    }
  });

  // A typo must not date an invoice years into the future.
  it("ignores an implausible figure", () => {
    expect(netDaysFromPaymentTerms("Net 999")).toBe(defaultNetDays);
  });
});

describe("line pricing keeps the agreed unit price", () => {
  // computeProposalTotals rounds `amount` to cents, so lineTotal/quantity does
  // NOT recover the agreed price: 3 x $0.655 stores 1.97, and 1.97/3 rounds to
  // 0.66 — a price the client never agreed to, multiplying back to 1.98.
  it("uses the stored price rather than dividing the rounded total", () => {
    const draft = buildDraftInvoice({
      totals: totals({
        lineItems: [line({ name: "Mileage", unit: "Mile", qty: 3, price: 0.655, amount: 1.97 })],
        subtotal: 1.97,
        total: 1.97,
      }),
      kind: "full",
      issueDate: ISSUE,
    });
    expect(draft.lineItems[0].unitAmount).toBe(0.66);
    expect(draft.lineItems[0].lineTotal).toBe(1.97);
  });

  it("falls back to the derived figure when the row carries no price", () => {
    const draft = buildDraftInvoice({
      totals: totals({ lineItems: [line({ qty: 2, price: 0, amount: 300 })], subtotal: 300, total: 300 }),
      kind: "full",
      issueDate: ISSUE,
    });
    expect(draft.lineItems[0].unitAmount).toBe(150);
  });

  // A quantity between 0 and 0.005 rounds to zero, which violates the
  // `quantity > 0` CHECK and fails the whole line write.
  it("never stores a quantity that rounds to zero", () => {
    const draft = buildDraftInvoice({
      totals: totals({ lineItems: [line({ qty: 0.004, price: 0, amount: 500 })], subtotal: 500, total: 500 }),
      kind: "full",
      issueDate: ISSUE,
    });
    expect(draft.lineItems[0].quantity).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Editing a raised invoice                                                   */
/* -------------------------------------------------------------------------- */

function stored(over: Partial<EditableInvoiceLine> = {}): EditableInvoiceLine {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    description: "Confined Space Entry — classroom",
    quantity: 12,
    unitAmount: 105,
    unit: "Seat",
    qtyBasis: "attendee",
    serviceDate: "2026-08-20",
    lineTotal: 1260,
    ...over,
  };
}

describe("lineTotalFor", () => {
  // THE CASE THIS WHOLE CHANGE EXISTS FOR. A class is quoted at 12 seats and
  // ten people turn up; the invoice has to say 1050.00, and it has to get there
  // by editing a quantity rather than by voiding a numbered document.
  it("bills 12 seats at 105 as 1260, and 10 seats at 105 as 1050", () => {
    expect(lineTotalFor({ quantity: 12, unitAmount: 105, qtyBasis: "attendee" })).toBe(1260);
    expect(lineTotalFor({ quantity: 10, unitAmount: 105, qtyBasis: "attendee" })).toBe(1050);
  });

  it("scales on every basis that means a multiplier", () => {
    expect(lineTotalFor({ quantity: 3, unitAmount: 200, qtyBasis: "session" })).toBe(600);
    expect(lineTotalFor({ quantity: 7.5, unitAmount: 160, qtyBasis: "hour" })).toBe(1200);
  });

  // A retainer with a quantity of 1 must not become two retainers because
  // somebody typed 2 into a box that does not price anything.
  it("ignores the quantity on a flat fee", () => {
    expect(lineTotalFor({ quantity: 1, unitAmount: 2500, qtyBasis: "flat" })).toBe(2500);
    expect(lineTotalFor({ quantity: 4, unitAmount: 2500, qtyBasis: "flat" })).toBe(2500);
    expect(lineTotalFor({ quantity: 0.5, unitAmount: 2500, qtyBasis: "flat" })).toBe(2500);
  });

  // numeric(12,2) is what the database stores, so the arithmetic has to be done
  // against the rounded quantity or the stored row cannot reproduce the total.
  it("multiplies the quantity the database will actually hold", () => {
    expect(lineTotalFor({ quantity: 10.004, unitAmount: 100, qtyBasis: "attendee" })).toBe(1000);
  });

  it("rounds the result to cents rather than letting float drift reach a money column", () => {
    expect(lineTotalFor({ quantity: 3, unitAmount: 0.655, qtyBasis: "hour" })).toBe(1.98);
    expect(lineTotalFor({ quantity: 3, unitAmount: 0.1, qtyBasis: "hour" })).toBe(0.3);
  });
});

describe("invoiceTotalsFrom", () => {
  // THE INVARIANT: total = subtotal + tax_amount.
  it("sums the stored lines and adds tax", () => {
    expect(invoiceTotalsFrom([{ lineTotal: 1050 }, { lineTotal: 250 }], 104)).toEqual({
      subtotal: 1300,
      tax: 104,
      total: 1404,
    });
  });

  it("is zero for an invoice with no lines", () => {
    expect(invoiceTotalsFrom([], 0)).toEqual({ subtotal: 0, tax: 0, total: 0 });
  });

  // subtotal, total and tax_amount all carry `>= 0` CHECKs; a negative tax
  // would fail the write with a 23514 nobody can act on.
  it("floors a negative tax at zero rather than crediting the client", () => {
    expect(invoiceTotalsFrom([{ lineTotal: 100 }], -50)).toEqual({ subtotal: 100, tax: 0, total: 100 });
  });

  it("survives a non-finite tax", () => {
    expect(invoiceTotalsFrom([{ lineTotal: 100 }], Number.NaN).total).toBe(100);
  });

  it("rounds each line before summing, so cents cannot accumulate", () => {
    expect(invoiceTotalsFrom([{ lineTotal: 0.1 }, { lineTotal: 0.2 }], 0).subtotal).toBe(0.3);
  });
});

describe("checkInvoiceLineEdit", () => {
  // The headline case, through the validator the action actually calls.
  it("reprices 12 seats to 10 and recomputes the line total server-side", () => {
    const checked = checkInvoiceLineEdit(stored(), { id: stored().id, quantity: 10 });

    expect(checked.ok).toBe(true);
    expect(checked.line?.quantity).toBe(10);
    expect(checked.line?.lineTotal).toBe(1050);
    // Untouched fields survive an edit that never mentioned them.
    expect(checked.line?.description).toBe("Confined Space Entry — classroom");
    expect(checked.line?.unitAmount).toBe(105);
  });

  it("leaves a flat line at its unit amount however the quantity is edited", () => {
    const line = stored({ qtyBasis: "flat", quantity: 1, unitAmount: 2500, lineTotal: 2500 });
    const checked = checkInvoiceLineEdit(line, { id: line.id, quantity: 9 });

    expect(checked.ok).toBe(true);
    expect(checked.line?.quantity).toBe(9);
    expect(checked.line?.lineTotal).toBe(2500);
  });

  // Switching the basis is the honest way to make a flat line scale.
  it("recomputes when the basis itself changes", () => {
    const line = stored({ qtyBasis: "flat", quantity: 10, unitAmount: 105, lineTotal: 105 });
    const checked = checkInvoiceLineEdit(line, { id: line.id, qtyBasis: "attendee" });

    expect(checked.line?.lineTotal).toBe(1050);
  });

  it("edits the unit, the description and the service date", () => {
    const checked = checkInvoiceLineEdit(stored(), {
      id: stored().id,
      unit: "  Attendee  ",
      description: "  Confined Space Entry  ",
      serviceDate: "2026-09-02",
    });

    expect(checked.line?.unit).toBe("Attendee");
    expect(checked.line?.description).toBe("Confined Space Entry");
    expect(checked.line?.serviceDate).toBe("2026-09-02");
  });

  it("clears the service date on an explicit null or empty string", () => {
    expect(checkInvoiceLineEdit(stored(), { id: stored().id, serviceDate: null }).line?.serviceDate).toBeNull();
    expect(checkInvoiceLineEdit(stored(), { id: stored().id, serviceDate: "" }).line?.serviceDate).toBeNull();
  });

  it("leaves the service date alone when the edit does not mention it", () => {
    expect(checkInvoiceLineEdit(stored(), { id: stored().id, quantity: 5 }).line?.serviceDate).toBe("2026-08-20");
  });

  /* --- negatives --------------------------------------------------------- */

  // quantity > 0 is a column CHECK; a 23514 is not a sentence anyone can act on.
  it("refuses a quantity of zero or below", () => {
    for (const quantity of [0, -1, -0.01]) {
      const checked = checkInvoiceLineEdit(stored(), { id: stored().id, quantity });
      expect(checked.ok, String(quantity)).toBe(false);
      expect(checked.error).toContain("more than zero");
    }
  });

  // 0.004 passes a naive `> 0` and then rounds to zero, failing the whole write.
  it("refuses a quantity that rounds away to zero", () => {
    expect(checkInvoiceLineEdit(stored(), { id: stored().id, quantity: 0.004 }).ok).toBe(false);
  });

  it("refuses a quantity that is not a number", () => {
    expect(checkInvoiceLineEdit(stored(), { id: stored().id, quantity: Number.NaN }).ok).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(checkInvoiceLineEdit(stored(), { id: stored().id, quantity: "10" as any }).ok).toBe(false);
  });

  it("refuses an absurd quantity rather than billing it", () => {
    expect(checkInvoiceLineEdit(stored(), { id: stored().id, quantity: maxLineQuantity + 1 }).ok).toBe(false);
  });

  it("refuses a negative unit price", () => {
    const checked = checkInvoiceLineEdit(stored(), { id: stored().id, unitAmount: -5 });
    expect(checked.ok).toBe(false);
    expect(checked.error).toContain("negative");
  });

  it("refuses an empty description and one past the column CHECK", () => {
    expect(checkInvoiceLineEdit(stored(), { id: stored().id, description: "   " }).ok).toBe(false);
    expect(checkInvoiceLineEdit(stored(), { id: stored().id, description: "x".repeat(501) }).ok).toBe(false);
  });

  it("refuses a unit past the column CHECK", () => {
    expect(checkInvoiceLineEdit(stored(), { id: stored().id, unit: "x".repeat(61) }).ok).toBe(false);
  });

  it("refuses a basis outside the enum the CHECK constraint allows", () => {
    const checked = checkInvoiceLineEdit(stored(), { id: stored().id, qtyBasis: "per_widget" });
    expect(checked.ok).toBe(false);
    expect(checked.error).toContain("how the quantity is counted");
  });

  it("refuses a date that is not a real calendar day", () => {
    for (const value of ["2026-02-31", "20/08/2026", "2026-8-2", "tomorrow"]) {
      expect(checkInvoiceLineEdit(stored(), { id: stored().id, serviceDate: value }).ok, value).toBe(false);
    }
  });

  it("refuses a line that would come to more than the system will invoice", () => {
    const line = stored({ qtyBasis: "attendee", unitAmount: 1_000_000 });
    expect(checkInvoiceLineEdit(line, { id: line.id, quantity: 99_999 }).ok).toBe(false);
  });
});

describe("quantityBasisFor", () => {
  // The proposal stores what the quantity meant when the client agreed to it.
  // Re-deriving it here could only disagree with the document they signed.
  it("takes the row's own basis when it has one", () => {
    expect(quantityBasisFor({ qtyBasis: "attendee", unit: "Session", qty: 2, price: 100, amount: 200 })).toBe(
      "attendee",
    );
    expect(quantityBasisFor({ qtyBasis: "flat", unit: "Hour", qty: 3, price: 100, amount: 300 })).toBe("flat");
  });

  it("ignores a basis the qty_basis CHECK would reject", () => {
    expect(quantityBasisFor({ qtyBasis: "per_widget", unit: "Seat" })).toBe("attendee");
  });

  it("reads the unit word for a row saved before the basis existed", () => {
    expect(quantityBasisFor({ unit: "Seat" })).toBe("attendee");
    expect(quantityBasisFor({ unit: "Person" })).toBe("attendee");
    expect(quantityBasisFor({ unit: "Hour" })).toBe("hour");
    expect(quantityBasisFor({ unit: "Session" })).toBe("session");
    expect(quantityBasisFor({ unit: "Training Day" })).toBe("session");
  });

  // A row whose stored amount is its own quantity times its own price is a
  // scaling row whatever it calls its unit; filing it flat would freeze it.
  it("falls back to the arithmetic for an unrecognised unit that plainly scales", () => {
    expect(quantityBasisFor({ unit: "Mile", qty: 120, price: 0.67, amount: 80.4 })).toBe("session");
  });

  // 1 x price == price for a flat fee and a scaling row alike, so it tells us
  // nothing, and flat is the answer that cannot re-price anything on its own.
  it("stays flat when the quantity is 1, or when the amount is not the product", () => {
    expect(quantityBasisFor({ unit: "Project", qty: 1, price: 5000, amount: 5000 })).toBe("flat");
    expect(quantityBasisFor({ unit: "Project", qty: 3, price: 5000, amount: 12000 })).toBe("flat");
    expect(quantityBasisFor({})).toBe("flat");
  });
});

describe("isQuantityBasis", () => {
  it("accepts exactly the four values the column CHECK allows", () => {
    for (const value of ["session", "attendee", "hour", "flat"]) expect(isQuantityBasis(value)).toBe(true);
    for (const value of ["Flat", "each", "", null, undefined, 3]) expect(isQuantityBasis(value), String(value)).toBe(false);
  });
});

describe("buildDraftInvoice carries the basis onto the generated lines", () => {
  // A generated line that files itself flat cannot be corrected from 12 seats
  // to 10 later, because a flat line ignores its quantity. This is the join
  // between generating an invoice and being able to fix one.
  it("keeps a per-seat fee-table row scaling", () => {
    const draft = buildDraftInvoice({
      totals: totals({
        lineItems: [line({ name: "Confined Space Entry", unit: "Seat", qty: 12, price: 105, amount: 1260 })],
        subtotal: 1260,
        total: 1260,
      }),
      kind: "full",
      issueDate: ISSUE,
    });

    expect(draft.lineItems[0].qtyBasis).toBe("attendee");
    expect(draft.lineItems[0].unit).toBe("Seat");
    expect(lineTotalFor({ ...draft.lineItems[0], quantity: 10 })).toBe(1050);
  });

  it("honours a basis the proposal row already decided", () => {
    const draft = buildDraftInvoice({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      totals: totals({ lineItems: [line({ unit: "Seat", qtyBasis: "flat" } as any)] }),
      kind: "full",
      issueDate: ISSUE,
    });
    expect(draft.lineItems[0].qtyBasis).toBe("flat");
  });

  // A deposit is a fixed sum, not a rate.
  it("marks a deposit and a balance flat", () => {
    expect(
      buildDraftInvoice({ totals: totals({ deposit: 900 }), kind: "deposit", issueDate: ISSUE }).lineItems[0].qtyBasis,
    ).toBe("flat");
    expect(
      buildDraftInvoice({ totals: totals({ total: 3000, deposit: 900 }), kind: "balance", issueDate: ISSUE })
        .lineItems[0].qtyBasis,
    ).toBe("flat");
  });
});
