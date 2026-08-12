import { describe, expect, it } from "vitest";
import type { DocumentTermInputs } from "@/components/proposals/proposal-document-model";
import { packageData } from "../catalog";
import { composeDocumentTerms, requiredClauseIds } from "./contract";
import { platformProfile } from "./platform";
import { buildSharedClauses } from "./shared-clauses";

// Every assertion here is something that, broken, PRINTS on a client's
// subscription document: a missing limitation of liability, a renewal clause
// that contradicts the California statute two paragraphs below it, an Enterprise
// uptime promise this tier does not staff for, or a seat count frozen into prose
// that the schedule above it disagrees with.

/**
 * Commercial values arrive already interpolated from the seller's own fields, so
 * the stub only has to be shaped right — the profile never sets any of these.
 */
const inputs: DocumentTermInputs = {
  paymentTerms: "Net 30 from invoice date",
  lateFee: "Late balances accrue interest at 1.5% per month",
  aiData: "Client data is used to operate the platform and, in de-identified form, to improve its models.",
  ipRights: "Seller retains all rights in the platform. Client retains all rights in its own content.",
  liabilityCap: "THE FEES PAID IN THE 12 MONTHS PRECEDING THE CLAIM",
  governingLaw: "the State of Wisconsin",
  validDays: "30",
};

const base = buildSharedClauses(inputs);
const composed = composeDocumentTerms(base, platformProfile);
const headings = composed.terms.map((term) => term.heading);
const bodies = composed.terms.map((term) => term.body);
const at = (heading: string) => headings.indexOf(heading);
const bodyOf = (heading: string) => composed.terms[at(heading)]?.body ?? "";
const baseHeading = (id: string) => base.find((clause) => clause.id === id)?.heading ?? `<no clause ${id}>`;

/** Only the text this profile wrote — the shared set is pinned by its own suite. */
const authored: string[] = [
  ...(platformProfile.extraClauses ?? []).flatMap((clause) => [clause.heading, clause.body]),
  ...Object.values(platformProfile.overrideClauses ?? {}).flatMap((override) =>
    override ? [override.heading ?? "", override.body] : [],
  ),
];

const extraHeadings = [
  "Included Users & Jobsites",
  "Onboarding & Configuration",
  "Support & Maintenance",
  "Acceptable Use & Account Security",
  "Subscription Term & Renewal",
  "Renewal Pricing",
];

describe("platform lexicon", () => {
  it("names the document and the engagement as a subscription", () => {
    expect(platformProfile.key).toBe("platform");
    expect(platformProfile.lexicon.documentTitle).toBe("Platform Subscription Proposal");
    expect(platformProfile.lexicon.engagementNoun).toBe("this subscription");
    expect(platformProfile.lexicon.termHeading).toBe("Subscription Term");
  });

  it("fills every lexicon member, so nothing falls back to another type's wording", () => {
    for (const [member, value] of Object.entries(platformProfile.lexicon)) {
      expect(value.trim().length, member).toBeGreaterThan(0);
    }
  });
});

describe("composition", () => {
  it("drops no required clause", () => {
    expect(composed.droppedRequired).toEqual([]);
  });

  it("prints every required clause the company is protected by", () => {
    for (const id of requiredClauseIds) {
      expect(headings, id).toContain(baseHeading(id));
    }
  });

  it("adds the six terms a subscription sale actually raises", () => {
    for (const heading of extraHeadings) expect(headings, heading).toContain(heading);
  });

  it("omits Non-Solicitation and nothing else", () => {
    expect(headings).not.toContain("Non-Solicitation");
    expect(composed.terms).toHaveLength(base.length - 1 + extraHeadings.length);
  });
});

describe("anchoring", () => {
  it("groups the operational terms straight after the change clause", () => {
    expect(at("Changes to the Subscription")).toBeGreaterThan(-1);
    expect(headings.slice(at("Changes to the Subscription") + 1, at("Confidentiality"))).toEqual([
      "Included Users & Jobsites",
      "Onboarding & Configuration",
      "Support & Maintenance",
    ]);
  });

  it("states the renewal terms immediately before the California statute", () => {
    const ca = at("California Auto-Renewal Law");
    expect(ca).toBeGreaterThan(1);
    expect(headings[ca - 2]).toBe("Subscription Term & Renewal");
    expect(headings[ca - 1]).toBe("Renewal Pricing");
  });

  it("places acceptable use with the other protections of the platform itself", () => {
    expect(headings[at(baseHeading("trade_secrets")) + 1]).toBe("Acceptable Use & Account Security");
  });

  it("resolves every anchor — nothing fell through to the end of the document", () => {
    // composeDocumentTerms parks an extra whose anchor it could not find AFTER
    // Proposal Validity, so the last heading is the cheapest proof of a typo'd
    // or omitted anchor clause.
    expect(headings[headings.length - 1]).toBe("Proposal Validity");
  });
});

