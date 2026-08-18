/**
 * Grant Tracker search filter construction.
 *
 * Pure, so the escaping rules that decide whether a search returns the right
 * rows can be asserted without a database (lib/grants/search.test.ts).
 *
 * Two DIFFERENT escaping layers apply here and they are easy to confuse:
 *
 *   1. LIKE. `%` and `_` are wildcards, so a literal search for "50_50" must
 *      escape them or it matches far more than the operator asked for.
 *   2. PostgREST's `or=(...)` tokenizer. It splits the list on commas and reads
 *      parentheses as structure, so an operand containing either has to be
 *      wrapped in double quotes or the whole filter stops parsing.
 *
 * Layer 1 runs first — its backslashes are part of the pattern that reaches
 * Postgres — and layer 2 wraps the result.
 */

/** Columns a free-text grant search looks in. */
export const grantSearchColumns = ["name", "agency", "sub_agency"] as const;

/**
 * `%` and `_` are LIKE wildcards. Escaping them keeps the search literal, the
 * same helper app/employee/proposals/page.tsx uses.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Wraps one `or=(...)` operand in double quotes.
 *
 * Without this an agency named "Smith, Inc." or a programme called
 * "SBIR (Phase I)" tears the filter into fragments that do not parse: the
 * request fails, `data` comes back null, and the page renders "No grants match
 * these filters" over a table that is full. A search that silently answers
 * "nothing" is worse than one that fails loudly.
 */
export function quoteOrOperand(value: string): string {
  return `"${value.replace(/["\\]/g, (match) => `\\${match}`)}"`;
}

/**
 * The `or` filter for a free-text search, or null when there is nothing to
 * search for — the caller then leaves the query unfiltered.
 */
export function buildGrantSearchFilter(search: string): string | null {
  const trimmed = search.trim();
  if (!trimmed) return null;

  const pattern = quoteOrOperand(`%${escapeLikePattern(trimmed)}%`);
  return grantSearchColumns.map((column) => `${column}.ilike.${pattern}`).join(",");
}
