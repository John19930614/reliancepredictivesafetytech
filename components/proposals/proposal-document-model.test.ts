// Unit tests for the proposal document's view-model.
//
// The repo's vitest runs with `environment: "node"` and carries no DOM/testing
// library, so there is no component-render harness to assert against. Rather
// than introduce a second test framework, every non-trivial derivation the
// document performs lives in proposal-document-model.ts and is tested here;
// ProposalDocument.tsx is then a declarative mapping of this model onto JSX.

import { describe, expect, it } from "vitest";
import { packageData, phaseOptions, serviceOptions } from "@/lib/proposals/catalog";
import type { GeneratorItem, GeneratorState } from "@/lib/proposals/generator-state";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import type { ProposalStatus } from "@/lib/proposals/types";
import {
  buildProposalDocumentModel,
  documentCopy,
  fieldCount,
  fieldLines,
  fieldText,
  formatDocumentDate,
  missingValue,
  type ProposalDocumentModel,
  type ProposalDocumentSubject,
} from "./proposal-document-model";

const state = (overrides: Partial<GeneratorState> = {}): GeneratorState => ({
  v: 1,
  fields: {},
  phases: [],
  services: [],
  ...overrides,
});

const item = (overrides: Partial<GeneratorItem> = {}): GeneratorItem => ({
  type: "service",
  key: "custom",
  name: "",
  qty: 1,
  price: 0,
  desc: "",
  unit: "",
  ...overrides,
});

const subject = (overrides: Partial<ProposalDocumentSubject> = {}): ProposalDocumentSubject => ({
  id: "11111111-1111-4111-8111-111111111111",
  title: "Acme Co — Platform Proposal",
  status: "draft" as ProposalStatus,
  currentRevision: 3,
  validUntil: null,
  ...overrides,
});

/** Every string the document would print, so a NaN cannot hide in one cell. */
function allStrings(model: ProposalDocumentModel): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(model);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Field readers                                                               */
/* -------------------------------------------------------------------------- */

describe("field readers", () => {
  it("trims text and falls back only when the field is absent or blank", () => {
    const s = state({ fields: { a: "  hello  ", b: "   ", c: 42, d: true } });
    expect(fieldText(s, "a", "fallback")).toBe("hello");
    expect(fieldText(s, "b", "fallback")).toBe("fallback");
    expect(fieldText(s, "missing", "fallback")).toBe("fallback");
    expect(fieldText(s, "c")).toBe("42");
    expect(fieldText(s, "d")).toBe("true");
    expect(fieldText(s, "missing")).toBe("");
  });

  it("splits multi-line fields and drops blank lines", () => {
    const s = state({ fields: { addr: "Street Address\n\n  City, State ZIP  \n" } });
    expect(fieldLines(s, "addr")).toEqual(["Street Address", "City, State ZIP"]);
    expect(fieldLines(s, "missing")).toEqual([]);
  });

  it("never returns NaN or a negative count", () => {
    const s = state({ fields: { good: 25, negative: -8, junk: "fifty", blank: "" } });
    expect(fieldCount(s, "good", 1)).toBe(25);
    expect(fieldCount(s, "negative", 1)).toBe(0);
    expect(fieldCount(s, "junk", 7)).toBe(7);
    expect(fieldCount(s, "blank", 7)).toBe(7);
    expect(fieldCount(s, "missing", 7)).toBe(7);
    expect(fieldCount(null, "missing", 7)).toBe(7);
  });
});

describe("formatDocumentDate", () => {
  it("formats a calendar date without touching Date (no timezone drift)", () => {
    expect(formatDocumentDate("2026-03-04")).toBe("March 4, 2026");
    expect(formatDocumentDate("2026-12-31")).toBe("December 31, 2026");
    expect(formatDocumentDate("2026-01-01T00:00:00.000Z")).toBe("January 1, 2026");
  });

  it("degrades honestly instead of guessing", () => {
    expect(formatDocumentDate(null)).toBe(missingValue);
    expect(formatDocumentDate("")).toBe(missingValue);
    expect(formatDocumentDate("   ")).toBe(missingValue);
    expect(formatDocumentDate("next Tuesday")).toBe("next Tuesday");
    expect(formatDocumentDate("2026-13-01")).toBe("2026-13-01");
  });
});

