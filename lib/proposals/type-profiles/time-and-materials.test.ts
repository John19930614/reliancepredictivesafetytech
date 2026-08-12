import { describe, expect, it } from "vitest";
import type { DocumentTermInputs } from "@/components/proposals/proposal-document-model";
import { composeDocumentTerms, requiredClauseIds } from "./contract";
import { buildSharedClauses } from "./shared-clauses";
import { timeAndMaterialsProfile } from "./time-and-materials";

// These assertions are about a document a client signs. The one that matters
// most is the estimate/cap test: a T&M proposal whose terms let a reader believe
// the printed total is a ceiling has already lost the argument it will later
// have over an invoice.

/**
 * Stands in for the seller's per-deal fields. Deliberately services-flavoured
 * and free of platform wording — `aiData` and `ipRights` are free text the
 * seller writes per proposal, so the profile cannot police them, and the
 * regression tests below would otherwise be measuring the fixture.
 */
const INPUTS: DocumentTermInputs = {
  paymentTerms: "Invoices are issued monthly and are due on the terms stated in the schedule",
  lateFee: "Past-due balances accrue interest at the rate stated in the schedule",
  aiData:
    "Seller may use de-identified engagement data to improve its safety analytics. Client data is not used to train third-party models without written authorization.",
  ipRights:
    "Client owns the written programs, reports, and audit findings prepared for it, on payment in full. Seller retains its pre-existing methods, formats, and templates.",
  liabilityCap: "THE TOTAL FEES ACTUALLY PAID FOR THE AFFECTED WORK",
  governingLaw: "the State of Wisconsin",
  validDays: "30",
};

function compose() {
  return composeDocumentTerms(buildSharedClauses(INPUTS), timeAndMaterialsProfile);
}

const headings = () => compose().terms.map((term) => term.heading);
const at = (heading: string) => headings().indexOf(heading);

/** Every body this profile wrote itself: the extras plus every override. */
function authoredBodies(): { label: string; body: string }[] {
  const extras = (timeAndMaterialsProfile.extraClauses ?? []).map((clause) => ({
    label: clause.id,
    body: clause.body,
  }));
  const overrides = Object.entries(timeAndMaterialsProfile.overrideClauses ?? {}).flatMap(([id, clause]) =>
    clause ? [{ label: id, body: clause.body }] : [],
  );
  return [...extras, ...overrides];
}

