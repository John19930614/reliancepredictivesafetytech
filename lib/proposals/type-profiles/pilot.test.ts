import { describe, expect, it } from "vitest";
import type { DocumentTermInputs } from "@/components/proposals/proposal-document-model";
import { composeDocumentTerms, requiredClauseIds, type SharedClauseId } from "./contract";
import { pilotProfile } from "./pilot";
import { buildSharedClauses } from "./shared-clauses";

// A pilot document has one job the other six types do not: it must be
// impossible to read as a subscription. Most of what follows is therefore
// negative — the wording a pilot must NOT contain, and the seller's own
// commercial fields this profile must not have swallowed on its way past.

/**
 * What the seller's fields resolve to before a profile ever sees them.
 * Deliberately distinctive strings: several tests below prove these survive
 * composition, and that the profile never restates one of its own.
 */
const stubInputs: DocumentTermInputs = {
  paymentTerms: "Net 45 from the invoice date",
  lateFee: "Balances past due accrue 1.25% per month",
  aiData: "Client data trains no shared model without written authorization.",
  ipRights: "Seller retains all rights in the platform and its risk models.",
  liabilityCap: "THE TOTAL FEES PAID UNDER THIS PROPOSAL",
  governingLaw: "the State of Wisconsin",
  validDays: "21",
};

const base = buildSharedClauses(stubInputs);
const composed = composeDocumentTerms(base, pilotProfile);
const headings = composed.terms.map((term) => term.heading);
const documentText = composed.terms.map((term) => `${term.heading}. ${term.body}`).join("\n");

const indexOfHeading = (heading: string) => {
  const index = headings.indexOf(heading);
  expect(index, `heading not in document: ${heading}`).toBeGreaterThan(-1);
  return index;
};

const bodyOf = (heading: string) => composed.terms[indexOfHeading(heading)].body;

/** Only the text this profile wrote — overrides and extras, headings included. */
const authoredClauses: { label: string; text: string }[] = [
  ...Object.entries(pilotProfile.overrideClauses ?? {}).map(([id, override]) => ({
    label: `override ${id}`,
    text: `${override?.heading ?? ""} ${override?.body ?? ""}`,
  })),
  ...(pilotProfile.extraClauses ?? []).map((extra) => ({
    label: `extra ${extra.id}`,
    text: `${extra.heading} ${extra.body}`,
  })),
];
const authoredText = authoredClauses.map((clause) => clause.text).join("\n");

/** Shared clauses whose body interpolates a value the seller sets per deal. */
const interpolatedClauseIds: SharedClauseId[] = [
  "payment_terms",
  "data_ai_use",
  "intellectual_property",
  "limitation_of_liability",
  "governing_law",
  "proposal_validity",
];

describe("pilot profile composition", () => {
  it("drops no required clause", () => {
    expect(composed.droppedRequired).toEqual([]);
  });

  it("still carries every required clause under its shared heading", () => {
    for (const id of requiredClauseIds) {
      const shared = base.find((clause) => clause.id === id);
      expect(shared, id).toBeDefined();
      expect(headings, id).toContain(shared!.heading);
    }
  });

  it("carries the terms a pilot cannot ship without", () => {
    expect(headings).toEqual(
      expect.arrayContaining([
        "Pilot Success Criteria",
        "Pilot Scope Boundary",
        "Evaluation Findings & Publicity",
        "Pre-Release Configuration",
        "No Automatic Conversion or Renewal",
        "Pilot Pricing Is Not a Production Quote",
      ]),
    );
  });

  it("omits the California auto-renewal clause and nothing else", () => {
    expect(headings).not.toContain("California Auto-Renewal Law");
    expect(pilotProfile.omitClauses).toEqual(["auto_renewal_ca"]);
    const kept = base.length - 1;
    expect(composed.terms).toHaveLength(kept + (pilotProfile.extraClauses ?? []).length);
  });

  it("leaves no auto-renewal wording anywhere in the composed document", () => {
    expect(documentText).not.toMatch(/auto-?renew/i);
  });

  it("prints each clause heading exactly once", () => {
    expect(new Set(headings).size).toBe(headings.length);
  });
});

