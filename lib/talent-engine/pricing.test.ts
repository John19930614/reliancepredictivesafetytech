import { describe, expect, it } from "vitest";
import {
  buildConsoleSummary,
  computeGrossMarginPct,
  computeMarkupPct,
  computeMatchMoney,
  computeSpread,
  computeWeeklyMargin,
  counterPayRate,
  meetsSpreadFloor,
  roundMoney,
  summariseLedger,
  validateHoursInput,
  validateRateInput,
} from "./pricing";
import { maxHourlyRate, maxWeeklyHours, type LedgerRow } from "./types";

const ledgerRow = (overrides: Partial<LedgerRow> = {}): LedgerRow => ({
  placement_id: "11111111-1111-4111-8111-111111111111",
  candidate_name: "Dana Reyes",
  client_name: "Acme Industrial",
  bill_rate: 95,
  pay_rate: 70,
  spread: 25,
  hours: 40,
  weekly_margin: 1000,
  ...overrides,
});

/* -------------------------------------------------------------------------- */
/* Rounding — the float-noise guard the whole module depends on               */
/* -------------------------------------------------------------------------- */

describe("roundMoney", () => {
  it("rounds to whole cents", () => {
    expect(roundMoney(24.9)).toBe(24.9);
    expect(roundMoney(1234.567)).toBe(1234.57);
    expect(roundMoney(0)).toBe(0);
  });

  it("kills IEEE-754 noise instead of passing it through", () => {
    expect(95 - 70.1).not.toBe(24.9); // the bug this exists to stop
    expect(roundMoney(95 - 70.1)).toBe(24.9);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(3 * 0.7)).toBe(2.1);
  });

  it("rounds a true half away from zero, in both directions", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(2.675)).toBe(2.68);
  });

  it("collapses garbage to 0 rather than returning NaN or -0", () => {
    for (const value of [NaN, Infinity, -Infinity, null, undefined, "abc", {}, []]) {
      expect(roundMoney(value)).toBe(0);
      expect(Number.isNaN(roundMoney(value))).toBe(false);
    }
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true);
  });

  it("coerces the numeric strings a numeric column hands back", () => {
    expect(roundMoney("95.00")).toBe(95);
    expect(roundMoney(" 24.905 ")).toBe(24.91);
  });
});

/* -------------------------------------------------------------------------- */
/* Per-match money                                                            */
/* -------------------------------------------------------------------------- */

describe("computeSpread", () => {
  it("subtracts pay from bill", () => {
    expect(computeSpread(95, 70)).toBe(25);
    expect(computeSpread(112.5, 78.25)).toBe(34.25);
  });

  it("never leaks float noise", () => {
    expect(computeSpread(95, 70.1)).toBe(24.9);
    expect(computeSpread(0.3, 0.1)).toBe(0.2);
  });

  it("reports a negative spread rather than clamping a losing match to zero", () => {
    expect(computeSpread(60, 75)).toBe(-15);
  });

  it("treats malformed rates as zero", () => {
    expect(computeSpread(NaN, 70)).toBe(-70);
    expect(computeSpread(95, Infinity)).toBe(95);
  });
});

describe("computeMarkupPct", () => {
  it("states the spread as a percentage of pay", () => {
    expect(computeMarkupPct(95, 70)).toBe(35.71);
    expect(computeMarkupPct(100, 75)).toBe(33.33);
    expect(computeMarkupPct(140, 100)).toBe(40);
  });

  it("returns 0 instead of Infinity when the pay rate is zero", () => {
    const markup = computeMarkupPct(95, 0);
    expect(markup).toBe(0);
    expect(Number.isFinite(markup)).toBe(true);
    expect(computeMarkupPct(0, 0)).toBe(0);
  });

  it("goes negative for an underwater match", () => {
    expect(computeMarkupPct(60, 75)).toBe(-20);
  });
});

describe("computeGrossMarginPct", () => {
  it("states the spread as a percentage of bill", () => {
    expect(computeGrossMarginPct(95, 70)).toBe(26.32);
    expect(computeGrossMarginPct(100, 75)).toBe(25);
  });

  it("returns 0 instead of Infinity when the bill rate is zero", () => {
    expect(computeGrossMarginPct(0, 70)).toBe(0);
    expect(computeGrossMarginPct(0, 0)).toBe(0);
  });
});

describe("computeWeeklyMargin", () => {
  it("multiplies the spread by the hours", () => {
    expect(computeWeeklyMargin(25, 40)).toBe(1000);
    expect(computeWeeklyMargin(24.9, 37.5)).toBe(933.75);
  });

  it("is zero for zero hours and never NaN for junk", () => {
    expect(computeWeeklyMargin(25, 0)).toBe(0);
    expect(computeWeeklyMargin(NaN, 40)).toBe(0);
    expect(computeWeeklyMargin(25, "abc" as unknown as number)).toBe(0);
  });
});

