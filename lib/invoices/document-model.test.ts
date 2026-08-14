import { describe, expect, it } from "vitest";
import {
  buildInvoiceDocumentModel,
  formatInvoiceDate,
  formatInvoiceFileDate,
  formatInvoiceMoney,
  formatQuantity,
  invoiceCopy,
  invoiceDownloadFilename,
  missingValue,
  normalizeCurrency,
  normalizeQtyBasis,
  quantityColumnHeader,
  subtotalLabel,
  type InvoiceDocumentInput,
  type InvoiceLineInput,
} from "./document-model";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function line(overrides: Partial<InvoiceLineInput> = {}): InvoiceLineInput {
  return {
    serviceDate: "2025-10-14",
    description: "Onsite safety program review",
    unitPrice: 185,
    quantity: 4,
    unit: "hour",
    qtyBasis: "hour",
    lineTotal: 740,
    ...overrides,
  };
}

/**
 * The invoice the punch list is written against: WONDFOUSA-2026-001-01 billing
 * against proposal WONDFOUSA-2026-001, hourly consulting, and one deliberate
 * no-charge line.
 */
function invoiceInput(overrides: Partial<InvoiceDocumentInput> = {}): InvoiceDocumentInput {
  return {
    invoiceNumber: "WONDFOUSA-2026-001-01",
    issueDate: "2025-10-31",
    referenceProposalNumber: "WONDFOUSA-2026-001",
    firm: {
      name: "Reliance Predictive Safety Technologies",
      addressLines: ["N64 W23110 Main Street", "Sussex, WI 53089"],
      phone: "262-555-0134",
      email: "billing@example.com",
    },
    billTo: {
      name: "Wondfo USA",
      addressLines: ["1400 Corporate Drive", "Willowbrook, IL 60527"],
      contactName: "Dana Reyes",
      email: "dana@wondfo.test",
    },
    consultant: "Steve Sladky",
    jobName: "EHS Program Support",
    paymentTerms: "Net 30",
    dueDate: "2025-11-30",
    lines: [
      line({ serviceDate: "2025-10-06", description: "CERS reporting support", quantity: 6, lineTotal: 1110 }),
      line({ serviceDate: "2025-10-14" }),
      // INV-7: a deliberate $0.00 line.
      line({
        serviceDate: "2025-10-20",
        description: "CERS Log-In Check List (No Charge)",
        unitPrice: 0,
        quantity: 1,
        lineTotal: 0,
      }),
    ],
    subtotal: 1850,
    salesTax: 0,
    total: 1850,
    preparedBy: "Steve Sladky",
    clientAgreementRef: "PO-88213",
    currency: "USD",
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Money and dates                                                             */
/* -------------------------------------------------------------------------- */

describe("formatInvoiceMoney", () => {
  it("always prints two decimal places, including for exact zero", () => {
    // INV-7. lib/proposals/pricing.ts prints a whole-dollar figure with no cents
    // and (via formatLineAmount) prints zero as the words "No cost". Neither is
    // right in a column of figures an AP clerk adds up.
    expect(formatInvoiceMoney(0)).toBe("$0.00");
    expect(formatInvoiceMoney(1200)).toBe("$1,200.00");
    expect(formatInvoiceMoney(185.5)).toBe("$185.50");
  });

  it("coerces junk to zero rather than printing NaN, and keeps a credit negative", () => {
    expect(formatInvoiceMoney(undefined)).toBe("$0.00");
    expect(formatInvoiceMoney("not money")).toBe("$0.00");
    expect(formatInvoiceMoney(Number.NaN)).toBe("$0.00");
    expect(formatInvoiceMoney(Number.POSITIVE_INFINITY)).toBe("$0.00");
    // A numeric(14,2) column can hand back a string.
    expect(formatInvoiceMoney("1850.00")).toBe("$1,850.00");
    // A negative figure is a real if unusual one — a credit — and is not clamped.
    expect(formatInvoiceMoney(-250)).toBe("-$250.00");
  });

  it("falls back to USD for a currency code Intl would throw on", () => {
    // client_invoices.currency only CHECKs char_length = 3, so "123" is storable
    // and would make Intl.NumberFormat throw a RangeError mid-download.
    expect(normalizeCurrency("123")).toBe("USD");
    expect(normalizeCurrency("eur")).toBe("EUR");
    expect(() => formatInvoiceMoney(10, "123")).not.toThrow();
    expect(formatInvoiceMoney(10, "123")).toBe("$10.00");
  });
});

describe("formatInvoiceDate", () => {
  it("prints a calendar date as MM/DD/YYYY without going through Date()", () => {
    // A Date-based format shifts the day across the server's timezone boundary.
    expect(formatInvoiceDate("2025-10-31")).toBe("10/31/2025");
    expect(formatInvoiceDate("2026-01-01T00:00:00Z")).toBe("01/01/2026");
  });

  it("dashes a missing date and echoes anything that is not one", () => {
    expect(formatInvoiceDate(null)).toBe(missingValue);
    expect(formatInvoiceDate("")).toBe(missingValue);
    expect(formatInvoiceDate(undefined)).toBe(missingValue);
    expect(formatInvoiceDate("on completion")).toBe("on completion");
    expect(formatInvoiceDate("2025-13-40")).toBe("2025-13-40");
  });
});

describe("formatQuantity", () => {
  it("prints whole counts without padding and keeps a real fraction", () => {
    expect(formatQuantity("8.00")).toBe("8");
    expect(formatQuantity(7.5)).toBe("7.5");
    expect(formatQuantity(0)).toBe("0");
  });

  it("floors a nonsensical count instead of printing NaN", () => {
    expect(formatQuantity(-4)).toBe("0");
    expect(formatQuantity("many")).toBe("0");
    expect(formatQuantity(undefined)).toBe("0");
  });
});

describe("invoiceDownloadFilename", () => {
  it("follows decision D-6: Invoice <number> <MM-DD-YYYY>.<ext>", () => {
    expect(invoiceDownloadFilename("WONDFOUSA-2026-001-01", "2025-10-31", "pdf")).toBe(
      "Invoice WONDFOUSA-2026-001-01 10-31-2025.pdf",
    );
    expect(invoiceDownloadFilename("WONDFOUSA-2026-001-01", "2025-10-31", "docx")).toBe(
      "Invoice WONDFOUSA-2026-001-01 10-31-2025.docx",
    );
  });

  it("strips what would break a Content-Disposition header, and drops missing parts", () => {
    // The number reaches a response header, so a quote or CRLF in it would be a
    // header injection rather than a cosmetic problem.
    expect(invoiceDownloadFilename('BAD"\r\nX-Evil: 1', "2025-10-31", "pdf")).toBe("Invoice BAD X-Evil 1 10-31-2025.pdf");
    expect(invoiceDownloadFilename("", null, "pdf")).toBe("Invoice.pdf");
    expect(invoiceDownloadFilename("INV-9", "nonsense", "pdf")).toBe("Invoice INV-9.pdf");
    expect(formatInvoiceFileDate("2025-10-31")).toBe("10-31-2025");
  });
});

/* -------------------------------------------------------------------------- */
/* The quantity column                                                         */
/* -------------------------------------------------------------------------- */

describe("quantityColumnHeader", () => {
  it("names the column after the basis every line shares", () => {
    expect(quantityColumnHeader([line({ qtyBasis: "hour" }), line({ qtyBasis: "hour" })])).toBe("HOURS");
    expect(quantityColumnHeader([line({ qtyBasis: "session" })])).toBe("SESSIONS");
    expect(quantityColumnHeader([line({ qtyBasis: "attendee" })])).toBe("ATTENDEES");
    expect(quantityColumnHeader([line({ qtyBasis: "flat" })])).toBe("QTY");
  });

  it("falls back to QTY when the lines disagree, and when there are none", () => {
    // A column headed HOURS whose rows are not all hours is worse than a generic
    // header, so a mixed invoice is demoted rather than mislabelled.
    expect(quantityColumnHeader([line({ qtyBasis: "hour" }), line({ qtyBasis: "attendee" })])).toBe("QTY");
    expect(quantityColumnHeader([])).toBe("QTY");
    // A basis that is not one of the four (an older row, a hand-edited payload)
    // normalizes to "flat" rather than reaching the header raw.
    expect(normalizeQtyBasis("HOUR")).toBe("hour");
    expect(normalizeQtyBasis("widgets")).toBe("flat");
    expect(quantityColumnHeader([{ qtyBasis: "widgets" }])).toBe("QTY");
  });

  it("names the subtotal after the same basis", () => {
    expect(subtotalLabel([line({ qtyBasis: "hour" })])).toBe("SUBTOTAL (HRS)");
    expect(subtotalLabel([line({ qtyBasis: "session" })])).toBe("SUBTOTAL (SESSIONS)");
    expect(subtotalLabel([line({ qtyBasis: "flat" })])).toBe("SUBTOTAL");
    expect(subtotalLabel([line({ qtyBasis: "hour" }), line({ qtyBasis: "flat" })])).toBe("SUBTOTAL");
  });
});

/* -------------------------------------------------------------------------- */
/* The model                                                                   */
/* -------------------------------------------------------------------------- */

describe("buildInvoiceDocumentModel", () => {
  it("carries both numbers in the header, its own and the proposal's", () => {
    const model = buildInvoiceDocumentModel(invoiceInput());

    expect(model.headerRows.map((row) => row.label)).toEqual([
      "INVOICE #",
      "DATE",
      "REFERENCE PROPOSAL NUMBER",
    ]);
    expect(model.headerRows.map((row) => row.value)).toEqual([
      "WONDFOUSA-2026-001-01",
      "10/31/2025",
      "WONDFOUSA-2026-001",
    ]);
  });

  it("still renders the reference row when there is no proposal to reference", () => {
    // The reference row is NOT optional in the layout. A reader must be able to
    // tell "raised outside a proposal" from "the row was dropped".
    const model = buildInvoiceDocumentModel(invoiceInput({ referenceProposalNumber: null }));

    expect(model.headerRows).toHaveLength(3);
    const reference = model.headerRows[2];
    expect(reference.label).toBe("REFERENCE PROPOSAL NUMBER");
    expect(reference.value).toBe(missingValue);
  });

  it("keeps a $0.00 line, with an explicit zero in both money columns", () => {
    // INV-7. Steve bills no-charge lines on purpose, to show goodwill work that
    // was performed. Stripping, collapsing or blanking one destroys the point of
    // putting it on the invoice.
    const model = buildInvoiceDocumentModel(invoiceInput());

    expect(model.lines).toHaveLength(3);
    const noCharge = model.lines.find((row) => row.description.includes("CERS Log-In Check List"));
    expect(noCharge).toBeDefined();
    expect(noCharge?.lineTotalLabel).toBe("$0.00");
    expect(noCharge?.unitPriceLabel).toBe("$0.00");
    expect(noCharge?.isNoCharge).toBe(true);
    // Never the proposal document's wording for a free line.
    expect(noCharge?.lineTotalLabel).not.toBe("No cost");
    expect(noCharge?.lineTotalLabel).not.toBe("$0");
  });

  it("keeps an invoice made ENTIRELY of no-charge lines", () => {
    const model = buildInvoiceDocumentModel(
      invoiceInput({
        lines: [
          line({ description: "Toolbox talk (No Charge)", unitPrice: 0, quantity: 1, lineTotal: 0 }),
          line({ description: "CERS Log-In Check List (No Charge)", unitPrice: 0, quantity: 2, lineTotal: 0 }),
        ],
        subtotal: 0,
        salesTax: 0,
        total: 0,
      }),
    );

    expect(model.lines).toHaveLength(2);
    expect(model.lines.every((row) => row.lineTotalLabel === "$0.00")).toBe(true);
    expect(model.totalRows.map((row) => row.value)).toEqual(["$0.00", "$0.00", "$0.00"]);
  });

  it("heads the quantity column and the subtotal from the lines' basis", () => {
    const hourly = buildInvoiceDocumentModel(invoiceInput());
    expect(hourly.quantityHeader).toBe("HOURS");
    expect(hourly.columnHeaders).toEqual(["DATE", "DESCRIPTION", "UNIT PRICE", "HOURS", "LINE TOTAL"]);
    expect(hourly.totalRows[0].label).toBe("SUBTOTAL (HRS)");
    // 6 + 4 + 1 hours across the three lines, including the no-charge one.
    expect(hourly.totalRows[0].quantityLabel).toBe("11");

    const training = buildInvoiceDocumentModel(
      invoiceInput({ lines: [line({ qtyBasis: "attendee", quantity: 24 })] }),
    );
    expect(training.quantityHeader).toBe("ATTENDEES");
    expect(training.columnHeaders[3]).toBe("ATTENDEES");
    expect(training.totalRows[0].label).toBe("SUBTOTAL (ATTENDEES)");
  });

  it("appends the CLIENT's agreement reference to the closing sentence, never ours", () => {
    // The service-agreement field is the client's own PO / agreement number. If
    // this ever starts echoing our proposal or invoice number, the client's AP
    // department cannot match the invoice to anything on their side.
    const model = buildInvoiceDocumentModel(invoiceInput());

    expect(model.agreementSentence).toBe(
      "Invoice for consulting services to client based on service agreement PO-88213",
    );
    expect(model.agreementSentence).toContain(invoiceCopy.agreementSentence);
    expect(model.agreementSentence).not.toContain("WONDFOUSA-2026-001");
    expect(model.preparedByLine).toBe("Invoice Prepared By: Steve Sladky");
  });

  it("shows the agreement reference as missing rather than quietly ending the sentence", () => {
    const model = buildInvoiceDocumentModel(invoiceInput({ clientAgreementRef: "", preparedBy: "" }));

    expect(model.agreementSentence).toBe(
      `Invoice for consulting services to client based on service agreement ${missingValue}`,
    );
    // Nobody recorded as preparer: a signing rule, not a fabricated name.
    expect(model.preparedByLine).toContain(invoiceCopy.preparedByRule);
    expect(model.preparedByLine).not.toContain("undefined");
  });

  it("fills the bar row, and dashes a due date the terms never set", () => {
    const model = buildInvoiceDocumentModel(invoiceInput({ dueDate: null }));

    expect(model.barCells.map((barCell) => barCell.label)).toEqual([
      "CONSULTANT",
      "JOB",
      "PAYMENT TERMS",
      "DUE DATE",
    ]);
    expect(model.barCells.map((barCell) => barCell.value)).toEqual([
      "Steve Sladky",
      "EHS Program Support",
      "Net 30",
      missingValue,
    ]);
  });

  it("builds the party blocks with the phone, email and contact appended", () => {
    const model = buildInvoiceDocumentModel(invoiceInput());

    expect(model.firm.name).toBe("Reliance Predictive Safety Technologies");
    expect(model.firm.lines).toEqual([
      "N64 W23110 Main Street",
      "Sussex, WI 53089",
      "262-555-0134",
      "billing@example.com",
    ]);
    expect(model.billTo.heading).toBe("TO");
    expect(model.billTo.name).toBe("Wondfo USA");
    expect(model.billTo.lines).toEqual([
      "1400 Corporate Drive",
      "Willowbrook, IL 60527",
      "Dana Reyes",
      "dana@wondfo.test",
    ]);
  });

  it("survives an invoice whose every field is missing or the wrong type", () => {
    // The input round-trips through JSONB and a set of numeric columns, and the
    // caller is a download route: a throw here is saved into the client's ".pdf"
    // as an HTML error page.
    const model = buildInvoiceDocumentModel({
      invoiceNumber: undefined,
      issueDate: undefined,
      referenceProposalNumber: undefined,
      firm: undefined,
      billTo: undefined,
      consultant: undefined,
      jobName: undefined,
      paymentTerms: undefined,
      dueDate: undefined,
      lines: undefined,
      subtotal: "oops",
      salesTax: null,
      total: Number.NaN,
      preparedBy: undefined,
      clientAgreementRef: undefined,
      currency: undefined,
    } as unknown as InvoiceDocumentInput);

    expect(model.headerRows).toHaveLength(3);
    expect(model.headerRows.every((row) => row.value === missingValue)).toBe(true);
    expect(model.lines).toEqual([]);
    expect(model.firm.name).toBe(missingValue);
    expect(model.billTo.name).toBe(missingValue);
    expect(model.totalRows.map((row) => row.value)).toEqual(["$0.00", "$0.00", "$0.00"]);
    expect(model.currency).toBe("USD");
    expect(JSON.stringify(model)).not.toContain("NaN");
    expect(JSON.stringify(model)).not.toContain("undefined");
  });

  it("collapses control characters that would restructure a cell", () => {
    // Every field occupies one cell of a fixed layout. A newline inside a
    // description would silently split the row in Word while doing nothing in
    // the PDF, so the two renderers would disagree.
    const model = buildInvoiceDocumentModel(
      invoiceInput({
        lines: [line({ description: "Site walk\nand\tdebrief" })],
        billTo: {
          name: "Wondfo\r\nUSA",
          addressLines: ["  ", "1400 Corporate Drive", ""],
          contactName: "",
          email: "",
        },
      }),
    );

    expect(model.lines[0].description).toBe("Site walk and debrief");
    expect(model.billTo.name).toBe("Wondfo USA");
    // Blank entries are dropped rather than printed as empty address lines.
    expect(model.billTo.lines).toEqual(["1400 Corporate Drive"]);
  });

  it("leaves the date cell empty on a line with no single service date", () => {
    // A dash in every row of a flat-fee invoice is noise; the header's DATE row
    // still dashes, because there a missing value is a real gap.
    const model = buildInvoiceDocumentModel(invoiceInput({ lines: [line({ serviceDate: null })] }));
    expect(model.lines[0].dateLabel).toBe("");
  });
});
