import { describe, expect, it } from "vitest";
import {
  contractorMultiplier,
  estimateContractValue,
  isHazardClass,
  lossRecordMultiplier,
  missingFields,
  siteSurcharge,
  blendedRate,
  headcountCharge,
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

  // company_profiles stores 0 quite happily. Counting it as PRESENT meant the
  // estimate refused while the gap list omitted the field causing the refusal,
  // so nobody could work out what to fix.
  it("names headcount as missing when it is zero, not just when it is null", () => {
    for (const employeeCount of [0, -5]) {
      expect(estimateContractValue({ employeeCount }).missing).toContain("Number of employees");
    }
  });

  it("does not let a zero EMR or zero site count buy confidence", () => {
    const result = estimateContractValue(profile({ emr: 0, trir: null, siteCount: 0 }));

    expect(result.missing).toContain("EMR (experience modification rate)");
    expect(result.missing).toContain("Number of locations");
    expect(result.confidence).not.toBe("high");
  });

  // estimateContractValue(client.profile) is the obvious call site, and a
  // company with no profile row has none.
  it("returns no estimate rather than throwing on a null profile", () => {
    expect(estimateContractValue(null).ok).toBe(false);
    expect(estimateContractValue(undefined).ok).toBe(false);
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

describe("the volume discount", () => {
  // The programme, templates and training library are written once, so serving
  // 5,000 people costs less PER HEAD than serving 50.
  it("lowers the blended rate as the population grows", () => {
    expect(blendedRate(50, 100)).toBe(100);
    expect(blendedRate(600, 100)).toBeLessThan(100);
    expect(blendedRate(6_000, 100)).toBeLessThan(blendedRate(600, 100));
  });

  // THE BUG THIS GUARDS. A whole-population factor makes every band edge a
  // cliff: at 5,000 employees the old version quoted $130,000 LESS than at
  // 4,999. A client who hires someone must never be quoted less, and a
  // salesperson must never be able to lower a quote by rounding headcount up.
  it("never charges less in total for one more employee", () => {
    for (let n = 1; n < 6_000; n += 1) {
      const here = headcountCharge(n, 165);
      const next = headcountCharge(n + 1, 165);
      if (next < here) {
        throw new Error(`headcountCharge fell from ${here} at ${n} to ${next} at ${n + 1}`);
      }
    }
  });

  it("is continuous across every band edge", () => {
    for (const edge of [250, 1_000, 5_000]) {
      expect(headcountCharge(edge, 165)).toBeGreaterThan(headcountCharge(edge - 1, 165));
    }
  });

  // Marginal, like tax brackets: the first 250 heads pay full freight whatever
  // the total, so the estimate for a small firm is unchanged by the bands.
  it("charges the first band in full", () => {
    expect(headcountCharge(100, 100)).toBe(10_000);
    expect(headcountCharge(250, 100)).toBe(25_000);
    // The 251st head is the first discounted one.
    expect(headcountCharge(251, 100)).toBe(25_090);
  });

  it("keeps the whole estimate monotonic in headcount, not just the charge", () => {
    let previous = 0;
    for (const employeeCount of [1, 100, 249, 250, 251, 999, 1_000, 1_001, 4_999, 5_000, 5_001, 20_000]) {
      const { mid } = estimateContractValue(profile({ employeeCount, annualRevenue: null }));
      expect(mid).toBeGreaterThanOrEqual(previous);
      previous = mid;
    }
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

  // The flag says the cap CHANGED the answer, not merely that one was computed.
  // Claiming otherwise had the screen state a cap of $3,000 directly above a
  // quote of $6,000.
  it("does not claim a cap when the floor is what actually bound the quote", () => {
    // 100 heads at $90 is $9,000 — above the floor, so the floor is not what
    // binds either. The 3% ceiling ($3,000) is BELOW the floor, so it cannot be
    // applied without quoting an uneconomic engagement: it is discarded, and
    // the output must not claim a cap it did not apply.
    const result = estimateContractValue({ employeeCount: 100, hazardClass: "moderate", annualRevenue: 100_000 });

    expect(result.mid).toBe(9_000);
    expect(result.cappedByRevenue).toBe(false);
    expect(result.drivers.some((driver) => driver.label === "Revenue ceiling")).toBe(false);
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

  // A client anchors on whichever end suits them, so neither end may contradict
  // the driver text beside it: no quote below the stated minimum, and none
  // above the stated revenue ceiling.
  it("never quotes below the engagement floor, even at the bottom of the band", () => {
    expect(estimateContractValue({ employeeCount: 3, hazardClass: "low" }).low).toBeGreaterThanOrEqual(6_000);
  });

  it("never quotes above the revenue ceiling, even at the top of the band", () => {
    const input = profile({ employeeCount: 4_000, annualRevenue: 2_000_000 });
    const result = estimateContractValue(input);

    expect(result.cappedByRevenue).toBe(true);
    expect(result.high).toBeLessThanOrEqual(Math.round(2_000_000 * 0.03));
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
