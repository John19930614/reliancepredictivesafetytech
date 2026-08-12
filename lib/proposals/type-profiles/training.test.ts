// What a training document must say, and what it must never say again.
//
// The forbidden-substring scan below is the reason this whole feature exists: a
// training proposal used to print "Taxes & SaaS Fees", "THE PLATFORM AND
// SERVICES ARE PROVIDED AS IS" and California's SaaS auto-renewal statute for a
// class held in a jobsite trailer. The stub feeds buildSharedClauses the REAL
// documentTermDefaults, so these assertions run against the text that actually
// ships rather than against a convenient fake.

import { describe, expect, it } from "vitest";
import { documentTermDefaults, type DocumentTermInputs } from "@/components/proposals/proposal-document-model";
import { composeDocumentTerms, sharedClauseIds, type SharedClauseId } from "./contract";
import { buildSharedClauses } from "./shared-clauses";
import { trainingProfile } from "./training";

const termInputs: DocumentTermInputs = {
  paymentTerms: documentTermDefaults.paymentTerms,
  lateFee: documentTermDefaults.lateFee,
  aiData: documentTermDefaults.aiData,
  ipRights: documentTermDefaults.ipRights,
  liabilityCap: documentTermDefaults.liabilityCap,
  governingLaw: documentTermDefaults.governingLaw,
  validDays: documentTermDefaults.validDays,
};

const composed = composeDocumentTerms(buildSharedClauses(termInputs), trainingProfile);
const headings = composed.terms.map((term) => term.heading);
const bodies = composed.terms.map((term) => term.body);

const extras = trainingProfile.extraClauses ?? [];
const overrides = Object.entries(trainingProfile.overrideClauses ?? {}) as [
  SharedClauseId,
  { heading?: string; body: string },
][];

/**
 * Everything this profile WROTE — the clauses it is answerable for.
 *
 * Two composed bodies are excluded on purpose: "Data and AI Use" and
 * "Intellectual Property" are verbatim seller fields (the asset's aiData and
 * ipRights selects), so their wording is a per-deal commercial choice, not a
 * profile decision. Scanning them for platform vocabulary would fail this suite
 * for text no profile can reach.
 */
const authored = [
  ...extras.map((clause) => `${clause.heading}\n${clause.body}`),
  ...overrides.map(([, clause]) => `${clause.heading ?? ""}\n${clause.body}`),
];

function bodyOf(heading: string): string {
  const term = composed.terms.find((candidate) => candidate.heading === heading);
  if (!term) throw new Error(`no composed clause headed "${heading}"`);
  return term.body;
}

describe("trainingProfile — composition", () => {
  it("keeps every required clause", () => {
    // A non-empty droppedRequired means the profile tried to delete a term that
    // protects the company. There is no acceptable value but [].
    expect(composed.droppedRequired).toEqual([]);
  });

  it("drops the auto-renewal clause and nothing else", () => {
    // Training sells sessions, not a renewing subscription: transaction-templates
    // gives this type packageKey "none".
    expect(trainingProfile.omitClauses).toEqual(["auto_renewal_ca"]);
    expect(headings).not.toContain("California Auto-Renewal Law");
    expect(composed.terms).toHaveLength(sharedClauseIds.length - 1 + extras.length);
  });

  it("prints the training operations block between Scope Changes and Confidentiality", () => {
    const start = headings.indexOf("Scope Changes");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(headings.slice(start + 1, start + 10)).toEqual([
      "Class Size and Minimum Billing",
      "Cancellation and Rescheduling",
      "Attendee No-Shows and Late Arrival",
      "Attendance Roster",
      "Certification and Cards",
      "Attendee Prerequisites",
      "Client-Provided Training Facilities",
      "Instructor Assignment",
      "Travel for On-Site Delivery",
    ]);
    expect(headings[start + 10]).toBe("Confidentiality");
  });

  it("anchors the two qualifying clauses to the shared clauses they qualify", () => {
    expect(headings[headings.indexOf("Intellectual Property") + 1]).toBe("Course Materials");
    expect(headings[headings.indexOf("Client Data Ownership") + 1]).toBe("Training Records and Retention");
  });

  it("places every extra clause, so none falls to the end of the document", () => {
    // composeDocumentTerms parks an extra whose anchor was omitted after
    // Proposal Validity rather than dropping it. Proposal Validity still being
    // last proves every anchor resolved.
    expect(headings[headings.length - 1]).toBe("Proposal Validity");
    for (const clause of extras) expect(headings).toContain(clause.heading);
  });

  it("anchors extras to shared clauses that survive this profile", () => {
    const omitted = new Set<string>(trainingProfile.omitClauses ?? []);
    const known = new Set<string>(sharedClauseIds);
    for (const clause of extras) {
      expect(clause.id.startsWith("training.")).toBe(true);
      const anchor = clause.anchor;
      const target = "after" in anchor ? anchor.after : "before" in anchor ? anchor.before : null;
      if (target === null) continue;
      expect(known.has(target)).toBe(true);
      expect(omitted.has(target)).toBe(false);
    }
    expect(new Set(extras.map((clause) => clause.id)).size).toBe(extras.length);
  });
});

