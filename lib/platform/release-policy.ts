// Which release status changes are allowed, and what must be true first.
//
// Pure and side-effect free so the rules are unit-testable, following the same
// split as lib/time-off/policy.ts. The server action consults this before
// writing; nothing here touches Supabase.
//
// WHY THIS EXISTS: updateReleaseStatus took any string and set it, so a release
// could be marked "deployed" with no sign-off — which is the one gate the
// Build & Release page exists to enforce — and an arbitrary status could be
// written until the database's own check constraint rejected it, surfacing as
// a raw Postgres error rather than a sentence anyone can act on.

/** The exact set the platform_releases check constraint permits. */
export const releaseStatuses = [
  "pending",
  "in_progress",
  "deployed",
  "rolled_back",
  "cancelled",
] as const;

export type ReleaseStatus = (typeof releaseStatuses)[number];

export function isReleaseStatus(value: unknown): value is ReleaseStatus {
  return typeof value === "string" && (releaseStatuses as readonly string[]).includes(value);
}

export interface ReleaseTransitionGate {
  ok: boolean;
  reason?: string;
}

export interface ReleaseTransitionInput {
  nextStatus: string;
  /** Null until an owner has signed the release off on the releases page. */
  signedOffAt?: string | null;
}

/**
 * The rule that matters: nothing reaches "deployed" without a recorded
 * sign-off. Everything else stays deliberately permissive — this is a small
 * team's own release log, and a status typed into it by hand is a record of
 * what happened, not a workflow to police.
 */
export function canSetReleaseStatus(input: ReleaseTransitionInput): ReleaseTransitionGate {
  if (!isReleaseStatus(input.nextStatus)) {
    return {
      ok: false,
      reason: `"${String(input.nextStatus)}" is not a release status. Choose one of: ${releaseStatuses.join(", ")}.`,
    };
  }

  if (input.nextStatus === "deployed" && !input.signedOffAt) {
    return {
      ok: false,
      reason: "Sign the release off before marking it deployed — the sign-off is the record that a human approved this ship.",
    };
  }

  return { ok: true };
}
