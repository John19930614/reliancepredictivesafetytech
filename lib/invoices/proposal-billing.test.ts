import { describe, expect, it } from "vitest";
import {
  buildProposalBillingSummary,
  mergeCommittedProposalQuantities,
  priceProposalBillingSelections,
  proposalBillingLineKey,
  validateProposalBillingSelections,
} from "@/lib/invoices/proposal-billing";
import type { ProposalLineItem, ProposalTotals } from "@/lib/proposals/pricing";

const REVISION_ID = "11111111-2222-4333-8444-555555555555";

function line(overrides: Partial<ProposalLineItem> = {}): ProposalLineItem {
  return {
    source: "service",
    key: "custom",
    name: "Safety consulting",
    desc: "On-site safety consulting",
    unit: "Hour",
    qty: 10,
    price: 100,
    amount: 1000,
    ...overrides,
  };
}

function totals(overrides: Partial<ProposalTotals> = {}): ProposalTotals {
  return {
    lineItems: [line(), line({ key: "training", name: "Training", unit: "Session", qty: 2, price: 250, amount: 500 })],
    subtotal: 1500,
    discount: 150,
    tax: 108,
    total: 1458,
    deposit: 0,
    ...overrides,
  };
}

describe("proposalBillingLineKey", () => {
  it("uses accepted revision identity and fee-table order, not a reusable catalog key", () => {
    expect(proposalBillingLineKey(REVISION_ID, 0)).toBe(`${REVISION_ID}:0`);
    expect(proposalBillingLineKey(REVISION_ID, 1)).toBe(`${REVISION_ID}:1`);
    expect(proposalBillingLineKey("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", 0)).not.toBe(
      proposalBillingLineKey(REVISION_ID, 0),
    );
  });

  it("rejects missing revision identity and invalid order", () => {
    expect(() => proposalBillingLineKey("", 0)).toThrow(/revision id/i);
    expect(() => proposalBillingLineKey(REVISION_ID, -1)).toThrow(/line order/i);
    expect(() => proposalBillingLineKey(REVISION_ID, 1.5)).toThrow(/line order/i);
  });
});

describe("buildProposalBillingSummary", () => {
  it("applies the accepted proposal discount to unit prices", () => {
    const billing = buildProposalBillingSummary(REVISION_ID, totals());

    expect(billing.lines[0].originalUnitAmount).toBe(100);
    expect(billing.lines[0].approvedUnitAmount).toBe(90);
    expect(billing.lines[1].approvedUnitAmount).toBe(225);
    expect(billing.proposedSubtotal).toBe(1350);
    expect(billing.proposedTax).toBe(108);
    expect(billing.proposedTotal).toBe(1458);
  });

  it("rounds a discounted unit price to cents before valuing quantities", () => {
    const billing = buildProposalBillingSummary(
      REVISION_ID,
      totals({ lineItems: [line({ qty: 3, price: 33.33, amount: 99.99 })], subtotal: 99.99, discount: 10, tax: 0, total: 89.99 }),
    );

    expect(billing.lines[0].approvedUnitAmount).toBe(30);
    expect(billing.lines[0].proposedValue).toBe(90);
  });

  it("merges committed quantities and exposes proposed, committed and remaining quantity and value", () => {
    const first = proposalBillingLineKey(REVISION_ID, 0);
    const second = proposalBillingLineKey(REVISION_ID, 1);
    const billing = buildProposalBillingSummary(REVISION_ID, totals(), [
      { lineKey: first, quantity: 2 },
      { lineKey: first, quantity: "3" },
      { lineKey: second, quantity: 1 },
    ]);

    expect(billing.lines[0]).toMatchObject({
      proposedQuantity: 10,
      committedQuantity: 5,
      remainingQuantity: 5,
      proposedValue: 900,
      committedValue: 450,
      remainingValue: 450,
    });
    expect(billing.lines[1]).toMatchObject({
      proposedQuantity: 2,
      committedQuantity: 1,
      remainingQuantity: 1,
      proposedValue: 450,
      committedValue: 225,
      remainingValue: 225,
    });
    expect(billing).toMatchObject({
      proposedSubtotal: 1350,
      committedSubtotal: 675,
      remainingSubtotal: 675,
      proposedTax: 108,
      committedTax: 54,
      remainingTax: 54,
      proposedTotal: 1458,
      committedTotal: 729,
      remainingTotal: 729,
    });
  });

  it("uses actual tax already committed and caps the final partial invoice against cent drift", () => {
    const billing = buildProposalBillingSummary(
      REVISION_ID,
      totals({ lineItems: [line({ qty: 3, price: 10, amount: 30 })], subtotal: 30, discount: 0, tax: 0.05, total: 30.05 }),
      [{ lineKey: proposalBillingLineKey(REVISION_ID, 0), quantity: 2 }],
      0.04,
    );

    expect(billing).toMatchObject({ committedTax: 0.04, remainingTax: 0.01 });
    expect(priceProposalBillingSelections(billing, [{ lineKey: billing.lines[0].lineKey, quantity: 1 }])).toMatchObject({
      subtotal: 10,
      tax: 0.01,
      total: 10.01,
    });
  });
});

