// Registry-level guarantees.
//
// The per-type suites prove each profile is internally right. These prove the
// things only visible ACROSS profiles: that every type has one, that none of
// them drops a clause it must keep, that they actually differ from each other
// (the entire point of the feature), and — most important — that a proposal
// written before types existed still renders the exact clause set it was sent
// under.

import { describe, expect, it } from "vitest";
import type { DocumentTermInputs } from "@/components/proposals/proposal-document-model";
import { transactionTemplateKeys, type TransactionTemplateKey } from "../transaction-templates";
import { composeDocumentTerms, requiredClauseIds, sharedClauseIds } from "./contract";
import { buildSharedClauses } from "./shared-clauses";
import { buildTermsForProfile, proposalTypeProfiles, resolveLexicon, resolveProposalTypeProfile } from "./index";

const inputs: DocumentTermInputs = {
  paymentTerms: "Net 30 from invoice date",
  lateFee: "1.5% per month on past-due undisputed balances",
  aiData: "Client data is processed to deliver the contracted services.",
  ipRights: "Seller retains platform IP; Client owns its own records.",
  liabilityCap: "Fees paid under this proposal in the prior 12 months",
  governingLaw: "Wisconsin (primary)",
  validDays: "60",
};

const keys = transactionTemplateKeys as readonly TransactionTemplateKey[];

describe("profile registry", () => {
  it("has exactly one profile per proposal type, keyed to itself", () => {
    for (const key of keys) {
      const profile = proposalTypeProfiles[key];
      expect(profile, key).toBeDefined();
      // A copy-paste that leaves the wrong key would route a training document
      // through pilot terms with nothing to show for it.
      expect(profile.key, key).toBe(key);
    }
    expect(Object.keys(proposalTypeProfiles).sort()).toEqual([...keys].sort());
  });

  it("covers all seven types the company sells", () => {
    expect(keys).toContain("pilot");
    expect(keys).toContain("platform");
    expect(keys).toContain("training");
    expect(keys).toContain("time_and_materials");
    expect(keys).toContain("fixed_price");
    expect(keys).toContain("enterprise");
    expect(keys).toContain("retainer");
  });

  it("never drops a required clause, whatever a profile asked for", () => {
    for (const key of keys) {
      const { droppedRequired } = composeDocumentTerms(buildSharedClauses(inputs), proposalTypeProfiles[key]);
      expect(droppedRequired, `${key} tried to omit a required clause`).toEqual([]);
    }
  });

  it("keeps every required clause in the rendered document", () => {
    const shared = buildSharedClauses(inputs);
    for (const key of keys) {
      const terms = buildTermsForProfile(inputs, proposalTypeProfiles[key]);
      for (const id of requiredClauseIds) {
        const original = shared.find((clause) => clause.id === id);
        // A profile may RENAME a required clause, so presence is proved by the
        // original heading or by the profile's own override heading.
        const override = proposalTypeProfiles[key].overrideClauses?.[id];
        const heading = override?.heading ?? original?.heading;
        expect(terms.some((term) => term.heading === heading), `${key} lost ${id}`).toBe(true);
      }
    }
  });

  it("only ever omits ids that exist in the shared set", () => {
    for (const key of keys) {
      for (const id of proposalTypeProfiles[key].omitClauses ?? []) {
        expect(sharedClauseIds, `${key} omits unknown id ${id}`).toContain(id);
      }
    }
  });

  it("gives every extra clause a type-prefixed, unique id", () => {
    const seen = new Set<string>();
    for (const key of keys) {
      for (const extra of proposalTypeProfiles[key].extraClauses ?? []) {
        expect(extra.id.includes("."), `${key}: ${extra.id} is not prefixed`).toBe(true);
        expect(seen.has(extra.id), `duplicate extra id ${extra.id}`).toBe(false);
        seen.add(extra.id);
        expect(extra.heading.trim()).not.toBe("");
        expect(extra.body.trim()).not.toBe("");
      }
    }
  });
});

