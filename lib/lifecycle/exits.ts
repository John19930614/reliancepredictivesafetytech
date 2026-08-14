// Exit paths — available at any step.
//
// PURE. The three ways an opportunity leaves the lifecycle without reaching
// Closed Won, plus the rules about what each one has to record.
//
// The pipeline this replaces had no concept of leaving sideways: a dead deal
// either sat in its column forever or was dragged to a stage it never reached.
// Neither tells you why you lost, and neither can be reported on. Every exit
// here carries a reason, and Closed Lost additionally carries the competitor,
// because "who did we lose to" is the single most useful thing a lost deal has
// left to give.

export const lifecycleExitStatuses = ["closed_lost", "on_hold", "disqualified"] as const;

export type LifecycleExitStatus = (typeof lifecycleExitStatuses)[number];

/** Every status an opportunity can hold, including the live ones. */
export const opportunityStatuses = ["open", "won", ...lifecycleExitStatuses] as const;

export type OpportunityStatus = (typeof opportunityStatuses)[number];

export interface LifecycleExit {
  status: LifecycleExitStatus;
  label: string;
  summary: string;
  /** Whether this exit asks who the deal was lost to. */
  capturesCompetitor: boolean;
  /** Whether this exit asks when to pick the deal back up. */
  capturesHoldDate: boolean;
}

export const lifecycleExits: readonly LifecycleExit[] = [
  {
    status: "closed_lost",
    label: "Closed Lost",
    summary: "Lost deal with reason, feedback and competitor captured.",
    capturesCompetitor: true,
    capturesHoldDate: false,
  },
  {
    status: "on_hold",
    label: "On Hold / Nurture",
    summary: "Pause for a defined period with follow-up date.",
    capturesCompetitor: false,
    capturesHoldDate: true,
  },
  {
    status: "disqualified",
    label: "Disqualified",
    summary: "Not a good fit or no longer pursuing with clear reason.",
    capturesCompetitor: false,
    capturesHoldDate: false,
  },
];

const exitByStatus = new Map<string, LifecycleExit>(lifecycleExits.map((exit) => [exit.status, exit]));

export function isLifecycleExitStatus(status: string | null | undefined): status is LifecycleExitStatus {
  return typeof status === "string" && exitByStatus.has(status);
}

export function lifecycleExit(status: string | null | undefined): LifecycleExit | null {
  return typeof status === "string" ? (exitByStatus.get(status) ?? null) : null;
}

/** True while the opportunity is still being worked. */
export function isOpen(status: string | null | undefined): boolean {
  return status === "open";
}

/** True once it has left the lifecycle, whether won or lost. */
export function isClosed(status: string | null | undefined): boolean {
  return status === "won" || isLifecycleExitStatus(status);
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export const maxExitReasonLength = 1000;
/** Short enough to type, long enough to be worth reading later. */
export const minExitReasonLength = 10;
export const maxCompetitorLength = 200;

export interface ExitInputCheck {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** The cleaned values to store, when ok. */
  value?: {
    status: LifecycleExitStatus;
    reason: string;
    competitor: string | null;
    holdUntil: string | null;
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real calendar date, not just the right shape.
 *
 * The shape alone lets "2026-13-45" through, which then reaches a `date` column
 * and fails at the database with a message nobody can act on. Round-tripping
 * through Date catches the month and day, since JS normalises an overflow
 * (2026-13-01 becomes 2027-01-01) and the string no longer matches.
 */
function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export interface ExitInput {
  status: string;
  reason?: string | null;
  competitor?: string | null;
  holdUntil?: string | null;
}

/**
 * Validates an exit before it is written.
 *
 * The reason floor is deliberate and matches the override rule elsewhere in the
 * platform: a one-word reason is indistinguishable from no reason, and this
 * record exists precisely so a later reader can act on it.
 */
export function checkExitInput(input: ExitInput): ExitInputCheck {
  const exit = lifecycleExit(input.status);
  if (!exit) {
    return { ok: false, error: "Choose a valid exit path." };
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length === 0) {
    return {
      ok: false,
      error: `Give a reason for marking this ${exit.label.toLowerCase()}.`,
      fieldErrors: { reason: "A reason is required." },
    };
  }
  if (reason.length < minExitReasonLength) {
    return {
      ok: false,
      error: "Say a little more about why this deal is leaving the lifecycle.",
      fieldErrors: { reason: "Too short to be useful later." },
    };
  }
  if (reason.length > maxExitReasonLength) {
    return {
      ok: false,
      error: `Keep the reason under ${maxExitReasonLength} characters.`,
      fieldErrors: { reason: "Too long." },
    };
  }

  // Only kept for the exit that asks for it, so a competitor cannot be smuggled
  // onto an On Hold record and later read as a loss.
  let competitor: string | null = null;
  if (exit.capturesCompetitor) {
    const named = typeof input.competitor === "string" ? input.competitor.trim() : "";
    if (named.length > maxCompetitorLength) {
      return { ok: false, error: "That competitor name is too long.", fieldErrors: { competitor: "Too long." } };
    }
    competitor = named.length > 0 ? named : null;
  }

  let holdUntil: string | null = null;
  if (exit.capturesHoldDate) {
    const date = typeof input.holdUntil === "string" ? input.holdUntil.trim() : "";
    if (date.length === 0) {
      return {
        ok: false,
        // A hold with no date is how deals disappear — it is the difference
        // between nurture and abandonment.
        error: "Set the date to pick this deal back up.",
        fieldErrors: { holdUntil: "A follow-up date is required." },
      };
    }
    if (!isRealDate(date)) {
      return { ok: false, error: "Enter the follow-up date as YYYY-MM-DD.", fieldErrors: { holdUntil: "Invalid date." } };
    }
    holdUntil = date;
  }

  return { ok: true, value: { status: exit.status, reason, competitor, holdUntil } };
}
