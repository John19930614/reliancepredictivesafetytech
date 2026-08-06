import { describe, expect, it } from "vitest";
import { buildYearOptions, monthOptions, parseProposalTerm, termFieldIds } from "./term";

function fields(overrides: Record<string, unknown> = {}) {
  return {
    [termFieldIds.startMonth]: "3",
    [termFieldIds.startYear]: "2026",
    [termFieldIds.endMonth]: "8",
    [termFieldIds.endYear]: "2026",
    ...overrides,
  };
}

describe("parseProposalTerm", () => {
  it("counts the term inclusively, the way a pilot is sold", () => {
    // March through August IS a six-month pilot — it runs to the end of August,
    // so the span is 6, not 5.
    const term = parseProposalTerm(fields());
    expect(term.months).toBe(6);
    expect(term.durationLabel).toBe("6-month");
    expect(term.rangeLabel).toBe("March 2026 – August 2026");
    expect(term.reversed).toBe(false);
  });

  it("counts a single month as one month", () => {
    expect(parseProposalTerm(fields({ [termFieldIds.endMonth]: "3" })).months).toBe(1);
  });

  it("spans a year boundary", () => {
    const term = parseProposalTerm(
      fields({ [termFieldIds.startMonth]: "11", [termFieldIds.endMonth]: "2", [termFieldIds.endYear]: "2027" }),
    );
    expect(term.months).toBe(4);
    expect(term.rangeLabel).toBe("November 2026 – February 2027");
  });

  it("accepts numbers as readily as the strings the selects produce", () => {
    const term = parseProposalTerm({
      [termFieldIds.startMonth]: 1,
      [termFieldIds.startYear]: 2026,
      [termFieldIds.endMonth]: 12,
      [termFieldIds.endYear]: 2026,
    });
    expect(term.months).toBe(12);
  });

  it("refuses to claim a duration when the end precedes the start", () => {
    // Printing "-2-month pilot" on a client document would be worse than
    // printing no duration at all.
    const term = parseProposalTerm(
      fields({ [termFieldIds.startMonth]: "8", [termFieldIds.endMonth]: "3" }),
    );
    expect(term.months).toBeNull();
    expect(term.durationLabel).toBeNull();
    expect(term.reversed).toBe(true);
    // Both endpoints are still known, so the dates themselves still print.
    expect(term.rangeLabel).toBe("August 2026 – March 2026");
  });

  it("degrades one endpoint at a time rather than blanking the whole term", () => {
    const term = parseProposalTerm(fields({ [termFieldIds.endMonth]: "", [termFieldIds.endYear]: "" }));
    expect(term.start?.label).toBe("March 2026");
    expect(term.end).toBeNull();
    expect(term.rangeLabel).toBeNull();
    expect(term.months).toBeNull();
  });

  it("returns an empty term for missing, null, or non-object fields", () => {
    for (const input of [undefined, null, [] as unknown as Record<string, unknown>, {}]) {
      const term = parseProposalTerm(input);
      expect(term.start).toBeNull();
      expect(term.end).toBeNull();
      expect(term.months).toBeNull();
      expect(term.rangeLabel).toBeNull();
    }
  });

  it("rejects out-of-range months and implausible years", () => {
    expect(parseProposalTerm(fields({ [termFieldIds.startMonth]: "0" })).start).toBeNull();
    expect(parseProposalTerm(fields({ [termFieldIds.startMonth]: "13" })).start).toBeNull();
    // A three-digit year is a typo, and it would print on a client document.
    expect(parseProposalTerm(fields({ [termFieldIds.startYear]: "226" })).start).toBeNull();
    expect(parseProposalTerm(fields({ [termFieldIds.startMonth]: "abc" })).start).toBeNull();
  });
});

describe("option lists", () => {
  it("offers twelve months numbered from one", () => {
    expect(monthOptions).toHaveLength(12);
    expect(monthOptions[0]).toEqual({ value: "1", label: "January" });
    expect(monthOptions[11]).toEqual({ value: "12", label: "December" });
  });

  it("windows years around the anchor without reading the clock", () => {
    // Deterministic on purpose: this module is imported by the server-rendered
    // document, and a Date.now() here would make the option list differ between
    // the server render and the client hydration.
    // One year back so a term already underway can be recorded, five forward
    // for a multi-year agreement quoted in advance.
    expect(buildYearOptions(2026)).toEqual(["2025", "2026", "2027", "2028", "2029", "2030", "2031"]);
    expect(buildYearOptions(2026, 0, 1)).toEqual(["2026", "2027"]);
  });
});