describe("pilot extra clauses", () => {
  it("namespaces and uniquely ids every extra", () => {
    const ids = (pilotProfile.extraClauses ?? []).map((extra) => extra.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith("pilot."), id).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lands each extra exactly where it was anchored", () => {
    expect(indexOfHeading("Pilot Success Criteria")).toBe(indexOfHeading("Scope Changes") - 1);
    expect(indexOfHeading("Pilot Scope Boundary")).toBe(indexOfHeading("Scope Changes") + 1);
    expect(indexOfHeading("Evaluation Findings & Publicity")).toBe(indexOfHeading("Confidentiality") + 1);
    expect(indexOfHeading("Pre-Release Configuration")).toBe(indexOfHeading("Warranty Disclaimer") + 1);
    expect(indexOfHeading("Pilot Pricing Is Not a Production Quote")).toBe(indexOfHeading("Proposal Validity") - 1);
  });

  it("keeps the no-conversion clause in the omitted California clause's old slot, not stranded at the end", () => {
    // An extra anchored to an omitted clause falls to the trailing section.
    // This one is anchored to electronic_signatures for exactly that reason.
    expect(indexOfHeading("No Automatic Conversion or Renewal")).toBe(
      indexOfHeading("Electronic Signatures (E-SIGN / UETA)") - 1,
    );
    expect(headings[headings.length - 1]).toBe("Proposal Validity");
  });
});

describe("pilot wording never promises a subscription", () => {
  it("negates every mention of a subscription, renewal, or conversion", () => {
    const mention = /\b(?:subscriptions?|renew\w*|convert\w*|conversions?)\b/i;
    const negation = /\b(?:no|not|nothing|never|neither|without|cannot)\b/i;
    let checked = 0;
    for (const clause of authoredClauses) {
      if (!mention.test(clause.text)) continue;
      checked += 1;
      expect(negation.test(clause.text), `${clause.label} mentions renewal/conversion without negating it`).toBe(true);
    }
    // Guard against a vacuous pass: a pilot document that never raises the
    // subject at all has not disclaimed it either.
    expect(checked, "no pilot clause addresses renewal or conversion").toBeGreaterThanOrEqual(2);
  });

  it("contains none of the phrases that would turn a pilot into a subscription", () => {
    const promises = [
      /auto-?renew/i,
      /automatically (?:renew|convert|continue)/i,
      /(?:renews?|converts?|continues?) automatically/i,
      /\bwill (?:renew|convert|continue as)\b/i,
      /\bshall (?:renew|convert)\b/i,
      /\brenews? (?:for|at the end)\b/i,
      /\bcontinues? (?:as|into) an? subscription\b/i,
      /\bsubscription (?:begins|commences|starts)\b/i,
      /\bbilled (?:monthly|annually) thereafter\b/i,
      /\bunless (?:client )?cancels?\b/i,
      /\bunless cancell?ed\b/i,
    ];
    for (const promise of promises) {
      expect(documentText, `document matched ${promise}`).not.toMatch(promise);
    }
  });

  it("says positively that the pilot ends and that anything after it is separately signed", () => {
    const noConversion = bodyOf("No Automatic Conversion or Renewal");
    expect(noConversion).toMatch(/does not renew/i);
    expect(noConversion).toMatch(/separate agreement/i);
    expect(bodyOf("Entire Agreement")).toMatch(/separately signed agreement/i);
    expect(bodyOf("Termination")).toMatch(/expires on the last day of the pilot term/i);
  });

  it("prices the pilot only, with no rate carried into a rollout", () => {
    const rollout = bodyOf("Pilot Pricing Is Not a Production Quote");
    expect(rollout).toMatch(/sets no rate, discount, or unit price/i);
    expect(rollout).toMatch(/rates in effect when it is quoted/i);
  });

  it("evaluates the pilot against criteria agreed in writing at kickoff", () => {
    expect(bodyOf("Pilot Success Criteria")).toMatch(/in writing at kickoff/i);
  });

  it("requires written consent before pilot findings become a case study", () => {
    const publicity = bodyOf("Evaluation Findings & Publicity");
    expect(publicity).toMatch(/case study/i);
    expect(publicity).toMatch(/prior written consent/i);
  });

  it("handles end-of-pilot data in one place and cross-references it", () => {
    // The export-and-delete mechanic lives in Client Data Ownership; the pilot
    // clauses point at it rather than restating a second, driftable copy.
    const ownership = bodyOf("Client Data Ownership");
    expect(ownership).toMatch(/when the pilot term ends/i);
    expect(ownership).toMatch(/exportable format within 30 days/i);
    expect(bodyOf("No Automatic Conversion or Renewal")).toMatch(/as stated under Client Data Ownership/);
    const restatements = composed.terms.filter((term) => /exportable format/i.test(term.body));
    expect(restatements).toHaveLength(1);
  });
});

