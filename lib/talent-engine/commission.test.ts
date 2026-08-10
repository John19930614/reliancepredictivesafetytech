import { describe, expect, it } from "vitest";
import {
  ownerRetainedMargin,
  projectedAnnualComp,
  recruiterWeekEconomics,
  solveBreakEven,
  weeklyBaseCost,
  weeklyCommission,
} from "./commission";

describe("weeklyCommission / ownerRetainedMargin", () => {
  it("matches the meeting's reference math: 5% of a $1,000 week is $50", () => {
    expect(weeklyCommission(1000, 5)).toBe(50);
    expect(ownerRetainedMargin(1000, 5)).toBe(950);
  });

  it("~$2,600 per placement per year at a $1,000/wk margin", () => {
    expect(weeklyCommission(1000, 5) * 52).toBe(2600);
  });

  it("clamps garbage to zero and caps the percentage", () => {
    expect(weeklyCommission(-500, 5)).toBe(0);
    expect(weeklyCommission(Number.NaN, 5)).toBe(0);
    expect(weeklyCommission(1000, 90)).toBe(500); // capped at 50
    expect(weeklyCommission(1000, -5)).toBe(0);
  });
});

describe("weeklyBaseCost / projectedAnnualComp", () => {
  it("splits an annual base into weeks", () => {
    expect(weeklyBaseCost(52000)).toBe(1000);
  });

  it("projects the meeting's year-one comp shape", () => {
    // $70K base + $50/wk commission ≈ $72.6K.
    expect(projectedAnnualComp(70000, 50)).toBe(72600);
  });
});

describe("solveBreakEven", () => {
  it("solves the configurable model", () => {
    const result = solveBreakEven({ baseSalary: 52000, spreadPerHour: 25, hoursPerWeek: 40, commissionPct: 5 });
    expect(result.weeklyCost).toBe(1000);
    expect(result.marginPerPlacement).toBe(1000);
    expect(result.ownerSharePerPlacement).toBe(950);
    // $950 retained per placement against a $1,000/wk salary: two placements.
    expect(result.placementsNeeded).toBe(2);
    expect(result.hoursNeeded).toBe(80);
  });

  it("a zero salary needs zero placements", () => {
    expect(solveBreakEven({ baseSalary: 0, spreadPerHour: 25, hoursPerWeek: 40, commissionPct: 5 }).placementsNeeded).toBe(0);
  });

  it("says 'never' instead of Infinity when there is no margin to retain", () => {
    const noSpread = solveBreakEven({ baseSalary: 52000, spreadPerHour: 0, hoursPerWeek: 40, commissionPct: 5 });
    expect(noSpread.placementsNeeded).toBeNull();
    expect(noSpread.hoursNeeded).toBeNull();
  });

  it("smaller spreads need more placements — the meeting's three-worker case", () => {
    // Covering a $52K salary on a ~$9/hr spread at 40 hrs takes 3 placements.
    const thin = solveBreakEven({ baseSalary: 52000, spreadPerHour: 9, hoursPerWeek: 40, commissionPct: 5 });
    expect(thin.placementsNeeded).toBe(3);
  });
});

describe("recruiterWeekEconomics", () => {
  it("rolls one week up from the plan", () => {
    const week = recruiterWeekEconomics(2000, { base_salary: 52000, commission_pct: 5 });
    expect(week.commission).toBe(100);
    expect(week.weeklyBase).toBe(1000);
    expect(week.totalCompCost).toBe(1100);
    expect(week.ownerNet).toBe(900);
    expect(week.coverageRatio).toBe(1.82);
  });

  it("handles a zero-cost plan without dividing by zero", () => {
    const week = recruiterWeekEconomics(500, { base_salary: 0, commission_pct: 0 });
    expect(week.totalCompCost).toBe(0);
    expect(week.coverageRatio).toBeNull();
  });
});