describe("trainingProfile — no platform language survives (the regression)", () => {
  // Every one of these is text a training proposal printed before this profile
  // existed, or text that would only be true of a software subscription.
  const forbidden = [
    "saas",
    "the platform and services are provided as is",
    "the platform will be error-free",
    "the platform supports safety management",
    "this platform is a safety management support tool",
    "misuse of the platform",
    "the platform as provided",
    "taxes & saas fees",
    "platform package",
    "platform access",
    "subscription fee",
    "included users",
    "included jobsites",
    "auto-renewal",
    "auto-renews",
    "sec.17600",
    "digital services",
    "sites, users, modules",
    "error-free",
  ];

  it("no composed clause body contains platform-subscription language", () => {
    for (const forbiddenText of forbidden) {
      const offenders = composed.terms
        .filter((term) => term.body.toLowerCase().includes(forbiddenText))
        .map((term) => term.heading);
      expect({ forbiddenText, offenders }).toEqual({ forbiddenText, offenders: [] });
    }
  });

  it("would still catch the old document — the scan is not vacuous", () => {
    // Same shared clauses, same scan, no profile: this is what a training
    // proposal printed before trainingProfile existed. If this ever passes, the
    // forbidden list has stopped describing the bug.
    const unprofiled = composeDocumentTerms(buildSharedClauses(termInputs), {
      key: "training",
      lexicon: trainingProfile.lexicon,
    });
    const tripped = forbidden.filter((forbiddenText) =>
      unprofiled.terms.some((term) => term.body.toLowerCase().includes(forbiddenText)),
    );
    expect(tripped).toContain("saas");
    expect(tripped).toContain("the platform and services are provided as is");
    expect(tripped).toContain("this platform is a safety management support tool");
    expect(tripped.length).toBeGreaterThanOrEqual(8);
  });

  it("no composed clause heading contains platform-subscription language", () => {
    for (const heading of headings) {
      expect(heading.toLowerCase()).not.toContain("saas");
      expect(heading.toLowerCase()).not.toContain("platform");
    }
  });

  it("no clause this profile authored says platform, subscription, or module", () => {
    for (const text of authored) {
      expect(text).not.toMatch(/\b(platform|platforms|saas|subscription|subscriptions|module|modules)\b/i);
    }
  });

  it("the lexicon names training, not software", () => {
    const lexicon = trainingProfile.lexicon;
    expect(trainingProfile.key).toBe("training");
    for (const value of Object.values(lexicon)) {
      expect(value.trim().length).toBeGreaterThan(0);
      expect(value).not.toMatch(/\b(platform|saas|subscription)\b/i);
    }
    expect(lexicon.warrantySubject).toBe("the training services");
    expect(lexicon.unitNoun).toBe("session");
    expect(lexicon.documentTitle).toBe("Training Services Proposal");
  });
});

describe("trainingProfile — no per-deal commercials baked into the terms", () => {
  it("names no dollar figure and no attendee count", () => {
    for (const text of authored) {
      // Prices, session fees and expense rates belong to the schedule, which is
      // printed from the proposal's own line items.
      expect(text).not.toMatch(/\$\s?\d/);
      expect(text).not.toMatch(/\b\d[\d,]*\s*(?:dollars|usd)\b/i);
      // Class sizes are per course and per room; the clause states the rule and
      // sends the reader to the schedule for the numbers.
      expect(text).not.toMatch(/\b\d+\s*(?:attendees?|participants?|students?|seats?|people|persons?)\b/i);
      expect(text).not.toMatch(/\bup to \d/i);
    }
  });

  it("points at the schedule wherever a per-deal number belongs", () => {
    // The six-participant floor is a stated commercial term, not a per-deal
    // number, so it lives in the clause rather than pointing at the schedule.
    expect(bodyOf("Class Size and Minimum Billing")).toContain("minimum of six participants");
    expect(bodyOf("Class Size and Minimum Billing")).toContain("billed on the confirmed roster");
    expect(bodyOf("Travel for On-Site Delivery")).toContain("travel and expense lines shown in the schedule");
    expect(bodyOf("Attendee No-Shows and Late Arrival")).toContain("at the rate shown in the schedule");
  });

  it("keeps percentages inside the cancellation clause, where a training vendor states them", () => {
    const withPercent = extras.filter((clause) => clause.body.includes("%")).map((clause) => clause.id);
    expect(withPercent).toEqual(["training.cancellation"]);
    for (const [, clause] of overrides) expect(clause.body).not.toContain("%");
  });

  it("states cancellation tiers that do not overlap or leave a gap", () => {
    const cancellation = bodyOf("Cancellation and Rescheduling");
    expect(cancellation).toContain("at least 10 business days");
    expect(cancellation).toContain("5 to 9 business days");
    expect(cancellation).toContain("fewer than 5 business days");
    expect(cancellation).toContain("50%");
    expect(cancellation).toContain("100%");
    // A late cancellation cannot cost less than an earlier one.
    expect(cancellation.indexOf("50%")).toBeLessThan(cancellation.indexOf("100%"));
  });

  it("writes plain ASCII, so the PDF and DOCX renderers cannot disagree about a glyph", () => {
    for (const text of authored) expect(text).toMatch(/^[\x20-\x7E\n]*$/);
  });
});

