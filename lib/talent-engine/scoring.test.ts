import { describe, expect, it } from "vitest";
import {
  matchScoringInputKeys,
  scoreAvailabilityFit,
  scoreCertificationFit,
  scoreExperienceFit,
  scoreLocationFit,
  scoreMatch,
  scoreSpreadFit,
  scoringSignals,
  talentScoringWeights,
  toScoringInput,
  type MatchScoringInput,
  type ScoringWeights,
} from "./scoring";

const NOW = new Date("2026-08-06T00:00:00.000Z");

function input(overrides: Partial<MatchScoringInput> = {}): MatchScoringInput {
  return {
    billRate: 95,
    payRate: 68,
    spreadFloor: 20,
    requiredCertifications: ["CSP"],
    heldCertifications: ["CSP"],
    verifiedCertifications: ["CSP"],
    yearsExperience: 12,
    requiredYears: null,
    candidateVerticals: ["Construction"],
    orderVertical: "Construction",
    candidateLocation: "Houston, TX",
    orderLocation: "Houston, TX",
    willingToRelocate: false,
    availabilityDate: "2026-08-01",
    orderStartDate: "2026-09-01",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// EEO guardrail (blueprint §6)
// ---------------------------------------------------------------------------
describe("EEO guardrail — the scoring surface", () => {
  // The load-bearing test in this file. If someone adds `age`, `gender`,
  // `fullName`, `email`, `phone` or a photo url to MatchScoringInput, this
  // fails — and so does the compile-time assertion in scoring.ts.
  it("accepts exactly the job-relevant allow-list and nothing else", () => {
    const populated: Record<keyof MatchScoringInput, unknown> = {
      billRate: 95,
      payRate: 68,
      spreadFloor: 20,
      requiredCertifications: [],
      heldCertifications: [],
      verifiedCertifications: [],
      yearsExperience: null,
      requiredYears: null,
      candidateVerticals: [],
      orderVertical: null,
      candidateLocation: null,
      orderLocation: null,
      willingToRelocate: false,
      availabilityDate: null,
      orderStartDate: null,
    };

    expect(Object.keys(populated).sort()).toEqual([...matchScoringInputKeys].sort());
  });

  it("names no protected characteristic anywhere in the allow-list", () => {
    const forbidden = [
      "name",
      "email",
      "phone",
      "age",
      "birth",
      "dob",
      "gender",
      "sex",
      "race",
      "ethnic",
      "national",
      "citizen",
      "religion",
      "marital",
      "disab",
      "veteran",
      "photo",
      "avatar",
      "image",
    ];
    // Compared word-by-word, not as substrings: "yearsExperience" innocently
    // contains "sex", and a substring check would make this assertion a liar.
    for (const key of matchScoringInputKeys) {
      const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(" ");
      const offending = words.filter((word) => forbidden.some((term) => word.startsWith(term)));
      expect({ key, offending }).toEqual({ key, offending: [] });
    }
  });

  it("projects whole rows down to the allow-list, dropping name, email and phone", () => {
    const projected = toScoringInput({
      candidate: {
        certifications: ["CSP"],
        verified_certifications: ["CSP"],
        years_experience: 9,
        verticals: ["Construction"],
        location: "Houston, TX",
        willing_to_relocate: true,
        availability_date: "2026-09-01",
        // Extra identifying columns a real row carries. They must not survive.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ full_name: "Dana Reyes", email: "dana@example.test", phone: "555-0100" } as any),
      },
      jobOrder: {
        cert_requirements: ["CSP"],
        vertical: "Construction",
        location: "Houston, TX",
        start_date: "2026-09-15",
      },
      billRate: 95,
      payRate: 68,
      spreadFloor: 20,
    });

    expect(Object.keys(projected).sort()).toEqual([...matchScoringInputKeys].sort());
    expect(JSON.stringify(projected)).not.toContain("Dana Reyes");
    expect(JSON.stringify(projected)).not.toContain("dana@example.test");
    expect(JSON.stringify(projected)).not.toContain("555-0100");
  });
});

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------
describe("talentScoringWeights", () => {
  it("matches the blueprint split and sums to 1", () => {
    expect(talentScoringWeights).toEqual({
      spread: 0.3,
      certification: 0.25,
      experience: 0.2,
      location: 0.15,
      availability: 0.1,
    });
    const sum = scoringSignals.reduce((acc, key) => acc + talentScoringWeights[key], 0);
    expect(Math.round(sum * 100) / 100).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Spread
// ---------------------------------------------------------------------------
describe("scoreSpreadFit", () => {
  it("scores zero below the floor, however close", () => {
    expect(scoreSpreadFit(95, 76, 20)).toBe(0); // $19 spread
    expect(scoreSpreadFit(95, 90, 20)).toBe(0);
    expect(scoreSpreadFit(50, 80, 20)).toBe(0); // a loss
  });

  it("scores ~60 exactly on the floor and 100 at double it", () => {
    expect(scoreSpreadFit(95, 75, 20)).toBe(60);
    expect(scoreSpreadFit(95, 55, 20)).toBe(100);
    expect(scoreSpreadFit(200, 55, 20)).toBe(100);
  });

  it("scales between the floor and double the floor", () => {
    // $30 spread on a $20 floor is half the headroom: 60 + 20 = 80.
    expect(scoreSpreadFit(95, 65, 20)).toBe(80);
  });

  it("returns 0 for non-finite rates rather than NaN", () => {
    expect(scoreSpreadFit(Number.NaN, 68, 20)).toBe(0);
    expect(scoreSpreadFit(95, Number.POSITIVE_INFINITY, 20)).toBe(0);
  });

  it("falls back to the agency default headroom when the floor is zero", () => {
    expect(scoreSpreadFit(95, 95, 0)).toBe(60);
    expect(scoreSpreadFit(95, 75, 0)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Certifications
// ---------------------------------------------------------------------------
describe("scoreCertificationFit", () => {
  it("returns 100 when the order requires nothing", () => {
    expect(scoreCertificationFit([], [], [])).toBe(100);
    expect(scoreCertificationFit([], ["CSP"], [])).toBe(100);
  });

  it("returns 100 when every required cert is verified, case-insensitively", () => {
    expect(scoreCertificationFit(["CSP", "OSHA 30"], ["CSP", "OSHA 30"], ["csp", "osha 30"])).toBe(100);
  });

  it("gives partial credit for a held-but-unverified cert", () => {
    expect(scoreCertificationFit(["CSP"], ["CSP"], [])).toBe(50);
    expect(scoreCertificationFit(["CSP", "CHST"], ["CSP", "CHST"], ["CSP"])).toBe(75);
  });

  it("heavily penalises a cert the candidate does not hold at all", () => {
    // One of two verified, one missing: 50 base less the 20-point penalty.
    expect(scoreCertificationFit(["CSP", "CHST"], ["CSP"], ["CSP"])).toBe(30);
    // Nothing held at all bottoms out.
    expect(scoreCertificationFit(["CSP", "CHST"], [], [])).toBe(0);
    // Missing is strictly worse than merely unverified.
    expect(scoreCertificationFit(["CSP", "CHST"], ["CSP"], ["CSP"])).toBeLessThan(
      scoreCertificationFit(["CSP", "CHST"], ["CSP", "CHST"], ["CSP"]),
    );
  });

  it("ignores blanks and duplicates in the requirement list", () => {
    expect(scoreCertificationFit(["CSP", " csp ", ""], ["CSP"], ["CSP"])).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------
describe("scoreExperienceFit", () => {
  it("scores a full match on both years and vertical at 100", () => {
    expect(scoreExperienceFit(12, 5, ["Construction"], "Construction")).toBe(100);
  });

  it("penalises a vertical mismatch without zeroing the signal", () => {
    // years 100 × 0.7 + vertical 40 × 0.3
    expect(scoreExperienceFit(12, 5, ["Healthcare"], "Construction")).toBe(82);
  });

  it("treats an unstated vertical as no requirement", () => {
    expect(scoreExperienceFit(12, 5, [], null)).toBe(100);
    expect(scoreExperienceFit(12, 5, [], "")).toBe(100);
  });

  it("scales years below an explicit requirement", () => {
    // 5 of 10 years → 50 × 0.7 + 100 × 0.3
    expect(scoreExperienceFit(5, 10, ["Construction"], "Construction")).toBe(65);
    expect(scoreExperienceFit(0, 10, ["Construction"], "Construction")).toBe(30);
  });

  it("uses a generous benchmark when the order states no minimum", () => {
    // Unspecified must not read as failed: 0 years still scores the 30 base.
    expect(scoreExperienceFit(0, null, [], null)).toBe(51);
    expect(scoreExperienceFit(10, null, [], null)).toBe(100);
    expect(scoreExperienceFit(null, null, [], null)).toBe(51);
  });
});

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------
describe("scoreLocationFit", () => {
  it("returns 100 for the same location", () => {
    expect(scoreLocationFit("Houston, TX", "Houston, TX", false)).toBe(100);
    expect(scoreLocationFit(" houston,  tx ", "Houston, TX", false)).toBe(100);
  });

  it("returns ~70 for a different location the candidate would relocate for", () => {
    expect(scoreLocationFit("Denver, CO", "Houston, TX", true)).toBe(70);
  });

  it("scores a different location low when the candidate will not relocate", () => {
    expect(scoreLocationFit("Denver, CO", "Houston, TX", false)).toBe(20);
  });

  it("cannot fail an order that states no location", () => {
    expect(scoreLocationFit("Denver, CO", null, false)).toBe(100);
    expect(scoreLocationFit(null, "", false)).toBe(100);
  });

  it("treats an unknown candidate location as a data gap, not a rejection", () => {
    expect(scoreLocationFit(null, "Houston, TX", false)).toBe(50);
    expect(scoreLocationFit(null, "Houston, TX", true)).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------
describe("scoreAvailabilityFit", () => {
  it("scores 100 when available on or before the requested start", () => {
    expect(scoreAvailabilityFit("2026-08-01", "2026-09-01", NOW)).toBe(100);
    expect(scoreAvailabilityFit("2026-09-01", "2026-09-01", NOW)).toBe(100);
  });

  it("decays linearly for a late start and bottoms out past the grace window", () => {
    expect(scoreAvailabilityFit("2026-09-16", "2026-09-01", NOW)).toBe(50);
    expect(scoreAvailabilityFit("2026-10-01", "2026-09-01", NOW)).toBe(0);
    expect(scoreAvailabilityFit("2027-01-01", "2026-09-01", NOW)).toBe(0);
  });

  it("measures against today when the order has no start date", () => {
    expect(scoreAvailabilityFit("2026-08-06", null, NOW)).toBe(100);
    expect(scoreAvailabilityFit("2026-08-21", null, NOW)).toBe(50);
  });

  it("treats a missing or malformed date as neutral", () => {
    expect(scoreAvailabilityFit(null, "2026-09-01", NOW)).toBe(50);
    expect(scoreAvailabilityFit("whenever", "2026-09-01", NOW)).toBe(50);
    expect(scoreAvailabilityFit("2026-02-30", "2026-09-01", NOW)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------
describe("scoreMatch", () => {
  it("returns an integer 0..100 and a per-signal breakdown", () => {
    const result = scoreMatch(input(), talentScoringWeights, NOW);

    expect(Object.keys(result.breakdown).sort()).toEqual([...scoringSignals].sort());
    expect(Number.isInteger(result.total)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.breakdown.certification).toBe(100);
    expect(result.breakdown.location).toBe(100);
  });

  it("scores a perfect match at 100", () => {
    const perfect = scoreMatch(
      input({ billRate: 95, payRate: 55, requiredYears: 5, availabilityDate: "2026-07-01" }),
      talentScoringWeights,
      NOW,
    );
    expect(perfect.total).toBe(100);
  });

  it("drops hard when the spread falls under the floor", () => {
    const above = scoreMatch(input({ payRate: 68 }), talentScoringWeights, NOW).total;
    const below = scoreMatch(input({ payRate: 90 }), talentScoringWeights, NOW).total;
    expect(below).toBeLessThan(above);
    expect(scoreMatch(input({ payRate: 90 }), talentScoringWeights, NOW).breakdown.spread).toBe(0);
  });

  it("honours a tuned weight object", () => {
    const spreadOnly: ScoringWeights = { spread: 1, certification: 0, experience: 0, location: 0, availability: 0 };
    const result = scoreMatch(input({ payRate: 90 }), spreadOnly, NOW);
    expect(result.total).toBe(0);
    // The breakdown is still complete even when a signal carries no weight.
    expect(result.breakdown.certification).toBe(100);
  });

  it("normalises weights that do not sum to 1", () => {
    const doubled: ScoringWeights = {
      spread: 0.6,
      certification: 0.5,
      experience: 0.4,
      location: 0.3,
      availability: 0.2,
    };
    expect(scoreMatch(input(), doubled, NOW).total).toBe(scoreMatch(input(), talentScoringWeights, NOW).total);
  });

  it("returns 0 rather than NaN when every weight is zero", () => {
    const none: ScoringWeights = { spread: 0, certification: 0, experience: 0, location: 0, availability: 0 };
    expect(scoreMatch(input(), none, NOW).total).toBe(0);
  });
});
