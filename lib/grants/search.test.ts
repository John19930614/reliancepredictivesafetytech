/**
 * The defect these cover: an agency name containing a comma or a programme
 * containing parentheses used to tear the PostgREST `or` filter apart. The
 * request failed, the page fell through to an empty array, and a full tracker
 * rendered as "No grants match these filters".
 */

import { describe, expect, it } from "vitest";
import { buildGrantSearchFilter, escapeLikePattern, quoteOrOperand } from "./search";

describe("escapeLikePattern", () => {
  it("escapes LIKE wildcards so a literal search stays literal", () => {
    expect(escapeLikePattern("50_50")).toBe("50\\_50");
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("leaves an ordinary term alone", () => {
    expect(escapeLikePattern("SBIR")).toBe("SBIR");
  });
});

describe("quoteOrOperand", () => {
  it("wraps the operand so a comma cannot split the filter", () => {
    expect(quoteOrOperand("%Smith, Inc.%")).toBe('"%Smith, Inc.%"');
  });

  it("escapes embedded quotes and backslashes for the tokenizer", () => {
    expect(quoteOrOperand('%a"b%')).toBe('"%a\\"b%"');
    expect(quoteOrOperand("%a\\b%")).toBe('"%a\\\\b%"');
  });
});

describe("buildGrantSearchFilter", () => {
  it("returns null for an empty or whitespace-only search", () => {
    expect(buildGrantSearchFilter("")).toBeNull();
    expect(buildGrantSearchFilter("   ")).toBeNull();
  });

  it("searches the programme, the agency and the sub-agency", () => {
    expect(buildGrantSearchFilter("SBIR")).toBe(
      'name.ilike."%SBIR%",agency.ilike."%SBIR%",sub_agency.ilike."%SBIR%"',
    );
  });

  it("keeps a comma inside the operand rather than as a separator", () => {
    const filter = buildGrantSearchFilter("Smith, Inc.");

    // Three operands, not four: the comma in the term must not create one.
    expect(filter?.split('",').length).toBe(3);
    expect(filter).toContain('name.ilike."%Smith, Inc.%"');
  });

  it("survives parentheses, which the tokenizer reads as structure", () => {
    expect(buildGrantSearchFilter("SBIR (Phase I)")).toContain('name.ilike."%SBIR (Phase I)%"');
  });

  it("applies the LIKE escape before quoting", () => {
    // Two backslashes on the wire: the tokenizer unwraps them to one, leaving
    // Postgres the escaped underscore that makes the search literal.
    expect(buildGrantSearchFilter("50_50")).toContain('name.ilike."%50\\\\_50%"');
  });
});
