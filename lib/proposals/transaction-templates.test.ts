import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProposalDocumentModel } from "@/components/proposals/proposal-document-model";
import {
  isNoPlatformPackageKey,
  isPackageKey,
  isPhaseKey,
  isPilotPackageKey,
  isServiceKey,
  phaseOptions,
  serviceOptions,
} from "./catalog";
import { scanProposalConsistency } from "./consistency";
import { isGeneratorState } from "./generator-state";
import { computeProposalTotals } from "./pricing";
import { buildStateFromTemplate, sanitizeTemplateState, templateLeakFieldIds } from "./templates";
import {
  buildTransactionTemplateState,
  getTransactionTemplateLabel,
  isTransactionTemplateKey,
  listTransactionTemplates,
  proposalBillingTermOptions,
  proposalTypeFieldId,
  proposalTypeLabelFromState,
  transactionTemplateKeys,
  type TransactionTemplateKey,
} from "./transaction-templates";

// These templates seed real client documents. Every invariant here is one that,
// broken, prints on a customer's proposal: a leaked client field, a key the
// price book no longer carries, prose that contradicts its own fields, or a
// billing term the editor's <select> cannot even display.

describe("transaction template registry", () => {
  it("offers the seven proposal types, labelled the way John asked for them", () => {
    const labels = listTransactionTemplates().map((template) => template.label);
    // "Platform Subscription" is the ordinary tier sale. Before it, Enterprise
    // was the only subscription template, so a Professional-tier deal for a
    // normal contractor borrowed a document written for a buyer with
    // procurement, a security review and an MSA.
    expect(labels).toEqual([
      "Pilot",
      "Platform Subscription",
      "Time & Materials",
      "Fixed Price",
      "Enterprise",
      "Retainer",
      "Training",
    ]);
  });

  it("every summary has a non-empty description for the picker", () => {
    for (const template of listTransactionTemplates()) {
      expect(template.description.trim().length, template.key).toBeGreaterThan(20);
    }
  });

  it("narrows keys correctly", () => {
    expect(isTransactionTemplateKey("pilot")).toBe(true);
    expect(isTransactionTemplateKey("growth")).toBe(false);
    expect(isTransactionTemplateKey("")).toBe(false);
  });
});

