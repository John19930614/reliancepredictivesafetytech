import { describe, expect, it } from "vitest";
import { packageData, phaseOptions, serviceOptions } from "./catalog";
import type { GeneratorItem, GeneratorState } from "./generator-state";
import type { DeliveryMode } from "./qty-basis";
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
    // Certification courses are billed per participant (2026-08-12). The rest
    // of the Training Catalog — program builds, crew briefings, facilitated
    // workshops — stays per session, because those sell a delivery, not seats.
    expect(serviceOptions.osha10).toMatchObject({ price: 210, unit: "Person", group: "Training Catalog" });
    expect(serviceOptions.firstAid).toMatchObject({ price: 145, unit: "Person", group: "Training Catalog" });
    expect(serviceOptions.forklift).toMatchObject({ price: 115, unit: "Person" });
    expect(serviceOptions.genTraining).toMatchObject({ price: 750, unit: "Session" });
    expect(serviceOptions.culture).toMatchObject({ price: 1250, unit: "Session" });
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
    expect(serviceOptions.osha10.price).toBe(210);
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

/* -------------------------------------------------------------------------- */
/* Qty means whatever the billing unit says it means                           */
/*                                                                             */
/* Since 2026-08-12 the certification courses are billed per participant, so a */
/* service row's qty is a HEADCOUNT on one line, a session count on the next,  */
/* hours on the one after that and miles on the last. Nothing in this module   */
/* may assume qty is small, whole, or 1.                                       */
/* -------------------------------------------------------------------------- */

describe("computeProposalTotals — per-unit quantities", () => {
  const services = (rows: Partial<GeneratorItem>[]) =>
    computeProposalTotals(state({ fields: { packageSelect: "none" }, services: rows.map((row) => item(row)) }));

  it("prices a full OSHA 10 class by the head, not by the session", () => {
    // 25 attendees × $210 = $5,250. The old per-session price was $2,100 for
    // the room, so a qty this module clamped or truncated would misquote a
    // real class by thousands.
    const totals = services([{ key: "osha10", qty: 25, price: 210, unit: "Person" }]);
    expect(totals.lineItems[0]).toMatchObject({ qty: 25, unit: "Person", amount: 5250 });
    expect(totals.subtotal).toBe(5250);
    expect(totals.total).toBe(5250);
  });

  it("carries a large headcount without truncating or capping it", () => {
    const totals = services([{ key: "respiratory", qty: 250, price: 85, unit: "Person" }]);
    expect(totals.lineItems[0].amount).toBe(21250);
  });

  it("keeps a fractional quantity where the unit is divisible", () => {
    // Half a field day, and a quarter-hour of consulting — both legitimate.
    const totals = services([
      { key: "fieldDay", qty: 0.5, price: 1250, unit: "Day" },
      { key: "reviewHour", qty: 0.25, price: 150, unit: "Hour" },
    ]);
    expect(totals.lineItems.map((row) => row.amount)).toEqual([625, 37.5]);
    expect(totals.subtotal).toBe(662.5);
  });

  it("prices four different billing units on one proposal, each by its own qty", () => {
    const totals = services([
      { key: "osha30", qty: 12, price: 510, unit: "Person" },
      { key: "culture", qty: 2, price: 1250, unit: "Session" },
      { key: "customWorkflow", qty: 8, price: 225, unit: "Hour" },
      { key: "mileage", qty: 120, price: 0.7, unit: "Mile" },
    ]);
    expect(totals.lineItems.map((row) => [row.unit, row.amount])).toEqual([
      ["Person", 6120],
      ["Session", 2500],
      ["Hour", 1800],
      ["Mile", 84],
    ]);
    expect(totals.subtotal).toBe(10504);
  });

  it("still bills the base subscription as one term, whatever the service rows do", () => {
    const totals = computeProposalTotals(
      state({
        fields: { packageSelect: "enterprise", annualPrice: "99500" },
        services: [item({ key: "osha10", qty: 25, price: 210, unit: "Person" })],
      }),
    );
    expect(totals.lineItems[0]).toMatchObject({ source: "package", qty: 1, unit: "", amount: 99500 });
    expect(totals.subtotal).toBe(104750);
  });

  it("makes the subtotal the sum of the amounts the client can see", () => {
    // Two three-mile trips at the IRS $0.655 rate. Each line prints $1.97, so
    // the subtotal printed under them must be $3.94 — summing the raw products
    // gave $3.93 and left the fee table one cent short of its own rows.
    const totals = services([
      { key: "mileage", qty: 3, price: 0.655, unit: "Mile" },
      { key: "mileage", qty: 3, price: 0.655, unit: "Mile" },
    ]);
    expect(totals.lineItems.map((row) => row.amount)).toEqual([1.97, 1.97]);
    expect(totals.subtotal).toBe(3.94);
    expect(totals.total).toBe(3.94);
  });

  it("leaves an ordinary whole-dollar proposal exactly where it was", () => {
    const totals = services([
      { key: "docMedium", qty: 3, price: 1150, unit: "Document" },
      { key: "complianceAudit", qty: 2, price: 1750, unit: "Audit" },
    ]);
    expect(totals.subtotal).toBe(6950);
    expect(totals.subtotal).toBe(totals.lineItems.reduce((sum, row) => sum + row.amount, 0));
  });
});

