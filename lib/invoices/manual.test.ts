import { describe, expect, it } from "vitest";
import { maxInvoiceAmount, maxLineDescriptionLength, maxLineQuantity, maxLineUnitAmount } from "./draft";
import { maxManualInvoiceLines, validateManualInvoice, type NewManualInvoiceInput, type NewManualInvoiceLine } from "./manual";

const now = new Date("2026-03-10T09:30:00Z");

function line(over: Partial<NewManualInvoiceLine> = {}): NewManualInvoiceLine {
  return {
    description: "Site safety audit",
    quantity: 2,
    unitAmount: 1500,
    unit: "Session",
    qtyBasis: "session",
    serviceDate: "2026-03-02",
    ...over,
  };
}

function input(over: Partial<NewManualInvoiceInput> = {}): NewManualInvoiceInput {
  return {
    clientId: "1f1c6a12-1a2b-4c3d-8e4f-0a1b2c3d4e5f",
    currency: "USD",
    issueDate: "2026-03-10",
    paymentTerms: "Net 30 from invoice date",
    taxAmount: 0,
    lines: [line()],
    ...over,
  };
}

/** Narrows the union so a passing case can be read without repeated guards. */
function accept(over: Partial<NewManualInvoiceInput> = {}) {
  const result = validateManualInvoice(input(over), now);
  if (!result.ok) throw new Error(`Expected acceptance, got: ${result.errors.join(" | ")}`);
  return result.value;
}

function reject(over: Partial<NewManualInvoiceInput> = {}): string[] {
  const result = validateManualInvoice(input(over), now);
  if (result.ok) throw new Error("Expected rejection.");
  return result.errors;
}

describe("validateManualInvoice — the happy path", () => {
  it("returns the invoice in the shape the writer stores", () => {
    const value = accept();

    expect(value.clientId).toBe("1f1c6a12-1a2b-4c3d-8e4f-0a1b2c3d4e5f");
    expect(value.currency).toBe("USD");
    expect(value.issueDate).toBe("2026-03-10");
    expect(value.subtotal).toBe(3000);
    expect(value.total).toBe(3000);
    expect(value.taxAmount).toBe(0);
    expect(value.lines).toHaveLength(1);
    expect(value.lines[0]).toMatchObject({
      description: "Site safety audit",
      quantity: 2,
      unitAmount: 1500,
      lineTotal: 3000,
      unit: "Session",
      qtyBasis: "session",
      serviceDate: "2026-03-02",
      sortOrder: 10,
    });
  });

  it("numbers the lines in tens so one can be inserted between two later", () => {
    const value = accept({ lines: [line(), line(), line()] });
    expect(value.lines.map((row) => row.sortOrder)).toEqual([10, 20, 30]);
  });

  it("adds the tax on top of the line sum", () => {
    const value = accept({ taxAmount: 262.5 });
    expect(value.subtotal).toBe(3000);
    expect(value.taxAmount).toBe(262.5);
    expect(value.total).toBe(3262.5);
  });

  it("trims and upper-cases the currency", () => {
    expect(accept({ currency: " gbp " }).currency).toBe("GBP");
  });

  it("stores blank header text as null so a renderer can tell it from a blank", () => {
    const value = accept({ consultantName: "   ", jobName: "", notes: undefined });
    expect(value.consultantName).toBeNull();
    expect(value.jobName).toBeNull();
    expect(value.notes).toBeNull();
  });

  it("keeps header text that was given, trimmed", () => {
    const value = accept({
      consultantName: "  Dana Reid  ",
      jobName: "Q1 refresher training",
      clientAgreementRef: "CA-2026-114",
      preparedBy: "J. Haldemann",
      notes: "Agreed by email 2 March.",
    });
    expect(value.consultantName).toBe("Dana Reid");
    expect(value.jobName).toBe("Q1 refresher training");
    expect(value.clientAgreementRef).toBe("CA-2026-114");
    expect(value.preparedBy).toBe("J. Haldemann");
    expect(value.notes).toBe("Agreed by email 2 March.");
  });
});

