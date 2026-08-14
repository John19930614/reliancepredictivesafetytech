import { describe, expect, it } from "vitest";
import {
  contractorMultiplier,
  estimateContractValue,
  isHazardClass,
  lossRecordMultiplier,
  missingFields,
  siteSurcharge,
  volumeFactor,
  type ContractEstimateInput,
} from "./contract-estimate";

/** A fully-populated profile, so each test can knock out one field at a time. */
function profile(over: Partial<ContractEstimateInput> = {}): ContractEstimateInput {
  return {
    employeeCount: 400,
    siteCount: 5,
    annualRevenue: 60_000_000,
    hazardClass: "high",
    emr: 1.0,
    trir: 3.0,
    contractorSharePct: 0,
    ...over,
  };
}

/* -------------------------------------------------------------------------- */
/* The one field with no substitute                                           */
/* -------------------------------------------------------------------------- */

describe("headcount is required", () => {
  // Everything else scales or corroborates headcount, so without it there is no
  // estimate — only a prompt for the number that would produce one.
  it("refuses to guess without an employee count", () => {
    const result = estimateContractValue({ hazardClass: "severe", siteCount: 40, annualRevenue: 900_000_000 });

    expect(result.ok).toBe(false);
    expect(result.mid).toBe(0);
    expect(result.confidence).toBe("none");
    expect(result.missing[0]).toBe("Number of employees");
  });

  it("estimates from headcount alone, but never rates it above low confidence", () => {
    const result = estimateContractValue({ employeeCount: 400 });

    expect(result.ok).toBe(true);
    expect(result.mid).toBeGreaterThan(0);
    // A number from headcount alone is a guess dressed up — say so.
    expect(result.confidence).toBe("low");
  });

  it("treats zero, negative and non-numeric headcount as absent", () => {
    for (const employeeCount of [0, -5, Number.NaN, null, undefined]) {
      expect(estimateContractValue({ employeeCount }).ok).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Drivers                                                                    */
/* -------------------------------------------------------------------------- */

describe("hazard class", () => {
  // A roofing contractor and an accounting firm with identical headcount are
  // not the same job, and the estimate has to say so.
  it("prices severe work well above low-hazard work at the same headcount", () => {
    const low = estimateContractValue(profile({ hazardClass: "low" })).mid;
    const severe = estimateContractValue(profile({ hazardClass: "severe" })).mid;

    expect(severe).toBeGreaterThan(low * 3);
  });

  it("rises monotonically across the four classes", () => {
    const values = (["low", "moderate", "high", "severe"] as const).map(
      (hazardClass) => estimateContractValue(profile({ hazardClass, annualRevenue: null })).mid,
    );

    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(4);
  });

  it("falls back to moderate for an unclassified or bogus value", () => {
    const moderate = estimateContractValue(profile({ hazardClass: "moderate" })).mid;

    expect(estimateContractValue(profile({ hazardClass: null })).mid).toBe(moderate);
    expect(estimateContractValue(profile({ hazardClass: "catastrophic" })).mid).toBe(moderate);
  });

  it("validates the vocabulary", () => {
    expect(isHazardClass("high")).toBe(true);
    expect(isHazardClass("HIGH")).toBe(false);
    expect(isHazardClass(null)).toBe(false);
  });
});

describe("siteSurcharge", () => {
  it("charges nothing for a single site", () => {
    expect(siteSurcharge(1)).toBe(0);
    expect(siteSurcharge(null)).toBe(0);
    expect(siteSurcharge(0)).toBe(0);
  });

  // 20 sites is not 20x the work of one — the written programme is shared. The
  // curve has to be sub-linear or a multi-site quote becomes fantasy.
  it("grows sub-linearly: 17 sites costs far less than 16x the second site", () => {
    const second = siteSurcharge(2);
    const seventeenth = siteSurcharge(17);

    expect(seventeenth).toBeGreaterThan(second);
    expect(seventeenth).toBeLessThan(second * 16);
    expect(seventeenth).toBe(second * 4); // sqrt(16) = 4
  });

  it("still increases with every extra site", () => {
    expect(siteSurcharge(10)).toBeGreaterThan(siteSurcharge(9));
  });
});

describe("lossRecordMultiplier", () => {
  // A poor record RAISES the value: the need is proven and the insurance saving
  // is money the buyer can already see.
  it("raises the estimate for a worse-than-average record", () => {
    expect(lossRecordMultiplier(1.5, 3)).toBeGreaterThan(1);
  });

  it("lowers it for a company that is already good", () => {
    expect(lossRecordMultiplier(0.7, 1)).toBeLessThan(1);
  });

  it("sits at exactly 1 for a dead-average company", () => {
    expect(lossRecordMultiplier(1.0, 3.0)).toBe(1);
  });

  it("is 1 when nothing is known", () => {
    expect(lossRecordMultiplier(null, null)).toBe(1);
    expect(lossRecordMultiplier(undefined, undefined)).toBe(1);
  });

  // An EMR of 3 is usually a typo, and even when real it does not triple what
  // anyone signs.
  it("clamps absurd inputs at both ends", () => {
    expect(lossRecordMultiplier(50, 500)).toBeLessThanOrEqual(1.6);
    expect(lossRecordMultiplier(0.01, 0)).toBeGreaterThanOrEqual(0.75);
  });

  it("ignores a negative or zero EMR rather than inverting the sale", () => {
    expect(lossRecordMultiplier(0, 3)).toBe(1);
    expect(lossRecordMultiplier(-2, 3)).toBe(1);
  });
});

describe("contractorMultiplier", () => {
  it("is neutral at zero and unknown", () => {
    expect(contractorMultiplier(0)).toBe(1);
    expect(contractorMultiplier(null)).toBe(1);
  });

  it("raises the estimate as the rotating share grows", () => {
    expect(contractorMultiplier(100)).toBeGreaterThan(contractorMultiplier(50));
    expect(contractorMultiplier(50)).toBeGreaterThan(contractorMultiplier(0));
  });

  it("clamps out-of-range percentages", () => {
    expect(contractorMultiplier(500)).toBe(contractorMultiplier(100));
    expect(contractorMultiplier(-20)).toBe(1);
  });
});

describe("volumeFactor", () => {
  // The programme, templates and training library are written once, so serving
  // 5,000 people costs less per head than serving 50.
  it("discounts larger populations, never smaller ones", () => {
    expect(volumeFactor(50)).toBe(1);
    expect(volumeFactor(400)).toBeLessThan(1);
    expect(volumeFactor(6_000)).toBeLessThan(volumeFactor(400));
  });

  it("applies each band from its threshold", () => {
    expect(volumeFactor(249)).toBe(1);
    expect(volumeFactor(250)).toBeLessThan(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Revenue as a ceiling, never a driver                                       */
/* -------------------------------------------------------------------------- */

describe("revenue ceiling", () => {
  // Revenue is a proxy for size and nothing else. Two identical workforces must
  // price identically, whatever the margin behind them.
  it("does not raise the estimate for a richer company", () => {
    const lean = estimateContractValue(profile({ annualRevenue: 40_000_000 }));
    const rich = estimateContractValue(profile({ annualRevenue: 900_000_000 }));

    expect(rich.mid).toBe(lean.mid);
    expect(rich.cappedByRevenue).toBe(false);
  });

  // ...but a company cannot spend what it does not earn.
  it("caps a headcount-heavy, revenue-thin company and says it did", () => {
    const result = estimateContractValue(profile({ employeeCount: 4_000, annualRevenue: 2_000_000 }));

    expect(result.cappedByRevenue).toBe(true);
    expect(result.mid).toBeLessThan(estimateContractValue(profile({ employeeCount: 4_000, annualRevenue: null })).mid);
    expect(result.drivers.some((driver) => driver.label === "Revenue ceiling")).toBe(true);
  });

  it("never caps below the engagement floor", () => {
    const result = estimateContractValue(profile({ employeeCount: 3_000, annualRevenue: 1 }));

    expect(result.mid).toBeGreaterThanOrEqual(6_000);
  });

  it("ignores a missing or nonsensical revenue", () => {
    for (const annualRevenue of [null, 0, -5_000_000]) {
      expect(estimateContractValue(profile({ annualRevenue })).cappedByRevenue).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Floor and band                                                             */
/* -------------------------------------------------------------------------- */

describe("engagement floor", () => {
  // Onboarding, a named contact and a reporting line cost the same whether the
  // client has 8 employees or 80.
  it("lifts a tiny engagement to the minimum and explains why", () => {
    const result = estimateContractValue({ employeeCount: 3, hazardClass: "low" });

    expect(result.mid).toBe(6_000);
    expect(result.drivers.some((driver) => driver.label === "Engagement floor")).toBe(true);
  });

  it("does not mention the floor when the estimate clears it", () => {
    const result = estimateContractValue(profile());

    expect(result.drivers.some((driver) => driver.label === "Engagement floor")).toBe(false);
  });
});

describe("the quoted band", () => {
  it("brackets the midpoint and stays ordered", () => {
    const { low, mid, high } = estimateContractValue(profile());

    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });

  it("rounds to something a person would say out loud", () => {
    for (const value of Object.values(estimateContractValue(profile()))) {
      if (typeof value === "number") expect(value % 500).toBe(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Confidence and gaps                                                        */
/* -------------------------------------------------------------------------- */

describe("confidence", () => {
  it("is high only when hazard, sites and a loss record are all known", () => {
    expect(estimateContractValue(profile()).confidence).toBe("high");
  });

  it("drops to medium when the loss record is unknown", () => {
    expect(estimateContractValue(profile({ emr: null, trir: null })).confidence).toBe("medium");
  });

  it("drops to low without a hazard class, however much else is known", () => {
    const result = estimateContractValue(profile({ hazardClass: null }));

    expect(result.confidence).toBe("low");
  });

  // Confidence describes the INPUTS. The arithmetic is equally certain either
  // way, and pretending otherwise would be the dishonest part.
  it("is none when there is nothing to compute from", () => {
    expect(estimateContractValue({}).confidence).toBe("none");
  });
});

describe("missingFields", () => {
  it("is empty for a complete profile", () => {
    expect(missingFields(profile())).toEqual([]);
  });

  it("names what would sharpen the estimate, most valuable first", () => {
    const gaps = missingFields({ employeeCount: 100 });

    expect(gaps[0]).toBe("Hazard class of the work");
    expect(gaps).toContain("EMR (experience modification rate)");
  });

  it("counts a bogus hazard class as missing rather than accepting it", () => {
    expect(missingFields(profile({ hazardClass: "spicy" }))).toContain("Hazard class of the work");
  });
});

/* -------------------------------------------------------------------------- */
/* Determinism — the whole reason this is a formula                           */
/* -------------------------------------------------------------------------- */

describe("determinism", () => {
  // The point of a formula over a model: the same inputs always produce the
  // same number, and a client can be shown how it was derived.
  it("returns an identical estimate for identical inputs", () => {
    expect(estimateContractValue(profile())).toEqual(estimateContractValue(profile()));
  });

  it("explains every estimate it produces", () => {
    const result = estimateContractValue(profile());

    expect(result.drivers.length).toBeGreaterThan(0);
    expect(result.drivers[0].label).toBe("Headcount");
    for (const driver of result.drivers) {
      expect(driver.detail.length).toBeGreaterThan(0);
    }
  });
});