describe("every built-in template body", () => {
  for (const key of transactionTemplateKeys) {
    describe(key, () => {
      it("is a well-formed GeneratorState", () => {
        expect(isGeneratorState(buildTransactionTemplateState(key))).toBe(true);
      });

      it("is scrub-clean: no client identity, no instance fields", () => {
        expect(templateLeakFieldIds(buildTransactionTemplateState(key))).toEqual([]);
      });

      it("survives sanitizeTemplateState unchanged (nothing for the scrubber to remove)", () => {
        const body = buildTransactionTemplateState(key);
        expect(sanitizeTemplateState(body)).toEqual(body);
      });

      it("references only keys the price book actually carries", () => {
        const body = buildTransactionTemplateState(key);
        expect(isPackageKey(String(body.fields.packageSelect))).toBe(true);
        for (const item of body.phases) expect(isPhaseKey(item.key), `phase ${item.key}`).toBe(true);
        for (const item of body.services) expect(isServiceKey(item.key), `service ${item.key}`).toBe(true);
      });

      it("uses a billing term the editor's <select> can display", () => {
        const body = buildTransactionTemplateState(key);
        expect(proposalBillingTermOptions).toContain(body.fields.billingTerm);
      });

      it("passes the consistency scanner — a template must never ship pre-flagged", () => {
        expect(scanProposalConsistency(buildTransactionTemplateState(key))).toEqual([]);
      });

      it("obeys the COPY RULE: no counts, durations or dollar figures in frozen prose", () => {
        const body = buildTransactionTemplateState(key);
        const prose = [
          String(body.fields.customSummary ?? ""),
          String(body.fields.customExclusions ?? ""),
          ...body.phases.map((item) => item.desc),
          ...body.services.map((item) => item.desc),
        ];
        const countBeforeNoun =
          /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty)\s+(users?|seats?|jobsites?|job\s+sites?|worksites?|sites?|locations?)\b/i;
        const monthCount = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)[-\s]month\b/i;
        const dollars = /\$\s?\d/;
        for (const text of prose) {
          expect(countBeforeNoun.test(text), text).toBe(false);
          expect(monthCount.test(text), text).toBe(false);
          expect(dollars.test(text), text).toBe(false);
        }
      });

      it("returns a fresh object per call — one proposal's edits cannot reprice the next", () => {
        const first = buildTransactionTemplateState(key);
        first.fields.customSummary = "mutated";
        if (first.phases.length > 0) first.phases[0].price = 999999;
        const second = buildTransactionTemplateState(key);
        expect(second.fields.customSummary).not.toBe("mutated");
        if (second.phases.length > 0) expect(second.phases[0].price).not.toBe(999999);
      });
    });
  }

  it("only the Pilot template makes the document talk about a pilot", () => {
    for (const key of transactionTemplateKeys) {
      const body = buildTransactionTemplateState(key);
      expect(isPilotPackageKey(String(body.fields.packageSelect)), key).toBe(key === "pilot");
    }
  });

  /* ------------------------------------------------------------------------ */
  /* Only platform work carries a subscription                                 */
  /* ------------------------------------------------------------------------ */

  it("gives a subscription ONLY to the platform types", () => {
    const platformTypes: TransactionTemplateKey[] = ["pilot", "platform", "enterprise"];
    for (const key of transactionTemplateKeys) {
      const body = buildTransactionTemplateState(key);
      const isServicesOnly = isNoPlatformPackageKey(String(body.fields.packageSelect));
      expect(isServicesOnly, `${key} package = ${body.fields.packageSelect}`).toBe(!platformTypes.includes(key));
    }
  });

  it("prints no subscription row, heading or seat pills on a services engagement", () => {
    for (const key of ["training", "fixed_price", "time_and_materials", "retainer"] as TransactionTemplateKey[]) {
      const state = buildTransactionTemplateState(key);
      const totals = computeProposalTotals(state);
      expect(totals.lineItems.some((row) => row.source === "package"), key).toBe(false);

      const model = buildProposalDocumentModel({
        state,
        proposal: { id: "p", title: "T", status: "draft", currentRevision: 1, validUntil: null },
      });
      expect(model.includesPlatformPackage, key).toBe(false);
      expect(model.packageHeading, key).toBe("Engagement Summary");
      expect(model.packageIntro, key).toContain("no platform subscription is included");
      expect(model.packageIntro, key).not.toMatch(/base subscription/i);
      const pillLabels = model.packagePills.map((pill) => pill.label);
      expect(pillLabels, key).not.toContain("Subscription Price");
      expect(pillLabels, key).not.toContain("Included Users");
      expect(pillLabels, key).not.toContain("Included Jobsites");
      // The fee table must not carry a "Platform Services" line either.
      expect(model.feeGroups.flatMap((group) => group.rows).some((row) => /platform services/i.test(row.name))).toBe(false);
    }
  });

  it("keeps the platform package, heading and pills on the platform types", () => {
    for (const key of ["pilot", "enterprise"] as TransactionTemplateKey[]) {
      const state = buildTransactionTemplateState(key);
      const model = buildProposalDocumentModel({
        state,
        proposal: { id: "p", title: "T", status: "draft", currentRevision: 1, validUntil: null },
      });
      expect(model.includesPlatformPackage, key).toBe(true);
      expect(model.packageHeading, key).toBe("Selected Platform Package");
      expect(model.packageIntro, key).toContain("base subscription");
      expect(computeProposalTotals(state).lineItems.some((row) => row.source === "package"), key).toBe(true);
      expect(model.packagePills.map((pill) => pill.label), key).toContain("Included Users");
    }
  });

  it("headlines the document with the engagement, not a package it does not sell", () => {
    const training = buildProposalDocumentModel({
      state: buildTransactionTemplateState("training"),
      proposal: { id: "p", title: "T", status: "draft", currentRevision: 1, validUntil: null },
    });
    expect(training.docline).toBe("Training Services Proposal");
    expect(training.proposalTypeLabel).toBe("Training Services");

    const fixed = buildProposalDocumentModel({
      state: buildTransactionTemplateState("fixed_price"),
      proposal: { id: "p", title: "T", status: "draft", currentRevision: 1, validUntil: null },
    });
    expect(fixed.docline).toBe("Fixed-Price Services Proposal");

    // The pilot keeps its own headline, driven by the package rather than the type.
    const pilot = buildProposalDocumentModel({
      state: buildTransactionTemplateState("pilot"),
      proposal: { id: "p", title: "T", status: "draft", currentRevision: 1, validUntil: null },
    });
    expect(pilot.docline).toMatch(/pilot/i);
  });

  it("stamps the type so the document can name it, and the stamp survives scrubbing", () => {
    const state = buildStateFromTemplate(buildTransactionTemplateState("retainer"), { preparedBy: "Steve" });
    expect(state?.fields[proposalTypeFieldId]).toBe("retainer");
    expect(proposalTypeLabelFromState(state?.fields)).toBe("Safety Advisory Retainer");
  });

  it("reads no type label from a proposal that was never stamped", () => {
    expect(proposalTypeLabelFromState({})).toBeNull();
    expect(proposalTypeLabelFromState({ [proposalTypeFieldId]: "not_a_type" })).toBeNull();
    expect(proposalTypeLabelFromState(null)).toBeNull();
  });

  it("Training carries the First Aid / CPR / AED line Steve asked for", () => {
    const body = buildTransactionTemplateState("training");
    expect(body.services.some((item) => item.key === "firstAid")).toBe(true);
  });

  /* ------------------------------------------------------------------------ */
  /* Seed quantities must mean something under the line's billing unit         */
  /*                                                                           */
  /* A seeded qty is what the client reads until the seller changes it. Since  */
  /* the certification courses moved to per-participant billing, a course line */
  /* seeded at 1 quotes a one-person class — under terms that bill a short     */
  /* roster at six. This is the guard that catches the NEXT catalog entry to   */
  /* change units, not just the one that already did.                          */
  /* ------------------------------------------------------------------------ */

  // Stated once, in the Class Size and Minimum Billing clause of
  // lib/proposals/type-profiles/training.ts.
  const classMinimum = 6;

  it("never seeds a per-participant course below the stated class minimum", () => {
    for (const key of transactionTemplateKeys) {
      for (const seed of buildTransactionTemplateState(key).services) {
        const option = serviceOptions[seed.key as keyof typeof serviceOptions];
        const label = `${key}/${seed.key} (${option.unit})`;
        expect(Number.isFinite(seed.qty), label).toBe(true);
        expect(seed.qty, label).toBeGreaterThan(0);
        if (option.unit === "Person") expect(seed.qty, label).toBeGreaterThanOrEqual(classMinimum);
      }
    }
  });

  it("seeds every service line at the catalog price for its key", () => {
    // Templates version WITH the price book. A seed carrying its own copy of a
    // price is a number that goes stale silently on the next repricing.
    for (const key of transactionTemplateKeys) {
      for (const seed of buildTransactionTemplateState(key).services) {
        expect(seed.price, `${key}/${seed.key}`).toBe(serviceOptions[seed.key as keyof typeof serviceOptions].price);
      }
    }
  });

  it("leaves name/desc/unit empty on every seed so the catalog copy rides along", () => {
    // Storing the catalog sentence would freeze it, and storing the unit would
    // freeze a unit against a price the seller has not set yet.
    for (const key of transactionTemplateKeys) {
      for (const seed of [...buildTransactionTemplateState(key).phases, ...buildTransactionTemplateState(key).services]) {
        expect(seed.name, `${key}/${seed.key}`).toBe("");
        expect(seed.unit, `${key}/${seed.key}`).toBe("");
      }
    }
  });

  it("prices the pilot's phases at zero and everyone else's at the catalog rate", () => {
    // The pilot package fee IS the price of the pilot; its phases print as
    // scope, not as four more fees on top.
    for (const seed of buildTransactionTemplateState("pilot").phases) expect(seed.price).toBe(0);

    for (const key of transactionTemplateKeys) {
      if (key === "pilot") continue;
      for (const seed of buildTransactionTemplateState(key).phases) {
        expect(seed.price, `${key}/${seed.key}`).toBe(phaseOptions[seed.key as keyof typeof phaseOptions].price);
        expect(seed.qty, `${key}/${seed.key}`).toBe(1);
      }
    }
  });

  it("Enterprise's included counts agree with the Enterprise package", () => {
    const body = buildTransactionTemplateState("enterprise");
    expect(body.fields.packageSelect).toBe("enterprise");
    expect(typeof body.fields.includedUsers).toBe("number");
    expect(typeof body.fields.includedSites).toBe("number");
  });
});