describe("trainingProfile — the terms a training deal actually needs", () => {
  it("reworded the required clauses into training language", () => {
    expect(bodyOf("Warranty Disclaimer")).toContain("THE TRAINING SERVICES AND COURSE MATERIALS ARE PROVIDED AS IS");
    expect(bodyOf("Warranty Disclaimer")).toContain("instructor qualified for that course");
    expect(bodyOf("OSHA Compliance Disclaimer")).toContain("29 U.S.C. sec.651");
    expect(bodyOf("OSHA Compliance Disclaimer")).toContain("Competent Person");
    expect(bodyOf("Indemnification")).toContain("roster information");
    expect(bodyOf("No Guarantee of Outcome")).toContain("29 C.F.R. Parts 1903, 1904, 1910, and 1926");
  });

  it("bills the seat, not the attendance", () => {
    const noShow = bodyOf("Attendee No-Shows and Late Arrival");
    expect(noShow).toContain("billed whether or not the attendee appears");
    expect(noShow).toContain("substitute a different attendee");
    expect(noShow).toContain("full published contact hours");
  });

  it("makes Client answerable for the roster the cards are printed from", () => {
    const roster = bodyOf("Attendance Roster");
    expect(roster).toContain("full legal name");
    expect(roster).toContain("3 business days");
    expect(roster).toContain("responsible for its accuracy");
  });

  it("says who issues a Department of Labor card, and what a card is not", () => {
    const certification = bodyOf("Certification and Cards");
    expect(certification).toContain("OSHA Training Institute Education Center");
    expect(certification).toContain("which Seller does not control");
    expect(certification).toContain("two years from the date of completion");
    expect(certification).toContain("Replacement or duplicate cards");
    expect(certification).toMatch(/not a determination that the holder is competent, qualified, or authorized/);
  });

  it("sets attendee prerequisites for language, PPE, hands-on fitness, and age", () => {
    const prerequisites = bodyOf("Attendee Prerequisites");
    expect(prerequisites).toContain("delivered in English");
    expect(prerequisites).toContain("personal protective equipment");
    expect(prerequisites).toContain("physically able to perform");
    expect(prerequisites).toContain("minimum age");
    expect(prerequisites).toContain("29 C.F.R. sec.1910.178");
  });

  it("puts the room, the power, the AV and the practical area on Client", () => {
    const facilities = bodyOf("Client-Provided Training Facilities");
    expect(facilities).toContain("projection surface or display");
    expect(facilities).toContain("clear practical area");
    expect(facilities).toContain("site access");
    expect(facilities).toContain("Cancellation and Rescheduling terms apply");
  });

  it("reserves instructor substitution and denies a named-individual commitment", () => {
    const instructor = bodyOf("Instructor Assignment");
    expect(instructor).toContain("equally qualified instructor");
    expect(instructor).toContain("not a commitment to a named individual");
  });

  it("retains completion records instead of deleting them 30 days after termination", () => {
    // The shared Client Data Ownership clause promises deletion; the retention
    // clause promises reissue. They have to be reading the same rule.
    expect(bodyOf("Client Data Ownership")).toContain("except for the attendance and completion records");
    const records = bodyOf("Training Records and Retention");
    expect(records).toContain("5 years from the session date");
    expect(records).toContain("29 C.F.R. sec.1910.178(l)(6)");
  });

  it("agrees with the training template's own exclusions prose", () => {
    // transaction-templates.ts:310 promises Client-provided facilities, rosters
    // confirmed before each session, cards only on completion, and travel billed
    // from the schedule. Each has a clause standing behind it.
    expect(headings).toContain("Client-Provided Training Facilities");
    expect(headings).toContain("Attendance Roster");
    expect(headings).toContain("Certification and Cards");
    expect(headings).toContain("Travel for On-Site Delivery");
    expect(bodies.join("\n")).toContain("completes a course and meets its requirements");
  });
});
