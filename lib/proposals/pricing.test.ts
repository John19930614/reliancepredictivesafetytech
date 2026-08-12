import { describe, expect, it } from "vitest";
import { packageData, phaseOptions, serviceOptions } from "./catalog";
import type { GeneratorItem, GeneratorState } from "./generator-state";
import {
  computeDocumentPrice,
  computeDocumentPriceFromState,
  computeProposalTotals,
  formatMoney,
} from "./pricing";

const state = (overrides: Partial<GeneratorState> = {}): GeneratorState => ({
  v: 1,
  fields: {},
  phases: [],
  services: [],
  ...overrides,
});

const item = (overrides: Partial<GeneratorItem> = {}): GeneratorItem => ({
  type: "service",
  key: "custom",
  name: "",
  qty: 1,
  price: 0,
  desc: "",
  unit: "",
  ...overrides,
});

/* -------------------------------------------------------------------------- */
/* Catalog integrity — these numbers are what a customer is billed.            */
/* -------------------------------------------------------------------------- */

describe("price book", () => {
  it("carries the catalog prices transcribed from the generator asset", () => {
    expect(phaseOptions.discovery.price).toBe(3500);
    expect(phaseOptions.build.price).toBe(10000);
    expect(phaseOptions.validation.price).toBe(6500);
    expect(phaseOptions.launch.price).toBe(8000);
    expect(phaseOptions.ongoing.price).toBe(4500);
    expect(phaseOptions.custom.price).toBe(0);

    expect(serviceOptions.platformLicense.price).toBe(7500);
    expect(serviceOptions.perUser.price).toBe(299);
    expect(serviceOptions.aiGateway.price).toBe(27500);
    expect(serviceOptions.customWorkflow).toMatchObject({ price: 225, unit: "Hour" });
    expect(serviceOptions.mileage).toMatchObject({ price: 0.7, unit: "Mile" });
    expect(serviceOptions.osha10).toMatchObject({ price: 175, unit: "Person", group: "Training Catalog" });
    expect(serviceOptions.genTraining).toMatchObject({ price: 750, unit: "Session" });
    expect(Object.keys(serviceOptions)).toHaveLength(64);

    expect(packageData.starter).toMatchObject({ price: 35000, users: 15, sites: 1 });
    expect(packageData.professional).toMatchObject({ price: 65000, users: 50, sites: 5 });
    expect(packageData.enterprise).toMatchObject({ price: 99500, users: 100, sites: 10 });
    expect(packageData.blacklabel).toMatchObject({ price: 155000, users: 250, sites: 25 });
    expect(packageData.custom).toMatchObject({ price: 5000, users: 50, sites: 2 });
  });

  it("is frozen so a caller cannot reprice the module for everyone else", () => {
    expect(Object.isFrozen(serviceOptions)).toBe(true);
    expect(Object.isFrozen(serviceOptions.osha10)).toBe(true);
    expect(Object.isFrozen(phaseOptions.discovery)).toBe(true);
    expect(Object.isFrozen(packageData.enterprise)).toBe(true);
    expect(() => {
      (serviceOptions.osha10 as { price: number }).price = 1;
    }).toThrow();
    expect(serviceOptions.osha10.price).toBe(175);
  });
});

/* -------------------------------------------------------------------------- */
/* Safety document pricing                                                      */
/* -------------------------------------------------------------------------- */

describe("computeDocumentPrice — page bands", () => {
  const band = (pages: number) => computeDocumentPrice({ pages, complexity: "Low", review: "Basic", customization: "None" });

  it("prices the Short band at $450 up to and including 35 pages", () => {
    expect(band(0)).toMatchObject({ band: "Short", bandBase: 450, price: 450 });
    expect(band(1)).toMatchObject({ band: "Short", price: 450 });
    expect(band(35)).toMatchObject({ band: "Short", bandBase: 450, price: 450 });
  });

  it("crosses into the Medium band at 36 pages and holds it through 60", () => {
    expect(band(36)).toMatchObject({ band: "Medium", bandBase: 900, price: 900 });
    expect(band(40)).toMatchObject({ band: "Medium", price: 900 });
    expect(band(60)).toMatchObject({ band: "Medium", bandBase: 900, price: 900 });
  });

  it("crosses into the Long band at 61 pages and never leaves it", () => {
    expect(band(61)).toMatchObject({ band: "Long", bandBase: 1600, price: 1600 });
    expect(band(90)).toMatchObject({ band: "Long", price: 1600 });
    expect(band(5000)).toMatchObject({ band: "Long", price: 1600 });
  });

  it("treats a fractional page count by band, not by rounding", () => {
    expect(band(35.5)).toMatchObject({ band: "Medium", bandBase: 900 });
    expect(band(60.5)).toMatchObject({ band: "Long", bandBase: 1600 });
  });
});

