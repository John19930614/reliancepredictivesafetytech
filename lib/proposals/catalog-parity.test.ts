import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packageData, phaseOptions, serviceOptions, stripPhaseOrdinal } from "./catalog";

// The generator asset carries its OWN copy of the price book, and that copy is
// not decoration: when a seller adds a line, the asset writes the catalog's name
// and description into the row's inputs, and those values are what get persisted
// into `form_data` and printed on the client's document. The catalog in
// catalog.ts only supplies fallbacks for rows that stored nothing.
//
// So a drift between the two is not cosmetic — it means new proposals quote one
// price book while the platform reasons about another. That is exactly what had
// happened: every Training Catalog entry in the asset still shared one
// boilerplate description, so two different trainings rendered identical scope
// paragraphs ("service line 3 and service line 6 are the same").
//
// scripts/build-proposal-generator.mjs cannot enforce this — it only injects the
// bridge — so the guard lives here. If this fails, regenerate the asset's
// literals from catalog.ts rather than hand-editing one side.

const assetPath = join(process.cwd(), "assets", "proposal-generator-v15.html");
const asset = readFileSync(assetPath, "utf8");

/** Pulls one `const <name> = { ... };` literal out of the asset's script. */
function assetLiteral(name: string): string {
  const start = asset.indexOf(`const ${name} = {`);
  expect(start, `${name} literal not found in the asset`).toBeGreaterThan(-1);
  const end = asset.indexOf("\n};", start);
  expect(end, `${name} literal is not terminated`).toBeGreaterThan(start);
  return asset.slice(start, end);
}

/** `key:{...}` entries, one per line, as the generator script writes them. */
function parseAssetEntries(name: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of assetLiteral(name).split("\n")) {
    const match = /^\s*(\w+)\s*:\s*\{(.*)\},?\s*$/.exec(line);
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}

/** Reads `name:"..."` / `price:123` out of one entry body. */
function field(body: string, key: string): string | null {
  const quoted = new RegExp(`${key}:"((?:[^"\\\\]|\\\\.)*)"`).exec(body);
  if (quoted) return JSON.parse(`"${quoted[1]}"`);
  const numeric = new RegExp(`${key}:(-?[\\d.]+)`).exec(body);
  return numeric ? numeric[1] : null;
}

describe("asset price book matches lib/proposals/catalog.ts", () => {
  const cases = [
    { label: "serviceOptions", catalog: serviceOptions as Record<string, { name: string; price: number; desc: string; unit: string }> },
    { label: "phaseOptions", catalog: phaseOptions as Record<string, { name: string; price: number; desc: string }> },
  ];

  for (const { label, catalog } of cases) {
    it(`${label}: same keys`, () => {
      expect([...parseAssetEntries(label).keys()].sort()).toEqual(Object.keys(catalog).sort());
    });

    it(`${label}: same name, price, unit, group and description for every entry`, () => {
      const assetEntries = parseAssetEntries(label);
      for (const [key, option] of Object.entries(catalog)) {
        const body = assetEntries.get(key);
        expect(body, `${label}.${key} missing from the asset`).toBeDefined();
        expect(field(body!, "name"), `${label}.${key}.name`).toBe(option.name);
        expect(Number(field(body!, "price")), `${label}.${key}.price`).toBe(option.price);
        expect(field(body!, "desc"), `${label}.${key}.desc`).toBe(option.desc);
        // `unit` is load-bearing and was NOT compared until 2026-08-12: the
        // document prints it, the asset builds its Qty label from it, and the
        // stored state persists it. Fourteen entries changed unit in one ship
        // and a one-sided edit would have gone out silently.
        const optionUnit = (option as { unit?: string }).unit;
        if (optionUnit !== undefined) {
          expect(field(body!, "unit"), `${label}.${key}.unit`).toBe(optionUnit);
        }
        const optionGroup = (option as { group?: string }).group;
        if (optionGroup !== undefined) {
          expect(field(body!, "group"), `${label}.${key}.group`).toBe(optionGroup);
        }
      }
    });
  }

  it("packageData: same names and descriptions", () => {
    const assetEntries = parseAssetEntries("packageData");
    expect([...assetEntries.keys()].sort()).toEqual(Object.keys(packageData).sort());
    for (const [key, option] of Object.entries(packageData)) {
      const body = assetEntries.get(key)!;
      expect(field(body, "name"), `packageData.${key}.name`).toBe(option.name);
      expect(field(body, "desc"), `packageData.${key}.desc`).toBe(option.desc);
      // `custom` reads price/users/sites off the live DOM inputs in the asset,
      // so only the literal packages can be compared numerically.
      if (key !== "custom") {
        expect(Number(field(body, "price")), `packageData.${key}.price`).toBe(option.price);
      }
    }
  });
});

describe("catalog copy rules", () => {
  it("no phase name carries its own ordinal", () => {
    // The document numbers phases by position. A name like "Phase 1 — Discovery"
    // rendered as "1. Phase 1 — Discovery", and a proposal that skipped a phase
    // printed two numbers that disagreed.
    for (const [key, option] of Object.entries(phaseOptions)) {
      expect(option.name, `phaseOptions.${key}.name`).not.toMatch(/^\s*phase\s*\d/i);
    }
  });

  it("no two service lines share a description", () => {
    // Section 03 prints one scope paragraph per service line. Identical
    // descriptions produced identical paragraphs under different headings.
    const seen = new Map<string, string>();
    for (const [key, option] of Object.entries(serviceOptions)) {
      const previous = seen.get(option.desc);
      expect(previous, `serviceOptions.${key} shares its description with ${previous}`).toBeUndefined();
      seen.set(option.desc, key);
    }
  });

  it("no package name or description hardcodes a count or a duration", () => {
    // These are frozen strings; a number baked in here cannot be corrected by
    // the seller, which is how "up to 50 users" and "(6-Month)" outlived every
    // edit to the fields beside them.
    for (const [key, option] of Object.entries(packageData)) {
      expect(option.name, `packageData.${key}.name`).not.toMatch(/\d/);
      expect(option.desc, `packageData.${key}.desc`).not.toMatch(/\b\d+[- ](month|user|jobsite|site)/i);
      expect(option.desc, `packageData.${key}.desc`).not.toMatch(/up to \d/i);
    }
  });
});

describe("stripPhaseOrdinal", () => {
  it("removes the ordinal every proposal saved before the rename still carries", () => {
    expect(stripPhaseOrdinal("Phase 1 — Discovery & Intake")).toBe("Discovery & Intake");
    expect(stripPhaseOrdinal("Phase 4 - Launch & Training")).toBe("Launch & Training");
    expect(stripPhaseOrdinal("phase 12: Something")).toBe("Something");
    expect(stripPhaseOrdinal("Phase 2 – En dash")).toBe("En dash");
  });

  it("leaves a name that merely mentions a phase alone", () => {
    expect(stripPhaseOrdinal("Discovery & Intake")).toBe("Discovery & Intake");
    expect(stripPhaseOrdinal("Phased Rollout Planning")).toBe("Phased Rollout Planning");
    expect(stripPhaseOrdinal("Custom Phase")).toBe("Custom Phase");
  });

  it("keeps a bare ordinal rather than returning nothing to print", () => {
    expect(stripPhaseOrdinal("Phase 2")).toBe("Phase 2");
    expect(stripPhaseOrdinal("Phase 2 — ")).toBe("Phase 2 — ");
  });
});