describe("pilot profile hardcodes no value the seller controls", () => {
  it("states no dollar figure and no percentage", () => {
    expect(authoredText).not.toMatch(/\$\s?\d/);
    expect(authoredText).not.toMatch(/\d\s*%/);
  });

  it("states no user, seat, or jobsite count", () => {
    expect(authoredText).not.toMatch(/\b\d[\d,]*\s+(?:users?|seats?|sites?|jobsites?|locations?|modules?|licen[sc]es?)\b/i);
    expect(authoredText).not.toMatch(
      /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred)\s+(?:users?|seats?|sites?|jobsites?|locations?)\b/i,
    );
  });

  it("states no calendar date for the pilot term", () => {
    expect(authoredText).not.toMatch(
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/,
    );
    expect(authoredText).not.toMatch(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
  });

  it("restates none of the seller's own commercial fields", () => {
    for (const value of [stubInputs.paymentTerms, stubInputs.lateFee, stubInputs.liabilityCap, stubInputs.governingLaw]) {
      expect(authoredText).not.toContain(value);
    }
  });

  it("never overrides or omits a clause whose shared body interpolates a seller field", () => {
    const overridden = Object.keys(pilotProfile.overrideClauses ?? {});
    const omitted = pilotProfile.omitClauses ?? [];
    for (const id of interpolatedClauseIds) {
      expect(overridden, `overriding ${id} would replace the seller's resolved value`).not.toContain(id);
      expect(omitted, `omitting ${id} would drop the seller's resolved value`).not.toContain(id);
    }
  });

  it("still prints every value the seller set", () => {
    expect(documentText).toContain(stubInputs.paymentTerms);
    expect(documentText).toContain(stubInputs.lateFee);
    expect(documentText).toContain(stubInputs.aiData);
    expect(documentText).toContain(stubInputs.ipRights);
    expect(documentText).toContain(stubInputs.liabilityCap);
    expect(documentText).toContain(stubInputs.governingLaw);
    expect(documentText).toContain(`${stubInputs.validDays} calendar days`);
  });
});

describe("pilot lexicon", () => {
  it("names the pilot everywhere the document names itself", () => {
    const { lexicon } = pilotProfile;
    expect(pilotProfile.key).toBe("pilot");
    expect(lexicon.documentTitle).toMatch(/Pilot/);
    expect(lexicon.engagementNoun).toBe("this pilot");
    expect(lexicon.termHeading).toMatch(/Pilot Term/);
    for (const value of Object.values(lexicon)) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(value, "second-person voice does not belong in a client document").not.toMatch(/\byour\b/i);
    }
  });

  it("disclaims the pilot services, not a subscription platform alone", () => {
    expect(pilotProfile.lexicon.warrantySubject).toBe("the platform and pilot services");
  });
});