describe("computeDocumentPrice — multipliers and fees", () => {
  const doc = (input: Record<string, unknown>) =>
    computeDocumentPrice({ pages: 40, complexity: "Low", review: "Basic", customization: "None", ...input });

  it("applies each complexity multiplier to the band base", () => {
    expect(doc({ complexity: "Low" })).toMatchObject({ complexityMultiplier: 1, price: 900 });
    expect(doc({ complexity: "Medium" })).toMatchObject({ complexityMultiplier: 1.2, price: 1080 });
    expect(doc({ complexity: "High" })).toMatchObject({ complexityMultiplier: 1.5, price: 1350 });
  });

  it("adds the review fee flat — it is not scaled by complexity", () => {
    expect(doc({ review: "Basic" })).toMatchObject({ reviewFee: 0, price: 900 });
    expect(doc({ review: "Standard" })).toMatchObject({ reviewFee: 375, price: 1275 });
    expect(doc({ review: "Premium" })).toMatchObject({ reviewFee: 1000, price: 1900 });
    // High complexity + Premium review: 900×1.5 + 1000, not (900+1000)×1.5.
    expect(doc({ complexity: "High", review: "Premium" }).price).toBe(2350);
  });

  it("applies the customization percentage to the complexity-adjusted base only", () => {
    expect(doc({ customization: "None" })).toMatchObject({ customizationRate: 0, price: 900 });
    expect(doc({ customization: "Light" })).toMatchObject({ customizationRate: 0.15, price: 1035 });
    expect(doc({ customization: "Moderate" })).toMatchObject({ customizationRate: 0.3, price: 1170 });
    expect(doc({ customization: "Heavy" })).toMatchObject({ customizationRate: 0.6, price: 1440 });
    // 900×1.5 = 1350 adjusted, +60% = 810 uplift, +1000 review = 3160.
    expect(doc({ complexity: "High", review: "Premium", customization: "Heavy" }).price).toBe(3160);
  });

  it("applies rush last, at +25% of everything else", () => {
    expect(doc({ rush: false }).price).toBe(900);
    expect(doc({ rush: true })).toMatchObject({ rush: true, price: 1125 });
    expect(doc({ complexity: "High", review: "Premium", customization: "Heavy", rush: true }).price).toBe(3950);
    expect(computeDocumentPrice({ pages: 80, complexity: "High", review: "Premium", customization: "Heavy", rush: true }).price).toBe(6050);
  });

  it("rounds the final price to whole dollars", () => {
    // (450×1.2 + 375 + 450×1.2×0.3) × 1.25 = 1346.25 -> 1346
    expect(computeDocumentPrice({ pages: 20, complexity: "Medium", review: "Standard", customization: "Moderate", rush: true }).price).toBe(1346);
  });

  it("builds the line-item name and description the generator writes", () => {
    const result = computeDocumentPrice({ pages: 40, complexity: "Medium", review: "Standard", customization: "Light", rush: true });
    expect(result.name).toBe("Safety Document — 40 pg (Medium) · Medium · Standard review");
    expect(result.desc).toBe(
      "Safety document / program. 40 pages (Medium band, base $900); complexity Medium (×1.2); " +
        "Standard review package (+$375); Light customization (+15%); rush delivery (+25%).",
    );
  });

  it("omits the optional clauses when the fee or uplift is zero", () => {
    const result = computeDocumentPrice({ pages: 10, complexity: "Low", review: "Basic", customization: "None" });
    expect(result.desc).toBe(
      "Safety document / program. 10 pages (Short band, base $450); complexity Low (×1); " +
        "Basic review package; None customization.",
    );
  });
});

