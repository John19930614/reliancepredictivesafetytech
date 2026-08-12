import { describe, expect, it } from "vitest";
import type { DocumentTermInputs } from "@/components/proposals/proposal-document-model";
import { composeDocumentTerms, requiredClauseIds, type SharedClauseId } from "./contract";
import { buildSharedClauses } from "./shared-clauses";
import { fixedPriceProfile } from "./fixed-price";

// Every assertion here is something that, broken, prints on a signed client
// document: a fixed-price job with no deemed acceptance (open forever), a
// change-order boundary that never states when work starts, two review windows
// that disagree, or SaaS wording on a proposal that sells no platform.
//
// The stub's seller-supplied fields (aiData, ipRights, liabilityCap) are
// deliberately platform-free and currency-free, so the scans below measure this
// profile's own text rather than a fixture's word choice.
const inputs: DocumentTermInputs = {
  paymentTerms: "Net 30 from invoice date",
  lateFee: "Balances past due accrue 1.5% per month",
  aiData:
    "Seller uses AI-assisted drafting and review on Client materials solely to produce the deliverables in this engagement, and does not use Client data to train third-party models.",
  ipRights:
    "Seller retains ownership of its pre-existing materials, methods, and templates. Client receives rights in the final deliverables as stated in this proposal on payment in full.",
  liabilityCap: "THE TOTAL FEES PAID UNDER THIS PROPOSAL",
  governingLaw: "the State of Wisconsin",
  validDays: "30",
};

const base = buildSharedClauses(inputs);
const composed = composeDocumentTerms(base, fixedPriceProfile);
const headings = composed.terms.map((term) => term.heading);
const extras = fixedPriceProfile.extraClauses ?? [];
const extraHeadings = extras.map((extra) => extra.heading);

/** The heading a shared clause prints under in THIS profile (overrides rename). */
function headingFor(id: SharedClauseId): string {
  const shared = base.find((clause) => clause.id === id);
  if (!shared) throw new Error(`no shared clause with id ${id}`);
  return fixedPriceProfile.overrideClauses?.[id]?.heading ?? shared.heading;
}

function bodyOf(heading: string): string {
  const term = composed.terms.find((candidate) => candidate.heading === heading);
  if (!term) throw new Error(`composed document has no clause headed "${heading}"`);
  return term.body;
}

function extraById(id: string) {
  const extra = extras.find((candidate) => candidate.id === id);
  if (!extra) throw new Error(`profile has no extra clause ${id}`);
  return extra;
}

/** Only the strings this profile authored: extra clauses and overrides. */
const authoredText: string[] = [
  ...extras.flatMap((extra) => [extra.heading, extra.body]),
  ...Object.values(fixedPriceProfile.overrideClauses ?? {}).flatMap((override) =>
    override ? [override.heading ?? "", override.body] : [],
  ),
];

