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
  documentLimits,
  fieldCount,
  fieldLines,
  fieldText,
  fitTeamBios,
  formatDocumentDate,
  missingValue,
  truncateAtWord,
  type DocumentTeamMember,
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

  it("headlines with the client company, without claiming the package is a pilot", () => {
    // Was "Pilot Program Proposal for ..." for every package, including
    // Enterprise and Black Label. The package is named in the docline instead.
    expect(model.headline).toBe("Proposal for Acme Construction");
    expect(model.subtitle).toBe(documentCopy.subtitle);
  });

  it("builds both party blocks", () => {
    // This fixture predates the addressee list, so it exercises the LEGACY
    // fallback: the single clientContact/clientTitle/clientEmail triple folded
    // into one addressee. Historical revisions are immutable and still carry
    // those fields, so the fallback has to keep working forever.
    expect(model.preparedFor).toEqual({
      name: "Acme Construction",
      lines: ["Dana Reyes — Safety Director · dana@acme.test", "100 Main St", "Madison, WI 53703"],
    });
    expect(model.preparedByBlock).toEqual({
      name: "Reliance Predictive Safety Technologies",
      lines: ["Prepared by: John Haldemann", "Sussex, Wisconsin", "Email: sales@example.com"],
    });
  });

  it("addresses the proposal to every person on the addressee list", () => {
    // The reported gap: a proposal goes to the safety director who asked for it
    // AND the project executive who approves it, and the block had room for one.
    const multi = buildProposalDocumentModel({
      state: {
        ...wellFormed,
        fields: {
          ...wellFormed.fields,
          clientContacts:
            "Dana Reyes | Safety Director | dana@acme.test\nPat Vance | Project Executive | pat@acme.test\nJo Kim",
        },
      },
      proposal: subject(),
    });

    expect(multi.preparedFor.lines).toEqual([
      "Dana Reyes — Safety Director · dana@acme.test",
      "Pat Vance — Project Executive · pat@acme.test",
      // Name only: no title, no email, and no stray separators printed.
      "Jo Kim",
      "100 Main St",
      "Madison, WI 53703",
    ]);
    expect(multi.clientContacts).toHaveLength(3);
    // The list wins outright — the legacy triple is not appended as a fourth.
    expect(multi.preparedFor.lines.join(" ")).not.toContain("Dana Reyes — Safety Director,");
  });

  it("renders the proposal date and validity from saved values", () => {
    expect(model.proposalDate).toBe("March 4, 2026");
    expect(model.proposalNumber).toBe("RPS-2026-PILOT-01");
    expect(model.validity).toBe("Open for acceptance for 90 calendar days from proposal date. Valid until June 2, 2026.");
  });

  it("describes the selected package from the catalog with the saved limits", () => {
    expect(model.packageIntro).toContain(packageData.professional.name);
    expect(model.packageIntro).toContain(packageData.professional.desc);
    // The counts are read from the state, never from a frozen catalog sentence.
    expect(model.packageIntro).toContain("50 users across 5 jobsites");
    expect(model.packagePills).toEqual([
      { label: "Subscription Price", value: "$65,000" },
      { label: "Term", value: "—" },
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

  it("lists only the base deliverables, naming the selected lines in one sentence", () => {
    // Section 04 used to append a "<name> deliverable package" bullet per line,
    // restating section 03 in full and costing most of a page.
    expect(model.deliverables).toEqual([...documentCopy.baseDeliverables]);
    expect(model.deliverablesCoverage).toContain(phaseOptions.discovery.name);
    expect(model.deliverablesCoverage).toContain(serviceOptions.osha10.name);
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
      { label: "Total", value: "$66,717", emphasis: "total" },
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
      label: "Total",
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
    expect(unnamed.deliverablesCoverage).toContain("Untitled phase 1");
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

/* -------------------------------------------------------------------------- */
/* Page budget                                                                 */
/*                                                                             */
/* The eight-page ceiling itself is asserted against the real paginator in     */
/* lib/proposals/pdf.test.ts. What is checked here is the trimming behaviour   */
/* that ceiling depends on — and, just as importantly, that the CONTRACTUAL    */
/* regions are left alone by it.                                               */
/* -------------------------------------------------------------------------- */

const bio = (paragraphs: string[]): DocumentTeamMember => ({
  id: "44444444-4444-4444-8444-444444444444",
  name: "Dana Reyes",
  title: "Head of Safety",
  paragraphs,
});

describe("truncateAtWord", () => {
  it("returns short text byte-for-byte, with nothing appended", () => {
    expect(truncateAtWord("Short enough.", 100)).toBe("Short enough.");
    expect(truncateAtWord("", 100)).toBe("");
  });

  it("cuts on a word boundary and marks the cut", () => {
    const trimmed = truncateAtWord("alpha bravo charlie delta echo", 18);
    expect(trimmed).toBe("alpha bravo…");
    expect(trimmed.length).toBeLessThanOrEqual(19);
  });

  it("drops a trailing separator so the ellipsis does not read as a typo", () => {
    expect(truncateAtWord("alpha bravo, charlie delta", 13)).toBe("alpha bravo…");
  });

  it("hard-clips a single token with no word boundary to cut on", () => {
    expect(truncateAtWord("x".repeat(50), 10)).toBe(`${"x".repeat(10)}…`);
  });
});

describe("fitTeamBios", () => {
  it("leaves a team that already fits completely untouched", () => {
    const team = [bio(["First paragraph.", "Second paragraph."])];
    expect(fitTeamBios(team)).toEqual(team);
  });

  it("splits the budget evenly, so one long bio survives where six cannot", () => {
    const long = "word ".repeat(800); // 4,000 chars — the profile's own limit
    const alone = fitTeamBios([bio([long])], 6000);
    expect(alone[0].paragraphs[0]).toBe(long);

    const six = fitTeamBios(
      Array.from({ length: 6 }, () => bio([long])),
      6000,
    );
    for (const member of six) {
      expect(member.paragraphs.join("").length).toBeLessThanOrEqual(1001);
    }
  });

  it("keeps earlier paragraphs whole and trims only where the budget runs out", () => {
    const [member] = fitTeamBios([bio(["alpha bravo charlie", "delta echo foxtrot golf"])], 30);
    expect(member.paragraphs[0]).toBe("alpha bravo charlie");
    expect(member.paragraphs[1]).toMatch(/…$/);
  });

  it("handles an empty team and a zero budget without producing empty prose", () => {
    expect(fitTeamBios([])).toEqual([]);
    expect(fitTeamBios([bio(["anything"])], 0)[0].paragraphs).toEqual([]);
  });
});

describe("buildProposalDocumentModel — page budget", () => {
  it("caps the executive summary", () => {
    const model = buildProposalDocumentModel({
      state: state({ fields: { customSummary: "word ".repeat(2000) } }),
      proposal: subject(),
    });
    expect(model.summary.length).toBeLessThanOrEqual(documentLimits.summaryChars + 1);
    expect(model.summary.endsWith("…")).toBe(true);
  });

  it("applies the team budget without the caller having to remember to", () => {
    const model = buildProposalDocumentModel({
      state: state(),
      proposal: subject(),
      team: Array.from({ length: 6 }, () => bio(["word ".repeat(800)])),
    });
    const printed = model.team.reduce((sum, member) => sum + member.paragraphs.join("").length, 0);
    expect(printed).toBeLessThanOrEqual(documentLimits.teamBioChars + 6);
  });

  it("never trims the assumptions, the scope paragraphs, or the fee table", () => {
    // These are the offer. Losing the tail of an exclusion to save a sheet is a
    // worse defect than a long document, so the budget deliberately skips them.
    const exclusions = "word ".repeat(4000);
    const scope = "scope ".repeat(400);
    const model = buildProposalDocumentModel({
      state: state({
        fields: { customExclusions: exclusions },
        services: [item({ key: "custom", name: "Bespoke line", desc: scope, qty: 1, price: 100 })],
      }),
      proposal: subject(),
    });

    expect(model.exclusions).toBe(exclusions.trim());
    expect(model.serviceScope[0].body).toBe(scope.trim());
    expect(model.feeGroups.flatMap((group) => group.rows)).toHaveLength(2);
  });
});