/* -------------------------------------------------------------------------- */
/* Well-formed proposal                                                        */
/* -------------------------------------------------------------------------- */

describe("buildProposalDocumentModel — well-formed state", () => {
  const wellFormed = state({
    fields: {
      sellerName: "Reliance Predictive Safety Technologies",
      preparedBy: "John Haldemann",
      sellerContact: "Sussex, Wisconsin\nEmail: sales@example.com",
      proposalDate: "2026-03-04",
      proposalNo: "RPS-2026-PILOT-01",
      validDays: "90",
      clientCompany: "Acme Construction",
      clientContact: "Dana Reyes",
      clientTitle: "Safety Director",
      clientAddress: "100 Main St\nMadison, WI 53703",
      clientEmail: "dana@acme.test",
      packageSelect: "professional",
      annualPrice: 65000,
      includedUsers: 50,
      includedSites: 5,
      billingTerm: "Annual upfront",
      discountPct: 10,
      taxPct: 5,
      depositPct: 25,
      paymentTerms: "Net 15 from invoice date",
      governingLaw: "California (primary)",
      customSummary: "A pilot for two jobsites.",
      customExclusions: "Excludes travel.",
    },
    phases: [item({ type: "phase", key: "discovery", name: "", qty: 1, price: 3500, desc: "" })],
    services: [item({ type: "service", key: "osha10", name: "", qty: 12, price: 175, desc: "" })],
  });

  const model = buildProposalDocumentModel({ state: wellFormed, proposal: subject({ validUntil: "2026-06-02" }) });

  it("headlines with the client company, as the generator does", () => {
    expect(model.headline).toBe("Pilot Program Proposal for Acme Construction");
    expect(model.subtitle).toBe(documentCopy.subtitle);
  });

  it("builds both party blocks", () => {
    expect(model.preparedFor).toEqual({
      name: "Acme Construction",
      lines: ["Dana Reyes — Safety Director", "100 Main St", "Madison, WI 53703", "dana@acme.test"],
    });
    expect(model.preparedByBlock).toEqual({
      name: "Reliance Predictive Safety Technologies",
      lines: ["Prepared by: John Haldemann", "Sussex, Wisconsin", "Email: sales@example.com"],
    });
  });

  it("renders the proposal date and validity from saved values", () => {
    expect(model.proposalDate).toBe("March 4, 2026");
    expect(model.proposalNumber).toBe("RPS-2026-PILOT-01");
    expect(model.validity).toBe("Open for acceptance for 90 calendar days from proposal date. Valid until June 2, 2026.");
  });

  it("describes the selected package from the catalog with the saved limits", () => {
    expect(model.packageIntro).toContain(packageData.professional.name);
    expect(model.packageIntro).toContain(packageData.professional.desc);
    expect(model.packagePills).toEqual([
      { label: "Pilot Fee", value: "$65,000" },
      { label: "Included Users", value: "50" },
      { label: "Included Jobsites", value: "5" },
      { label: "Billing", value: "Annual upfront" },
    ]);
  });

  it("falls the scope back to the catalog when a row stored only its key", () => {
    expect(model.phaseScope).toEqual([{ heading: `1. ${phaseOptions.discovery.name}`, body: phaseOptions.discovery.desc }]);
    expect(model.serviceScope).toEqual([
      { heading: `Service Line 1: ${serviceOptions.osha10.name}`, body: serviceOptions.osha10.desc },
    ]);
  });

  it("lists the base deliverables plus one per phase and service", () => {
    expect(model.deliverables).toHaveLength(documentCopy.baseDeliverables.length + 2);
    expect(model.deliverables).toContain(`${phaseOptions.discovery.name} deliverable package`);
    expect(model.deliverables).toContain(`${serviceOptions.osha10.name} deliverable package`);
  });

  it("groups the fee table and shows the service billing unit", () => {
    expect(model.feeGroups.map((g) => g.label)).toEqual([
      "Base Subscription",
      "Implementation Phases",
      "Service Lines & Add-Ons",
    ]);
    const service = model.feeGroups[2].rows[0];
    expect(service.unit).toBe("Person");
    expect(service.qtyLabel).toBe("12 Person");
    expect(service.priceLabel).toBe("$175");
    expect(service.amountLabel).toBe("$2,100");
  });

  it("drives every total from computeProposalTotals, never from the state", () => {
    const totals = computeProposalTotals(wellFormed);
    // 65000 + 3500 + 2100 = 70600; -10% = 63540; +5% tax = 66717; 25% deposit.
    expect(totals.subtotal).toBe(70600);
    expect(totals.total).toBe(66717);
    expect(model.totals).toEqual(totals);
    expect(model.totalRows).toEqual([
      { label: "Subtotal", value: "$70,600" },
      { label: "Discount", value: "-$7,060" },
      { label: "Tax", value: "$3,177" },
      { label: "Total Proposed Fee", value: "$66,717", emphasis: "total" },
      { label: "Deposit Due at Acceptance", value: "$16,679.25", emphasis: "deposit" },
    ]);
  });

  it("interpolates the seller-selected commercial terms", () => {
    expect(model.schedule).toContain("(Annual upfront)");
    expect(model.schedule).toContain("Net 15 from invoice date");
    const byHeading = new Map(model.terms.map((t) => [t.heading, t.body]));
    expect(byHeading.get("Payment Terms")).toContain("Net 15 from invoice date");
    expect(byHeading.get("Governing Law & Venue")).toContain("governed by the laws of California (primary)");
    expect(byHeading.get("Proposal Validity")).toContain("open for 90 calendar days");
  });

  it("carries the contractual clauses the printed document is relied on for", () => {
    const headings = model.terms.map((t) => t.heading);
    expect(headings).toHaveLength(27);
    expect(headings).toContain("Dispute Resolution & Arbitration");
    expect(headings).toContain("Limitation of Liability");
    expect(headings).toContain("Governing Law & Venue");
    expect(headings).toContain("Warranty Disclaimer");
    expect(headings).toContain("OSHA Compliance Disclaimer");
    const liability = model.terms.find((t) => t.heading === "Limitation of Liability")?.body ?? "";
    expect(liability).toContain("Fees paid under this proposal in the prior 12 months");
    const arbitration = model.terms.find((t) => t.heading === "Dispute Resolution & Arbitration")?.body ?? "";
    expect(arbitration).toContain("AAA Commercial Arbitration Rules");
  });

  it("signs with the preparer and names the seller in the legal notice", () => {
    expect(model.sellerSignature).toBe("John Haldemann / Authorized Representative");
    expect(model.legalNotice).toContain("produced by Reliance Predictive Safety Technologies");
  });

  it("accepts pre-computed totals rather than recomputing them", () => {
    const totals = computeProposalTotals(wellFormed);
    const reused = buildProposalDocumentModel({ state: wellFormed, totals, proposal: subject() });
    expect(reused.totals).toBe(totals);
  });
});