/* -------------------------------------------------------------------------- */
/* Billing basis — what a quantity MEANS, and what it therefore costs          */
/*                                                                             */
/* `unit` used to be a label with no arithmetic behind it, so a per-session     */
/* class and a per-head course were priced by the same multiplication and       */
/* printed with the same bare number. These are the two billing models the      */
/* business actually sells, plus the one where the quantity is not billed.      */
/* -------------------------------------------------------------------------- */

describe("computeProposalTotals — billing basis", () => {
  const services = (rows: Partial<GeneratorItem>[]) =>
    computeProposalTotals(state({ fields: { packageSelect: "none" }, services: rows.map((row) => item(row)) }));

  it("bills a $1,000 session class by the session, and drops to two when one cancels", () => {
    // Three classes booked at $1,000 for the room. The price does not move with
    // the headcount; the QUANTITY is the number of classes delivered. One
    // cancels, two are delivered, the client owes $2,000.
    const booked = services([{ key: "loto", qty: 3, price: 1000, unit: "Session", qty_basis: "session" }]);
    expect(booked.lineItems[0]).toMatchObject({ qtyBasis: "session", qty: 3, qtyLabel: "3 sessions", amount: 3000 });
    expect(booked.total).toBe(3000);

    const delivered = services([{ key: "loto", qty: 2, price: 1000, unit: "Session", qty_basis: "session" }]);
    expect(delivered.lineItems[0]).toMatchObject({ qty: 2, qtyLabel: "2 sessions", amount: 2000 });
    expect(delivered.total).toBe(2000);
  });

  it("bills bloodborne pathogens by the head: 10 attendees at $105 is $1,050", () => {
    const totals = services([{ key: "bbp", qty: 10, price: 105, unit: "Person", qty_basis: "attendee" }]);
    expect(totals.lineItems[0]).toMatchObject({
      qtyBasis: "attendee",
      qty: 10,
      qtyLabel: "10 attendees",
      price: 105,
      amount: 1050,
    });
    expect(totals.subtotal).toBe(1050);
    expect(totals.total).toBe(1050);
  });

  it("does not let the quantity move a flat line's amount", () => {
    // The point of the basis. Same fee at 1, at 4, and at 0 — a flat fee is
    // removed by deleting the line, not by typing a zero into a box the
    // document does not bill from.
    const amounts = [1, 4, 0, 250].map(
      (qty) => services([{ key: "adminSetup", qty, price: 2500, unit: "Project", qty_basis: "flat" }]).total,
    );
    expect(amounts).toEqual([2500, 2500, 2500, 2500]);
  });

  it("prints a flat line as a fee rather than as a quantity", () => {
    const totals = services([{ key: "adminSetup", qty: 4, price: 2500, unit: "Project", qty_basis: "flat" }]);
    // qty is normalized to the one unit actually billed so the fee table still
    // reconciles: the printed qty × price equals the printed amount.
    expect(totals.lineItems[0]).toMatchObject({ qtyBasis: "flat", qty: 1, qtyLabel: "Flat fee", price: 2500, amount: 2500 });
    expect(totals.lineItems[0].qty * totals.lineItems[0].price).toBe(totals.lineItems[0].amount);
  });

  it("bills hours by the hour and labels them as hours", () => {
    const totals = services([{ key: "reviewHour", qty: 8, price: 150, unit: "Hour", qty_basis: "hour" }]);
    expect(totals.lineItems[0]).toMatchObject({ qtyBasis: "hour", qtyLabel: "8 hours", amount: 1200 });
  });

  it("derives the basis from the row's unit when the row stored none", () => {
    // Which is what makes the label correct on the proposals already saved.
    const totals = services([
      { key: "genTraining", qty: 2, price: 750, unit: "Session" },
      { key: "osha10", qty: 25, price: 210, unit: "Person" },
      { key: "customWorkflow", qty: 6, price: 225, unit: "Hour" },
      { key: "mileage", qty: 120, price: 0.7, unit: "Mile" },
    ]);
    expect(totals.lineItems.map((row) => [row.qtyBasis, row.qtyLabel, row.amount])).toEqual([
      ["session", "2 sessions", 1500],
      ["attendee", "25 attendees", 5250],
      ["hour", "6 hours", 1350],
      [null, "120 Mile", 84],
    ]);
  });

  it("lets the row's stored basis beat the unit its catalog entry carries today", () => {
    // Same guarantee the stored `unit` has: a re-based catalog entry cannot
    // reach backwards into a document already sent.
    const totals = services([{ key: "osha10", qty: 1, price: 2100, unit: "Session", qty_basis: "session" }]);
    expect(serviceOptions.osha10.unit).toBe("Person");
    expect(totals.lineItems[0]).toMatchObject({ qtyBasis: "session", qtyLabel: "1 session", amount: 2100 });
  });

  it("keeps the subscription row printing its bare quantity", () => {
    const totals = computeProposalTotals(state({ fields: { packageSelect: "enterprise", annualPrice: "99500" } }));
    expect(totals.lineItems[0]).toMatchObject({ source: "package", qtyBasis: null, qtyLabel: "1", amount: 99500 });
  });
});

