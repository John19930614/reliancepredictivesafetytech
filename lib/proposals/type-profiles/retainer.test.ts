import { describe, expect, it } from "vitest";
import type { DocumentTermInputs } from "@/components/proposals/proposal-document-model";
import { composeDocumentTerms, requiredClauseIds, type SharedClauseId } from "./contract";
import { retainerProfile } from "./retainer";
import { buildSharedClauses } from "./shared-clauses";

// These terms print on a signed client document. The invariants below are the
// ones that, broken, either cost the company money (an ambiguous rollover, a
// designation nobody meant to accept) or embarrass it (a consulting retainer
// that disclaims the uptime of a platform it is not selling).

/**
 * A seller's per-deal commercial fields, filled the way the editor fills them.
 * Deliberately free of platform wording: the four interpolated bodies
 * (payment terms, AI/data, IP, liability cap) come from the seller, not from
 * this profile, so the regression sweep below is measuring the profile's own
 * choices rather than a stub that flatters them.
 */
const stubInputs: DocumentTermInputs = {
  paymentTerms: "Invoiced monthly in advance, net 30 from invoice date",
  lateFee: "Past-due balances accrue interest at 1.5% per month",
  aiData:
    "Seller may use AI-assisted analysis to prepare drafts and summaries. Client data is not used to train third-party models, and AI output is reviewed by a qualified safety professional before it is delivered to Client.",
  ipRights:
    "Seller retains ownership of its methodologies, frameworks, and templates. Client receives a perpetual, non-exclusive license to use written advisory output delivered under this agreement for its internal safety purposes.",
  liabilityCap: "THE FEES PAID BY CLIENT IN THE TWELVE MONTHS PRECEDING THE CLAIM",
  governingLaw: "the State of Wisconsin",
  validDays: "30",
};

function compose() {
  return composeDocumentTerms(buildSharedClauses(stubInputs), retainerProfile);
}

const headings = () => compose().terms.map((term) => term.heading);
const bodies = () => compose().terms.map((term) => term.body);
const indexOf = (heading: string) => headings().indexOf(heading);

/** Only the text this profile actually authors: its overrides and its extras. */
function profileAuthoredBodies(): { label: string; body: string }[] {
  const overrides = Object.entries(retainerProfile.overrideClauses ?? {}).map(([id, value]) => ({
    label: `override ${id}`,
    body: (value as { body: string }).body,
  }));
  const extras = (retainerProfile.extraClauses ?? []).map((extra) => ({
    label: extra.id,
    body: extra.body,
  }));
  return [...overrides, ...extras];
}

