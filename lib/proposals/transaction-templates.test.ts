import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPackageKey, isPhaseKey, isPilotPackageKey, isServiceKey } from "./catalog";
import { scanProposalConsistency } from "./consistency";
import { isGeneratorState } from "./generator-state";
import { buildStateFromTemplate, sanitizeTemplateState, templateLeakFieldIds } from "./templates";
import {
  buildTransactionTemplateState,
  getTransactionTemplateLabel,
  isTransactionTemplateKey,
  listTransactionTemplates,
  proposalBillingTermOptions,
  transactionTemplateKeys,
} from "./transaction-templates";

// These templates seed real client documents. Every invariant here is one that,
// broken, prints on a customer's proposal: a leaked client field, a key the
// price book no longer carries, prose that contradicts its own fields, or a
// billing term the editor's <select> cannot even display.

describe("transaction template registry", () => {
  it("offers the six proposal types, labelled the way John asked for them", () => {
    const labels = listTransactionTemplates().map((template) => template.label);
    expect(labels).toEqual(["Pilot", "Time & Materials", "Fixed Price", "Enterprise", "Retainer", "Training"]);
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

  it("Training carries the First Aid / CPR / AED line Steve asked for", () => {
    const body = buildTransactionTemplateState("training");
    expect(body.services.some((item) => item.key === "firstAid")).toBe(true);
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