describe("computeDocumentPrice — defaults and malformed input", () => {
  it("defaults to 0 pages, Medium, Standard, None, no rush", () => {
    const result = computeDocumentPrice();
    expect(result).toMatchObject({
      pages: 0,
      band: "Short",
      complexity: "Medium",
      review: "Standard",
      customization: "None",
      rush: false,
      price: 915,
    });
    expect(computeDocumentPrice({ pages: "", complexity: "", review: "", customization: "" }).price).toBe(915);
  });

  it("falls back to a neutral rate for an unrecognised label but keeps the label", () => {
    const result = computeDocumentPrice({ pages: 40, complexity: "Extreme", review: "Deluxe", customization: "Total" });
    expect(result).toMatchObject({ complexityMultiplier: 1, reviewFee: 0, customizationRate: 0, price: 900 });
    expect(result.name).toContain("Extreme");
    expect(result.desc).toContain("Deluxe review package;");
  });

  it("cannot be tricked by an inherited property name", () => {
    expect(computeDocumentPrice({ pages: 40, complexity: "toString", review: "constructor" })).toMatchObject({
      complexityMultiplier: 1,
      reviewFee: 0,
      price: 900,
    });
  });

  it("coerces numeric strings and clamps negative page counts to zero", () => {
    expect(computeDocumentPrice({ pages: "40", complexity: "Low", review: "Basic" }).price).toBe(900);
    expect(computeDocumentPrice({ pages: -10, complexity: "Low", review: "Basic" })).toMatchObject({ pages: 0, price: 450 });
    expect(computeDocumentPrice({ pages: "-10", complexity: "Low", review: "Basic" }).pages).toBe(0);
  });

  it("prices non-numeric or missing page counts as zero pages, never NaN", () => {
    // The asset yields NaN here, and because NaN <= 35 is false it silently
    // lands in the most expensive Long band. This port refuses to do that.
    for (const pages of ["abc", null, undefined, {}, [], NaN, Infinity, "12abc"]) {
      const result = computeDocumentPrice({ pages, complexity: "Low", review: "Basic" });
      expect(result.pages).toBe(0);
      expect(result.band).toBe("Short");
      expect(result.price).toBe(450);
      expect(Number.isNaN(result.price)).toBe(false);
    }
  });

  it("reads rush from booleans and their string encodings", () => {
    for (const rush of [true, "true", "on", "yes", "1", 1]) {
      expect(computeDocumentPrice({ pages: 40, complexity: "Low", review: "Basic", rush }).rush).toBe(true);
    }
    for (const rush of [false, "false", "", "0", 0, null, undefined, "maybe"]) {
      expect(computeDocumentPrice({ pages: 40, complexity: "Low", review: "Basic", rush }).rush).toBe(false);
    }
  });

  it("reads the generator's docCalc fields off a saved state", () => {
    const saved = state({
      fields: { docPages: "80", docComplexity: "High", docReview: "Premium", docCustom: "Heavy", docRush: true },
    });
    expect(computeDocumentPriceFromState(saved).price).toBe(6050);
    expect(computeDocumentPriceFromState(state()).price).toBe(915);
    expect(computeDocumentPriceFromState(null).price).toBe(915);
  });
});

/* -------------------------------------------------------------------------- */
/* Proposal totals                                                             */
/* -------------------------------------------------------------------------- */

