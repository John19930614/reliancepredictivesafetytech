// The client-code moniker behind per-client document numbers (Wondfo-2026-001).
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
// numbers were then CODE-NN with a per-client sequence.
//
// SUPERSEDED 2026-08-14: the code is now the readable company moniker rather
// than initials (Wondfo, not WFU), and a document number carries its YEAR with
// a sequence that restarts each January — Wondfo-2026-001. Two consequences
// worth stating:
//
//   - The code is no longer uppercased. "Wondfo" must survive round-tripping,
//     so normalizeClientCode trims and nothing else. Uniqueness is still
//     enforced, case-insensitively, by the index in the migration.
//   - EXISTING NUMBERS ARE NOT REWRITTEN. WFU-01, SE-04 and the rest keep the
//     numbers they were issued under; a reference a client already holds must
//     not change underneath them. Both allocators only fire on a null number,
//     so old rows are untouched by design rather than by luck.

/**
 * Mirrors company_clients_client_code_format in the migration.
 *
 * Starts with a letter, then letters or digits, 2–24 characters. No spaces,
 * punctuation or accents: this string is embedded in a document reference that
 * gets typed into emails, spreadsheets and bank memos, and anything needing
 * escaping there causes trouble somewhere downstream.
 */
export const clientCodePattern = /^[A-Za-z][A-Za-z0-9]{1,23}$/;

export const clientCodeRule =
  "2–24 letters or digits from the company name, e.g. Wondfo for Wondfo USA. No spaces or punctuation.";

/**
 * Trims. Does NOT uppercase and does NOT validate.
 *
 * Case is preserved deliberately — "Wondfo" is the point, and upper-casing it
 * to WONDFO would make every document reference shout. Uniqueness across
 * clients is enforced case-insensitively by the database index, so "wondfo"
 * still cannot coexist with "Wondfo".
 */
export function normalizeClientCode(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidClientCode(value: unknown): boolean {
  return clientCodePattern.test(normalizeClientCode(value));
}

/**
 * CODE-YYYY-NNN, the sequence zero-padded to three digits.
 *
 * padStart never truncates, and the SQL side uses greatest(3, length(...)) for
 * the same reason: past sequence 999 the number simply grows to four digits.
 * A fixed-width pad that CUT the string would mint a duplicate reference, which
 * on a financial document is the worst failure available.
 */
export function formatClientDocumentNumber(code: string, year: number, seq: number): string {
  const n = Math.max(1, Math.trunc(seq));
  return `${normalizeClientCode(code)}-${Math.trunc(year)}-${String(n).padStart(3, "0")}`;
}

/**
 * The same shape with an INV marker: Wondfo-INV-2026-001.
 *
 * Proposals and invoices carry separate sequences, so without a marker the same
 * string could name both a quote and a demand for payment — and an accountant
 * holding "Wondfo-2026-001" would have no way to tell which. The marker costs
 * four characters and removes the ambiguity entirely.
 */
export function formatClientInvoiceNumber(code: string, year: number, seq: number): string {
  const n = Math.max(1, Math.trunc(seq));
  return `${normalizeClientCode(code)}-INV-${Math.trunc(year)}-${String(n).padStart(3, "0")}`;
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

  // Case-insensitive: the database index is, so a suggestion that only differs
  // in case from a taken code would be rejected on save.
  const takenSet = new Set<string>();
  for (const code of taken) takenSet.add(normalizeClientCode(code).toLowerCase());

  const titled = (word: string) => word[0] + word.slice(1).toLowerCase();

  // Readable monikers first — the first word is what people actually call the
  // company ("Wondfo USA" is Wondfo). Initials are kept as a late fallback for
  // names whose first word is shared or meaningless.
  const candidates: string[] = [titled(words[0])];
  if (words.length >= 2) {
    candidates.push(titled(words[0]) + titled(words[1]));
    candidates.push(words[0][0] + words[1][0]);
    if (words.length >= 3) candidates.push(words[0][0] + words[1][0] + words[2][0]);
  }
  candidates.push(titled(words[0]).slice(0, 3));

  for (const candidate of candidates) {
    if (clientCodePattern.test(candidate) && !takenSet.has(candidate.toLowerCase())) return candidate;
  }
  return "";
}
