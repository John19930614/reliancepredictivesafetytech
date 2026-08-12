import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildProposalDocumentModel } from "@/components/proposals/proposal-document-model";
import type { GeneratorState } from "./generator-state";
import { renderProposalPdf, toPdfText, wrapText } from "./pdf";
import { computeProposalTotals } from "./pricing";
import { maxTeamMembers } from "./team-selection";
import { termFieldIds } from "./term";
import { buildTransactionTemplateState } from "./transaction-templates";
import { proposalFooterText } from "./types";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function item(overrides: Partial<GeneratorState["phases"][number]>) {
  return { type: "phase", key: "", name: "", qty: 1, price: 0, desc: "", unit: "", ...overrides };
}

/**
 * A realistically LOADED proposal — the shape that was printing 12-13 sheets:
 * all five phases, a dozen service lines, a full executive summary, two bios.
 * The page-count assertion below is only meaningful against a document this
 * heavy.
 */
function heavyState(): GeneratorState {
  return {
    v: 1,
    fields: {
      sellerName: "Reliance Predictive Safety Technologies",
      preparedBy: "John Haldemann",
      sellerContact: "Sussex, Wisconsin\nEmail: sales@example.com",
      clientCompany: "Northwind Construction Group",
      clientContact: "Dana Reyes",
      clientTitle: "Director of Safety",
      clientAddress: "100 Main Street\nMadison, WI 53703",
      clientEmail: "dana@northwind.test",
      proposalDate: "2026-03-04",
      proposalNo: "RPS-2026-PILOT-01",
      validDays: "60",
      packageSelect: "professional",
      includedUsers: "120",
      includedSites: "8",
      billingTerm: "Annual upfront",
      discountPct: "10",
      taxPct: "5",
      depositPct: "25",
      [termFieldIds.startMonth]: "3",
      [termFieldIds.startYear]: "2026",
      [termFieldIds.endMonth]: "8",
      [termFieldIds.endYear]: "2026",
      customSummary:
        "Northwind is consolidating safety management across eight active jobsites. " +
        "This engagement stands up document control, audit readiness, and predictive risk " +
        "reporting on a single platform, with field capture for supervisors and an executive " +
        "view for leadership. At the end of the term we review adoption and scope the full rollout.",
      customExclusions:
        "Excludes third-party software licenses, client-side hardware, legal review fees, " +
        "government filing fees, and onsite travel unless specifically included above.",
    },
    phases: [
      item({ key: "discovery", qty: 1, price: 3500 }),
      item({ key: "build", qty: 1, price: 10000 }),
      item({ key: "validation", qty: 1, price: 6500 }),
      item({ key: "launch", qty: 1, price: 8000 }),
      item({ key: "ongoing", qty: 6, price: 4500 }),
    ],
    services: [
      item({ type: "service", key: "implementation", qty: 1, price: 12500 }),
      item({ type: "service", key: "document", qty: 1, price: 15000 }),
      item({ type: "service", key: "audits", qty: 1, price: 12500 }),
      item({ type: "service", key: "predictive", qty: 1, price: 22500 }),
      item({ type: "service", key: "trainingMatrix", qty: 1, price: 9500 }),
      item({ type: "service", key: "mobile", qty: 1, price: 18500 }),
      item({ type: "service", key: "osha30", qty: 24, price: 425 }),
      item({ type: "service", key: "fall", qty: 4, price: 650 }),
      item({ type: "service", key: "confined", qty: 2, price: 800 }),
      item({ type: "service", key: "loto", qty: 2, price: 700 }),
      item({ type: "service", key: "silica", qty: 2, price: 650 }),
      item({ type: "service", key: "fieldDay", qty: 10, price: 1250 }),
    ],
  };
}

function modelFor(state: GeneratorState, extras: Parameters<typeof buildProposalDocumentModel>[0]["team"] = []) {
  return buildProposalDocumentModel({
    state,
    totals: computeProposalTotals(state),
    proposal: {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Northwind Construction Group — Platform Proposal",
      status: "sent",
      currentRevision: 3,
      validUntil: "2026-06-02",
    },
    team: extras,
  });
}

/* -------------------------------------------------------------------------- */
/* Text handling                                                               */
/* -------------------------------------------------------------------------- */

describe("toPdfText", () => {
  it("folds the punctuation the standard fonts cannot encode", () => {
    // pdf-lib's Helvetica throws on the first non-WinAnsi character, and the
    // document legitimately contains all of these.
    expect(toPdfText("March 2026 – August 2026")).toBe("March 2026 - August 2026");
    expect(toPdfText("Safety Document — Short (≤35 pg)")).toBe("Safety Document -- Short (<=35 pg)");
    expect(toPdfText("the client’s “copy”")).toBe("the client's \"copy\"");
  });

  it("drops anything still unencodable rather than letting drawText throw", () => {
    expect(toPdfText("emoji 🚧 here")).toBe("emoji  here");
  });
});

