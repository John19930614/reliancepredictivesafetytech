// Discovery and qualification — the shape of steps 5 and 6.
//
// PURE. No I/O. The four qualification tests are BANT, which is what the
// lifecycle map names at step 6: "Authority, need, budget, timeline validated".
//
// They stay four separate booleans rather than one score, because "we have
// budget but no timeline" and "we have timeline but no budget" are different
// deals and a single 50% would hide which. The completeness figure below is
// derived for display; it is never what gets stored.

export interface QualificationRow {
  opportunity_id: string;
  discovery_call_at: string | null;
  primary_need: string | null;
  pain_points: string | null;
  decision_makers: string | null;
  budget_range: string | null;
  timeline: string | null;
  has_budget: boolean;
  has_authority: boolean;
  has_need: boolean;
  has_timeline: boolean;
  competition: string | null;
  qualified_at: string | null;
  qualified_by: string | null;
  updated_at: string;
}

export type BantKey = "has_budget" | "has_authority" | "has_need" | "has_timeline";

export interface BantTest {
  key: BantKey;
  label: string;
  /** What has to be true, phrased as the thing to go and find out. */
  question: string;
}

export const bantTests: readonly BantTest[] = [
  { key: "has_budget", label: "Budget", question: "Is there money allocated, and do we know roughly how much?" },
  { key: "has_authority", label: "Authority", question: "Have we spoken to someone who can say yes?" },
  { key: "has_need", label: "Need", question: "Is there a real problem this solves, in their words?" },
  { key: "has_timeline", label: "Timeline", question: "Is there a date they need this working by?" },
];

export interface QualificationState {
  /** How many of the four are met. */
  met: number;
  total: number;
  /** The tests still outstanding, in declaration order. */
  outstanding: BantTest[];
  /** All four met. */
  complete: boolean;
  /** True once a person has recorded the qualification decision. */
  qualified: boolean;
}

/**
 * Reads the qualification state.
 *
 * A missing record is "nothing established yet", not an error — most
 * opportunities reach step 5 before anyone has written anything down.
 */
export function qualificationState(row: QualificationRow | null | undefined): QualificationState {
  const met = row ? bantTests.filter((test) => row[test.key] === true).length : 0;
  const outstanding = row ? bantTests.filter((test) => row[test.key] !== true) : [...bantTests];

  return {
    met,
    total: bantTests.length,
    outstanding,
    complete: met === bantTests.length,
    qualified: Boolean(row?.qualified_at),
  };
}

/* -------------------------------------------------------------------------- */
/* Discovery completeness                                                     */
/* -------------------------------------------------------------------------- */

export interface DiscoveryItem {
  key: keyof QualificationRow;
  label: string;
  captured: boolean;
}

/**
 * The four things Discovery is for, and whether each has been captured.
 *
 * Mirrors the lifecycle map's own bullets: initial call held, needs and pain
 * points identified, decision makers identified, budget and timeline discussed.
 * Whitespace does not count as captured — a field containing a space is the
 * same as an empty one to the person reading it later.
 */
export function discoveryItems(row: QualificationRow | null | undefined): DiscoveryItem[] {
  const filled = (value: string | null | undefined) => typeof value === "string" && value.trim().length > 0;

  return [
    { key: "discovery_call_at", label: "Initial call / meeting held", captured: Boolean(row?.discovery_call_at) },
    { key: "primary_need", label: "Needs and pain points identified", captured: filled(row?.primary_need) || filled(row?.pain_points) },
    { key: "decision_makers", label: "Decision makers identified", captured: filled(row?.decision_makers) },
    { key: "budget_range", label: "Budget and timeline discussed", captured: filled(row?.budget_range) && filled(row?.timeline) },
  ];
}

/** How much of Discovery has been captured. */
export function discoveryProgress(row: QualificationRow | null | undefined): { captured: number; total: number } {
  const items = discoveryItems(row);
  return { captured: items.filter((item) => item.captured).length, total: items.length };
}

/* -------------------------------------------------------------------------- */
/* Probability                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A suggested win probability from the BANT count.
 *
 * ADVISORY ONLY — the caller offers it, a person accepts it. Probability drives
 * the weighted pipeline number, and a figure that moved itself whenever somebody
 * ticked a box would quietly restate the forecast without anyone deciding to.
 *
 * The curve is deliberately flat at the bottom: one of four met is barely
 * different from none, because the one met is usually "need", which every
 * enquiry has by definition.
 */
export function suggestedProbability(met: number): number {
  switch (met) {
    case 4:
      return 60;
    case 3:
      return 40;
    case 2:
      return 25;
    case 1:
      return 10;
    default:
      return 5;
  }
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export interface QualificationInput {
  discoveryCallAt?: string | null;
  primaryNeed?: string | null;
  painPoints?: string | null;
  decisionMakers?: string | null;
  budgetRange?: string | null;
  timeline?: string | null;
  hasBudget?: boolean;
  hasAuthority?: boolean;
  hasNeed?: boolean;
  hasTimeline?: boolean;
  competition?: string | null;
}

const limits: Record<string, number> = {
  primaryNeed: 2000,
  painPoints: 4000,
  decisionMakers: 2000,
  budgetRange: 200,
  timeline: 200,
  competition: 1000,
};

export interface QualificationCheck {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Column-shaped patch, containing only the keys the caller supplied. */
  patch?: Record<string, unknown>;
}

const columnFor: Record<string, string> = {
  primaryNeed: "primary_need",
  painPoints: "pain_points",
  decisionMakers: "decision_makers",
  budgetRange: "budget_range",
  timeline: "timeline",
  competition: "competition",
};

/**
 * Validates a discovery/qualification edit and shapes it into columns.
 *
 * Only the keys actually supplied end up in the patch, so saving the BANT boxes
 * cannot blank a discovery note the caller never saw.
 */
export function checkQualificationInput(input: QualificationInput): QualificationCheck {
  const patch: Record<string, unknown> = {};

  for (const [key, column] of Object.entries(columnFor)) {
    const value = input[key as keyof QualificationInput];
    if (value === undefined) continue;
    const text = typeof value === "string" ? value.trim() : "";
    if (text.length > limits[key]) {
      return {
        ok: false,
        error: "That entry is too long.",
        fieldErrors: { [key]: `Keep it under ${limits[key]} characters.` },
      };
    }
    patch[column] = text.length > 0 ? text : null;
  }

  if (input.discoveryCallAt !== undefined) {
    if (input.discoveryCallAt === null || input.discoveryCallAt === "") {
      patch.discovery_call_at = null;
    } else {
      const parsed = new Date(input.discoveryCallAt);
      if (Number.isNaN(parsed.getTime())) {
        return { ok: false, error: "Enter a valid date for the discovery call.", fieldErrors: { discoveryCallAt: "Invalid date." } };
      }
      patch.discovery_call_at = parsed.toISOString();
    }
  }

  for (const test of bantTests) {
    const key = ({
      has_budget: "hasBudget",
      has_authority: "hasAuthority",
      has_need: "hasNeed",
      has_timeline: "hasTimeline",
    } as const)[test.key];
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      return { ok: false, error: `${test.label} has to be yes or no.` };
    }
    patch[test.key] = value;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Nothing to save." };
  }

  return { ok: true, patch };
}
