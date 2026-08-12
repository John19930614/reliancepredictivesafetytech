// END-TO-END proof that a proposal type reaches the rendered document.
//
// registry.test.ts proves the composer picks the right clauses. This proves the
// DOCUMENT MODEL actually asks it to — the wiring between the two, which is
// where "we built per-type terms" quietly becomes "and the renderer still shows
// the old ones". Every assertion below runs the real builder over the real
// template state, the same path the screen, the PDF, the DOCX, the share page
// and the DocuSign envelope all take.

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildTransactionTemplateState,
  transactionTemplateKeys,
  type TransactionTemplateKey,
} from "@/lib/proposals/transaction-templates";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import { buildProposalDocumentModel } from "./proposal-document-model";
import type { GeneratorState } from "@/lib/proposals/generator-state";

const proposal = {
  id: "11111111-2222-4333-8444-555555555555",
  title: "Acme Rollout",
  status: "draft" as const,
  currentRevision: 1,
  validUntil: "2026-12-31",
};

function model(state: GeneratorState) {
  return buildProposalDocumentModel({
    state,
    totals: computeProposalTotals(state),
    team: [],
    signature: null,
    proposal,
  });
}

function documentText(state: GeneratorState): string {
  return model(state)
    .terms.map((term) => `${term.heading}\n${term.body}`)
    .join("\n\n");
}

const keys = transactionTemplateKeys as readonly TransactionTemplateKey[];

describe("the document model applies the proposal type's profile", () => {
  it("gives every type a different set of clause headings", () => {
    const seen = new Map<string, TransactionTemplateKey>();
    for (const key of keys) {
      const fingerprint = model(buildTransactionTemplateState(key))
        .terms.map((term) => term.heading)
        .join("|");
      const clash = seen.get(fingerprint);
      expect(clash, `${key} renders the same terms as ${clash}`).toBeUndefined();
      seen.set(fingerprint, key);
    }
  });

  it("names sections 03/05/06 for the deal", () => {
    const training = model(buildTransactionTemplateState("training"));
    expect(training.scopeHeading).toBe("Courses & Delivery");
    expect(training.feesHeading).toBe("Training Fees");

    const tm = model(buildTransactionTemplateState("time_and_materials"));
    // The estimate argument is made in the heading over the money, before the
    // reader reaches the terms.
    expect(tm.feesHeading).toContain("Estimated");

    const fixed = model(buildTransactionTemplateState("fixed_price"));
    expect(fixed.feesHeading).toBe("Fixed Price Schedule");
  });

  it("keeps the platform-era headings on a proposal with no type stamped", () => {
    const untyped: GeneratorState = { v: 1, fields: {}, phases: [], services: [] };
    const built = model(untyped);
    expect(built.scopeHeading).toBe("Detailed Scope of Work");
    expect(built.feesHeading).toBe("Pricing Schedule");
    expect(built.termHeading).toBe("Schedule and Implementation Approach");
  });
});

