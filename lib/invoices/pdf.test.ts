import { inflateSync } from "node:zlib";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildInvoiceDocumentModel,
  missingValue,
  type InvoiceDocumentInput,
  type InvoiceLineInput,
} from "./document-model";
import { renderInvoicePdf, toPdfText, wrapText } from "./pdf";

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
 * A REALISTIC invoice — twelve billed lines with descriptions that wrap, plus
 * the deliberate no-charge line. The one-page assertion below is only meaningful
 * against a document this heavy; a three-line fixture would fit whatever the
 * geometry was.
 */
function heavyInput(overrides: Partial<InvoiceDocumentInput> = {}): InvoiceDocumentInput {
  const descriptions = [
    "CERS reporting support and hazardous materials business plan review for the Willowbrook facility",
    "Onsite safety program review with the plant leadership team",
    "Job hazard analysis rewrite covering the packaging and shipping lines",
    "Respiratory protection program update and fit-test scheduling",
    "Lockout/tagout procedure verification walk with maintenance supervision",
    "Contractor prequalification review and insurance certificate reconciliation",
    "Monthly EHS metrics package and leadership readout preparation",
    "Emergency action plan revision and evacuation route re-marking review",
    "Forklift operator evaluation observations and refresher recommendations",
    "Chemical inventory reconciliation against the SDS library",
    "Incident investigation coaching for two recordable events",
    "Regulatory correspondence review ahead of the Cal/OSHA site visit",
  ];

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
      contactName: "Dana Reyes, Director of Safety",
      email: "dana@wondfo.test",
    },
    consultant: "Steve Sladky",
    jobName: "EHS Program Support",
    paymentTerms: "Net 30",
    dueDate: "2025-11-30",
    lines: [
      ...descriptions.map((description, index) =>
        line({ serviceDate: `2025-10-${String(index + 3).padStart(2, "0")}`, description, quantity: index + 2, lineTotal: 185 * (index + 2) }),
      ),
      line({
        serviceDate: "2025-10-28",
        description: "CERS Log-In Check List (No Charge)",
        unitPrice: 0,
        quantity: 1,
        lineTotal: 0,
      }),
    ],
    subtotal: 19240,
    salesTax: 0,
    total: 19240,
    preparedBy: "Steve Sladky",
    clientAgreementRef: "PO-88213",
    currency: "USD",
    ...overrides,
  };
}

function modelFor(overrides: Partial<InvoiceDocumentInput> = {}) {
  return buildInvoiceDocumentModel(heavyInput(overrides));
}

/* -------------------------------------------------------------------------- */
/* Reading the rendered file back                                              */
/* -------------------------------------------------------------------------- */

/**
 * The text a rendered PDF actually DRAWS, one entry per sheet.
 *
 * Page counts measure sheets, not ink: a renderer that laid out one blank page
 * would satisfy every "getPageCount() === 1" assertion in this file. pdf-lib
 * flate-encodes content streams on save() and writes drawn strings as hex, so
 * neither the words nor the URL-absence assertion can be checked by scanning the
 * raw bytes; both need the stream decoded first. (Lifted from
 * lib/proposals/pdf.test.ts, which needed the same thing.)
 */
async function drawnPages(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);

  return doc.getPages().map((page) => {
    const contents = page.node.context.lookup(page.node.get(PDFName.of("Contents")));
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map((ref) => page.node.context.lookup(ref))
        : [contents];

    const operators = streams
      .map((stream) => {
        if (!(stream instanceof PDFRawStream)) return "";
        const raw = Buffer.from(stream.contents);
        try {
          return inflateSync(raw).toString("latin1");
        } catch {
          return raw.toString("latin1");
        }
      })
      .join("\n");

    return [...operators.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)]
      .map(([, hex]) => Buffer.from(hex, "hex").toString("latin1"))
      .join("\n");
  });
}

/* -------------------------------------------------------------------------- */
/* Text handling                                                               */
/* -------------------------------------------------------------------------- */