/* -------------------------------------------------------------------------- */
/* Degraded / empty state                                                      */
/* -------------------------------------------------------------------------- */

describe("buildProposalDocumentModel — empty and malformed state", () => {
  const empty = state();
  const model = buildProposalDocumentModel({ state: empty, proposal: subject() });

  it("never renders NaN, undefined, or null anywhere in the document", () => {
    for (const text of allStrings(model)) {
      expect(text).not.toMatch(/NaN|undefined|null/);
    }
  });

  it("falls back to the proposal title rather than inventing a client name", () => {
    expect(model.headline).toBe("Acme Co — Platform Proposal");
    expect(model.preparedFor.name).toBe(missingValue);
    expect(model.preparedFor.lines).toEqual([]);
    expect(model.proposalDate).toBe(missingValue);
    expect(model.proposalNumber).toBe(missingValue);
  });

  it("says so plainly when there is no summary, scope, or exclusions", () => {
    expect(model.summary).toBe(documentCopy.noSummary);
    expect(model.exclusions).toBe(documentCopy.noExclusions);
    expect(model.phaseScope).toEqual([]);
    expect(model.serviceScope).toEqual([]);
    expect(model.deliverables).toEqual([...documentCopy.baseDeliverables]);
  });

  it("still shows the base subscription row the generator itself would render", () => {
    expect(model.feeGroups).toHaveLength(1);
    expect(model.feeGroups[0].label).toBe("Base Subscription");
    expect(model.feeGroups[0].rows[0].name).toBe(packageData.custom.name);
    expect(model.totalRows[3]).toEqual({
      label: "Total Proposed Fee",
      value: "$5,000",
      emphasis: "total",
    });
  });

  it("keeps the legal terms complete even with no saved commercial selections", () => {
    expect(model.terms).toHaveLength(27);
    const governing = model.terms.find((t) => t.heading === "Governing Law & Venue")?.body ?? "";
    expect(governing).toContain("Wisconsin (primary)");
    expect(model.sellerSignature).toBe("Authorized Representative");
  });

  it("labels an unnamed, uncatalogued line item instead of printing a blank", () => {
    const unnamed = buildProposalDocumentModel({
      state: state({
        phases: [item({ type: "phase", key: "no-such-key", qty: 1, price: 100 })],
        services: [item({ type: "service", key: "gone", qty: 2, price: 50 })],
      }),
      proposal: subject(),
    });
    expect(unnamed.phaseScope[0].heading).toBe("1. Untitled phase 1");
    expect(unnamed.phaseScope[0].body).toBe("");
    expect(unnamed.serviceScope[0].heading).toBe("Service Line 1: Untitled service line 1");
    expect(unnamed.deliverables).toContain("Untitled phase 1 deliverable package");
    expect(unnamed.feeGroups[2].rows[0].qtyLabel).toBe("2");
  });
});

