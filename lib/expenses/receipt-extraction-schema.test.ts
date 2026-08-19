import { describe, expect, it } from "vitest";
import { isEmptyExtraction, parseReceiptExtractionOutput } from "./receipt-extraction-schema";

function output(fields: Record<string, unknown>) {
  return JSON.stringify({
    vendor: null,
    amount: null,
    expense_date: null,
    category: null,
    payment_method: null,
    notes: null,
    ...fields,
  });
}

describe("parseReceiptExtractionOutput", () => {
  it("parses a well-formed extraction", () => {
    const result = parseReceiptExtractionOutput(
      output({ vendor: "Hampton Inn", amount: 214.5, expense_date: "2026-08-12", category: "Hotel", payment_method: "Visa ending 4471" }),
    );

    expect(result).toEqual({
      vendor: "Hampton Inn",
      amount: 214.5,
      expense_date: "2026-08-12",
      category: "Hotel",
      payment_method: "Visa ending 4471",
      notes: null,
    });
  });

  it("returns null for unparseable JSON rather than throwing", () => {
    expect(parseReceiptExtractionOutput("not json")).toBeNull();
    expect(parseReceiptExtractionOutput("")).toBeNull();
  });

  it("drops a category outside the allowed expense category list instead of trusting the model", () => {
    const result = parseReceiptExtractionOutput(output({ vendor: "Acme", category: "Yacht Rental" }));
    expect(result?.category).toBeNull();
    expect(result?.vendor).toBe("Acme");
  });

  it("drops a non-positive or non-numeric amount", () => {
    expect(parseReceiptExtractionOutput(output({ amount: -5 }))?.amount).toBeNull();
    expect(parseReceiptExtractionOutput(output({ amount: "twenty" }))?.amount).toBeNull();
    expect(parseReceiptExtractionOutput(output({ amount: 0 }))?.amount).toBeNull();
  });

  it("drops a malformed date instead of passing it through", () => {
    expect(parseReceiptExtractionOutput(output({ expense_date: "08/12/2026" }))?.expense_date).toBeNull();
    expect(parseReceiptExtractionOutput(output({ expense_date: "2026-08-12" }))?.expense_date).toBe("2026-08-12");
  });

  it("rounds amount to two decimal places", () => {
    expect(parseReceiptExtractionOutput(output({ amount: 19.999 }))?.amount).toBe(20);
  });
});

describe("isEmptyExtraction", () => {
  it("is true when nothing legible was extracted", () => {
    expect(isEmptyExtraction({ vendor: null, amount: null, expense_date: null, category: null, payment_method: null, notes: null })).toBe(true);
  });

  it("is false when at least one field was extracted", () => {
    expect(isEmptyExtraction({ vendor: "Shell", amount: null, expense_date: null, category: null, payment_method: null, notes: null })).toBe(false);
  });
});