describe("time & materials profile — identity", () => {
  it("is keyed to the time_and_materials template", () => {
    expect(timeAndMaterialsProfile.key).toBe("time_and_materials");
  });

  it("names the engagement in services language, not platform language", () => {
    const lexicon = timeAndMaterialsProfile.lexicon;
    expect(lexicon.documentTitle).toBe("Time & Materials Services Proposal");
    expect(lexicon.unitNoun).toBe("task");
    expect(lexicon.warrantySubject).not.toMatch(/platform/i);
    for (const value of Object.values(lexicon)) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("time & materials profile — composition", () => {
  it("drops no required clause", () => {
    expect(compose().droppedRequired).toEqual([]);
  });

  it("prints every required clause, including the two it reworded", () => {
    const present = headings();
    const expected = [
      "Confidentiality",
      "Limitation of Liability",
      "Standard of Care & Warranty Disclaimer", // warranty_disclaimer, reworded
      "OSHA Compliance Disclaimer",
      "Indemnification",
      "Dispute Resolution & Arbitration",
      "Governing Law & Venue",
      "Entire Agreement",
      "Proposal Validity",
    ];
    for (const heading of expected) expect(present, heading).toContain(heading);
    // The list above must stay the same length as the contract's requirement.
    expect(expected).toHaveLength(requiredClauseIds.length);
  });

  it("omits the auto-renewal clause, because nothing here renews", () => {
    expect(headings()).not.toContain("California Auto-Renewal Law");
    expect(compose().terms.map((term) => term.body).join(" ")).not.toMatch(/auto-?renew/i);
  });

  it("every omission is justified and non-required", () => {
    expect(timeAndMaterialsProfile.omitClauses).toEqual(["auto_renewal_ca"]);
    for (const id of timeAndMaterialsProfile.omitClauses ?? []) {
      expect(requiredClauseIds).not.toContain(id);
    }
  });

  it("adds the nine T&M terms, all prefixed and uniquely id'd", () => {
    const extras = timeAndMaterialsProfile.extraClauses ?? [];
    expect(extras).toHaveLength(9);
    for (const clause of extras) expect(clause.id).toMatch(/^tm\./);
    expect(new Set(extras.map((clause) => clause.id)).size).toBe(extras.length);
    for (const clause of extras) expect(headings()).toContain(clause.heading);
  });

  it("anchors the extras where they were meant to land", () => {
    // The estimate/cap pair leads the section, ahead of Payment Terms.
    expect(at("Estimated Quantities; Not a Fixed Price")).toBe(0);
    expect(at("Not-to-Exceed Authorization")).toBe(1);

    // Rate and billing mechanics gather around Payment Terms.
    const payment = at("Payment Terms");
    expect(at("Rates and Rate Period")).toBe(payment - 1);
    expect(at("Timesheets and Supporting Records")).toBe(payment + 1);
    expect(at("Overtime, Premium Time, and Minimum Billing")).toBe(payment + 2);
    expect(at("Travel, Mobilization, and Reimbursable Expenses")).toBe(payment + 3);
    expect(at("Standby and Delay Time")).toBe(payment + 4);

    // Direction of the work sits with Independent Contractor; demobilization
    // sits with Termination.
    expect(at("Personnel, Substitution, and Direction of the Work")).toBe(
      at("Independent Contractor; No Joint Employment") + 1,
    );
    expect(at("Suspension and Demobilization")).toBe(at("Termination") + 1);

    // Nothing fell to the end because its anchor went missing.
    expect(headings().at(-1)).toBe("Proposal Validity");
  });
});

describe("time & materials profile — the estimate is not a cap", () => {
  it("states plainly that the printed total is neither a fixed price nor a maximum", () => {
    const clause = compose().terms.find((term) => term.heading === "Estimated Quantities; Not a Fixed Price");
    expect(clause).toBeDefined();
    const body = clause!.body;
    expect(body).toMatch(/estimates prepared for budgeting/i);
    expect(body).toMatch(/neither a fixed price nor a guaranteed maximum/i);
    expect(body).toMatch(/quantities actually delivered/i);
    // A cap exists only if one was actually agreed.
    expect(body).toMatch(/unless a not-to-exceed amount is agreed/i);
    // And this clause wins if some other total on the page implies otherwise.
    expect(body).toMatch(/this section controls/i);
  });

  it("agrees with the template prose: quantities are estimates, billing follows delivery", () => {
    const all = compose().terms.map((term) => term.body).join(" ");
    expect(all).not.toMatch(/guaranteed maximum price/i);
    expect(all).not.toMatch(/the total (?:stated|shown) in the schedule is the full professional fee/i);
  });

  it("gives the not-to-exceed mechanism a way in and a duty to warn on approach", () => {
    const body = compose().terms.find((term) => term.heading === "Not-to-Exceed Authorization")!.body;
    expect(body).toMatch(/agreed in a writing signed by both parties/i);
    expect(body).toMatch(/75 percent/);
    expect(body).toMatch(/90 percent/);
    expect(body).toMatch(/not obligated to continue work beyond/i);
  });

  it("keeps quantity drift out of the change-order process, which is the point of T&M", () => {
    const body = compose().terms.find((term) => term.heading === "Scope Changes")!.body;
    expect(body).toMatch(/is not a scope change/i);
    expect(body).toMatch(/new task type/i);
    // The shared wording was written for a subscription's sites and modules.
    expect(body).not.toMatch(/sites, users, modules/i);
    // The shared pause right survives the rewording.
    expect(body).toMatch(/10 business days/);
  });
});

describe("time & materials profile — no platform language survives", () => {
  it("never mentions a platform, a subscription, or SaaS anywhere in the terms", () => {
    for (const term of compose().terms) {
      expect(term.heading, term.heading).not.toMatch(/platform|saas|subscription/i);
      expect(term.body, term.heading).not.toMatch(/platform|saas|subscription/i);
      expect(term.body, term.heading).not.toMatch(/error-free/i);
      expect(term.body, term.heading).not.toMatch(/as available/i);
    }
  });

  it("replaced the platform disclaimers with a services standard of care", () => {
    const warranty = compose().terms.find((term) => term.heading === "Standard of Care & Warranty Disclaimer")!.body;
    expect(warranty).toMatch(/degree of skill and care ordinarily exercised/i);
    expect(warranty).toMatch(/AS IS/);
    expect(warranty).toMatch(/re-performance of the affected task line/i);

    const osha = compose().terms.find((term) => term.heading === "OSHA Compliance Disclaimer")!.body;
    expect(osha).toMatch(/29 U\.S\.C\. sec\.651/);
    expect(osha).toMatch(/do not assume the role of Client's Competent Person/i);
  });

  it("keeps the joint-employment guardrail pointing both ways", () => {
    const body = compose().terms.find(
      (term) => term.heading === "Independent Contractor; No Joint Employment",
    )!.body;
    expect(body).toMatch(/sole employer of its personnel/i);
    expect(body).toMatch(/neither party intends a joint-employer relationship/i);

    const personnel = compose().terms.find(
      (term) => term.heading === "Personnel, Substitution, and Direction of the Work",
    )!.body;
    expect(personnel).toMatch(/substitute personnel of equivalent qualification/i);
    expect(personnel).toMatch(/direct the manner and means/i);
  });
});

describe("time & materials profile — no per-deal commercial values baked in", () => {
  it("quotes no rate, no dollar figure, and no currency amount", () => {
    // Scoped to bodies THIS profile wrote: the shared payment_terms clause
    // legitimately carries a returned-check fee, which is not this file's doing.
    for (const { label, body } of authoredBodies()) {
      expect(body, label).not.toMatch(/\$\s*\d/);
      expect(body, label).not.toMatch(/\b\d[\d,]*(?:\.\d+)?\s*(?:dollars?|USD)\b/i);
      expect(body, label).not.toMatch(/\b\d[\d,]*(?:\.\d+)?\s*(?:per|\/)\s*(?:hour|hr|day|week|month)\b/i);
    }
  });

  it("states no payment term, late fee, liability cap, governing law, or validity window of its own", () => {
    for (const { label, body } of authoredBodies()) {
      expect(body, label).not.toMatch(/\bnet\s*\d+\b/i);
      expect(body, label).not.toMatch(/\d+(?:\.\d+)?\s*percent per month/i);
      expect(body, label).not.toMatch(/\bcalendar days from the proposal date\b/i);
    }
  });

  it("points at the schedule of fees for every rate it relies on", () => {
    const rates = compose().terms.find((term) => term.heading === "Rates and Rate Period")!.body;
    expect(rates).toMatch(/unit rates shown in the schedule of fees govern/i);
    expect(rates).toMatch(/no other rate sheet, verbal quote, or prior proposal applies/i);
    expect(rates).toMatch(/never applies to work already performed/i);

    const travel = compose().terms.find(
      (term) => term.heading === "Travel, Mobilization, and Reimbursable Expenses",
    )!.body;
    expect(travel).toMatch(/only where the schedule of fees carries a line for them/i);
    expect(travel).toMatch(/set no travel rate of their own/i);
  });

  it("defers the billing-dispute window to Payment Terms instead of inventing a second one", () => {
    const body = compose().terms.find((term) => term.heading === "Timesheets and Supporting Records")!.body;
    expect(body).toMatch(/billing-dispute window stated in Payment Terms/);
    expect(body).not.toMatch(/\d+\s*business days/);
    expect(body).toMatch(/does not defer payment of the undisputed remainder/i);
  });

  it("carries the conventional overtime and minimum-billing figures a T&M invoice needs", () => {
    const body = compose().terms.find(
      (term) => term.heading === "Overtime, Premium Time, and Minimum Billing",
    )!.body;
    expect(body).toMatch(/beyond 8 hours in a day or 40 hours in a week/i);
    expect(body).toMatch(/one and one-half times the applicable unit rate/i);
    expect(body).toMatch(/quarter-hour increments/i);
    expect(body).toMatch(/four-hour minimum/i);
    expect(body).toMatch(/not compounded/i);
  });

  it("bills client-caused standby and excuses seller-caused standby", () => {
    const body = compose().terms.find((term) => term.heading === "Standby and Delay Time")!.body;
    expect(body).toMatch(/billed as standby at the applicable unit rate/i);
    expect(body).toMatch(/Standby caused by Seller's own failure[^.]*is not billable/i);

    const suspension = compose().terms.find((term) => term.heading === "Suspension and Demobilization")!.body;
    expect(suspension).toMatch(/jobsite is unavailable/i);
    expect(suspension).toMatch(/30 consecutive days/);
  });
});

describe("time & materials profile — house style", () => {
  it("writes plain ASCII and never addresses the reader in the second person", () => {
    for (const { label, body } of authoredBodies()) {
      expect(body, label).not.toMatch(/[§‘’“”]/); // section sign, smart quotes
      expect(body, label).not.toMatch(/\b(you|your|yours)\b/i);
      expect(body.trim(), label).toBe(body);
    }
  });
});