describe("computeProposalTotals — line items", () => {
  it("puts the package first, then phases, then services", () => {
    const totals = computeProposalTotals(
      state({
        fields: { packageSelect: "professional" },
        phases: [item({ type: "phase", key: "discovery", qty: 1, price: 3500 })],
        services: [item({ key: "osha10", qty: 10, price: 175 })],
      }),
    );
    expect(totals.lineItems.map((row) => row.source)).toEqual(["package", "phase", "service"]);
    expect(totals.lineItems[0]).toMatchObject({ key: "professional", name: "Professional Safety Intelligence", qty: 1, price: 65000, amount: 65000 });
    expect(totals.lineItems[1]).toMatchObject({ key: "discovery", name: "Discovery & Intake", amount: 3500 });
    expect(totals.lineItems[2]).toMatchObject({ key: "osha10", name: "OSHA 10 Training", qty: 10, amount: 1750 });
    expect(totals.subtotal).toBe(70250);
  });

  it("lets the annualPrice / includedUsers / includedSites fields override the package", () => {
    const totals = computeProposalTotals(
      state({ fields: { packageSelect: "enterprise", annualPrice: "8000", includedUsers: "12", includedSites: "3" } }),
    );
    expect(totals.lineItems[0].price).toBe(8000);
    expect(totals.lineItems[0].desc).toBe("Platform access for the term — includes 12 users and 3 sites.");
    expect(totals.total).toBe(8000);
  });

  it("states the engagement term chosen on the left in the base subscription row", () => {
    const totals = computeProposalTotals(
      state({
        fields: {
          packageSelect: "enterprise",
          includedUsers: "40",
          includedSites: "5",
          termStartMonth: "3",
          termStartYear: "2026",
          termEndMonth: "8",
          termEndYear: "2026",
        },
      }),
    );
    expect(totals.lineItems[0].desc).toBe("Platform access for the 6-month term — includes 40 users and 5 sites.");
  });

  it("omits the duration rather than guessing when the term is reversed or half-filled", () => {
    const halfFilled = computeProposalTotals(
      state({ fields: { includedUsers: "1", includedSites: "1", termStartMonth: "3", termStartYear: "2026" } }),
    );
    expect(halfFilled.lineItems[0].desc).toBe("Platform access for the term — includes 1 users and 1 sites.");

    const reversed = computeProposalTotals(
      state({
        fields: {
          includedUsers: "1",
          includedSites: "1",
          termStartMonth: "9",
          termStartYear: "2026",
          termEndMonth: "3",
          termEndYear: "2026",
        },
      }),
    );
    expect(reversed.lineItems[0].desc).toBe("Platform access for the term — includes 1 users and 1 sites.");
  });

  it("keeps a deliberate zero package price instead of falling back to the catalog", () => {
    expect(computeProposalTotals(state({ fields: { packageSelect: "enterprise", annualPrice: "0" } })).total).toBe(0);
    expect(computeProposalTotals(state({ fields: { packageSelect: "enterprise", annualPrice: 0 } })).total).toBe(0);
  });

  it("falls back to catalog name and description when the row stored none", () => {
    const totals = computeProposalTotals(
      state({
        fields: { annualPrice: "0" },
        services: [item({ key: "fieldDay", name: "", desc: "", qty: 2, price: 1250 })],
      }),
    );
    expect(totals.lineItems[1]).toMatchObject({
      name: "Field Support Day",
      desc:
        "A day of on-site safety support: pre-task briefings, field observations, corrective coaching, and a written end-of-day summary for management.",
      amount: 2500,
    });
  });

  it("keeps a custom name/description written by the seller", () => {
    const totals = computeProposalTotals(
      state({
        fields: { annualPrice: "0" },
        services: [item({ key: "safetyDocCustom", name: "Safety Document — 40 pg", desc: "Bespoke", qty: 1, price: 1455 })],
      }),
    );
    expect(totals.lineItems[1]).toMatchObject({ name: "Safety Document — 40 pg", desc: "Bespoke", amount: 1455 });
  });
});

describe("computeProposalTotals — the discount / tax / deposit chain", () => {
  const priced = (fields: GeneratorState["fields"]) =>
    computeProposalTotals(
      state({
        fields: { packageSelect: "custom", annualPrice: "10000", ...fields },
      }),
    );

  it("computes subtotal, discount, tax, total and deposit in order", () => {
    const totals = priced({ discountPct: "10", taxPct: "5", depositPct: "25" });
    expect(totals.subtotal).toBe(10000);
    expect(totals.discount).toBe(1000);
    expect(totals.tax).toBe(450);
    expect(totals.total).toBe(9450);
    expect(totals.deposit).toBe(2362.5);
  });

  it("taxes the discounted amount, not the subtotal", () => {
    const totals = priced({ discountPct: "50", taxPct: "10" });
    expect(totals.tax).toBe(500);
    expect(totals.total).toBe(5500);
  });

  it("takes the deposit off the total, after tax", () => {
    const totals = priced({ taxPct: "10", depositPct: "50" });
    expect(totals.total).toBe(11000);
    expect(totals.deposit).toBe(5500);
  });

  it("defaults every percentage to zero", () => {
    const totals = priced({});
    expect(totals).toMatchObject({ subtotal: 10000, discount: 0, tax: 0, total: 10000, deposit: 0 });
  });

  it("rounds money to cents instead of leaking float noise", () => {
    const totals = computeProposalTotals(
      state({
        fields: { annualPrice: "0" },
        services: [item({ key: "mileage", qty: 3, price: 0.7 })],
      }),
    );
    expect(3 * 0.7).not.toBe(2.1); // the float noise this guards against
    expect(totals.lineItems[1].amount).toBe(2.1);
    expect(totals.subtotal).toBe(2.1);
    expect(totals.total).toBe(2.1);
  });
});