describe("fixed-price profile composition", () => {
  it("drops no required clause", () => {
    expect(composed.droppedRequired).toEqual([]);
  });

  it("still prints every required clause, under its own heading", () => {
    for (const id of requiredClauseIds) {
      expect(headings, id).toContain(headingFor(id));
    }
  });

  it("prints the fixed-price clauses in reading order: boundary, acceptance, revisions, money, change orders", () => {
    const order = [
      "Payment Terms",
      extraById("fixed.deliverables_define_scope").heading,
      extraById("fixed.acceptance").heading,
      extraById("fixed.revisions").heading,
      extraById("fixed.milestone_invoicing").heading,
      headingFor("scope_changes"),
      extraById("fixed.client_obligations").heading,
      extraById("fixed.regulatory_change").heading,
    ];
    const positions = order.map((heading) => headings.indexOf(heading));
    expect(positions).not.toContain(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // Contiguous: nothing shared wedges into the fixed-price run.
    expect(headings.slice(positions[0], positions[positions.length - 1] + 1)).toEqual(order);
  });

  it("omits only the clauses the profile declares, and the auto-renewal clause is gone", () => {
    expect(fixedPriceProfile.omitClauses).toEqual(["auto_renewal_ca"]);
    expect(headings).not.toContain("California Auto-Renewal Law");
    expect(composed.terms.some((term) => /auto-?renew/i.test(term.body))).toBe(false);
    // A "Taxes & SaaS Fees" heading on a proposal selling no SaaS is the same bug.
    expect(headings).not.toContain("Taxes & SaaS Fees");
    expect(headings).toContain("Taxes");
  });

  it("anchors every extra clause against the shared clause it names", () => {
    for (const extra of extras) {
      expect(extra.id.startsWith("fixed."), extra.id).toBe(true);
      const at = headings.indexOf(extra.heading);
      expect(at, extra.id).toBeGreaterThanOrEqual(0);

      if ("after" in extra.anchor) {
        const anchorAt = headings.indexOf(headingFor(extra.anchor.after));
        expect(at, extra.id).toBeGreaterThan(anchorAt);
        for (const between of headings.slice(anchorAt + 1, at)) {
          expect(extraHeadings, `${extra.id} drifted away from its anchor`).toContain(between);
        }
      } else if ("before" in extra.anchor) {
        const anchorAt = headings.indexOf(headingFor(extra.anchor.before));
        expect(at, extra.id).toBeLessThan(anchorAt);
        for (const between of headings.slice(at + 1, anchorAt)) {
          expect(extraHeadings, `${extra.id} drifted away from its anchor`).toContain(between);
        }
      } else {
        throw new Error(`${extra.id} is anchored by position; this profile anchors to clauses`);
      }
    }
  });

  it("gives every extra clause a unique id and heading", () => {
    expect(new Set(extras.map((extra) => extra.id)).size).toBe(extras.length);
    expect(new Set(extraHeadings).size).toBe(extras.length);
    expect(new Set(headings).size).toBe(headings.length);
  });

  it("makes every override actually change the shared text it replaces", () => {
    for (const [id, override] of Object.entries(fixedPriceProfile.overrideClauses ?? {})) {
      const shared = base.find((clause) => clause.id === id);
      expect(shared, id).toBeDefined();
      expect(override?.body, id).not.toBe(shared?.body);
    }
  });
});

describe("the two properties that define a fixed-price deal", () => {
  it("states deemed acceptance, so silence cannot hold the engagement open", () => {
    const acceptance = bodyOf(extraById("fixed.acceptance").heading);
    expect(acceptance).toMatch(/deemed accepted/);
    expect(acceptance).toMatch(/does not deliver a valid written rejection within the review period/);
    expect(acceptance).toMatch(/review period of 10 business days/);
    // A rejection has to be written, timely, and specific against the scope.
    expect(acceptance).toMatch(/in writing/);
    expect(acceptance).toMatch(/identifies the specific criterion stated for that deliverable in the scope/);
    expect(acceptance).toMatch(/general statement of dissatisfaction/);
    // Milestone billing hangs off acceptance, per billingTerm "Milestone-based".
    expect(bodyOf(extraById("fixed.milestone_invoicing").heading)).toMatch(
      /accepted or deemed accepted/,
    );
  });

  it("states the change-order boundary: the listed deliverables are the whole scope, and unsigned work does not start", () => {
    const boundary = bodyOf(extraById("fixed.deliverables_define_scope").heading);
    expect(boundary).toMatch(/the fixed price is the entire professional fee for those deliverables and nothing else/);
    expect(boundary).toMatch(/proceeds as a change order/);

    const changeOrders = bodyOf(headingFor("scope_changes"));
    expect(changeOrders).toMatch(
      /Work outside the deliverables listed in the scope does not begin until a change order covering it is signed/,
    );
    expect(changeOrders).toMatch(/signed by both parties/);
    expect(changeOrders).toMatch(/Verbal approvals/);
    // Reworded off the platform vocabulary the shared clause used.
    expect(changeOrders).not.toMatch(/sites, users, modules/);
  });
});

describe("internal consistency of the stated periods", () => {
  it("gives a resubmitted deliverable the same review window as a first submission", () => {
    const acceptance = bodyOf(extraById("fixed.acceptance").heading);
    const revisions = bodyOf(extraById("fixed.revisions").heading);

    const windows = (text: string) => [...text.matchAll(/(\d+)\s+business days?/g)].map((match) => match[1]);
    expect(windows(acceptance).length).toBeGreaterThan(0);
    expect(windows(revisions).length).toBeGreaterThan(0);
    expect(new Set([...windows(acceptance), ...windows(revisions)])).toEqual(new Set(["10"]));
    expect(revisions).toMatch(/same review period of 10 business days/);
  });

  it("states one business-day period across everything this profile authored", () => {
    const stated = new Set(
      authoredText.flatMap((text) => [...text.matchAll(/(\d+)\s+business days?/g)].map((match) => match[1])),
    );
    expect(stated).toEqual(new Set(["10"]));
  });

  it("counts the included revision rounds once, and sends the next round to a change order", () => {
    const revisions = bodyOf(extraById("fixed.revisions").heading);
    expect(revisions).toMatch(/includes two rounds of revision/);
    expect(revisions).toMatch(/A third or later round of revision on the same deliverable[^.]*proceeds as a change order/);
  });
});

describe("what a fixed-price document must never say", () => {
  it("carries no platform-subscription language in any composed clause", () => {
    // packageKey is "none" for fixed_price: there is no platform in this deal and
    // nothing recurring, so none of this may survive composition.
    const forbidden = [
      /\bSaaS\b/i,
      /\bplatform\b/i,
      /\bsubscription\b/i,
      /auto-?renew/i,
      /renewal term/i,
      /error-free/i,
      /as available/i,
      /\bper user\b/i,
      /\bseat\b/i,
    ];
    for (const term of composed.terms) {
      for (const pattern of forbidden) {
        expect(pattern.test(term.body), `${term.heading} matched ${pattern}`).toBe(false);
      }
    }
  });

  it("hardcodes no commercial value the seller sets per deal", () => {
    for (const text of authoredText) {
      expect(text).not.toMatch(/\$\s?\d/);
      expect(text).not.toMatch(/\bdollars?\b/i);
      // Payment terms, late fee, liability cap, governing law and validity days
      // are interpolated into the SHARED clauses from the seller's own fields.
      expect(text).not.toMatch(/\bnet\s+\d+\b/i);
      expect(text).not.toMatch(/\d+\s*%/);
      expect(text).not.toMatch(/\bcalendar days\b/i);
    }

    // The only currency in the composed document is inherited, not authored
    // here: the shared returned-check fee and the seller's own liability cap.
    const withCurrency = composed.terms.filter((term) => /\$/.test(term.body)).map((term) => term.heading);
    expect(withCurrency).toEqual(["Payment Terms"]);
  });

  it("keeps authored text plain ASCII, including sec. rather than the section symbol", () => {
    for (const text of authoredText) {
      const offender = [...text].find((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) > 0x7e);
      expect(offender, `non-ASCII character in: ${text.slice(0, 60)}`).toBeUndefined();
    }
    expect(bodyOf("OSHA Compliance Disclaimer")).toMatch(/29 U\.S\.C\. sec\.651/);
  });

  it("never speaks to the client in the second person", () => {
    for (const text of authoredText) {
      expect(text, text.slice(0, 60)).not.toMatch(/\b(you|your|yours)\b/i);
    }
  });
});

describe("lexicon", () => {
  it("names the document, the fee, and the unit of work for a deliverables deal", () => {
    const { lexicon } = fixedPriceProfile;
    expect(fixedPriceProfile.key).toBe("fixed_price");
    expect(lexicon.documentTitle).toBe("Fixed-Price Services Proposal");
    expect(lexicon.unitNoun).toBe("deliverable");
    expect(lexicon.warrantySubject).toBe("the deliverables and services");
    for (const value of Object.values(lexicon)) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(value).not.toMatch(/\bplatform\b|\bsubscription\b/i);
    }
  });

  it("does not reuse a heading the rendered document already prints", () => {
    // ProposalDocument.tsx already has a "Deliverables" section; the scope
    // heading sits over the scope of each priced line, not beside that section.
    expect(fixedPriceProfile.lexicon.scopeHeading).not.toBe("Deliverables");
  });
});

describe("coordination with the seller-controlled IP clause", () => {
  it("subordinates the work-product license instead of contradicting it", () => {
    const license = bodyOf(extraById("fixed.work_product_license").heading);
    expect(license).toMatch(/On payment in full of the fixed price/);
    expect(license).toMatch(/perpetual, non-exclusive, non-transferable license/);
    expect(license).toMatch(
      /adds to the Intellectual Property terms stated above and does not limit them; if the two conflict, the Intellectual Property terms govern/,
    );
    // It prints immediately after the clause it defers to.
    expect(headings.indexOf(extraById("fixed.work_product_license").heading)).toBe(
      headings.indexOf(headingFor("intellectual_property")) + 1,
    );
  });
});
