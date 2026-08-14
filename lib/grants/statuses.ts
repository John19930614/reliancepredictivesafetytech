/**
 * The Grant Tracker workflow.
 *
 * Keys are the values stored in company_grant_opportunities.status and are
 * STABLE — the CHECK constraint in
 * supabase/migrations/20260816090000_grant_tracker.sql lists exactly these, and
 * lib/grants/migration-parity.test.ts fails if the two drift. Labels are copy
 * and may be reworded freely.
 *
 * The source spreadsheet used free text ("Reviewing membership", "pre-reg",
 * "We do not qualify", and blanks), which is why nothing could be counted. Each
 * of those collapses onto one key here; see the migration's seed block for the
 * row-by-row mapping.
 */

export const grantPipelineStatusKeys = [
  "identified", // seen it, nothing done yet
  "researching", // reading requirements, deciding whether to pursue
  "inquiry_sent", // reached out to the agency, awaiting a reply
  "pre_registered", // pre-registration done, application window not yet open
  "application_submitted", // filed and waiting on a decision
] as const;

/**
 * Parked, NOT terminal. Lighter Capital is "keep on hand" — not a grant today,
 * but a funding route we may take. It has to be able to re-enter the pipeline
 * without an admin reopening it, which a terminal status would require.
 */
export const grantParkedStatusKeys = ["on_hold"] as const;

export const grantTerminalStatusKeys = ["awarded", "declined", "not_eligible"] as const;

export const grantStatusKeys = [
  ...grantPipelineStatusKeys,
  ...grantParkedStatusKeys,
  ...grantTerminalStatusKeys,
] as const;

export type GrantStatusKey = (typeof grantStatusKeys)[number];

/** Column default, and the status a new row starts in. */
export const firstGrantStatusKey: GrantStatusKey = "identified";

export interface GrantStatus {
  key: GrantStatusKey;
  label: string;
  summary: string;
  /** Reported outcomes: reaching one requires a reason, leaving one is an admin act. */
  isTerminal: boolean;
  /**
   * Badge colour. Every hex is already in use elsewhere in the portal
   * (lib/proposals/types.ts, components/legal-register/badges.tsx) — colour
   * encodes urgency class, and the label carries the exact state, so two
   * statuses may legitimately share a tone.
   */
  color: string;
}

export const grantStatuses: readonly GrantStatus[] = [
  {
    key: "identified",
    label: "Identified",
    summary: "Spotted the programme. Nobody has assessed it yet.",
    isTerminal: false,
    color: "#a7a7a7",
  },
  {
    key: "researching",
    label: "Researching",
    summary: "Reading the requirements and deciding whether it is worth pursuing.",
    isTerminal: false,
    color: "#f59e0b",
  },
  {
    key: "inquiry_sent",
    label: "Inquiry Sent",
    summary: "We have contacted the agency and are waiting on a reply.",
    isTerminal: false,
    color: "#3b82f6",
  },
  {
    key: "pre_registered",
    label: "Pre-Registered",
    summary: "Pre-registration is done; the application window has not opened yet.",
    isTerminal: false,
    color: "#f59e0b",
  },
  {
    key: "application_submitted",
    label: "Application Submitted",
    summary: "Filed. Waiting on the funder's decision.",
    isTerminal: false,
    color: "#c9932b",
  },
  {
    key: "on_hold",
    label: "Keep On Hand",
    summary: "Not being pursued now, but kept as a funding route worth revisiting.",
    isTerminal: false,
    color: "#a7a7a7",
  },
  {
    key: "awarded",
    label: "Awarded",
    summary: "We won it.",
    isTerminal: true,
    color: "#22c55e",
  },
  {
    key: "declined",
    label: "Declined",
    summary: "We applied and were turned down.",
    isTerminal: true,
    color: "#ef4444",
  },
  {
    key: "not_eligible",
    label: "Not Eligible",
    summary: "We do not qualify. The reason is on the record so it can be re-checked.",
    isTerminal: true,
    color: "#6b7280",
  },
];

export function isGrantStatusKey(value: string | null | undefined): value is GrantStatusKey {
  return grantStatusKeys.includes(value as GrantStatusKey);
}

/**
 * Returns null rather than throwing for an unknown key, so a hand-edited row
 * renders as off-workflow instead of taking the page down.
 */
export function grantStatus(key: string | null | undefined): GrantStatus | null {
  return grantStatuses.find((status) => status.key === key) ?? null;
}

export function isGrantTerminalStatus(key: string | null | undefined): boolean {
  return grantTerminalStatusKeys.includes(key as (typeof grantTerminalStatusKeys)[number]);
}

export function grantStatusLabel(key: string | null | undefined): string {
  return grantStatus(key)?.label ?? String(key ?? "Unknown");
}

export function grantStatusColor(key: string | null | undefined): string {
  return grantStatus(key)?.color ?? "#a7a7a7";
}

/**
 * List order within the "undated and live" band: the rows blocked on US come
 * before the rows blocked on THEM. A lower number sorts first.
 */
const undatedRank: Record<GrantStatusKey, number> = {
  researching: 0,
  pre_registered: 1,
  inquiry_sent: 2,
  application_submitted: 3,
  identified: 4,
  on_hold: 5,
  awarded: 6,
  declined: 7,
  not_eligible: 8,
};

export function grantStatusRank(key: string | null | undefined): number {
  return isGrantStatusKey(key) ? undatedRank[key] : Number.MAX_SAFE_INTEGER;
}
