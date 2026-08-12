import { describe, expect, it } from "vitest";
import {
  collectNarrativeRegions,
  collectProposalFacts,
  parseCountToken,
  regionsWithFindings,
  scanProposalConsistency,
} from "./consistency";
import { phaseOptions, serviceOptions } from "./catalog";
import type { GeneratorItem, GeneratorState } from "./generator-state";

function item(overrides: Partial<GeneratorItem> & { key: string }): GeneratorItem {
  return { type: "phase", name: "", qty: 1, price: 0, desc: "", unit: "", ...overrides };
}

/**
 * The Wondfo proposal as it actually sat in the database on 2026-08-11:
 * includedUsers 50, includedSites 5, and line descriptions still quoting the
 * 20-user / one-jobsite figures the pilot was originally scoped at.
 */
function wondfoState(): GeneratorState {
  return {
    v: 1,
    fields: {
      packageSelect: "custom",
      annualPrice: "0",
      includedUsers: "50",
      includedSites: "5",
      termStartMonth: "8",
      termStartYear: "2026",
      termEndMonth: "12",
      termEndYear: "2026",
      customSummary:
        "This proposal establishes a five-month pilot program covering up to 50 users at five jobsites.",
      customExclusions: "This pilot is limited to the basic HSE Management System.",
    },
    phases: [
      item({
        key: "discovery",
        name: "Discovery & Intake",
        desc: "Account setup, provisioning of up to 20 users, jobsite configuration, and kickoff training.",
      }),
      item({
        key: "build",
        name: "Build & Configure",
        desc: "Live field use of the basic feature set by up to 20 users at one jobsite.",
      }),
    ],
    services: [],
  };
}

describe("parseCountToken", () => {
  it("reads digits, thousands separators, and written-out numbers", () => {
    expect(parseCountToken("20")).toBe(20);
    expect(parseCountToken("1,250")).toBe(1250);
    expect(parseCountToken("five")).toBe(5);
    expect(parseCountToken("One")).toBe(1);
    expect(parseCountToken("fifty")).toBe(50);
    expect(parseCountToken("twenty-five")).toBe(25);
    expect(parseCountToken("twenty five")).toBe(25);
  });

  it("returns null for tokens that are not counts", () => {
    expect(parseCountToken("")).toBeNull();
    expect(parseCountToken("jobsite")).toBeNull();
    expect(parseCountToken("gazillion")).toBeNull();
  });
});