describe("toPdfText", () => {
  it("folds the punctuation the standard fonts cannot encode", () => {
    // pdf-lib's Helvetica THROWS on the first non-WinAnsi character — it does
    // not skip it — so a curly quote pasted out of Word into a line description
    // would take down the whole download.
    expect(toPdfText("October 2025 – November 2025")).toBe("October 2025 - November 2025");
    expect(toPdfText("Safety Document — Short (≤35 pg)")).toBe("Safety Document -- Short (<=35 pg)");
    expect(toPdfText("the client’s “copy”")).toBe("the client's \"copy\"");
    // The model's own missingValue is an em dash, so this fold is on the hot
    // path of every invoice with an unknown field.
    expect(toPdfText(missingValue)).toBe("--");
  });

  it("drops anything still unencodable rather than letting drawText throw", () => {
    expect(toPdfText("emoji 🚧 here")).toBe("emoji  here");
    expect(toPdfText("thin space")).toBe("thin space");
  });
});

describe("wrapText", () => {
  it("wraps to the column and never exceeds it", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapText("word ".repeat(80), font, 7.8, 206);
    expect(lines.length).toBeGreaterThan(1);
    for (const text of lines) expect(font.widthOfTextAtSize(text, 7.8)).toBeLessThanOrEqual(206);
  });

  it("hard-splits a token too long for the column instead of overflowing it", async () => {
    // A long unbroken PO number in the description column must not run into the
    // UNIT PRICE figures beside it.
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapText("X".repeat(400), font, 7.8, 100);
    expect(lines.length).toBeGreaterThan(1);
    for (const text of lines) expect(font.widthOfTextAtSize(text, 7.8)).toBeLessThanOrEqual(100);
  });

  it("returns nothing for empty or whitespace-only input", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(wrapText("", font, 8, 100)).toEqual([]);
    expect(wrapText("   \n  ", font, 8, 100)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

describe("renderInvoicePdf", () => {
  it("produces a loadable PDF titled for the invoice", async () => {
    const model = modelFor();
    const bytes = await renderInvoicePdf({ model });

    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(0);
    expect(reloaded.getTitle()).toBe("INVOICE WONDFOUSA-2026-001-01");
  });

  it("stays a ONE-PAGER with a realistic multi-line invoice", async () => {
    // The whole point of the layout: Steve's original is a single sheet and that
    // is what a client expects to receive. Asserted against thirteen lines with
    // wrapping descriptions rather than eyeballed on a three-line fixture.
    const model = modelFor();
    const reloaded = await PDFDocument.load(await renderInvoicePdf({ model }));
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("draws real content on the sheet it emits", async () => {
    // Page counts survive a document with no ink on it at all; this is the
    // assertion that the invoice actually reached the page.
    const pages = await drawnPages(await renderInvoicePdf({ model: modelFor() }));

    expect(pages).toHaveLength(1);
    expect(pages[0].length).toBeGreaterThan(800);
  });

  it("puts both numbers, the party blocks, the bar and the closing text on the page", async () => {
    const text = (await drawnPages(await renderInvoicePdf({ model: modelFor() }))).join("\n");

    for (const expected of [
      "INVOICE",
      "INVOICE #",
      "WONDFOUSA-2026-001-01",
      "DATE",
      "10/31/2025",
      "REFERENCE PROPOSAL NUMBER",
      "WONDFOUSA-2026-001",
      "Reliance Predictive Safety Technologies",
      "TO",
      "Wondfo USA",
      "CONSULTANT",
      "Steve Sladky",
      "JOB",
      "PAYMENT TERMS",
      "DUE DATE",
      "11/30/2025",
      "DESCRIPTION",
      "UNIT PRICE",
      "LINE TOTAL",
      "SUBTOTAL (HRS)",
      "SALES TAX",
      "TOTAL",
      "Invoice Prepared By:",
      "Invoice for consulting services to client based on service agreement PO-88213",
    ]) {
      expect(text).toContain(expected);
    }

    // Priced, not just laid out.
    expect(text).toMatch(/\$[\d,]+\.\d{2}/);
  });

  it("prints the deliberate $0.00 line rather than dropping it (INV-7)", async () => {
    const text = (await drawnPages(await renderInvoicePdf({ model: modelFor() }))).join("\n");

    expect(text).toContain("CERS Log-In Check List (No Charge)");
    expect(text).toContain("$0.00");
    // The proposal document's wording for a free line has no place in a column
    // of figures somebody has to add up.
    expect(text).not.toContain("No cost");
  });

  it("heads the quantity column from the lines' basis", async () => {
    const hourly = (await drawnPages(await renderInvoicePdf({ model: modelFor() }))).join("\n");
    expect(hourly).toContain("HOURS");

    const training = (
      await drawnPages(
        await renderInvoicePdf({
          model: modelFor({
            lines: [line({ qtyBasis: "attendee", quantity: 24, description: "OSHA 30 course", lineTotal: 10200 })],
          }),
        }),
      )
    ).join("\n");
    expect(training).toContain("ATTENDEES");
    expect(training).not.toContain("HOURS");
  });

  it("renders the reference row even when there is no proposal behind the invoice", async () => {
    const text = (
      await drawnPages(await renderInvoicePdf({ model: modelFor({ referenceProposalNumber: null }) }))
    ).join("\n");

    expect(text).toContain("REFERENCE PROPOSAL NUMBER");
    // missingValue is an em dash, folded to "--" by toPdfText.
    expect(text).toContain("--");
  });

  it("does not throw on characters pdf-lib's standard fonts cannot encode", async () => {
    // The character-folding guard, exercised through the real renderer rather
    // than only through toPdfText: an unfolded character reaches drawText and
    // throws, which the route would save into the client's ".pdf" as HTML.
    const model = modelFor({
      billTo: {
        name: "Wondfo “USA” — Willowbrook",
        addressLines: ["1400 Corporate Drive 🚧"],
        contactName: "Dana Reyes – Safety",
        email: "dana@wondfo.test",
      },
      lines: [line({ description: "Documents ≤35 pages · client’s copy — reviewed" })],
      clientAgreementRef: "PO‑88213",
    });

    const bytes = await renderInvoicePdf({ model });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const text = (await drawnPages(bytes)).join("\n");
    expect(text).toContain("Documents <=35 pages");
    expect(text).toContain("client's copy");
  });

  it("wraps a very long description instead of clipping or overflowing it", async () => {
    const long =
      "Comprehensive review of the site's hazardous materials business plan, including the chemical " +
      "inventory reconciliation, the CERS submittal history, the emergency response contact roster, " +
      "and the corrective actions carried over from the previous inspection cycle.";
    const pages = await drawnPages(
      await renderInvoicePdf({ model: modelFor({ lines: [line({ description: long })] }) }),
    );
    const text = pages.join("\n");

    // Wrapped: the words survive across several drawn runs, and the tail of the
    // sentence is still on the page.
    expect(text).toContain("Comprehensive review of the site's");
    expect(text).toContain("previous inspection cycle.");
    expect(pages).toHaveLength(1);
  });

  it("paginates rather than clipping when an invoice is genuinely long", async () => {
    // Dropping billed rows off the bottom of a page to preserve the one-sheet
    // look would be a far worse defect than a two-sheet invoice.
    const many = Array.from({ length: 60 }, (_, index) =>
      line({ description: `Consulting session ${index + 1}`, quantity: 2, lineTotal: 370 }),
    );
    const pages = await drawnPages(await renderInvoicePdf({ model: modelFor({ lines: many }) }));

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join("\n")).toContain("Consulting session 60");
    // The continuation page repeats the column headers and carries a page count.
    expect(pages[1]).toContain("DESCRIPTION");
    expect(pages[0]).toContain(`Page 1 of ${pages.length}`);
  });

  it("renders an all-but-empty invoice without throwing, and still draws its structure", async () => {
    const model = buildInvoiceDocumentModel({
      invoiceNumber: "",
      issueDate: "",
      referenceProposalNumber: null,
      firm: { name: "", addressLines: [], phone: "", email: "" },
      billTo: { name: "", addressLines: [], contactName: "", email: "" },
      consultant: "",
      jobName: "",
      paymentTerms: "",
      dueDate: null,
      lines: [],
      subtotal: 0,
      salesTax: 0,
      total: 0,
      preparedBy: "",
      clientAgreementRef: "",
      currency: "USD",
    });

    const bytes = await renderInvoicePdf({ model });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);

    const text = (await drawnPages(bytes)).join("\n");
    expect(text).toContain("INVOICE #");
    expect(text).toContain("REFERENCE PROPOSAL NUMBER");
    expect(text).toContain("TOTAL");
    expect(text).toContain("$0.00");
  });

  it("carries no file route or localhost URL into the page margin", async () => {
    // This is the reason the export is generated server-side at all: the
    // browser's own print footer writes the page URL into every margin, and no
    // stylesheet can suppress it everywhere.
    const pages = await drawnPages(await renderInvoicePdf({ model: modelFor() }));
    for (const text of pages) {
      expect(text).not.toContain("/employee/clients");
      expect(text).not.toContain("http://localhost");
    }
  });
});
