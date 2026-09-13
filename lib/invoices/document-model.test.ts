import { describe, expect, it } from "vitest";
import { buildInvoiceDocumentModel, type InvoiceDocumentSource } from "./document-model";
import { renderInvoiceDocx } from "./docx";
import type { CompanyProfile } from "@/lib/company/profile";

const seller = {
  display_name: "Reliance Predictive Safety Technologies",
  legal_name: "Reliance Predictive Safety Technologies LLC",
  email: "hello@example.com",
  phone: "555-0100",
  website: "example.com",
  address_line1: "1 Test Way",
  city: "Milwaukee",
  state: "WI",
  postal_code: "53202",
  country: "US",
} as unknown as CompanyProfile;

const invoice: InvoiceDocumentSource = {
  invoice_number: "Wondfo-2026-002-01",
  status: "draft",
  kind: "full",
  issue_date: "2026-09-01",
  due_date: "2026-10-01",
  currency: "USD",
  subtotal: 880,
  tax_amount: 0,
  total: 880,
  job_name: "Wondfo USA — Training Services Proposal",
  consultant_name: null,
  payment_terms: null,
  client_agreement_ref: null,
  prepared_by: null,
  notes: null,
};

function model(lines: Parameters<typeof buildInvoiceDocumentModel>[0]["lines"]) {
  return buildInvoiceDocumentModel({
    invoice,
    lines,
    seller,
    billTo: { name: "Wondfo USA" },
    statusLabel: "Draft",
    kindLabel: "Full",
    proposalNumber: "Wondfo-2026-002",
  });
}

describe("buildInvoiceDocumentModel — service date", () => {
  it("carries the date the work was performed onto the line", () => {
    const built = model([
      {
        description: "Training\nFirst Aid / CPR / AED Training",
        quantity: 6,
        unit_amount: 105,
        line_total: 630,
        service_date: "2026-08-18",
      },
    ]);
    expect(built.lines[0].serviceDate).toBe("Aug 18, 2026");
  });

  it("is null when the line has no date, so nothing prints", () => {
    const built = model([
      { description: "Full amount", quantity: 1, unit_amount: 2500, line_total: 2500, service_date: null },
    ]);
    expect(built.lines[0].serviceDate).toBeNull();
  });

  it("is null when the column is absent entirely", () => {
    const built = model([{ description: "Full amount", quantity: 1, unit_amount: 2500, line_total: 2500 }]);
    expect(built.lines[0].serviceDate).toBeNull();
  });

  it("keeps each line's own date rather than one for the whole invoice", () => {
    const built = model([
      { description: "Day one", quantity: 1, unit_amount: 100, line_total: 100, service_date: "2026-08-18" },
      { description: "Day two", quantity: 1, unit_amount: 100, line_total: 100, service_date: "2026-08-19" },
    ]);
    expect(built.lines.map((line) => line.serviceDate)).toEqual(["Aug 18, 2026", "Aug 19, 2026"]);
  });
});

describe("buildInvoiceDocumentModel — the client-facing surface", () => {
  it("prints no notes when the seller has written none", () => {
    // The generator used to auto-fill this with internal provenance and an
    // instruction to the drafter, both of which reached the client's copy.
    expect(model([{ description: "x", quantity: 1, unit_amount: 1, line_total: 1 }]).notes).toBeNull();
  });

  it("names the parent proposal", () => {
    expect(model([{ description: "x", quantity: 1, unit_amount: 1, line_total: 1 }]).proposalNumber).toBe(
      "Wondfo-2026-002",
    );
  });

  it("totals the invoice in its own currency", () => {
    const built = model([{ description: "x", quantity: 1, unit_amount: 880, line_total: 880 }]);
    expect(built.total).toBe("$880.00");
  });
});

describe("renderInvoiceDocx — branding", () => {
  it("embeds the Reliance seal in the Word invoice", async () => {
    const built = model([{ description: "Safety consulting", quantity: 1, unit_amount: 880, line_total: 880 }]);
    const bytes = await renderInvoiceDocx(built);

    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(bytes.includes(Buffer.from("word/media/"))).toBe(true);
  });
});