describe("meetsSpreadFloor", () => {
  it("passes a match at or above the floor", () => {
    expect(meetsSpreadFloor(95, 70, 20)).toBe(true);
    expect(meetsSpreadFloor(90, 70, 20)).toBe(true); // exactly on the floor
  });

  it("fails a match under the floor", () => {
    expect(meetsSpreadFloor(85, 70, 20)).toBe(false);
    expect(meetsSpreadFloor(60, 75, 20)).toBe(false);
  });

  it("agrees with the displayed spread on a float-noise boundary", () => {
    // 95 − 70.1 is 24.900000000000002 raw; against a 24.9 floor the naive
    // comparison passes for the wrong reason, and the reverse case must not fail.
    expect(computeSpread(95, 70.1)).toBe(24.9);
    expect(meetsSpreadFloor(95, 70.1, 24.9)).toBe(true);
    expect(meetsSpreadFloor(95, 70.1, 24.91)).toBe(false);
  });
});

describe("counterPayRate", () => {
  it("returns the pay rate that exactly restores the floor", () => {
    expect(counterPayRate(95, 20)).toBe(75);
    expect(meetsSpreadFloor(95, counterPayRate(95, 20), 20)).toBe(true);
    expect(counterPayRate(112.35, 20)).toBe(92.35);
  });

  it("clamps to zero when the floor is wider than the bill rate", () => {
    expect(counterPayRate(15, 20)).toBe(0);
    expect(counterPayRate(20, 20)).toBe(0);
    expect(counterPayRate(NaN, 20)).toBe(0);
  });
});