describe("applying a built-in template", () => {
  it("layers the new proposal's own prefill on top of the scrubbed body", () => {
    const state = buildStateFromTemplate(buildTransactionTemplateState("fixed_price"), {
      preparedBy: "Steve",
      today: "2026-08-11",
    });
    expect(state).not.toBeNull();
    expect(state?.fields.preparedBy).toBe("Steve");
    expect(state?.fields.proposalDate).toBe("2026-08-11");
    expect(state?.fields.customSummary).toBe(buildTransactionTemplateState("fixed_price").fields.customSummary);
    expect(state?.fields.clientCompany).toBeUndefined();
  });

  it("labels resolve for every key", () => {
    expect(getTransactionTemplateLabel("time_and_materials")).toBe("Time & Materials");
  });
});

describe("billing term transcription parity with the asset", () => {
  it("matches the billingTerm <select> options verbatim", () => {
    const asset = readFileSync(join(process.cwd(), "assets", "proposal-generator-v15.html"), "utf8");
    const select = /<select id="billingTerm">([\s\S]*?)<\/select>/.exec(asset);
    expect(select, "billingTerm select not found in the asset").not.toBeNull();
    const options = [...select![1].matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((match) => match[1]);
    expect(options).toEqual([...proposalBillingTermOptions]);
  });
});
