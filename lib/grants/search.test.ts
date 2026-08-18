/**
 * The defect these cover: an agency name containing a comma or a programme
 * containing parentheses used to tear the PostgREST `or` filter apart. The
 * request failed, the page fell through to an empty array, and a full tracker
 * rendered as "No grants match these filters".
 */

import { describe, expect, it } from "vitest";
import { buildGrantSearchFilter, escapeLikePattern, grantSearchColumns, quoteOrOperand } from "./search";

/**
 * Splits an `or` list the way PostgREST does — on TOP-LEVEL commas only, with a
 * quoted operand treated as opaque. Reimplemented here rather than asserting on
 * the raw string because the whole defect was a filter that looked fine and
 * tokenized into fragments.
 */
function operands(filter: string | null): string[] {
  if (filter === null) return [];

  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;

  for (const char of filter) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === "\\") {
      current += char;
      escaped = true;
    } else if (char === '"') {
      quoted = !quoted;
      current += char;
    } else if (char === "," && !quoted) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);

  return parts;
}

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

    expect(operands(filter)).toEqual([
      'name.ilike."%Smith, Inc.%"',
      'agency.ilike."%Smith, Inc.%"',
      'sub_agency.ilike."%Smith, Inc.%"',
    ]);
  });

  it("survives parentheses, which the tokenizer reads as structure", () => {
    expect(buildGrantSearchFilter("SBIR (Phase I)")).toContain('name.ilike."%SBIR (Phase I)%"');
  });

  // The regression itself. Unquoted, "Smith, Inc." split into SIX operands,
  // three of them the fragment " Inc.%", which is not a condition at all — the
  // request failed and the page rendered a full tracker as an empty one.
  it.each([
    ["a comma", "Smith, Inc."],
    ["parentheses", "SBIR (Phase I)"],
    ["a quote", 'The "Big" Fund'],
    ["a backslash", "A\\B"],
  ])("emits exactly one well-formed operand per column for %s", (_label, term) => {
    const parts = operands(buildGrantSearchFilter(term));

    expect(parts).toHaveLength(grantSearchColumns.length);
    for (const part of parts) {
      expect(part).toMatch(/^(name|agency|sub_agency)\.ilike\.".*"$/);
    }
  });

  it("applies the LIKE escape before quoting", () => {
    // Two backslashes on the wire: the tokenizer unwraps them to one, leaving
    // Postgres the escaped underscore that makes the search literal.
    expect(buildGrantSearchFilter("50_50")).toContain('name.ilike."%50\\\\_50%"');
  });
});
