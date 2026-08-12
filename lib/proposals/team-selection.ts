// Which teammates appear on a proposal, and who signs it.
//
// Pure functions only — no Supabase, no I/O — so the selection rules are unit
// testable and so this module can be imported from both the client editor and
// the server renderer. The database side lives in team-server.ts.
//
// STORAGE SHAPE
// A generator field value must be a scalar (isGeneratorFieldValue rejects
// objects and arrays, which is what stops a hand-crafted POST from smuggling
// structured data into the generator's DOM). The selected teammates are
// therefore stored as ONE comma-separated string of user ids rather than an
// array, and parsed back out here.

/**
 * One colleague as the editor's checkbox list needs them.
 *
 * Declared in this pure module rather than beside the query that produces it:
 * the editor is a client component and must be able to import the type without
 * pulling in a `server-only` module.
 */
export interface TeamRosterEntry {
  userId: string;
  name: string;
  title: string;
  /** False when the person has published a profile but written no bio text. */
  hasBio: boolean;
  hasSignature: boolean;
}

/** Generator field ids the team picker writes into `state.fields`. */
export const teamFieldIds = Object.freeze({
  /** Comma-separated user ids whose bios print in the document. */
  members: "proposalTeamMembers",
  /** Single user id whose stored signature is applied to the seller block. */
  signer: "proposalSigner",
} as const);

/**
 * Accepts anything a v4 UUID generator produces, and nothing else.
 *
 * The ids round-trip through a client-editable form field, so they are treated
 * as untrusted input: a malformed id is dropped rather than passed to a query.
 */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUserId(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value.trim());
}

/**
 * Hard cap on how many bios one proposal may print.
 *
 * The bios are a trust signal, not a staff directory, and each one costs real
 * space on a document we are actively trying to keep under eight pages. It also
 * bounds the `in` list sent to the database.
 */
export const maxTeamMembers = 6;

/**
 * Parses the selected member ids out of a generator state's fields.
 *
 * Deduplicates while preserving the seller's chosen order, drops anything that
 * is not a well-formed id, and truncates at `maxTeamMembers`. Always returns an
 * array, never null — "no one selected" and "field missing" are the same thing
 * to every caller.
 */
export function parseTeamMemberIds(fields: Record<string, unknown> | null | undefined): string[] {
  const raw = fields?.[teamFieldIds.members];
  if (typeof raw !== "string" || raw.trim() === "") return [];

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim().toLowerCase();
    if (!isUserId(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= maxTeamMembers) break;
  }
  return ids;
}

/** The user id whose signature signs this proposal, or null. */
export function parseSignerId(fields: Record<string, unknown> | null | undefined): string | null {
  const raw = fields?.[teamFieldIds.signer];
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase();
  return isUserId(id) ? id : null;
}

/** Serializes a selection back into the single scalar field the state stores. */
export function serializeTeamMemberIds(ids: readonly string[]): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const value of ids) {
    const id = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!isUserId(id) || seen.has(id)) continue;
    seen.add(id);
    kept.push(id);
    if (kept.length >= maxTeamMembers) break;
  }
  return kept.join(",");
}

/** Adds or removes one id, returning the new serialized value. */
export function toggleTeamMember(current: readonly string[], id: string, checked: boolean): string {
  const next = checked ? [...current, id] : current.filter((value) => value !== id);
  return serializeTeamMemberIds(next);
}
