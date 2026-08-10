// The configurable vertical / trade list for the EHS Talent Engine.
//
// Pure functions only — no Supabase, no I/O — importable from client islands
// and server actions alike. The stored list lives on the talent_settings
// singleton (vertical_options text[], migration 20260809210000) and is edited
// by an admin in the Money floor panel; candidate and job-order forms render
// it as a picker instead of the free-text field it replaces.
//
// Decision of record (build review, 2026-08-07): Steve asked for construction
// trades and safety specialties as a dropdown — electrician, carpenter, solar,
// bridge, underground, general construction, electrical safety — rather than a
// single "construction" bucket. The list below seeds the setting; it is a
// starting point, not a cap, which is why the picker keeps an "other" input
// and the admin can extend the list.

export const defaultVerticalOptions: readonly string[] = Object.freeze([
  "Electrician",
  "Carpenter",
  "Solar",
  "Bridge",
  "Underground",
  "General Construction",
  "Electrical Safety",
]);

export const maxVerticalOptions = 60;
export const maxVerticalLength = 60;

/**
 * Cleans a raw list into what the picker renders and the setting stores:
 * strings only, trimmed, inner whitespace collapsed, empties dropped, length
 * capped, deduplicated case-insensitively keeping the FIRST casing seen, and
 * the whole list capped. Order is preserved — the admin's ordering is the
 * display order.
 */
export function normalizeVerticalOptions(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const value = raw.replace(/\s+/g, " ").trim().slice(0, maxVerticalLength).trim();
    if (value === "") continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= maxVerticalOptions) break;
  }
  return out;
}

/**
 * The Money floor panel edits the list as plain text, one option per line
 * (commas also split, so a pasted "Electrician, Carpenter" does what it looks
 * like it does).
 */
export function parseVerticalOptionsText(text: unknown): string[] {
  if (typeof text !== "string") return [];
  return normalizeVerticalOptions(text.split(/[\r\n,]+/));
}

/** The same list as the textarea's editable text. */
export function formatVerticalOptionsText(options: readonly string[]): string {
  return normalizeVerticalOptions([...options]).join("\n");
}

/**
 * What a picker submit actually stores: the ticked options plus whatever was
 * typed into the "other" input, comma-separated, deduplicated as one list.
 */
export function combineVerticalSelection(selected: unknown, customText: unknown): string[] {
  const custom = typeof customText === "string" ? customText.split(/[,\r\n]+/) : [];
  const picked = Array.isArray(selected) ? selected : [];
  return normalizeVerticalOptions([...picked, ...custom]);
}

/**
 * Options for display where a record may carry values the configured list no
 * longer (or never) contained — legacy free-text entries must stay visible and
 * un-tickable-off, not silently vanish from the record.
 */
export function optionsWithSelection(options: readonly string[], selected: readonly string[]): string[] {
  return normalizeVerticalOptions([...options, ...selected]);
}