describe("mergeCommittedProposalQuantities", () => {
  it("sums repeated source rows and ignores unusable entries", () => {
    expect(
      mergeCommittedProposalQuantities([
        { lineKey: "line-a", quantity: 1.25 },
        { lineKey: "line-a", quantity: "2.50" },
        { lineKey: "line-b", quantity: 0 },
        { lineKey: "", quantity: 10 },
      ]),
    ).toEqual({ "line-a": 3.75 });
  });
});

describe("proposal billing selections", () => {
  it("prices selected quantities and applies proposal tax proportionately with cent rounding", () => {
    const billing = buildProposalBillingSummary(REVISION_ID, totals());
    const priced = priceProposalBillingSelections(billing, [
      { lineKey: billing.lines[0].lineKey, quantity: 3 },
      { lineKey: billing.lines[1].lineKey, quantity: 0.5 },
    ]);

    expect(priced).toMatchObject({ ok: true, subtotal: 382.5, tax: 30.6, total: 413.1 });
    expect(priced.lines).toEqual([
      { lineKey: billing.lines[0].lineKey, lineOrder: 0, quantity: 3, unitAmount: 90, lineTotal: 270 },
      { lineKey: billing.lines[1].lineKey, lineOrder: 1, quantity: 0.5, unitAmount: 225, lineTotal: 112.5 },
    ]);
  });

  it("rounds proportionate tax to cents", () => {
    const billing = buildProposalBillingSummary(
      REVISION_ID,
      totals({ lineItems: [line({ qty: 3, price: 10, amount: 30 })], subtotal: 30, discount: 0, tax: 2.47, total: 32.47 }),
    );

    expect(priceProposalBillingSelections(billing, [{ lineKey: billing.lines[0].lineKey, quantity: 1 }])).toMatchObject({
      subtotal: 10,
      tax: 0.82,
      total: 10.82,
    });
  });

  it("rejects empty, duplicate, unknown, malformed and over-remaining selections", () => {
    const billing = buildProposalBillingSummary(REVISION_ID, totals(), [
      { lineKey: proposalBillingLineKey(REVISION_ID, 0), quantity: 9 },
    ]);
    const first = billing.lines[0].lineKey;

    expect(validateProposalBillingSelections(billing, [])[0].code).toBe("empty_selection");
    expect(
      validateProposalBillingSelections(billing, [
        { lineKey: first, quantity: 1 },
        { lineKey: first, quantity: 1 },
        { lineKey: "not-on-the-revision", quantity: 1 },
        { lineKey: billing.lines[1].lineKey, quantity: 0 },
      ]).map((problem) => problem.code),
    ).toEqual(["duplicate_line", "unknown_line", "invalid_quantity"]);
    expect(validateProposalBillingSelections(billing, [{ lineKey: first, quantity: 1.01 }])[0].code).toBe(
      "exceeds_remaining",
    );
    expect(validateProposalBillingSelections(billing, [{ lineKey: first, quantity: 0.001 }])[0].code).toBe(
      "invalid_quantity",
    );
    expect(validateProposalBillingSelections(billing, [null] as never)[0].code).toBe("invalid_line_key");
  });
});
