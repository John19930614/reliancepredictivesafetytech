// Turns a Supabase/PostgREST error into a sentence an employee can act on.
//
// The idiom `error?.message ?? "Could not save."` looks safe but the fallback
// is dead code: Supabase virtually always returns an error object, so users
// were shown raw database strings ("duplicate key value violates unique
// constraint …", "new row violates row-level security policy …") that say
// nothing actionable. This helper inverts the priority: the hand-written
// fallback is the default, and only a handful of recognised codes get a more
// specific sentence.
//
// Pure and dependency-free so client components can use it. Callers that want
// the raw message for debugging should console.error it themselves.

export interface FriendlyErrorInput {
  code?: string | null;
  message?: string | null;
}

/** Postgres error codes worth translating for end users. */
const codeMessages: Record<string, string> = {
  // unique_violation
  "23505": "That record already exists.",
  // foreign_key_violation
  "23503": "A linked record is missing or was removed. Refresh and try again.",
  // check_violation
  "23514": "One of the values is not accepted. Check the fields and try again.",
  // insufficient_privilege (RLS)
  "42501": "You do not have permission to do that.",
};

export function friendlyError(error: FriendlyErrorInput | null | undefined, fallback: string): string {
  if (!error) return fallback;

  const code = typeof error.code === "string" ? error.code : "";
  if (code && codeMessages[code]) return codeMessages[code];

  // RLS denials sometimes arrive without the 42501 code but always name the
  // policy in the message.
  const message = typeof error.message === "string" ? error.message : "";
  if (/row-level security/i.test(message)) return codeMessages["42501"];
  if (/duplicate key value/i.test(message)) return codeMessages["23505"];

  return fallback;
}
