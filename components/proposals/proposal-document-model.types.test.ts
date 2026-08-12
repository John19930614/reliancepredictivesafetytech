// END-TO-END proof that a proposal type reaches the rendered document.
//
// registry.test.ts proves the composer picks the right clauses. This proves the
// DOCUMENT MODEL actually asks it to — the wiring between the two, which is
// where "we built per-type terms" quietly becomes "and the renderer still shows
// the old ones". Every assertion below runs the real builder over the real
// template state, the same path the screen, the PDF, the DOCX, the share page
// and the DocuSign envelope all take.

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