describe("computeProposalTotals — tiered per-head rates", () => {
  // The MODEL and the arithmetic only. No threshold and no discounted rate is
  // defined anywhere in this codebase: a line stays at its single flat rate
  // until someone with the authority to set prices puts numbers on it. These
  // ladders are the tests' own.
  const withTiers = (qty: number, tiers: { min_qty: number; price: number }[]) =>
    computeProposalTotals(
      state({
        fields: { packageSelect: "none" },
        services: [item({ key: "bbp", qty, price: 105, unit: "Person", qty_basis: "attendee", qty_tiers: tiers })],
      }),
    );

  const ladder = [
    { min_qty: 20, price: 95 },
    { min_qty: 50, price: 85 },
  ];

  it("holds the list rate below the first threshold", () => {
    expect(withTiers(10, ladder).lineItems[0]).toMatchObject({ price: 105, listPrice: 105, amount: 1050 });
  });

  it("steps the rate down for the WHOLE headcount once the threshold is met", () => {
    // Volume, not graduated: twenty heads at $95 is $1,900, not nineteen at
    // $105 plus one at $95.
    expect(withTiers(20, ladder).lineItems[0]).toMatchObject({ price: 95, listPrice: 105, amount: 1900 });
    expect(withTiers(60, ladder).lineItems[0]).toMatchObject({ price: 85, amount: 5100 });
  });

  it("keeps a tiered row's own arithmetic reconcilable on the printed page", () => {
    const row = withTiers(20, ladder).lineItems[0];
    expect(row.qty * row.price).toBe(row.amount);
  });

  it("prices a row with no ladder at its single flat rate — the default", () => {
    expect(withTiers(60, []).lineItems[0]).toMatchObject({ price: 105, amount: 6300 });
  });
});