/* -------------------------------------------------------------------------- */
/* Revision markers                                                            */
/* -------------------------------------------------------------------------- */

describe("buildProposalDocumentModel — revision markers", () => {
  it("flags a historical revision", () => {
    const model = buildProposalDocumentModel({
      state: state(),
      proposal: subject({ currentRevision: 5 }),
      revisionNumber: 2,
    });
    expect(model.revisionLabel).toBe("Revision 2");
    expect(model.currentRevisionLabel).toBe("Revision 5");
    expect(model.isHistoricalRevision).toBe(true);
  });

  it("does not flag the current revision as historical", () => {
    const model = buildProposalDocumentModel({
      state: state(),
      proposal: subject({ currentRevision: 5 }),
      revisionNumber: 5,
    });
    expect(model.revisionLabel).toBe("Revision 5");
    expect(model.isHistoricalRevision).toBe(false);
  });

  it("shows no revision marker when the live proposal is rendered", () => {
    const model = buildProposalDocumentModel({ state: state(), proposal: subject({ currentRevision: 4 }) });
    expect(model.revisionLabel).toBeNull();
    expect(model.isHistoricalRevision).toBe(false);
    expect(model.currentRevisionLabel).toBe("Revision 4");
  });

  it("survives a non-finite current_revision from the database", () => {
    const model = buildProposalDocumentModel({
      state: state(),
      proposal: subject({ currentRevision: Number.NaN }),
      revisionNumber: 1,
    });
    expect(model.currentRevisionLabel).toBe("Revision 1");
    expect(model.isHistoricalRevision).toBe(false);
  });
});