describe("retainer profile shape", () => {
  it("is the retainer type and names itself as an advisory retainer, not a platform", () => {
    expect(retainerProfile.key).toBe("retainer");
    expect(retainerProfile.lexicon.documentTitle).toBe("Safety Advisory Retainer");
    // The subject of the warranty and outcome disclaimers. "the platform and
    // services" is the exact wrong answer for a type with packageKey "none".
    expect(retainerProfile.lexicon.warrantySubject).toBe("the advisory services");
    // A retainer is bought by the month, not the seat or the session.
    expect(retainerProfile.lexicon.unitNoun).toBe("month");
    for (const value of Object.values(retainerProfile.lexicon)) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives every extra clause a 'retainer.'-prefixed unique id", () => {
    const ids = (retainerProfile.extraClauses ?? []).map((extra) => extra.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id.startsWith("retainer.")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never lists a required clause among its omissions", () => {
    const omitted = new Set<SharedClauseId>(retainerProfile.omitClauses ?? []);
    for (const id of requiredClauseIds) expect(omitted.has(id), id).toBe(false);
  });
});

describe("retainer composition", () => {
  it("drops no required clause", () => {
    expect(compose().droppedRequired).toEqual([]);
  });

  it("still prints every required clause, under its own or its reworded heading", () => {
    const base = buildSharedClauses(stubInputs);
    const overrides = retainerProfile.overrideClauses ?? {};
    const printed = headings();
    for (const id of requiredClauseIds) {
      const shared = base.find((clause) => clause.id === id);
      expect(shared, id).toBeDefined();
      const expected = overrides[id]?.heading ?? shared!.heading;
      expect(printed, id).toContain(expected);
    }
  });

  it("omits Client Data Ownership - the hosted-data clause this type replaces", () => {
    expect(headings()).not.toContain("Client Data Ownership");
    // ...and does not simply lose the subject matter with it.
    expect(headings()).toContain("Engagement Records and Access");
  });

  it("prints all eight retainer-specific headings", () => {
    expect(headings()).toEqual(
      expect.arrayContaining([
        "Included Advisory Capacity",
        "Capacity Overage",
        "Availability and Response Times",
        "Project Work Quoted Separately",
        "Engagement Records and Access",
        "Seller Is Not Competent Person or Safety Manager of Record",
        "Assigned Advisor and Substitution",
        "Minimum Term, Notice, and Partial Months",
      ]),
    );
  });

  it("lands the full document: 27 shared clauses, less one omission, plus eight extras", () => {
    expect(compose().terms).toHaveLength(27 - 1 + 8);
  });

  it("anchors each extra where a reader expects to find it", () => {
    const capacity = indexOf("Included Advisory Capacity");
    const overage = indexOf("Capacity Overage");
    const availability = indexOf("Availability and Response Times");

    // Money first: payment terms, then what the money buys, then its edges.
    expect(capacity).toBe(indexOf("Payment Terms") + 1);
    expect(overage).toBe(capacity + 1);
    expect(availability).toBe(overage + 1);

    // The project boundary reads as the exception to Scope Changes.
    expect(indexOf("Project Work Quoted Separately")).toBe(indexOf("Scope Changes") + 1);
    // The records clause takes the omitted clause's old slot. Heading read from
    // the shared library rather than retyped, so a punctuation change there
    // cannot turn this into a false failure.
    const tradeSecrets = buildSharedClauses(stubInputs).find((clause) => clause.id === "trade_secrets")!.heading;
    expect(indexOf("Engagement Records and Access")).toBe(indexOf(tradeSecrets) + 1);
    // The designation clause extends the OSHA disclaimer immediately above it.
    expect(indexOf("Seller Is Not Competent Person or Safety Manager of Record")).toBe(
      indexOf("OSHA Compliance Disclaimer") + 1,
    );
    expect(indexOf("Assigned Advisor and Substitution")).toBe(indexOf("Independent Contractor") + 1);
    expect(indexOf("Minimum Term, Notice, and Partial Months")).toBe(indexOf("Termination") + 1);

    // Nothing fell to the end for want of a valid anchor.
    expect(headings().at(-1)).toBe("Proposal Validity");
  });
});

/* -------------------------------------------------------------------------- */
/* The two clauses that carry this engagement                                  */
/* -------------------------------------------------------------------------- */

describe("the rollover position is unambiguous", () => {
  const capacity = () => compose().terms.find((term) => term.heading === "Included Advisory Capacity");

  it("is present and takes a side on carryover rather than leaving it open", () => {
    const body = capacity()?.body ?? "";
    expect(body).toContain("carries forward into the immediately following month only");
    expect(body).toContain("expires");
    // No banking across months, and no second bite at a carried hour.
    expect(body).toContain("does not carry a second time");
    // Current month burns first, so a carried balance cannot be gamed.
    expect(body).toContain("consumed before any carried-forward balance");
  });

  it("closes the three ways a client argues unused time is worth cash", () => {
    const body = capacity()?.body ?? "";
    expect(body).toContain("not refundable");
    expect(body).toContain("not creditable against project fees");
    expect(body).toContain("expires on the effective date of termination or non-renewal");
  });

  it("routes excess work to the schedule's rates or a signed uplift, never to a surprise invoice", () => {
    const body = compose().terms.find((term) => term.heading === "Capacity Overage")?.body ?? "";
    expect(body).toContain("the hourly rates shown in the schedule");
    expect(body).toContain("written uplift");
    expect(body).toContain("does not bill overage it did not flag in advance");
  });
});

describe("Seller is not the Competent Person", () => {
  const clause = () =>
    compose().terms.find((term) => term.heading === "Seller Is Not Competent Person or Safety Manager of Record");

  it("refuses the designation, names what it would take to accept it, and blocks accidental assumption", () => {
    const body = clause()?.body ?? "";
    expect(body).toContain("is not Client's Competent Person");
    expect(body).toContain("safety manager or safety director of record");
    expect(body).toContain("unless a separate written agreement identifies Seller in that role");
    expect(body).toContain("does not by itself create any of those designations");
    // Multi-employer citation doctrine is the live exposure for an advisor.
    expect(body).toContain("controlling, creating, exposing, or correcting employer");
  });

  it("states the non-delegable duty once, in the OSHA clause, rather than twice", () => {
    const osha = compose().terms.find((term) => term.heading === "OSHA Compliance Disclaimer")?.body ?? "";
    expect(osha).toContain("non-delegable");
    expect(osha).toContain("supplements Client's safety program and does not replace it");
    // The designation clause must not restate it - one idea, one section.
    expect(clause()?.body ?? "").not.toContain("non-delegable");
  });
});

/* -------------------------------------------------------------------------- */
/* Regressions                                                                 */
/* -------------------------------------------------------------------------- */

describe("no platform-subscription language survives", () => {
  // packageKey is "none": this proposal sells advisory time, not software. Any
  // of these words on the page is a clause that was copied and not read.
  const banned = [
    "saas",
    "software as a service",
    "platform",
    "subscription",
    "error-free",
    "as available",
    "modules",
    "seats",
    "uptime",
    "per user",
  ];

  it("appears in no composed clause body", () => {
    for (const term of compose().terms) {
      for (const word of banned) {
        expect(term.body.toLowerCase(), `${term.heading} / "${word}"`).not.toContain(word);
      }
    }
  });

  it("appears in no composed clause heading", () => {
    for (const heading of headings()) {
      for (const word of banned) {
        expect(heading.toLowerCase(), `"${word}"`).not.toContain(word);
      }
    }
  });

  it("keeps the auto-renewal clause, because a month-to-month retainer really does auto-renew", () => {
    const body = compose().terms.find((term) => term.heading === "Automatic Renewal Notice")?.body ?? "";
    expect(body).toContain("continues from month to month");
    expect(body).toContain("which is an automatic renewal");
    expect(body).toContain("cancel automatic renewal by written notice at any time");
    expect(body).toContain("sec.17600-17606");
  });
});

describe("commercial values stay in the schedule", () => {
  // A clause that hardcodes a rate, a fee, or an hour count overrides what the
  // seller priced in the editor and prints a contradiction on the document.
  // Scoped to text THIS profile writes: the shared payment-terms clause carries
  // a pre-existing $50 returned-check fee, and breach notification a 72-hour
  // window, neither of which this profile authored or may quietly restate.
  const dollars = /\$\s?\d/;
  const hourCount = /\b\d+(\.\d+)?\s*(hours?|hrs?)\b/i;

  it("states no dollar figure", () => {
    for (const { label, body } of profileAuthoredBodies()) {
      expect(dollars.test(body), label).toBe(false);
    }
  });

  it("states no hour count", () => {
    for (const { label, body } of profileAuthoredBodies()) {
      expect(hourCount.test(body), label).toBe(false);
    }
  });

  it("points at the schedule for the fee and the rates instead", () => {
    // Lowercased: these phrases open a sentence in one clause and sit
    // mid-sentence in another, and the profile is entitled to capitalize.
    const authored = profileAuthoredBodies()
      .map((entry) => entry.body)
      .join(" ")
      .toLowerCase();
    expect(authored).toContain("the monthly commitment shown in the schedule");
    expect(authored).toContain("the hourly rates shown in the schedule");
    expect(authored).toContain("the initial term shown in the schedule");
  });

  it("keeps the procedural periods it is allowed to fix", () => {
    const term = compose().terms.find((entry) => entry.heading === "Minimum Term, Notice, and Partial Months");
    expect(term?.body).toContain("30 days' written notice");
    expect(term?.body).toContain("15 days' written notice");
    // A partial month already begun is not refunded. Stated, not implied.
    expect(term?.body).toContain("is not refundable or prorated");
  });
});

describe("clause voice", () => {
  it("never addresses the client in the second person", () => {
    const secondPerson = /\b(you|your|yours|yourself)\b/i;
    for (const term of compose().terms) {
      expect(secondPerson.test(term.body), term.heading).toBe(false);
    }
  });

  it("is honest about a small firm's availability", () => {
    const body = compose().terms.find((term) => term.heading === "Availability and Response Times")?.body ?? "";
    expect(body).toContain("does not provide around-the-clock coverage");
    expect(body).toContain("does not place Seller on call outside business hours");
    // "Urgent" is defined, not left to the requester's adjective.
    expect(body).toContain("A request is urgent when");
    expect(body).toContain("After-hours and emergency incident response is a separate engagement");
  });

  it("agrees with the transaction template that project work is quoted separately", () => {
    const body = compose().terms.find((term) => term.heading === "Project Work Quoted Separately")?.body ?? "";
    expect(body).toContain("does not draw on the monthly commitment");
    expect(body).toContain("project work begins only after Client accepts that quote in writing");
  });
});