/* -------------------------------------------------------------------------- */
/* Legacy states — these are documents already in clients' hands               */
/*                                                                             */
/* A proposal saved before the per-participant repricing, before `unit` was    */
/* part of a row, or before proposalType existed must still price and label    */
/* exactly as it did on the day it was sent.                                   */
/* -------------------------------------------------------------------------- */

describe("computeProposalTotals — legacy saved states", () => {
  it("keeps a pre-repricing training row at its session price AND its session label", () => {
    // The shape a proposal sent before 2026-08-12 holds: First Aid was $1,200
    // for the session then and is $145 per participant now. Reading the unit
    // from the live catalog printed this row as "1 Person" — a $1,200 head.
    const totals = computeProposalTotals(
      state({
        fields: { packageSelect: "none" },
        services: [item({ key: "firstAid", qty: 1, price: 1200, unit: "Session" })],
      }),
    );
    expect(totals.lineItems[0]).toMatchObject({ price: 1200, qty: 1, unit: "Session", amount: 1200 });
    expect(totals.lineItems[0].unit).not.toBe(serviceOptions.firstAid.unit);
    expect(totals.total).toBe(1200);
  });

  it("prices a row that stored nothing but a key, a qty and a price", () => {
    // No name, no desc, no unit — the catalog supplies all three, which is what
    // a template-seeded row (unit: "") relies on. The stored PRICE still wins,
    // so a repriced catalog cannot move a number on a sent document.
    const bare = { type: "service", key: "firstAid", qty: 6, price: 1200 } as unknown as GeneratorItem;
    const totals = computeProposalTotals(state({ fields: { packageSelect: "none" }, services: [bare] }));
    expect(totals.lineItems[0]).toMatchObject({
      name: serviceOptions.firstAid.name,
      desc: serviceOptions.firstAid.desc,
      price: 1200,
      amount: 7200,
    });
    // Nothing travelled with the price, so the only unit available is today's.
    // A row in this shape is the one case the stored-unit fix cannot cover.
    expect(totals.lineItems[0].unit).toBe(serviceOptions.firstAid.unit);
  });

  it("prices a proposal that predates proposalType and the term selects", () => {
    const totals = computeProposalTotals(
      state({
        fields: { packageSelect: "custom", annualPrice: "5000", depositPct: "25" },
        phases: [item({ type: "phase", key: "discovery", qty: 1, price: 3500 })],
        services: [item({ key: "genTraining", qty: 4, price: 750, unit: "Session" })],
      }),
    );
    // No proposalType, no termStart*/termEnd*: the package row states the term
    // without a duration rather than inventing one.
    expect(totals.lineItems[0].desc).toBe("Platform access for the term — includes 50 users and 2 sites.");
    expect(totals.subtotal).toBe(11500);
    expect(totals.deposit).toBe(2875);
  });

  it("prices a phase row that stored the old ordinal-prefixed name", () => {
    // stripPhaseOrdinal() is a render-time concern; the math must not care.
    const totals = computeProposalTotals(
      state({
        fields: { packageSelect: "none" },
        phases: [item({ type: "phase", key: "build", name: "Phase 2 — Build & Configure", qty: 1, price: 10000 })],
      }),
    );
    expect(totals.lineItems[0]).toMatchObject({ name: "Phase 2 — Build & Configure", unit: "", amount: 10000 });
  });

  it("prices a row whose catalog key no longer exists", () => {
    const totals = computeProposalTotals(
      state({
        fields: { packageSelect: "none" },
        services: [item({ key: "retiredCourse", name: "Retired Course", qty: 9, price: 95, unit: "Person" })],
      }),
    );
    expect(totals.lineItems[0]).toMatchObject({ name: "Retired Course", unit: "Person", amount: 855 });
  });

  it("prices a state saved before qty_basis existed to the cent, exactly as it did then", () => {
    // THE REGRESSION GUARD FOR THE WHOLE FEATURE. This is the literal shape a
    // signed proposal holds in client_proposals.form_data: no qty_basis on any
    // row, no qty_tiers, no delivery_mode. Every figure below is the one the
    // client's countersigned document prints, and none of them may move.
    const legacy = {
      v: 1,
      fields: { packageSelect: "professional", annualPrice: "65000", discountPct: "10", taxPct: "5.5", depositPct: "25" },
      phases: [
        { type: "phase", key: "discovery", name: "Discovery & Intake", qty: 1, price: 3500, desc: "", unit: "" },
        { type: "phase", key: "launch", name: "Launch & Training", qty: 2, price: 8000, desc: "", unit: "" },
      ],
      services: [
        { type: "service", key: "osha10", name: "OSHA 10 Training", qty: 25, price: 210, desc: "", unit: "Person" },
        { type: "service", key: "genTraining", name: "Training Session (general)", qty: 3, price: 750, desc: "", unit: "Session" },
        { type: "service", key: "auditDay", name: "In-Person Audit Day", qty: 4, price: 1750, desc: "", unit: "Day" },
        { type: "service", key: "mileage", name: "Travel Mileage", qty: 312, price: 0.655, desc: "", unit: "Mile" },
        { type: "service", key: "reviewHour", name: "Document Review / Consulting", qty: 6.5, price: 150, desc: "", unit: "Hour" },
      ],
    } as unknown as GeneratorState;

    const totals = computeProposalTotals(legacy);
    expect(totals.lineItems.map((row) => row.amount)).toEqual([65000, 3500, 16000, 5250, 2250, 7000, 204.36, 975]);
    expect(totals.subtotal).toBe(100179.36);
    expect(totals.discount).toBe(10017.94);
    expect(totals.tax).toBe(4958.88);
    expect(totals.total).toBe(95120.3);
    expect(totals.deposit).toBe(23780.08);

    // Not one of those rows lost its multiplier to a basis it never stored:
    // the only basis-free row here is the one whose unit implies none.
    expect(totals.lineItems.map((row) => row.qtyBasis)).toEqual([
      null,
      null,
      null,
      "attendee",
      "session",
      null,
      null,
      "hour",
    ]);
    for (const row of totals.lineItems) {
      expect(row.amount, row.name).toBe(Math.round(row.qty * row.price * 100) / 100);
    }
  });

  it("labels a legacy row the way the document already printed it", () => {
    // toFeeRow() composed `${qty} ${unit}`; qtyLabel must not change a single
    // character of that for a row with no basis, or every stored proposal
    // re-renders differently from the copy the client signed.
    const totals = computeProposalTotals(
      state({
        fields: { packageSelect: "none" },
        services: [
          item({ key: "auditDay", qty: 4, price: 1750, unit: "Day" }),
          item({ key: "mileage", qty: 312, price: 0.655, unit: "Mile" }),
          item({ key: "retiredExtra", name: "Retired Extra", qty: 2, price: 500, unit: "" }),
        ],
      }),
    );
    expect(totals.lineItems.map((row) => row.qtyLabel)).toEqual(["4 Day", "312 Mile", "2"]);
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

  it("falls back to plain multiplication for a hostile or unknown qty_basis", () => {
    // A basis arrives from persisted JSONB, so it is untrusted input like every
    // other value here. The dangerous failure is not a crash: it is a bogus
    // value being read as `flat` and quietly dropping a ×10 off a real total.
    // Ten heads at $105 must stay $1,050 no matter what the field says.
    // NB " FLAT " is deliberately absent: a real basis in odd casing or with
    // stray whitespace is a legitimate value written by some other build, and
    // is normalized rather than discarded. Only values that are not one of the
    // four at all land here.
    for (const qty_basis of [
      "flatten",
      "flat fee",
      "per head",
      "__proto__",
      "constructor",
      "toString",
      "",
      "   ",
      "<script>alert(1)</script>",
      0,
      1,
      true,
      null,
      {},
      [],
      ["flat"],
      { valueOf: () => "flat" },
    ]) {
      const totals = computeProposalTotals(
        state({
          fields: { packageSelect: "none" },
          services: [item({ key: "bbp", qty: 10, price: 105, unit: "Person", qty_basis } as Partial<GeneratorItem>)],
        }),
      );
      const row = totals.lineItems[0];
      expect(Number.isFinite(row.amount), String(qty_basis)).toBe(true);
      expect(row.amount, String(qty_basis)).toBe(1050);
      // Either the row's own unit resolved the basis, or nothing did — never a
      // basis the payload named.
      expect(["attendee", null], String(qty_basis)).toContain(row.qtyBasis);
      expect(totals.total).toBe(1050);
    }
  });

  it("ignores a malformed tier ladder instead of repricing from it", () => {
    for (const qty_tiers of [
      "[{min_qty:1,price:1}]",
      { min_qty: 1, price: 1 },
      [{ min_qty: "1", price: 1 }],
      [{ min_qty: 1, price: "1" }],
      [{ min_qty: Number.NaN, price: 1 }],
      [{ min_qty: 1, price: Number.POSITIVE_INFINITY }],
      [null, "1:1", 7],
      [],
      null,
    ]) {
      const totals = computeProposalTotals(
        state({
          fields: { packageSelect: "none" },
          services: [item({ key: "bbp", qty: 10, price: 105, unit: "Person", qty_basis: "attendee", qty_tiers } as Partial<GeneratorItem>)],
        }),
      );
      expect(totals.lineItems[0], JSON.stringify(qty_tiers)).toMatchObject({ price: 105, amount: 1050 });
    }
  });

  it("cannot be driven negative or infinite through a tier ladder", () => {
    const totals = computeProposalTotals(
      state({
        fields: { packageSelect: "none" },
        services: [
          item({ key: "bbp", qty: 10, price: 105, unit: "Person", qty_basis: "attendee", qty_tiers: [{ min_qty: 1, price: -1000 }] } as Partial<GeneratorItem>),
          item({ key: "bbp", qty: 10, price: 105, unit: "Person", qty_basis: "attendee", qty_tiers: [{ min_qty: -50, price: 0 }] } as Partial<GeneratorItem>),
        ],
      }),
    );
    expect(totals.lineItems.map((row) => row.amount)).toEqual([0, 0]);
    expect(totals.subtotal).toBe(0);
    expect(totals.total).toBe(0);
  });

  it("never prints a delivery mode it does not recognize", () => {
    for (const delivery_mode of ["hybrid", "<img src=x onerror=alert(1)>", "", 1, {}, null]) {
      const totals = computeProposalTotals(
        state({
          fields: { packageSelect: "none" },
          services: [item({ key: "bbp", qty: 1, price: 400, unit: "Session", delivery_mode } as Partial<GeneratorItem>)],
        }),
      );
      expect(totals.lineItems[0].deliveryMode).toBeNull();
      expect(totals.lineItems[0].deliveryLabel).toBe("");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Delivery mode — wording, never money                                        */
/* -------------------------------------------------------------------------- */

describe("computeProposalTotals — delivery mode", () => {
  const trainingLine = (delivery_mode?: DeliveryMode) =>
    computeProposalTotals(
      state({
        fields: { packageSelect: "none" },
        services: [item({ key: "bbp", qty: 10, price: 105, unit: "Person", qty_basis: "attendee", delivery_mode })],
      }),
    ).lineItems[0];

  it("carries the two course delivery modes onto the line", () => {
    expect(trainingLine("in_person")).toMatchObject({
      deliveryMode: "in_person",
      deliveryLabel: "Instructor-led course — in person",
    });
    expect(trainingLine("virtual")).toMatchObject({
      deliveryMode: "virtual",
      deliveryLabel: "Instructor-led course — virtual",
    });
  });

  it("says nothing at all when the seller did not choose", () => {
    expect(trainingLine()).toMatchObject({ deliveryMode: null, deliveryLabel: "" });
  });

  it("does not let the delivery mode move a single cent", () => {
    expect([trainingLine("in_person").amount, trainingLine("virtual").amount, trainingLine().amount]).toEqual([1050, 1050, 1050]);
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