describe("the terms a client actually reads", () => {
  it("puts training terms on a training proposal, and no SaaS wording", () => {
    const text = documentText(buildTransactionTemplateState("training"));
    // The bug that started this: a class in a trailer sold under SaaS tax and
    // platform-warranty clauses.
    expect(text).not.toMatch(/saas/i);
    expect(text).not.toMatch(/the platform will be error-free/i);
    // And the terms a training deal genuinely needs.
    expect(text).toMatch(/cancel/i);
    expect(text).toMatch(/roster/i);
    expect(text).toMatch(/certification/i);
  });

  it("says plainly on a T&M proposal that the estimate is not a cap", () => {
    const text = documentText(buildTransactionTemplateState("time_and_materials"));
    expect(text).toMatch(/not a (fixed price|guaranteed maximum)|estimate/i);
    expect(text).toMatch(/timesheet|time records|records/i);
    expect(text).not.toMatch(/saas/i);
  });

  it("gives a fixed-price proposal an acceptance mechanism", () => {
    const text = documentText(buildTransactionTemplateState("fixed_price"));
    expect(text).toMatch(/deemed accepted/i);
    expect(text).toMatch(/change order/i);
  });

  it("gives an enterprise proposal precedence and service levels", () => {
    const text = documentText(buildTransactionTemplateState("enterprise"));
    expect(text).toMatch(/precedence/i);
    expect(text).toMatch(/service level|availability/i);
  });

  it("promises no automatic conversion on a pilot", () => {
    const text = documentText(buildTransactionTemplateState("pilot"));
    expect(text).toMatch(/success criteria/i);
    expect(text).not.toMatch(/auto-?renew/i);
  });

  it("tells a retainer client that Seller is not their Competent Person", () => {
    const text = documentText(buildTransactionTemplateState("retainer"));
    expect(text).toMatch(/competent person/i);
  });

  it("sells a subscription on the platform type without enterprise apparatus", () => {
    const text = documentText(buildTransactionTemplateState("platform"));
    expect(text).toMatch(/subscription/i);
    // The lighter document: no SLA credits, no order-of-precedence ladder.
    expect(text).not.toMatch(/service credit/i);
    expect(text).not.toMatch(/order of precedence/i);
  });
});

describe("every surface shows the same headings", () => {
  // THE GAP THIS CLOSES. The first version of this suite asserted only against
  // buildProposalDocumentModel and called itself end-to-end proof. It was not:
  // pdf.ts and docx.ts had their own hardcoded "Detailed Scope of Work" /
  // "Pricing Schedule" / "Schedule and Implementation Approach", so a training
  // client read "Courses & Delivery" on the share page and then signed a
  // DocuSign PDF headed "Detailed Scope of Work". Asserting on the model alone
  // cannot see that, which is exactly why it shipped.
  it("passes the type's headings to the PDF and DOCX renderers, not hardcoded ones", async () => {
    const pdfSource = await readFile(new URL("../../lib/proposals/pdf.ts", import.meta.url), "utf8");
    const docxSource = await readFile(new URL("../../lib/proposals/docx.ts", import.meta.url), "utf8");

    for (const [surface, source] of [
      ["pdf", pdfSource],
      ["docx", docxSource],
    ] as const) {
      expect(source, `${surface} hardcodes section 03`).not.toContain('"Detailed Scope of Work"');
      expect(source, `${surface} hardcodes section 05`).not.toContain('"Pricing Schedule"');
      expect(source, `${surface} hardcodes section 06`).not.toContain('"Schedule and Implementation Approach"');
      expect(source, `${surface} ignores scopeHeading`).toContain("model.scopeHeading");
      expect(source, `${surface} ignores feesHeading`).toContain("model.feesHeading");
      expect(source, `${surface} ignores termHeading`).toContain("model.termHeading");
    }
  });

  // HANDOFF — the same defect, one section up, still open.
  //
  // Section 03's empty-scope notes are hardcoded three times: ProposalDocument.tsx
  // reads documentCopy.noPhases / .noServices directly, docx.ts passes its own
  // copies of the sentences to pushScope(), and pdf.ts prints a third variant.
  // So a training proposal still tells its client "No implementation phases
  // selected." — an absence that is the design, not a gap.
  //
  // The model now decides: `phaseEmptyNote` / `serviceEmptyNote` are "" for a
  // services engagement and carry the original sentences otherwise. Wiring the
  // three renderers to them is owned elsewhere; when that lands, turn this into
  // the same source assertion as the headings above.
  it.todo("passes the type's empty-scope notes to all three renderers, not hardcoded ones");
});

/* -------------------------------------------------------------------------- */
/* The subscription leak                                                       */
/*                                                                             */
/* Four of the seven types sell NO subscription (packageKey "none"). The       */
/* defaults, fallbacks and frozen sentences under them were all written for a  */
/* platform sale, and each one that survives prints subscription language on a */
/* document about a CPR class or three written programs.                       */
/* -------------------------------------------------------------------------- */