describe("validateManualInvoice — quantity basis decides the arithmetic", () => {
  it("multiplies a scaling line", () => {
    const value = accept({ lines: [line({ qtyBasis: "attendee", quantity: 10, unitAmount: 105 })] });
    expect(value.lines[0].lineTotal).toBe(1050);
    expect(value.total).toBe(1050);
  });

  it("refuses to multiply a flat fee, whatever quantity was typed", () => {
    // The defect this guards: a $2,500 retainer must not become $5,000 because
    // somebody put 2 in a box that does not price anything.
    const value = accept({ lines: [line({ qtyBasis: "flat", quantity: 2, unitAmount: 2500 })] });
    expect(value.lines[0].lineTotal).toBe(2500);
  });

  it("rejects a basis outside the permitted vocabulary", () => {
    expect(reject({ lines: [line({ qtyBasis: "per-widget" })] })).toContainEqual(
      expect.stringContaining("Line 1: choose how the quantity is counted"),
    );
  });

  it("rejects a missing basis", () => {
    expect(reject({ lines: [line({ qtyBasis: "" })] })).toContainEqual(
      expect.stringContaining("Line 1: choose how the quantity is counted"),
    );
  });
});

describe("validateManualInvoice — rounding", () => {
  it("rounds every line to cents before it can reach a money column", () => {
    const value = accept({ lines: [line({ quantity: 3, unitAmount: 0.655, qtyBasis: "session", unit: "Mile" })] });
    expect(value.lines[0].unitAmount).toBe(0.66);
    expect(value.lines[0].lineTotal).toBe(1.98);
    expect(value.subtotal).toBe(1.98);
  });

  it("rounds the quantity before multiplying, so the stored figures reproduce the total", () => {
    const value = accept({ lines: [line({ quantity: 1.014, unitAmount: 100, qtyBasis: "hour" })] });
    expect(value.lines[0].quantity).toBe(1.01);
    expect(value.lines[0].lineTotal).toBe(101);
  });

  it("rounds the tax and keeps total = subtotal + tax", () => {
    const value = accept({ taxAmount: 10.005, lines: [line({ quantity: 1, unitAmount: 100, qtyBasis: "flat" })] });
    expect(value.taxAmount).toBe(10.01);
    expect(value.total).toBe(110.01);
    expect(value.total).toBe(value.subtotal + value.taxAmount);
  });

  it("adds cent-level lines without float drift", () => {
    const value = accept({
      lines: [
        line({ quantity: 1, unitAmount: 0.1, qtyBasis: "flat" }),
        line({ quantity: 1, unitAmount: 0.2, qtyBasis: "flat" }),
      ],
    });
    expect(value.subtotal).toBe(0.3);
  });
});

describe("validateManualInvoice — due date", () => {
  it("derives the due date from the payment terms when none is given", () => {
    expect(accept({ paymentTerms: "Net 30 from invoice date" }).dueDate).toBe("2026-04-09");
    expect(accept({ paymentTerms: "Net 15 from invoice date" }).dueDate).toBe("2026-03-25");
  });

  it("makes 'due upon receipt' due on the issue date", () => {
    expect(accept({ paymentTerms: "Due upon receipt" }).dueDate).toBe("2026-03-10");
  });

  it("falls back to Net 30 when the terms say nothing recognisable", () => {
    expect(accept({ paymentTerms: "As agreed" }).dueDate).toBe("2026-04-09");
    expect(accept({ paymentTerms: null }).dueDate).toBe("2026-04-09");
  });

  it("crosses a year end correctly", () => {
    expect(accept({ issueDate: "2026-12-20", paymentTerms: "Net 30" }).dueDate).toBe("2027-01-19");
  });

  it("keeps an explicit due date", () => {
    expect(accept({ dueDate: "2026-05-01" }).dueDate).toBe("2026-05-01");
  });

  it("allows a due date equal to the issue date", () => {
    expect(accept({ dueDate: "2026-03-10" }).dueDate).toBe("2026-03-10");
  });

  it("rejects a due date before the issue date", () => {
    // Otherwise the invoice is overdue the moment it is issued and lands in the
    // ageing buckets on the ledger page as debt on day one.
    expect(reject({ dueDate: "2026-03-09" })).toContain("The due date cannot be before the issue date.");
  });

  it("rejects a due date that is not a calendar date", () => {
    expect(reject({ dueDate: "2026-02-31" })).toContain("Give the due date as YYYY-MM-DD.");
  });
});

