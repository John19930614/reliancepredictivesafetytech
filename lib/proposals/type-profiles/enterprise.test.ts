import { describe, expect, it } from "vitest";
import type { DocumentTermInputs } from "@/components/proposals/proposal-document-model";
import { composeDocumentTerms, requiredClauseIds, type SharedClauseId } from "./contract";
import { buildSharedClauses } from "./shared-clauses";
import { enterpriseProfile } from "./enterprise";

// This is the type an enterprise legal team reads before signing. The tests
// below are not style checks: each one corresponds to a way this document could
// go out wrong and cost real money -- a missing limitation of liability, a
// certification the company does not hold asserted as fact, a coverage limit or
// seat count frozen into a clause the seller never agreed to, or the order of
// precedence against the client's MSA left unstated.

// Sentinel values, so a clause that swallowed a per-deal commercial term is
// visible rather than plausible. Real proposals interpolate the seller's own
// fields here; a profile must never restate them.
const SENTINELS = {
  paymentTerms: "PAYMENTTERMS-SENTINEL",
  lateFee: "LATEFEE-SENTINEL",
  aiData: "AIDATA-SENTINEL",
  ipRights: "IPRIGHTS-SENTINEL",
  liabilityCap: "LIABILITYCAP-SENTINEL",
  governingLaw: "the State of Testlandia",
  validDays: "VALIDDAYS-SENTINEL",
} as const satisfies DocumentTermInputs;

const base = buildSharedClauses(SENTINELS);
const compose = () => composeDocumentTerms(base, enterpriseProfile);
const headings = () => compose().terms.map((term) => term.heading);
const indexOf = (heading: string) => headings().indexOf(heading);

/** Only the text this profile authored -- overrides and extras, not the shared base. */
const authoredText = (): string[] => {
  const overrides = Object.values(enterpriseProfile.overrideClauses ?? {}).flatMap((override) =>
    override ? [override.heading ?? "", override.body] : [],
  );
  const extras = (enterpriseProfile.extraClauses ?? []).flatMap((extra) => [extra.heading, extra.body]);
  return [...overrides, ...extras].filter((text) => text.length > 0);
};

const clauseBody = (heading: string): string => {
  const found = compose().terms.find((term) => term.heading === heading);
  if (!found) throw new Error(`no composed clause headed "${heading}"`);
  return found.body;
};