const servicesKeys = ["training", "time_and_materials", "fixed_price", "retainer"] as const;
const platformKeys = ["pilot", "platform", "enterprise"] as const;

describe("a services-only document sells nothing it does not sell", () => {
  it("prints no billing term when the seller chose none, instead of the pilot's", () => {
    for (const key of servicesKeys) {
      const state = buildTransactionTemplateState(key);
      // The seller cleared the seeded billing term, or the proposal predates it.
      delete state.fields.billingTerm;
      const built = model(state);

      expect(built.packagePills.map((pill) => pill.label), key).not.toContain("Billing");
      expect(JSON.stringify(built.packagePills), key).not.toMatch(/pilot/i);
      expect(built.schedule, `${key} schedule`).not.toMatch(/pilot/i);
      // The payment terms still reach the page — dropping the fabricated
      // cadence must not drop the real clause with it.
      expect(built.schedule, `${key} payment terms`).toMatch(/Net 30 from invoice date/);
    }
  });

  it("headlines the engagement, not a pilot or a package", () => {
    for (const key of servicesKeys) {
      const built = model(buildTransactionTemplateState(key));
      expect(built.docline, key).not.toMatch(/pilot|platform access/i);
      expect(built.packageHeading, key).toBe("Engagement Summary");
    }
  });

  it("files the fee rows under headings that do not imply a subscription", () => {
    const training = model(buildTransactionTemplateState("training"));
    const labels = training.feeGroups.map((group) => group.label);
    // The courses ARE the deal; "Add-Ons" says they are bolted onto something.
    expect(labels).toContain("Service Lines");
    expect(labels).not.toContain("Service Lines & Add-Ons");
    expect(labels).not.toContain("Base Subscription");

    const retainer = model(buildTransactionTemplateState("retainer"));
    expect(retainer.feeGroups.map((group) => group.label)).toContain("Engagement Phases");
    expect(retainer.feeGroups.map((group) => group.label)).not.toContain("Implementation Phases");
  });

  it("keeps the subscription-era fee headings on the types that do sell one", () => {
    const platform = model(buildTransactionTemplateState("platform"));
    const labels = platform.feeGroups.map((group) => group.label);
    expect(labels).toContain("Base Subscription");
    expect(labels).toContain("Implementation Phases");
  });

  it("promises no deliverable package for a course or a block of hours", () => {
    for (const key of servicesKeys) {
      const built = model(buildTransactionTemplateState(key));
      if (built.deliverablesCoverage === "") continue;
      expect(built.deliverablesCoverage, key).not.toMatch(/deliverable package/i);
      expect(built.deliverablesCoverage, key).toMatch(/Section 03/);
    }

    // Still promised where it is true.
    const enterprise = model(buildTransactionTemplateState("enterprise"));
    expect(enterprise.deliverablesCoverage).toMatch(/deliverable package is produced/i);
  });

  it("says nothing is missing from a scope that is complete by design", () => {
    for (const key of servicesKeys) {
      const built = model(buildTransactionTemplateState(key));
      expect(built.phaseEmptyNote, key).toBe("");
      expect(built.serviceEmptyNote, key).toBe("");
    }

    // A platform rollout with no phases really is an unfinished scope.
    const platform = model(buildTransactionTemplateState("platform"));
    expect(platform.phaseEmptyNote).toBe("No implementation phases selected.");
    expect(platform.serviceEmptyNote).toBe("No added service lines selected.");
  });

  it("opens section 06 in the engagement's own words, not an implementation's", () => {
    const training = model(buildTransactionTemplateState("training"));
    expect(training.schedule).toContain("the training program");
    expect(training.schedule).not.toMatch(/implementation/i);

    const tm = model(buildTransactionTemplateState("time_and_materials"));
    expect(tm.schedule).not.toMatch(/implementation/i);

    // And still names a real billing term when one was chosen.
    expect(training.schedule).toContain("(Milestone-based)");
  });

  it("carries no seat or jobsite figure anywhere on the page", () => {
    for (const key of servicesKeys) {
      const state = buildTransactionTemplateState(key);
      // Exactly what the asset leaves behind: its own input defaults, saved by
      // the bridge whether or not the deal has seats.
      state.fields.includedUsers = 50;
      state.fields.includedSites = 2;
      const built = model(state);

      const printed = [built.packageIntro, JSON.stringify(built.packagePills)].join(" ");
      expect(printed, key).not.toMatch(/\b50\b/);
      expect(printed, key).not.toMatch(/Included Users|Included Jobsites/);
    }
  });
});