describe("the types actually differ", () => {
  it("produces a different clause list for every type", () => {
    const fingerprints = new Map<string, TransactionTemplateKey>();
    for (const key of keys) {
      const fingerprint = buildTermsForProfile(inputs, proposalTypeProfiles[key])
        .map((term) => term.heading)
        .join("|");
      const clash = fingerprints.get(fingerprint);
      expect(clash, `${key} and ${clash} render identical terms`).toBeUndefined();
      fingerprints.set(fingerprint, key);
    }
  });

  it("names sections for the deal rather than for the platform", () => {
    const headings = keys.map((key) => resolveLexicon(proposalTypeProfiles[key]).feesHeading);
    expect(new Set(headings).size).toBeGreaterThan(3);
  });

  it("keeps SaaS language off the documents that sell no software", () => {
    // The bug that started this: a training proposal printed "Taxes & SaaS
    // Fees" and a platform warranty disclaimer for a class in a trailer.
    for (const key of ["training", "time_and_materials", "fixed_price", "retainer"] as const) {
      const document = buildTermsForProfile(inputs, proposalTypeProfiles[key])
        .map((term) => `${term.heading} ${term.body}`)
        .join("\n")
        // aiData and ipRights are seller-chosen <select> values, not profile
        // text — no profile can reach them, so they are not this test's business.
        .replace(inputs.aiData, "")
        .replace(inputs.ipRights, "");
      expect(document, `${key} still carries SaaS wording`).not.toMatch(/saas/i);
      expect(document, `${key} still disclaims a platform`).not.toMatch(/the platform will be error-free/i);
    }
  });

  it("still sells a subscription on the types that have one", () => {
    for (const key of ["platform", "enterprise"] as const) {
      const document = buildTermsForProfile(inputs, proposalTypeProfiles[key])
        .map((term) => `${term.heading} ${term.body}`)
        .join("\n");
      expect(document, key).toMatch(/subscription/i);
    }
  });
});

describe("proposals written before types existed", () => {
  it("resolves no profile from an unstamped or unknown state", () => {
    expect(resolveProposalTypeProfile(null)).toBeNull();
    expect(resolveProposalTypeProfile({})).toBeNull();
    expect(resolveProposalTypeProfile({ proposalType: "" })).toBeNull();
    expect(resolveProposalTypeProfile({ proposalType: "not_a_type" })).toBeNull();
    expect(resolveProposalTypeProfile({ proposalType: 7 })).toBeNull();
  });

  it("renders the shared clause set verbatim, in its original order", () => {
    // THE REGRESSION THAT MATTERS. Every proposal already sent was written
    // against these 27 clauses in this order. Shipping this feature must not
    // change one word of a document a client is already holding.
    const legacy = buildTermsForProfile(inputs, null);
    const shared = buildSharedClauses(inputs);
    expect(legacy).toEqual(shared.map(({ heading, body }) => ({ heading, body })));
    expect(legacy).toHaveLength(sharedClauseIds.length);
  });

  it("falls back to the original section headings and the original line noun", () => {
    // toEqual, not toMatchObject: every member of the untyped fallback is
    // pinned, so a new lexicon field wired through resolveLexicon has to state
    // its legacy value here rather than reach a legacy document unannounced.
    expect(resolveLexicon(null)).toEqual({
      scopeHeading: "Detailed Scope of Work",
      feesHeading: "Pricing Schedule",
      termHeading: "Schedule and Implementation Approach",
      // Composes to "Service Line 1:", which is what every proposal sent before
      // per-type wording existed prints over its schedule rows.
      unitNoun: "service",
    });
  });

  it("forwards each type's own unit noun instead of the platform default", () => {
    // The field was declared on all seven profiles and forwarded by none, so
    // every document called every row a "Service Line" regardless.
    expect(resolveLexicon(proposalTypeProfiles.time_and_materials).unitNoun).toBe("task");
    expect(resolveLexicon(proposalTypeProfiles.training).unitNoun).toBe("session");
    expect(resolveLexicon(proposalTypeProfiles.fixed_price).unitNoun).toBe("deliverable");
    for (const key of keys) {
      expect(resolveLexicon(proposalTypeProfiles[key]).unitNoun, key).toBe(
        proposalTypeProfiles[key].lexicon.unitNoun,
      );
    }
  });

  it("resolves a profile once a type is stamped", () => {
    expect(resolveProposalTypeProfile({ proposalType: "training" })?.key).toBe("training");
    expect(resolveProposalTypeProfile({ proposalType: " training " })?.key).toBe("training");
  });
});

describe("seller fields survive composition", () => {
  it("still interpolates every per-deal commercial value on every type", () => {
    // A profile that overrode payment_terms or governing_law with fixed text
    // would silently hardcode a commercial term the seller sets per deal.
    for (const key of keys) {
      const document = buildTermsForProfile(inputs, proposalTypeProfiles[key])
        .map((term) => term.body)
        .join("\n");
      expect(document, `${key} lost the payment terms`).toContain(inputs.paymentTerms);
      expect(document, `${key} lost the liability cap`).toContain(inputs.liabilityCap);
      expect(document, `${key} lost the governing law`).toContain(inputs.governingLaw);
      expect(document, `${key} lost the validity window`).toContain(inputs.validDays);
    }
  });
});