describe("agreement with the shared clause set", () => {
  it("does not contradict the California auto-renewal clause", () => {
    const renewal = bodyOf("Subscription Term & Renewal");
    expect(headings).toContain("California Auto-Renewal Law");
    // The statute's own duties: notice before charging, and a cancellation right
    // this profile's 30-day non-renewal window must not quietly narrow.
    expect(renewal).toContain("before it is charged");
    expect(renewal).toContain("Nothing in this section limits the cancellation rights");
    // Fee-change notice sits OUTSIDE the non-renewal window, not inside it.
    expect(bodyOf("Renewal Pricing")).toContain("at least 45 days");
    expect(renewal).toContain("at least 30 days");
  });

  it("keeps the SaaS tax clause, which is correct for this type", () => {
    expect(headings).toContain("Taxes & SaaS Fees");
  });

  it("coordinates data export with Client Data Ownership instead of duplicating it", () => {
    const ownership = bodyOf("Client Data Ownership");
    expect(ownership).toContain("Throughout the subscription term");
    // The shared on-termination window and deletion promise stay verbatim.
    expect(ownership).toContain("standard exportable format within 30 days");
    expect(ownership).toContain("securely deletes it from active systems");
    // Exactly one clause in the document carries the termination-export promise.
    expect(bodies.filter((body) => body.includes("exportable format"))).toHaveLength(1);
    expect(extraHeadings.filter((heading) => /export/i.test(heading))).toEqual([]);
  });

  it("restates the change clause without the suspend-the-client remedy", () => {
    expect(headings).not.toContain("Scope Changes");
    const changes = bodyOf("Changes to the Subscription");
    expect(changes).toContain("Verbal approvals are not binding");
    expect(changes).not.toMatch(/pause work/i);
  });
});

describe("stays distinguishable from the Enterprise profile", () => {
  it("carries no uptime commitment and no service credits", () => {
    const document = bodies.join("\n");
    expect(document).not.toMatch(/uptime|service credit|service[- ]level|\bSLA\b/i);
    expect(document).not.toMatch(/\d+(\.\d+)?\s?%\s*(availability|available)/i);
  });

  it("carries no MSA precedence apparatus", () => {
    expect(bodies.join("\n")).not.toMatch(/order of precedence|takes precedence|shall prevail|prevails over/i);
    // Enterprise's entire-agreement clause stacks MSA and SOW above the proposal;
    // this one is built on the signed order and says so.
    const entire = bodyOf("Entire Agreement");
    expect(entire).not.toMatch(/master services agreement|statement of work/i);
    expect(entire).toContain("signed order or subscription schedule");
  });

  it("promises support in hours and effort, not in percentages", () => {
    const support = bodyOf("Support & Maintenance");
    expect(support).toContain("standard business hours");
    expect(support).toContain("end of the next business day");
    expect(support).not.toMatch(/\d+(\.\d+)?\s?%/);
  });
});

describe("no commercial value is frozen into the prose", () => {
  it("names no seat or jobsite count anywhere in the document", () => {
    for (const body of bodies) expect(body).not.toMatch(/\b\d+\s*(users|seats|jobsites|sites)\b/i);
    // ...and says so the way the copy rule requires.
    expect(bodyOf("Included Users & Jobsites")).toContain("included users and jobsites shown in the schedule");
  });

  it("names no dollar figure or percentage in profile-authored text", () => {
    // Scoped to authored text: the shared payment clause's returned-check fee is
    // the seller's, set once for every proposal type, and not this profile's to
    // restate or remove.
    for (const text of authored) {
      expect(text).not.toMatch(/\$\s?\d/);
      expect(text).not.toMatch(/\d+(\.\d+)?\s?%/);
    }
  });

  it("names no tier, so a price-book rename cannot strand the terms", () => {
    const authoredText = authored.join("\n");
    for (const key of ["starter", "professional", "enterprise", "blacklabel"] as const) {
      expect(authoredText, key).not.toContain(packageData[key].name);
    }
    expect(authoredText).not.toMatch(/\b(starter|enterprise|black label)\b/i);
  });

  it("is plain ASCII, so the section symbol and smart quotes cannot reach a PDF", () => {
    for (const text of authored) expect(text, text.slice(0, 40)).toMatch(/^[\x20-\x7E\n]*$/);
  });
});