describe("what a platform proposal keeps", () => {
  it("still names the subscription, its seats and its billing", () => {
    for (const key of platformKeys) {
      const built = model(buildTransactionTemplateState(key));
      expect(built.packageHeading, key).toBe("Selected Platform Package");
      expect(built.packagePills.map((pill) => pill.label), key).toContain("Billing");
      expect(built.feeGroups.map((group) => group.label), key).toContain("Base Subscription");
    }
  });
});

describe("what must never change per type", () => {
  it("still interpolates the seller's own commercial fields on every type", () => {
    for (const key of keys) {
      const state = buildTransactionTemplateState(key);
      const text = documentText(state);
      // Defaults come from documentTermDefaults when the seller has not
      // overridden them; either way the value must reach the page.
      expect(text, `${key} lost its payment terms`).toMatch(/net 30|invoice/i);
      expect(text, `${key} lost its governing law`).toMatch(/wisconsin/i);
      expect(text, `${key} lost its validity window`).toMatch(/calendar days/i);
    }
  });

  it("keeps the clauses no proposal may ship without", () => {
    for (const key of keys) {
      const text = documentText(buildTransactionTemplateState(key));
      expect(text, `${key}: no liability limit`).toMatch(/limitation of liability/i);
      expect(text, `${key}: no OSHA responsibility`).toMatch(/osha/i);
      expect(text, `${key}: no dispute resolution`).toMatch(/dispute resolution/i);
      expect(text, `${key}: no governing law`).toMatch(/governing law/i);
      expect(text, `${key}: no validity`).toMatch(/proposal validity/i);
    }
  });

  it("prints a legacy proposal's schedule and billing line exactly as it always did", () => {
    // No type stamped, no billing term saved — the state a proposal written
    // before the Billing Term select was collected still has. It inherited the
    // asset's selected option then and must inherit it now: this document is in
    // a client's hands, and a sentence that changes under it is a different
    // document. The pilot wording is only wrong where a TYPE says it is wrong.
    const untyped: GeneratorState = { v: 1, fields: {}, phases: [], services: [] };
    const built = model(untyped);

    expect(built.schedule).toBe(
      "The schedule is coordinated after acceptance. Unless otherwise agreed, implementation follows the order " +
        "shown in the scope. Billing follows the selected term (One-time (pilot)), with Net 30 from invoice date.",
    );
    expect(built.packagePills).toContainEqual({ label: "Billing", value: "One-time (pilot)" });
    expect(built.phaseEmptyNote).toBe("No implementation phases selected.");
  });

  it("renders a legacy proposal's terms exactly as they were before types existed", () => {
    // A document already in a client's hands must not acquire new legal terms
    // because a feature shipped after it was sent.
    const untyped: GeneratorState = { v: 1, fields: {}, phases: [], services: [] };
    const terms = model(untyped).terms;
    expect(terms).toHaveLength(27);
    expect(terms[0].heading).toBe("Payment Terms");
    expect(terms[terms.length - 1].heading).toBe("Proposal Validity");
    expect(terms.some((term) => term.heading === "Taxes & SaaS Fees")).toBe(true);
  });
});