describe("computeProposalTotals — malformed and hostile input", () => {
  it("treats an empty state as the generator's default package row", () => {
    const totals = computeProposalTotals(state());
    expect(totals.lineItems).toHaveLength(1);
    // The generator preselects `blank` — manual price, no pilot wording — so a
    // state with no packageSelect prices at zero rather than quoting the pilot fee.
    expect(totals.lineItems[0]).toMatchObject({ source: "package", key: "blank", price: 0 });
    expect(totals.total).toBe(0);
  });

  it("survives null, undefined, and structurally broken states", () => {
    for (const broken of [null, undefined, {}, { fields: null, phases: null, services: null }, { fields: "nope", phases: "nope" }]) {
      const totals = computeProposalTotals(broken as unknown as GeneratorState);
      expect(totals.lineItems).toHaveLength(1);
      expect(Number.isFinite(totals.total)).toBe(true);
      expect(totals.total).toBe(0);
    }
  });

  it("falls back to the default package for an unknown or missing package key", () => {
    for (const packageSelect of ["", "nope", "constructor", 42, true]) {
      const totals = computeProposalTotals(state({ fields: { packageSelect } as GeneratorState["fields"] }));
      expect(totals.lineItems[0].key).toBe("blank");
      expect(totals.lineItems[0].price).toBe(0);
    }
  });

  it("coerces non-numeric qty and price to zero rather than NaN", () => {
    const totals = computeProposalTotals(
      state({
        fields: { annualPrice: "0" },
        services: [
          item({ key: "fieldDay", qty: "abc" as unknown as number, price: 1250 }),
          item({ key: "fieldDay", qty: 2, price: "oops" as unknown as number }),
          item({ key: "fieldDay", qty: NaN, price: Infinity }),
          item({ key: "fieldDay", qty: 2, price: "1250" as unknown as number }),
        ],
      }),
    );
    expect(totals.lineItems.map((row) => row.amount)).toEqual([0, 0, 0, 0, 2500]);
    expect(totals.subtotal).toBe(2500);
    expect(Number.isNaN(totals.total)).toBe(false);
  });

  it("clamps negative quantities, prices, users and sites to zero", () => {
    const totals = computeProposalTotals(
      state({
        fields: { annualPrice: "-500", includedUsers: "-5", includedSites: "-1" },
        phases: [item({ type: "phase", key: "build", qty: -3, price: 10000 })],
        services: [item({ key: "hotel", qty: 2, price: -185 })],
      }),
    );
    expect(totals.lineItems[0].price).toBe(0);
    // Zero counts read as "not set yet", so the includes clause is omitted
    // rather than quoting a limit of zero on the fee table.
    expect(totals.lineItems[0].desc).toBe("Platform access for the term.");
    expect(totals.lineItems[1].qty).toBe(0);
    expect(totals.lineItems[2].price).toBe(0);
    expect(totals.subtotal).toBe(0);
    expect(totals.total).toBe(0);
  });

  it("clamps out-of-range percentages so a typo cannot invert the total", () => {
    const overDiscount = computeProposalTotals(state({ fields: { annualPrice: "10000", discountPct: "150" } }));
    expect(overDiscount.discount).toBe(10000);
    expect(overDiscount.total).toBe(0);

    const negative = computeProposalTotals(state({ fields: { annualPrice: "10000", discountPct: "-20", taxPct: "-5", depositPct: "-10" } }));
    expect(negative).toMatchObject({ discount: 0, tax: 0, total: 10000, deposit: 0 });

    const overDeposit = computeProposalTotals(state({ fields: { annualPrice: "10000", depositPct: "120" } }));
    expect(overDeposit.deposit).toBe(10000);
  });

  it("ignores non-object entries in the item arrays", () => {
    const totals = computeProposalTotals(
      state({
        fields: { annualPrice: "0" },
        phases: [null, "phase", 7, item({ type: "phase", key: "ongoing", qty: 1, price: 4500 })] as unknown as GeneratorItem[],
      }),
    );
    expect(totals.lineItems).toHaveLength(2);
    expect(totals.total).toBe(4500);
  });

  it("never returns NaN or Infinity for any field", () => {
    const totals = computeProposalTotals(
      state({
        fields: { annualPrice: "NaN", discountPct: "abc", taxPct: {} as unknown as string, depositPct: [] as unknown as string },
        services: [item({ key: "custom", qty: Number.MAX_VALUE, price: Number.MAX_VALUE })],
      }),
    );
    for (const value of [totals.subtotal, totals.discount, totals.tax, totals.total, totals.deposit]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("formatMoney", () => {
  it("matches the generator's money() output", () => {
    expect(formatMoney(450)).toBe("$450");
    expect(formatMoney(1600)).toBe("$1,600");
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(0.7)).toBe("$0.70");
  });

  it("renders garbage as $0 rather than $NaN", () => {
    expect(formatMoney(undefined)).toBe("$0");
    expect(formatMoney("abc")).toBe("$0");
    expect(formatMoney(NaN)).toBe("$0");
  });
});
