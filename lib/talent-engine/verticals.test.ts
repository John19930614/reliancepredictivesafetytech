import { describe, expect, it } from "vitest";
import {
  combineVerticalSelection,
  defaultVerticalOptions,
  formatVerticalOptionsText,
  maxVerticalLength,
  maxVerticalOptions,
  normalizeVerticalOptions,
  optionsWithSelection,
  parseVerticalOptionsText,
} from "./verticals";

describe("defaultVerticalOptions", () => {
  it("carries the trades and specialties decided in the 2026-08-07 review", () => {
    for (const trade of [
      "Electrician",
      "Carpenter",
      "Solar",
      "Bridge",
      "Underground",
      "General Construction",
      "Electrical Safety",
    ]) {
      expect(defaultVerticalOptions).toContain(trade);
    }
  });
});

describe("normalizeVerticalOptions", () => {
  it("trims, collapses whitespace and drops empties", () => {
    expect(normalizeVerticalOptions(["  Solar ", "General   Construction", "", "   "])).toEqual([
      "Solar",
      "General Construction",
    ]);
  });

  it("dedupes case-insensitively keeping the first casing", () => {
    expect(normalizeVerticalOptions(["Solar", "solar", "SOLAR", "Bridge"])).toEqual(["Solar", "Bridge"]);
  });

  it("ignores non-strings and non-arrays", () => {
    expect(normalizeVerticalOptions([1, null, "Solar", {}])).toEqual(["Solar"]);
    expect(normalizeVerticalOptions("Solar")).toEqual([]);
    expect(normalizeVerticalOptions(undefined)).toEqual([]);
  });

  it("caps entry length and list size", () => {
    const long = "x".repeat(maxVerticalLength + 20);
    expect(normalizeVerticalOptions([long])[0]).toHaveLength(maxVerticalLength);
    const many = Array.from({ length: maxVerticalOptions + 10 }, (_, i) => `V${i}`);
    expect(normalizeVerticalOptions(many)).toHaveLength(maxVerticalOptions);
  });
});

describe("parseVerticalOptionsText / formatVerticalOptionsText", () => {
  it("splits on newlines and commas", () => {
    expect(parseVerticalOptionsText("Electrician\nCarpenter, Solar\r\nBridge")).toEqual([
      "Electrician",
      "Carpenter",
      "Solar",
      "Bridge",
    ]);
  });

  it("round-trips through the textarea format", () => {
    const options = ["Electrician", "General Construction"];
    expect(parseVerticalOptionsText(formatVerticalOptionsText(options))).toEqual(options);
  });

  it("tolerates junk", () => {
    expect(parseVerticalOptionsText(undefined)).toEqual([]);
    expect(parseVerticalOptionsText("")).toEqual([]);
  });
});

describe("combineVerticalSelection", () => {
  it("merges ticked options with the custom input, deduped", () => {
    expect(combineVerticalSelection(["Solar", "Bridge"], "Wind, solar")).toEqual(["Solar", "Bridge", "Wind"]);
  });

  it("works with either side empty", () => {
    expect(combineVerticalSelection([], "Pharma")).toEqual(["Pharma"]);
    expect(combineVerticalSelection(["Solar"], "")).toEqual(["Solar"]);
    expect(combineVerticalSelection(null, undefined)).toEqual([]);
  });
});

describe("optionsWithSelection", () => {
  it("keeps legacy values visible alongside the configured list", () => {
    expect(optionsWithSelection(["Solar", "Bridge"], ["Pharma"])).toEqual(["Solar", "Bridge", "Pharma"]);
  });

  it("does not duplicate a selected value already in the list", () => {
    expect(optionsWithSelection(["Solar"], ["solar"])).toEqual(["Solar"]);
  });
});