describe("collectProposalFacts", () => {
  it("reads the seller's fields rather than the catalog defaults", () => {
    const facts = collectProposalFacts(wondfoState());
    expect(facts.users).toBe(50);
    expect(facts.sites).toBe(5);
    // August through December inclusive.
    expect(facts.termMonths).toBe(5);
    expect(facts.termRangeLabel).toBe("August 2026 – December 2026");
  });

  it("falls back to the package catalog when the count fields are absent", () => {
    const facts = collectProposalFacts({ v: 1, fields: { packageSelect: "starter" }, phases: [], services: [] });
    expect(facts.users).toBe(15);
    expect(facts.sites).toBe(1);
    expect(facts.termMonths).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* A services engagement has no subscription facts                             */
/* -------------------------------------------------------------------------- */

/** A training proposal exactly as the asset saves one: its own field defaults intact. */
function trainingState(): GeneratorState {
  return {
    v: 1,
    fields: {
      packageSelect: "none",
      proposalType: "training",
      // The asset's Included Users / Included Jobsites inputs carry these in
      // their markup, and the bridge collects every field that has an element —
      // so they sit in form_data on a proposal that sells no seats at all.
      includedUsers: "50",
      includedSites: "2",
      billingTerm: "Milestone-based",
    },
    phases: [],
    services: [item({ type: "service", key: "firstAid", qty: 6, price: 145 })],
  };
}

describe("collectProposalFacts — services-only engagements", () => {
  it("reports no seats, no jobsites and no package", () => {
    // THE REGRESSION THIS PINS. The guard read `packageRow?.key ?? ""`, but
    // buildPackageLine() omits the package ROW entirely for a services deal, so
    // it asked isNoPlatformPackageKey("") — always false. The guard never once
    // fired, and a training proposal handed the AI reviewer 50 users, 2
    // jobsites and "Platform Services" as authoritative facts.
    const facts = collectProposalFacts(trainingState());
    expect(facts.servicesOnly).toBe(true);
    expect(facts.users).toBe(0);
    expect(facts.sites).toBe(0);
    expect(facts.packageName).toBe("");
    expect(facts.packagePrice).toBe(0);
    expect(facts.proposalTypeLabel).toBe("Training Services");
  });

  it("still reads the package on a proposal that does sell one", () => {
    const facts = collectProposalFacts({
      v: 1,
      fields: { packageSelect: "professional", proposalType: "platform" },
      phases: [],
      services: [],
    });
    expect(facts.servicesOnly).toBe(false);
    expect(facts.packageName).toBe("Professional Safety Intelligence");
    expect(facts.users).toBe(50);
  });

  it("invents no billing term for a typed proposal, and keeps the legacy one", () => {
    const typed = trainingState();
    delete typed.fields.billingTerm;
    expect(collectProposalFacts(typed).billingTerm).toBe("");

    // A proposal with no type stamped predates all of this and still shows what
    // the asset's selected option showed.
    expect(collectProposalFacts({ v: 1, fields: {}, phases: [], services: [] }).billingTerm).toBe("One-time (pilot)");
  });
});

describe("scanProposalConsistency — services-only engagements", () => {
  it("does not police seat and jobsite counts a services deal never quoted", () => {
    const state = trainingState();
    state.fields.customSummary =
      "Sessions are delivered at three locations, with a supervisor cohort of twelve users on the platform side.";
    const findings = scanProposalConsistency(state);
    // Included Users / Included Jobsites are not fields this deal has, so prose
    // cannot contradict them. Comparing against 0 made every ordinary sentence
    // a finding.
    expect(findings.filter((finding) => finding.topic === "sites")).toEqual([]);
    expect(findings.filter((finding) => finding.topic === "users")).toEqual([]);
  });

  it("still catches a term duration that contradicts the dates", () => {
    const state = trainingState();
    Object.assign(state.fields, {
      termStartMonth: "8",
      termStartYear: "2026",
      termEndMonth: "12",
      termEndYear: "2026",
      customSummary: "A six-month training calendar.",
    });
    const findings = scanProposalConsistency(state).filter((finding) => finding.topic === "term_months");
    expect(findings).toHaveLength(1);
    expect(findings[0].expected).toBe(5);
  });

  it("cites no base subscription when flagging a price, because there is none", () => {
    const state = trainingState();
    state.fields.customSummary = "The training calendar is priced at $12,000 for the year.";
    const money = scanProposalConsistency(state).filter((finding) => finding.topic === "money");
    expect(money).toHaveLength(1);
    expect(money[0].message).not.toMatch(/base subscription/i);
    expect(money[0].message).toContain("the total is $870");
  });
});

describe("scanProposalConsistency", () => {
  it("flags the stale user count in every line description that carries it", () => {
    const findings = scanProposalConsistency(wondfoState());
    const userFindings = findings.filter((finding) => finding.topic === "users");

    expect(userFindings).toHaveLength(2);
    for (const finding of userFindings) {
      expect(finding.claimed).toBe(20);
      expect(finding.expected).toBe(50);
      expect(finding.quote).toMatch(/up to 20 users/i);
      expect(finding.message).toContain("Included Users is 50");
    }
    expect(userFindings.map((finding) => finding.regionId)).toEqual(["phase:0", "phase:1"]);
  });

  it("flags a written-out jobsite count", () => {
    const siteFindings = scanProposalConsistency(wondfoState()).filter((finding) => finding.topic === "sites");
    expect(siteFindings).toHaveLength(1);
    expect(siteFindings[0].regionId).toBe("phase:1");
    expect(siteFindings[0].claimed).toBe(1);
    expect(siteFindings[0].expected).toBe(5);
  });

  it("leaves figures that already agree alone", () => {
    // The summary says 50 users, five jobsites and a five-month term — all
    // correct — so none of it may be reported.
    const findings = scanProposalConsistency(wondfoState());
    expect(findings.some((finding) => finding.regionId === "field:customSummary")).toBe(false);
  });

  it("flags a term duration that contradicts the term dates", () => {
    const state = wondfoState();
    state.fields.customSummary = "This proposal establishes a six-month pilot for 50 users at five jobsites.";
    const findings = scanProposalConsistency(state).filter((finding) => finding.topic === "term_months");
    expect(findings).toHaveLength(1);
    expect(findings[0].claimed).toBe(6);
    expect(findings[0].expected).toBe(5);
  });

  it("says nothing about durations when no term has been chosen", () => {
    const state = wondfoState();
    delete state.fields.termStartMonth;
    delete state.fields.termEndMonth;
    state.fields.customSummary = "A six-month pilot for 50 users at five jobsites.";
    expect(scanProposalConsistency(state).filter((finding) => finding.topic === "term_months")).toEqual([]);
  });

  it("ignores untouched catalog boilerplate", () => {
    const state = wondfoState();
    // The stock Discovery sentence mentions no counts, but the point is that a
    // description identical to the price book is the price book's copy and not
    // this proposal's claim.
    state.phases = [item({ key: "discovery", name: "Discovery & Intake", desc: phaseOptions.discovery.desc })];
    expect(scanProposalConsistency(state).filter((finding) => finding.regionId === "phase:0")).toEqual([]);
  });

  it("does not flag the additional-user block, which quotes a block size on purpose", () => {
    const state = wondfoState();
    state.phases = [];
    state.services = [
      item({
        type: "service",
        key: "extraUsers",
        name: serviceOptions.extraUsers.name,
        // Edited by the seller, so the catalog-identical guard does not apply —
        // the exemption for this key is what has to carry it.
        desc: "Adds 25 additional user seats to the active subscription term, billed per block.",
      }),
    ];
    expect(scanProposalConsistency(state).filter((finding) => finding.topic === "users")).toEqual([]);
  });

  it("flags a headline price the pricing schedule does not contain", () => {
    const state = wondfoState();
    state.fields.annualPrice = "5000";
    state.fields.customSummary = "The pilot is priced at $0.00 for the term.";
    const moneyFindings = scanProposalConsistency(state).filter((finding) => finding.topic === "money");
    expect(moneyFindings).toHaveLength(1);
    expect(moneyFindings[0].claimed).toBe(0);
    expect(moneyFindings[0].quote).toBe("$0.00");
  });

  it("accepts a price that matches a figure on the schedule", () => {
    const state = wondfoState();
    state.fields.annualPrice = "5000";
    state.fields.customSummary = "The pilot is priced at $5,000 for the term.";
    expect(scanProposalConsistency(state).filter((finding) => finding.topic === "money")).toEqual([]);
  });

  it("does not police prices inside line descriptions, where a rate is normal", () => {
    const state = wondfoState();
    state.services = [
      item({ type: "service", key: "fieldDay", name: "Field Support Day", desc: "Billed at $1,250 per day on site." }),
    ];
    expect(scanProposalConsistency(state).filter((finding) => finding.topic === "money")).toEqual([]);
  });

  it("returns nothing for a state with no narrative at all", () => {
    expect(scanProposalConsistency({ v: 1, fields: {}, phases: [], services: [] })).toEqual([]);
    expect(scanProposalConsistency(null)).toEqual([]);
  });
});

describe("collectNarrativeRegions", () => {
  it("addresses each passage stably and resolves catalog text", () => {
    const regions = collectNarrativeRegions(wondfoState());
    expect(regions.map((region) => region.id)).toEqual([
      "field:customSummary",
      "field:customExclusions",
      "phase:0",
      "phase:1",
    ]);
    expect(regions[2].label).toBe("Phase 1: Discovery & Intake");
    expect(regions[0].target).toBe("customSummary");
    expect(regions[3].target).toBe("1");
  });

  it("prints the catalog sentence for a row that stored only a key", () => {
    const regions = collectNarrativeRegions({
      v: 1,
      fields: {},
      phases: [item({ key: "launch" })],
      services: [],
    });
    expect(regions[0].text).toBe(phaseOptions.launch.desc);
    expect(regions[0].isCatalogDefault).toBe(true);
  });
});

describe("regionsWithFindings", () => {
  it("narrows to just the passages that need rewriting, in document order", () => {
    const state = wondfoState();
    const regions = collectNarrativeRegions(state);
    const flagged = regionsWithFindings(regions, scanProposalConsistency(state));
    expect(flagged.map((region) => region.id)).toEqual(["phase:0", "phase:1"]);
  });
});
