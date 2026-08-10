import { describe, expect, it } from "vitest";
import {
  clientCodePattern,
  formatClientProposalNumber,
  isValidClientCode,
  normalizeClientCode,
  suggestClientCode,
} from "./client-codes";

describe("normalizeClientCode / isValidClientCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeClientCode("  hun ")).toBe("HUN");
    expect(isValidClientCode("hun")).toBe(true);
    expect(isValidClientCode(" se ")).toBe(true);
  });

  it("rejects everything outside 2-3 letters", () => {
    for (const bad of ["", "H", "HUNZ", "H1", "H-N", "H N", 12, null, undefined]) {
      expect(isValidClientCode(bad)).toBe(false);
    }
  });

  it("the pattern matches the migration's CHECK constraint", () => {
    expect(clientCodePattern.source).toBe("^[A-Z]{2,3}$");
  });
});

describe("formatClientProposalNumber", () => {
  it("zero-pads to two digits", () => {
    expect(formatClientProposalNumber("HUN", 1)).toBe("HUN-01");
    expect(formatClientProposalNumber("se", 12)).toBe("SE-12");
  });

  it("grows past 99 instead of truncating", () => {
    // The failure mode this guards: a plain 2-char pad turning 100 into "10"
    // and colliding with an existing reference.
    expect(formatClientProposalNumber("HUN", 100)).toBe("HUN-100");
  });

  it("never emits a zero or negative sequence", () => {
    expect(formatClientProposalNumber("HUN", 0)).toBe("HUN-01");
    expect(formatClientProposalNumber("HUN", -3)).toBe("HUN-01");
  });
});

describe("suggestClientCode", () => {
  it("uses initials for multi-word names", () => {
    expect(suggestClientCode("Staff Electric")).toBe("SE");
  });

  it("prefers the 3-letter prefix for single-word names", () => {
    expect(suggestClientCode("Hunzinger")).toBe("HUN");
  });

  it("extends through the third word on a collision", () => {
    // The meeting's own example: Staff Electric Company Incorporated → SEC.
    expect(suggestClientCode("Staff Electric Company Incorporated", ["SE"])).toBe("SEC");
  });

  it("keeps walking the ladder until an untaken candidate appears", () => {
    expect(suggestClientCode("Staff Electric", ["SE"])).toBe("SEL");
    expect(suggestClientCode("Staff Electric", ["SE", "SEL"])).toBe("ST");
  });

  it("is case- and punctuation-insensitive about the name", () => {
    expect(suggestClientCode("hunzinger construction, inc.")).toBe("HC");
  });

  it("returns empty when nothing valid remains", () => {
    expect(suggestClientCode("")).toBe("");
    expect(suggestClientCode("42")).toBe("");
    expect(suggestClientCode(undefined)).toBe("");
    expect(suggestClientCode("AB", ["AB", "ABC"])).toBe("");
  });

  it("never suggests a taken code regardless of its casing", () => {
    expect(suggestClientCode("Hunzinger", ["hun"])).toBe("HU");
  });
});