describe("validateManualInvoice — issue date", () => {
  it("defaults to the caller's `now` when none is given", () => {
    expect(accept({ issueDate: "" }).issueDate).toBe("2026-03-10");
    expect(accept({ issueDate: undefined }).issueDate).toBe("2026-03-10");
  });

  it("never reads the clock itself", () => {
    const value = validateManualInvoice(input({ issueDate: "" }), new Date("2019-07-04T23:59:59Z"));
    expect(value.ok).toBe(true);
    if (value.ok) {
      expect(value.value.issueDate).toBe("2019-07-04");
      expect(value.value.dueDate).toBe("2019-08-03");
    }
  });

  it("rejects a malformed issue date", () => {
    expect(reject({ issueDate: "10/03/2026" })).toContain("Give the issue date as YYYY-MM-DD.");
  });

  it("rejects a date that does not exist on the calendar", () => {
    expect(reject({ issueDate: "2026-02-30" })).toContain("Give the issue date as YYYY-MM-DD.");
  });
});

describe("validateManualInvoice — rejections", () => {
  it("refuses an invoice with no lines", () => {
    expect(reject({ lines: [] })).toContain("An invoice needs at least one line.");
  });

  it("refuses a line with no description", () => {
    expect(reject({ lines: [line({ description: "   " })] })).toContain("Line 1: add a description.");
  });

  it("refuses a description longer than the column allows", () => {
    expect(reject({ lines: [line({ description: "x".repeat(maxLineDescriptionLength + 1) })] })).toContainEqual(
      expect.stringContaining("keep the description under"),
    );
  });

  it("refuses a zero or negative quantity", () => {
    expect(reject({ lines: [line({ quantity: 0 })] })).toContain("Line 1: quantity must be more than zero.");
    expect(reject({ lines: [line({ quantity: -1 })] })).toContain("Line 1: quantity must be more than zero.");
  });

  it("refuses a quantity that rounds away to zero", () => {
    // 0.004 passes a naive `> 0` test and then stores as 0.00, which violates
    // the quantity CHECK and fails the whole write.
    expect(reject({ lines: [line({ quantity: 0.004 })] })).toContain("Line 1: quantity must be more than zero.");
  });

  it("refuses a quantity above the ceiling", () => {
    expect(reject({ lines: [line({ quantity: maxLineQuantity + 1 })] })).toContainEqual(
      expect.stringContaining("quantity looks wrong"),
    );
  });

  it("accepts a quantity exactly at the ceiling", () => {
    const value = accept({ lines: [line({ quantity: maxLineQuantity, unitAmount: 1, qtyBasis: "hour" })] });
    expect(value.lines[0].quantity).toBe(maxLineQuantity);
  });

  it("refuses a non-numeric quantity or price", () => {
    expect(reject({ lines: [line({ quantity: Number.NaN })] })).toContain("Line 1: quantity must be a number.");
    expect(reject({ lines: [line({ unitAmount: Number.POSITIVE_INFINITY })] })).toContain(
      "Line 1: unit price must be a number.",
    );
  });

  it("refuses a negative unit price", () => {
    expect(reject({ lines: [line({ unitAmount: -0.01 })] })).toContain("Line 1: unit price cannot be negative.");
  });

  it("accepts a zero unit price", () => {
    // A no-charge line among paid ones is legitimate; the column CHECK is >= 0.
    const value = accept({ lines: [line({ unitAmount: 0 })] });
    expect(value.lines[0].lineTotal).toBe(0);
  });

  it("refuses a unit price above the ceiling but accepts one at it", () => {
    expect(reject({ lines: [line({ unitAmount: maxLineUnitAmount + 1 })] })).toContainEqual(
      expect.stringContaining("unit price looks wrong"),
    );
    expect(accept({ lines: [line({ unitAmount: maxLineUnitAmount, qtyBasis: "flat" })] }).total).toBe(
      maxLineUnitAmount,
    );
  });

  it("refuses an over-long unit label", () => {
    expect(reject({ lines: [line({ unit: "u".repeat(61) })] })).toContainEqual(
      expect.stringContaining("keep the unit under 60 characters"),
    );
  });

  it("refuses a malformed service date", () => {
    expect(reject({ lines: [line({ serviceDate: "March 2" })] })).toContain(
      "Line 1: give the service date as YYYY-MM-DD.",
    );
  });

  it("treats a blank service date as no date rather than an error", () => {
    expect(accept({ lines: [line({ serviceDate: "" })] }).lines[0].serviceDate).toBeNull();
    expect(accept({ lines: [line({ serviceDate: null })] }).lines[0].serviceDate).toBeNull();
  });

  it("refuses negative or non-numeric tax", () => {
    expect(reject({ taxAmount: -1 })).toContain("Tax cannot be negative.");
    expect(reject({ taxAmount: Number.NaN })).toContain("Tax must be a number.");
  });

  it("refuses a currency that is not three letters", () => {
    for (const currency of ["US", "USDD", "12$", ""]) {
      expect(reject({ currency })).toContain("Currency must be a three-letter code, such as USD.");
    }
  });

  it("refuses an invoice with no client", () => {
    expect(reject({ clientId: "  " })).toContain("Choose the client this invoice is for.");
  });

  it("refuses a total above the system ceiling", () => {
    expect(
      reject({ lines: [line({ quantity: 200, unitAmount: maxLineUnitAmount, qtyBasis: "session" })] }),
    ).toContainEqual(expect.stringContaining("more than this system will invoice"));
  });

  it("refuses more lines than one invoice may carry", () => {
    const many = Array.from({ length: maxManualInvoiceLines + 1 }, () => line());
    expect(reject({ lines: many })).toContain(`An invoice can carry at most ${maxManualInvoiceLines} lines.`);
  });

  it("accepts exactly the line ceiling", () => {
    const many = Array.from({ length: maxManualInvoiceLines }, () => line({ quantity: 1, unitAmount: 1, qtyBasis: "flat" }));
    expect(accept({ lines: many }).lines).toHaveLength(maxManualInvoiceLines);
  });

  it("refuses over-long header text and names the field", () => {
    expect(reject({ consultantName: "c".repeat(201) })).toContain("Keep consultant name under 200 characters.");
    expect(reject({ jobName: "j".repeat(301) })).toContain("Keep job name under 300 characters.");
    expect(reject({ paymentTerms: "p".repeat(1001) })).toContain("Keep payment terms under 1000 characters.");
    expect(reject({ clientAgreementRef: "r".repeat(121) })).toContain(
      "Keep client agreement number under 120 characters.",
    );
    expect(reject({ preparedBy: "b".repeat(201) })).toContain("Keep prepared by under 200 characters.");
    expect(reject({ notes: "n".repeat(4001) })).toContain("Keep notes under 4000 characters.");
  });

  it("reports every problem at once rather than one per submit", () => {
    const errors = reject({
      currency: "US",
      taxAmount: -5,
      lines: [line({ description: "" }), line({ quantity: 0 })],
    });
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(errors).toContain("Line 1: add a description.");
    expect(errors).toContain("Line 2: quantity must be more than zero.");
  });

  it("survives lines that are not objects at all", () => {
    const errors = reject({ lines: [null as unknown as NewManualInvoiceLine] });
    expect(errors).toContain("Line 1: add a description.");
  });

  it("refuses a total above the ceiling even when every line is inside its own", () => {
    const many = Array.from({ length: 120 }, () =>
      line({ quantity: 1000, unitAmount: maxLineUnitAmount, qtyBasis: "session" }),
    );
    const result = validateManualInvoice(input({ lines: many }), now);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual(expect.stringContaining("more than this system will invoice"));
    }
    expect(maxInvoiceAmount).toBeGreaterThan(0);
  });
});
