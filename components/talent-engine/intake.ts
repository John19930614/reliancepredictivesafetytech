/**
 * Shared parsing for the Talent Engine intake forms. Pure — safe to import
 * from client components.
 */

/** "CSP, CHST,," → ["CSP", "CHST"]. */
export function splitList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * "" → null (field left blank), a parseable number → the number,
 * anything else → undefined (caller shows a validation error).
 */
export function parseOptionalNumber(value: FormDataEntryValue | null): number | null | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}