describe("computeMatchMoney", () => {
  it("returns every derived number for a healthy match", () => {
    expect(computeMatchMoney(95, 70, 20, 40)).toEqual({
      spread: 25,
      markupPct: 35.71,
      grossMarginPct: 26.32,
      weeklyMargin: 1000,
      floorOk: true,
    });
  });

  it("defaults to a 40-hour week", () => {
    expect(computeMatchMoney(95, 70, 20).weeklyMargin).toBe(1000);
  });

  it("flags an underwater match without throwing", () => {
    const money = computeMatchMoney(80, 70, 20, 40);
    expect(money).toMatchObject({ spread: 10, floorOk: false, weeklyMargin: 400 });
  });

  it("survives a zero-pay match with finite numbers throughout", () => {
    const money = computeMatchMoney(95, 0, 20, 40);
    expect(money.markupPct).toBe(0);
    for (const value of [money.spread, money.markupPct, money.grossMarginPct, money.weeklyMargin]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Ledger rollup                                                              */
/* -------------------------------------------------------------------------- */

describe("summariseLedger", () => {
  it("totals hours, billings, pay and margin across placements", () => {
    const totals = summariseLedger([
      ledgerRow({ bill_rate: 95, pay_rate: 70, hours: 40 }),
      ledgerRow({ bill_rate: 110, pay_rate: 80, hours: 40 }),
    ]);
    expect(totals).toEqual({
      totalHours: 80,
      totalBilled: 8200,
      totalPaid: 6000,
      totalMargin: 2200,
      avgSpread: 27.5,
    });
  });

  it("weights the average spread by hours instead of averaging the rows", () => {
    // Unweighted mean of $25 and $5 is $15; the honest blended number is $23.18.
    const totals = summariseLedger([
      ledgerRow({ bill_rate: 95, pay_rate: 70, hours: 40 }),
      ledgerRow({ bill_rate: 55, pay_rate: 50, hours: 4 }),
    ]);
    expect(totals.totalHours).toBe(44);
    expect(totals.avgSpread).toBe(23.18);
  });

  it("returns zeroes for an empty, null, or all-zero-hours ledger", () => {
    const empty = { totalHours: 0, totalBilled: 0, totalPaid: 0, totalMargin: 0, avgSpread: 0 };
    expect(summariseLedger([])).toEqual(empty);
    expect(summariseLedger(null as unknown as LedgerRow[])).toEqual(empty);
    expect(summariseLedger([ledgerRow({ hours: 0 })])).toEqual(empty);
  });

  it("skips malformed rows rather than blanking the whole rollup", () => {
    const totals = summariseLedger([
      null,
      "nope",
      7,
      ledgerRow({ bill_rate: 95, pay_rate: 70, hours: 40 }),
      ledgerRow({ hours: NaN }),
      ledgerRow({ hours: -10 }),
    ] as unknown as LedgerRow[]);
    expect(totals.totalHours).toBe(40);
    expect(totals.totalMargin).toBe(1000);
  });

  it("rounds cent-level rates instead of accumulating float drift", () => {
    const totals = summariseLedger([ledgerRow({ bill_rate: 0.7, pay_rate: 0.1, hours: 3 })]);
    expect(totals.totalBilled).toBe(2.1);
    expect(totals.totalPaid).toBe(0.3);
    expect(totals.totalMargin).toBe(1.8);
  });
});

/* -------------------------------------------------------------------------- */
/* Console summary                                                            */
/* -------------------------------------------------------------------------- */

describe("buildConsoleSummary", () => {
  it("fills every KPI from the ledger plus the two counts", () => {
    const summary = buildConsoleSummary({
      ledger: [
        ledgerRow({ bill_rate: 95, pay_rate: 70, hours: 40 }),
        ledgerRow({ bill_rate: 110, pay_rate: 80, hours: 40 }),
      ],
      activePlacements: 2,
      pendingApprovals: 3,
    });
    expect(summary).toEqual({
      activePlacements: 2,
      billableHours: 80,
      avgSpreadPerHour: 27.5,
      weeklyGrossMargin: 2200,
      revenueRunRate: 426400,
      pendingApprovals: 3,
      clientBillings: 8200,
      workerPay: 6000,
      grossMarginPct: 26.83,
      avgMarkupPct: 36.67,
    });
  });

  it("annualises client billings, not margin — 52 weeks of the current book", () => {
    const summary = buildConsoleSummary({ ledger: [ledgerRow({ bill_rate: 100, pay_rate: 75, hours: 40 })] });
    expect(summary.clientBillings).toBe(4000);
    expect(summary.revenueRunRate).toBe(4000 * 52);
    expect(summary.revenueRunRate).not.toBe(summary.weeklyGrossMargin * 52);
  });

  it("returns an all-zero strip for no arguments at all", () => {
    expect(buildConsoleSummary()).toEqual({
      activePlacements: 0,
      billableHours: 0,
      avgSpreadPerHour: 0,
      weeklyGrossMargin: 0,
      revenueRunRate: 0,
      pendingApprovals: 0,
      clientBillings: 0,
      workerPay: 0,
      grossMarginPct: 0,
      avgMarkupPct: 0,
    });
  });

  it("clamps negative and fractional counts and never emits NaN", () => {
    const summary = buildConsoleSummary({
      ledger: "nope" as unknown as LedgerRow[],
      activePlacements: -4,
      pendingApprovals: 2.9,
    });
    expect(summary.activePlacements).toBe(0);
    expect(summary.pendingApprovals).toBe(2);
    for (const value of Object.values(summary)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Input validation                                                           */
/* -------------------------------------------------------------------------- */

describe("validateRateInput", () => {
  it("accepts rates inside the numeric(10,2) bounds", () => {
    expect(validateRateInput(0)).toEqual({ ok: true });
    expect(validateRateInput(95.5)).toEqual({ ok: true });
    expect(validateRateInput(maxHourlyRate)).toEqual({ ok: true });
    expect(validateRateInput("87.25")).toEqual({ ok: true });
  });

  it("rejects NaN, non-finite, and non-numeric values", () => {
    for (const value of [NaN, Infinity, -Infinity, "abc", {}, [], true, null, undefined, ""]) {
      const result = validateRateInput(value);
      expect(result.ok).toBe(false);
      expect(result.reason).toBeTruthy();
    }
  });

  it("rejects negative rates and rates over the maximum", () => {
    expect(validateRateInput(-0.01).ok).toBe(false);
    expect(validateRateInput(-100).reason).toContain("negative");
    expect(validateRateInput(maxHourlyRate + 0.01).ok).toBe(false);
    expect(validateRateInput(1e9).reason).toContain(String(maxHourlyRate));
  });
});

describe("validateHoursInput", () => {
  it("accepts a normal and a maximum week", () => {
    expect(validateHoursInput(40)).toEqual({ ok: true });
    expect(validateHoursInput("37.5")).toEqual({ ok: true });
    expect(validateHoursInput(maxWeeklyHours)).toEqual({ ok: true });
    expect(validateHoursInput(0)).toEqual({ ok: true });
  });

  it("rejects negatives, junk, and more hours than a week holds", () => {
    expect(validateHoursInput(-1).ok).toBe(false);
    expect(validateHoursInput(maxWeeklyHours + 1).ok).toBe(false);
    expect(validateHoursInput(NaN).ok).toBe(false);
    expect(validateHoursInput("abc").ok).toBe(false);
    expect(validateHoursInput(undefined).ok).toBe(false);
  });
});
