// The client-code moniker behind per-client proposal numbers (HUN-01).
//
// Pure functions only — no Supabase, no I/O — importable from both the client
// forms and the server actions. The database side is
// supabase/migrations/20260809200000_client_proposal_client_codes.sql: the
// CHECK constraint there and `clientCodePattern` here must agree.
//
// Decision of record (build review, 2026-08-07): a 2–3 letter moniker from the
// company name, assigned by whoever writes the client's first proposal, unique
// across clients; on an initials collision the code is extended (Staff Electric
// Company Incorporated → SEC), and the state initial is never used. Proposal
// numbers are then CODE-NN with a per-client sequence.

/** Mirrors company_clients_client_code_format in the migration. */
export const clientCodePattern = /^[A-Z]{2,3}$/;

export const clientCodeRule = "2–3 capital letters from the company name, e.g. HUN for Hunzinger.";

/** Uppercases and trims; returns "" for non-strings. Does NOT validate. */
export function normalizeClientCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function isValidClientCode(value: unknown): boolean {
  return clientCodePattern.test(normalizeClientCode(value));
}

/**
 * CODE-NN, zero-padded to two digits.
 *
 * greatest(2, …) in SQL and this guard are the same rule: past sequence 99 the
 * number simply grows (HUN-100) — a bare two-char pad would TRUNCATE and mint a
 * duplicate reference.
 */
export function formatClientProposalNumber(code: string, seq: number): string {
  const n = Math.max(1, Math.trunc(seq));
  return `${normalizeClientCode(code)}-${String(n).padStart(2, "0")}`;
}

function nameWords(name: string): string[] {
  return name
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((word) => word !== "");
}

/**
 * A suggested moniker for a company name — a starting point the assigner can
 * overtype, never an automatic assignment.
 *
 * The ladder mirrors how the team said they would pick codes by hand: initials
 * first (Staff Electric → SE), extend through a third word on collision
 * (Staff Electric Company → SEC), then fall back to prefixes of the first word.
 * Single-word names prefer the 3-letter prefix (Hunzinger → HUN) because a
 * 2-letter fragment of one word reads as an abbreviation of nothing.
 * Returns "" when the name yields no valid, untaken candidate.
 */
export function suggestClientCode(name: unknown, taken: Iterable<string> = []): string {
  if (typeof name !== "string") return "";
  const words = nameWords(name);
  if (words.length === 0) return "";

  const takenSet = new Set<string>();
  for (const code of taken) takenSet.add(normalizeClientCode(code));

  const candidates: string[] = [];
  if (words.length >= 2) {
    candidates.push(words[0][0] + words[1][0]);
    if (words.length >= 3) candidates.push(words[0][0] + words[1][0] + words[2][0]);
    candidates.push(words[0][0] + words[1].slice(0, 2));
  }
  if (words.length === 1) {
    candidates.push(words[0].slice(0, 3), words[0].slice(0, 2));
  } else {
    candidates.push(words[0].slice(0, 2), words[0].slice(0, 3));
  }

  for (const candidate of candidates) {
    if (clientCodePattern.test(candidate) && !takenSet.has(candidate)) return candidate;
  }
  return "";
}