describe("enterprise profile composition", () => {
  it("drops no required clause", () => {
    expect(compose().droppedRequired).toEqual([]);
  });

  it("omits nothing, so every shared clause survives under its own or its overridden heading", () => {
    const overrides = enterpriseProfile.overrideClauses ?? {};
    const composed = headings();
    expect(enterpriseProfile.omitClauses).toEqual([]);
    for (const clause of base) {
      expect(composed, clause.id).toContain(overrides[clause.id]?.heading ?? clause.heading);
    }
    expect(composed).toHaveLength(base.length + (enterpriseProfile.extraClauses ?? []).length);
  });

  it("keeps every clause the profile declares omitted out of the document", () => {
    // Vacuous today (nothing is omitted) and deliberately so: this is the guard
    // that fires the day someone adds an omission without checking the composer.
    const omitted = new Set<SharedClauseId>(enterpriseProfile.omitClauses ?? []);
    const composed = headings();
    for (const clause of base) {
      if (omitted.has(clause.id)) expect(composed, clause.id).not.toContain(clause.heading);
    }
  });

  it("still prints every required clause even if a future edit tries to omit them", () => {
    const sabotaged = composeDocumentTerms(base, { ...enterpriseProfile, omitClauses: requiredClauseIds });
    expect([...sabotaged.droppedRequired].sort()).toEqual([...requiredClauseIds].sort());
    const overrides = enterpriseProfile.overrideClauses ?? {};
    const composed = sabotaged.terms.map((term) => term.heading);
    for (const id of requiredClauseIds) {
      const clause = base.find((candidate) => candidate.id === id);
      expect(composed, id).toContain(overrides[id]?.heading ?? clause?.heading);
    }
  });

  it("anchors each enterprise extra where the document reads it", () => {
    const composed = headings();
    expect(composed[0]).toBe("Master Services Agreement & Order Form");

    // The operating commitments cluster after change control, in declared order.
    expect(indexOf("Affiliates, Sites & Named Users")).toBeGreaterThan(indexOf("Change Control"));
    expect(indexOf("Service Level Commitment")).toBeGreaterThan(indexOf("Affiliates, Sites & Named Users"));
    expect(indexOf("Support, Escalation & Business Reviews")).toBeGreaterThan(indexOf("Service Level Commitment"));
    expect(indexOf("Confidentiality")).toBeGreaterThan(indexOf("Support, Escalation & Business Reviews"));

    // Security sits with breach notification, transition with data ownership,
    // insurance with indemnity, renewal with the auto-renewal statute.
    expect(indexOf("Information Security Program")).toBeGreaterThan(indexOf("Data Breach Notification"));
    expect(indexOf("Subprocessors & Data Location")).toBeGreaterThan(indexOf("Information Security Program"));
    expect(indexOf("Data Export & Transition Assistance")).toBeGreaterThan(indexOf("Client Data Ownership"));
    expect(indexOf("Insurance")).toBeGreaterThan(indexOf("Indemnification"));
    expect(indexOf("Renewal, True-Up & Fee Changes")).toBeGreaterThan(indexOf("California Auto-Renewal Law"));
    expect(indexOf("Assignment & Change of Control")).toBeGreaterThan(indexOf("Non-Solicitation"));
    expect(indexOf("Publicity & Reference Use")).toBeLessThan(indexOf("Severability"));

    // Nothing fell to the end for want of an anchor.
    expect(composed[composed.length - 1]).toBe("Proposal Validity");
  });

  it("gives every extra an enterprise-prefixed unique id", () => {
    const ids = (enterpriseProfile.extraClauses ?? []).map((extra) => extra.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith("enterprise.")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the two clauses that define this type", () => {
  it("states the MSA order of precedence and makes the proposal an Order Form", () => {
    const orderForm = clauseBody("Master Services Agreement & Order Form");
    expect(orderForm).toMatch(/Order Form/);
    expect(orderForm).toMatch(/Master Services Agreement/);
    expect(orderForm).toMatch(/no Master Services Agreement is in effect/i);

    const entire = clauseBody("Entire Agreement & Order of Precedence");
    expect(entire).toMatch(/order of precedence/i);
    // The ladder, in order: amendment, then MSA, then this proposal. Read from
    // the precedence sentence itself -- the clause names the MSA earlier, where
    // it says an executed one is part of the agreement.
    const ladder = entire.slice(entire.indexOf("order of precedence"));
    const amendment = ladder.indexOf("amendment");
    const msa = ladder.indexOf("executed Master Services Agreement");
    const proposal = ladder.indexOf("this proposal and the schedule");
    expect(amendment).toBeGreaterThan(-1);
    expect(msa).toBeGreaterThan(amendment);
    expect(proposal).toBeGreaterThan(msa);
    // Procurement boilerplate must not sneak in through an acknowledged PO.
    expect(entire).toMatch(/purchase orders?[^.]*have no effect/i);
    // Reworded, not contradicted: the shared clause's own promise survives.
    expect(entire).toMatch(/No change is binding unless in a writing signed by both parties/);
  });

  it("commits to availability and makes service credits the remedy", () => {
    const sla = clauseBody("Service Level Commitment");
    expect(sla).toMatch(/99\.5 percent/);
    expect(sla).toMatch(/5 percent of the monthly portion of the subscription fee/);
    expect(sla).toMatch(/the credit is 10 percent/);
    expect(sla).toMatch(/the credit is 15 percent/);
    expect(sla).toMatch(/sole and exclusive remedy/i);
    expect(sla).toMatch(/scheduled maintenance/i);
    expect(sla).toMatch(/emergency maintenance/i);
    expect(sla).toMatch(/force majeure/i);
    // A credit nobody can claim is not a remedy.
    expect(sla).toMatch(/within 30 days after the end of the affected month/);
    expect(sla).toMatch(/rolling twelve-month period/);

    // The AS IS disclaimer must not cancel the commitment it sits beside.
    const warranty = clauseBody("Warranty Disclaimer");
    expect(warranty).toMatch(/EXCEPT FOR THE SERVICE LEVEL COMMITMENT/);
    expect(warranty).toMatch(/AS IS AND AS AVAILABLE/);
  });

  it("carries the rest of the enterprise apparatus", () => {
    expect(clauseBody("Support, Escalation & Business Reviews")).toMatch(/Severity 1/);
    expect(clauseBody("Support, Escalation & Business Reviews")).toMatch(/business review each quarter/i);
    expect(clauseBody("Subprocessors & Data Location")).toMatch(/United States/);
    expect(clauseBody("Insurance")).toMatch(/[Cc]ertificates of insurance are provided on written request/);
    expect(clauseBody("Affiliates, Sites & Named Users")).toMatch(/included users and jobsites shown in the schedule/);
    expect(clauseBody("Assignment & Change of Control")).toMatch(/merger, acquisition/);
    expect(clauseBody("Publicity & Reference Use")).toMatch(/prior written consent/);
  });

  it("keeps renewal consistent with the shared California auto-renewal clause", () => {
    const renewal = clauseBody("Renewal, True-Up & Fee Changes");
    expect(renewal).toMatch(/California Auto-Renewal Law provision above control/);
    expect(renewal).toMatch(/true|actual usage/i);
    // The statute promises notice of a material change at least 30 days out;
    // the renewal quote must not be tighter than that.
    expect(renewal).toMatch(/at least 60 days before the renewal date/);
    expect(clauseBody("California Auto-Renewal Law")).toMatch(/at least 30 days in advance/);
  });

  it("extends data export instead of restating Client Data Ownership", () => {
    const transition = clauseBody("Data Export & Transition Assistance");
    const ownership = clauseBody("Client Data Ownership");
    expect(transition).toMatch(/Client Data Ownership above/);
    expect(transition).toMatch(/60 days/);
    // The shared clause keeps its own 30-day export; the extra must not fork it.
    expect(ownership).toMatch(/within 30 days/);
    expect(transition).not.toMatch(/within 30 days/);
  });
});

describe("claims this document must not make", () => {
  it("asserts no security certification as held", () => {
    for (const term of compose().terms) {
      expect(term.body, term.heading).not.toMatch(/\bSOC\s*-?\s*2\b/i);
      expect(term.body, term.heading).not.toMatch(/\bISO\s*\/?\s*IEC?\s*27001\b/i);
      expect(term.body, term.heading).not.toMatch(/\bHITRUST\b/i);
      expect(term.body, term.heading).not.toMatch(/\bFedRAMP\b/i);
    }
    // And says so in terms, rather than leaving the buyer to infer it.
    const security = clauseBody("Information Security Program");
    expect(security).toMatch(/does not represent that it holds any particular certification/i);
    expect(security).toMatch(/certifications Seller then holds/);
  });

  it("states no seat count, jobsite count, or insurance dollar figure", () => {
    for (const term of compose().terms) {
      expect(term.body, term.heading).not.toMatch(/\b\d[\d,]*\s+(named\s+)?(users|seats|licen[cs]es|jobsites|sites)\b/i);
      // Any currency amount of $1,000 or more, or a "million"-scale figure.
      expect(term.body, term.heading).not.toMatch(/\$\s*\d{1,3}(?:,\d{3})+/);
      expect(term.body, term.heading).not.toMatch(/\b\d[\d.,]*\s*(million|billion)\b/i);
    }
    const insurance = clauseBody("Insurance");
    expect(insurance).not.toMatch(/\$/);
    expect(insurance).not.toMatch(/\bper occurrence\b/i);
    expect(insurance).not.toMatch(/\baggregate\b/i);
    expect(insurance).toMatch(/This proposal states no coverage limit/);
  });

  it("restates no per-deal commercial term the seller sets in the editor", () => {
    const authored = authoredText().join("\n");
    for (const sentinel of Object.values(SENTINELS)) {
      expect(authored, sentinel).not.toContain(sentinel);
    }
    // The shared clauses still interpolate them, so nothing was lost either.
    const composed = compose()
      .terms.map((term) => term.body)
      .join("\n");
    for (const sentinel of Object.values(SENTINELS)) {
      expect(composed, sentinel).toContain(sentinel);
    }
  });

  it("writes plain ASCII, so no section symbol or smart punctuation reaches a PDF", () => {
    for (const text of authoredText()) {
      expect(text).toMatch(/^[\t\n\x20-\x7E]*$/);
      expect(text).not.toContain("§");
    }
  });

  it("speaks in the shared clause voice: declarative, third person, no marketing", () => {
    for (const text of authoredText()) {
      expect(text).not.toMatch(/\b(you|your|yours)\b/i);
      expect(text).not.toMatch(/\b(world[- ]class|best[- ]in[- ]class|cutting[- ]edge|industry[- ]leading|seamless|unparalleled)\b/i);
    }
  });
});

describe("enterprise lexicon", () => {
  it("names this type's own document, fee, scope, and term", () => {
    const lexicon = enterpriseProfile.lexicon;
    expect(enterpriseProfile.key).toBe("enterprise");
    for (const [field, value] of Object.entries(lexicon)) {
      expect(value.trim().length, field).toBeGreaterThan(0);
      expect(value, field).toMatch(/^[\x20-\x7E]*$/);
    }
    expect(lexicon.documentTitle).toMatch(/Enterprise/);
    expect(lexicon.documentTitle).toMatch(/Subscription/);
    // Mid-sentence noun: lower case, no leading article.
    expect(lexicon.engagementNoun).toMatch(/^[a-z]/);
    expect(lexicon.engagementNoun).not.toMatch(/^(a|an|the) /);
    // The warranty disclaimer's subject has to be the thing being disclaimed.
    expect(lexicon.warrantySubject).toMatch(/platform/i);
    expect(lexicon.unitNoun).toMatch(/subscription/i);
  });
});
