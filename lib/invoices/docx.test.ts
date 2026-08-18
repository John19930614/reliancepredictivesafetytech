import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  buildInvoiceDocumentModel,
  missingValue,
  type InvoiceDocumentInput,
  type InvoiceLineInput,
} from "./document-model";
import { renderInvoiceDocx } from "./docx";

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
      contactName: "Dana Reyes, Director of Safety",
      email: "dana@wondfo.test",
    },
    consultant: "Steve Sladky",
    jobName: "EHS Program Support",
    paymentTerms: "Net 30",
    dueDate: "2025-11-30",
    lines: [
      line({ serviceDate: "2025-10-06", description: "CERS reporting support", quantity: 6, lineTotal: 1110 }),
      line({ serviceDate: "2025-10-14" }),
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

function modelFor(overrides: Partial<InvoiceDocumentInput> = {}) {
  return buildInvoiceDocumentModel(invoiceInput(overrides));
}

/* -------------------------------------------------------------------------- */
/* Reading the rendered file back                                              */
/* -------------------------------------------------------------------------- */

/**
 * Pulls one entry out of the .docx archive.
 *
 * A byte-length check cannot tell an invoice from an empty Word template — the
 * boilerplate parts alone clear 10 kB — so the assertions below read
 * `word/document.xml` and look for the document's own words. Done by walking the
 * local file headers with zlib rather than adding a zip library: `jszip` is a
 * transitive dependency of `docx`, not one this project declares. (Same helper
 * as lib/proposals/docx.test.ts, which needed the same thing.)
 */
function readArchiveEntry(archive: Buffer, name: string): string {
  const wanted = Buffer.from(name, "latin1");
  let offset = archive.indexOf("PK", 0, "latin1");

  while (offset !== -1) {
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLength + extraLength;

    if (archive.subarray(offset + 30, offset + 30 + nameLength).equals(wanted)) {
      const body =
        compressedSize > 0 ? archive.subarray(dataStart, dataStart + compressedSize) : archive.subarray(dataStart);
      return method === 0 ? body.toString("utf8") : inflateRawSync(body).toString("utf8");
    }

    offset = archive.indexOf("PK", dataStart, "latin1");
  }

  throw new Error(`${name} is not in the archive`);
}

/** The visible text of a Word part, i.e. everything inside its <w:t> runs. */
function wordText(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map(([, run]) => run.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'))
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

describe("renderInvoiceDocx", () => {
  it("produces a downloadable Word document from the invoice view-model", async () => {
    const bytes = await renderInvoiceDocx(modelFor());

    expect(bytes.length).toBeGreaterThan(10_000);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
  });

  it("writes the invoice's own text into word/document.xml, not an empty shell", async () => {
    const text = wordText(readArchiveEntry(await renderInvoiceDocx(modelFor()), "word/document.xml"));

    for (const expected of [
      "INVOICE",
      "INVOICE #",
      "WONDFOUSA-2026-001-01",
      "REFERENCE PROPOSAL NUMBER",
      "WONDFOUSA-2026-001",
      "10/31/2025",
      "Reliance Predictive Safety Technologies",
      "TO",
      "Wondfo USA",
      "Dana Reyes, Director of Safety",
      "CONSULTANT",
      "JOB",
      "PAYMENT TERMS",
      "DUE DATE",
      "DESCRIPTION",
      "UNIT PRICE",
      "HOURS",
      "LINE TOTAL",
      "SUBTOTAL (HRS)",
      "SALES TAX",
      "TOTAL",
      "Invoice Prepared By: Steve Sladky",
      "Invoice for consulting services to client based on service agreement PO-88213",
    ]) {
      expect(text).toContain(expected);
    }

    // Priced, not just laid out.
    expect(text).toMatch(/\$[\d,]+\.\d{2}/);
  });

  it("keeps the deliberate $0.00 line in the table (INV-7)", async () => {
    const text = wordText(readArchiveEntry(await renderInvoiceDocx(modelFor()), "word/document.xml"));

    expect(text).toContain("CERS Log-In Check List (No Charge)");
    expect(text).toContain("$0.00");
    expect(text).not.toContain("No cost");

    // All three lines reached the table, not just the two that were charged for.
    for (const description of ["CERS reporting support", "Onsite safety program review", "CERS Log-In Check List"]) {
      expect(text).toContain(description);
    }
  });

  it("still writes the reference row when there is no proposal behind the invoice", async () => {
    const text = wordText(
      readArchiveEntry(await renderInvoiceDocx(modelFor({ referenceProposalNumber: null })), "word/document.xml"),
    );

    expect(text).toContain("REFERENCE PROPOSAL NUMBER");
    expect(text).toContain(missingValue);
  });

  it("heads the quantity column from the lines' basis", async () => {
    const text = wordText(
      readArchiveEntry(
        await renderInvoiceDocx(
          modelFor({ lines: [line({ qtyBasis: "session", quantity: 3, description: "Toolbox talk", lineTotal: 555 })] }),
        ),
        "word/document.xml",
      ),
    );

    expect(text).toContain("SESSIONS");
    expect(text).toContain("SUBTOTAL (SESSIONS)");
    expect(text).not.toContain("HOURS");
  });

  it("writes each line of a multi-line description as its own run, broken not merged", async () => {
    // The exact two the business asked for. A "\n" inside one w:t is swallowed
    // by Word — the file would open with the heading run into the sentence
    // beside it while the PDF drew the break, and the two documents would
    // disagree about the same invoice.
    const xml = readArchiveEntry(
      await renderInvoiceDocx(
        modelFor({
          lines: [
            line({ description: "Training\nBiosafety Training: Classroom and Practical." }),
            line({ description: "Audit\n4-Hour Audit. Audit report submitted" }),
          ],
        }),
      ),
      "word/document.xml",
    );

    // Each line is its own <w:t>: no run carries the newline through.
    const runs = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, run]) => run);
    expect(runs).toContain("Training");
    expect(runs).toContain("Biosafety Training: Classroom and Practical.");
    expect(runs).toContain("Audit");
    expect(runs).toContain("4-Hour Audit. Audit report submitted");
    expect(xml).not.toContain("Training\nBiosafety");

    // The two halves stay in ONE paragraph, separated by a <w:br/> — not split
    // across paragraphs, which would let Word break the row's own text apart
    // and space it like two entries.
    const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(([block]) => block);
    const descriptionParagraph = paragraphs.find((block) => block.includes("Biosafety Training"));
    expect(descriptionParagraph).toBeDefined();
    expect(descriptionParagraph).toContain("Training");
    expect(descriptionParagraph).toMatch(/<w:br\s*\/?>/);
  });

  it("leaves a single-line value as the one run it always was", async () => {
    // Every other field on the document is one line, and nothing about it
    // changed: no stray breaks in the party blocks or the totals.
    const xml = readArchiveEntry(await renderInvoiceDocx(modelFor()), "word/document.xml");
    const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map(([block]) => block);
    const preparedBy = paragraphs.find((block) => block.includes("Invoice Prepared By"));

    expect(preparedBy).toBeDefined();
    expect(preparedBy).not.toMatch(/<w:br\s*\/?>/);
  });

  it("lays out on US Letter with no table running past the margin", async () => {
    // The `docx` package defaults to A4. Taking that default while the geometry
    // is written for Letter is what made every full-width proposal table overhang
    // the right margin in Word.
    const xml = readArchiveEntry(await renderInvoiceDocx(modelFor()), "word/document.xml");

    const pageWidth = Number(/<w:pgSz[^>]*\sw:w="(\d+)"/.exec(xml)?.[1]);
    const left = Number(/<w:pgMar[^>]*\sw:left="(\d+)"/.exec(xml)?.[1]);
    const right = Number(/<w:pgMar[^>]*\sw:right="(\d+)"/.exec(xml)?.[1]);

    expect(pageWidth).toBe(12240); // 8.5in in twips
    expect(Number(/<w:pgSz[^>]*\sw:h="(\d+)"/.exec(xml)?.[1])).toBe(15840); // 11in

    const printable = pageWidth - left - right;
    const tableWidths = [...xml.matchAll(/<w:tblW\b[^>]*>/g)]
      .map(([tag]) => ({
        type: /w:type="([^"]+)"/.exec(tag)?.[1],
        width: Number(/w:w="(\d+)"/.exec(tag)?.[1]),
      }))
      .filter((entry) => entry.type === "dxa" && Number.isFinite(entry.width))
      .map((entry) => entry.width);

    expect(tableWidths.length).toBeGreaterThan(0);
    expect(tableWidths.filter((width) => width > printable)).toEqual([]);
  });

  it("carries the invoice number in the footer and no file route", async () => {
    // Same reason the PDF route exists: a client-facing document must never
    // carry the internal URL it was generated from.
    const bytes = await renderInvoiceDocx(modelFor());
    const footer = wordText(readArchiveEntry(bytes, "word/footer1.xml"));

    expect(footer).toContain("WONDFOUSA-2026-001-01");
    expect(footer).not.toContain("/employee/clients");
  });

  it("renders an all-but-empty invoice without throwing, and still writes its structure", async () => {
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

    const bytes = await renderInvoiceDocx(model);
    const text = wordText(readArchiveEntry(bytes, "word/document.xml"));

    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(text).toContain("INVOICE #");
    expect(text).toContain("REFERENCE PROPOSAL NUMBER");
    expect(text).toContain("TOTAL");
    expect(text).toContain("$0.00");
  });
});