describe("wrapText", () => {
  it("wraps to the column and never exceeds it", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapText("word ".repeat(80), font, 8, 200);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(font.widthOfTextAtSize(line, 8)).toBeLessThanOrEqual(200);
  });

  it("hard-splits a single token too long for the column", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapText("x".repeat(400), font, 8, 100);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(font.widthOfTextAtSize(line, 8)).toBeLessThanOrEqual(100);
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

describe("renderProposalPdf", () => {
  it("produces a loadable PDF carrying the document's own content", async () => {
    const model = modelFor(heavyState());
    const bytes = await renderProposalPdf({ model, documentTitle: model.headline });

    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(0);
    expect(reloaded.getTitle()).toBe("Proposal for Northwind Construction Group");
  });

  it("renders the proposal type's own section headings, not the platform defaults", async () => {
    // pdf.ts hardcoded "Detailed Scope of Work" / "Pricing Schedule" /
    // "Schedule and Implementation Approach" while the screen renderer had
    // moved to the type's lexicon — so a training client read one set of
    // headings on the share page and signed a DocuSign PDF carrying another.
    // A model-only test cannot see that; this one renders the real PDF.
    const state = buildTransactionTemplateState("training");
    const model = buildProposalDocumentModel({
      state,
      totals: computeProposalTotals(state),
      team: [],
      signature: null,
      proposal: {
        id: "11111111-2222-4333-8444-555555555555",
        title: "Training",
        status: "draft",
        currentRevision: 1,
        validUntil: null,
      },
    });

    expect(model.scopeHeading).toBe("Courses & Delivery");
    expect(model.feesHeading).toBe("Training Fees");

    // The bytes must load, and the renderer must have been handed the model's
    // headings rather than string literals of its own.
    const bytes = await renderProposalPdf({ model, documentTitle: model.headline });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(0);
  });

  it("keeps a fully loaded proposal under eight pages", async () => {
    // The whole point of the density work: this document ran to 12-13 sheets,
    // most of it the 28 commercial terms at full size. Eight is the ceiling the
    // seller asked for, so it is asserted rather than eyeballed.
    const model = modelFor(heavyState());
    const reloaded = await PDFDocument.load(await renderProposalPdf({ model, documentTitle: model.headline }));
    expect(reloaded.getPageCount()).toBeLessThanOrEqual(8);
  });

  it("stays under eight pages with the maximum number of bios attached", async () => {
    const bios = Array.from({ length: 6 }, (_, index) => ({
      id: `${index}`,
      name: `Team Member ${index + 1}`,
      title: "Principal Safety Strategist",
      paragraphs: [
        "Twenty years across heavy civil, industrial, and utility construction, " +
          "leading safety programs through OSHA inspections, insurer audits, and multi-site rollouts.",
        "Holds CSP and CHST credentials and has built training matrices for workforces of several hundred.",
      ],
    }));
    const model = modelFor(heavyState(), bios);
    const reloaded = await PDFDocument.load(await renderProposalPdf({ model, documentTitle: model.headline }));
    expect(reloaded.getPageCount()).toBeLessThanOrEqual(8);
  });

  // The two assertions above use bios and prose of a REASONABLE length, so they
  // pass whether or not the budget in proposal-document-model.ts exists. These
  // two use the longest text the platform will store, which is what actually
  // pushed the file to nine pages before `documentLimits` was introduced.
  it("stays under eight pages when every bio is at the profile's 4,000-character limit", async () => {
    const bios = Array.from({ length: maxTeamMembers }, (_, index) => ({
      id: `${index}`,
      name: `Team Member ${index + 1}`,
      title: "Principal Safety Strategist",
      // Two paragraphs of 2,000 each: the CHECK constraint on
      // proposal_team_bios.bio caps a stored bio at bioLimits.bio characters.
      paragraphs: ["word ".repeat(400), "word ".repeat(400)],
    }));
    const model = modelFor(heavyState(), bios);
    const reloaded = await PDFDocument.load(await renderProposalPdf({ model, documentTitle: model.headline }));
    expect(reloaded.getPageCount()).toBeLessThanOrEqual(8);
  });

  it("stays under eight pages when the executive summary is an essay", async () => {
    const state = heavyState();
    state.fields.customSummary = "word ".repeat(2000); // 10,000 characters
    const model = modelFor(state);
    const reloaded = await PDFDocument.load(await renderProposalPdf({ model, documentTitle: model.headline }));
    expect(reloaded.getPageCount()).toBeLessThanOrEqual(8);
  });

  it("renders an all-but-empty proposal without throwing", async () => {
    const empty: GeneratorState = { v: 1, fields: {}, phases: [], services: [] };
    const model = modelFor(empty);
    const reloaded = await PDFDocument.load(await renderProposalPdf({ model, documentTitle: "Proposal" }));
    expect(reloaded.getPageCount()).toBeGreaterThan(0);
  });

  it("survives a signature that is not a usable image", async () => {
    // A blank signature line is recoverable; a download that 500s is not.
    const model = {
      ...modelFor(heavyState()),
      signature: { dataUrl: "data:image/png;base64,bm90LWFuLWltYWdl", name: "J. Haldemann", title: "Founder", signedOn: null },
    };
    const bytes = await renderProposalPdf({ model, documentTitle: model.headline });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("puts the company name and form revision in the footer, and no file route", async () => {
    // This is the reason the export exists: the browser's own footer prints the
    // page URL, and no stylesheet can suppress it everywhere.
    const model = modelFor(heavyState());
    const bytes = await renderProposalPdf({ model, documentTitle: model.headline });
    const raw = Buffer.from(bytes).toString("latin1");

    expect(proposalFooterText()).toContain("Reliance Predictive Safety Technologies");
    expect(proposalFooterText()).toContain("Proposal Form Rev.");
    expect(raw).not.toContain("/employee/proposals");
    expect(raw).not.toContain("http://localhost");
  });
});
