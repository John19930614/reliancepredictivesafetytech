// The Client Lifecycle — 11 steps, one process, one owner, one outcome.
//
// PURE. No I/O and no server-only import, so the rail renders on the server and
// every helper is unit-tested directly.
//
// STEP KEYS ARE STORED VALUES. `opportunities.step` holds the key, never the
// label, and the database CHECK constraint lists the same eleven. Renaming a
// label here is a copy change; renaming a KEY is a data migration. They are kept
// apart for that reason — the previous lifecycle put display strings in the
// column and every rename became a production problem.

export const lifecycleStepKeys = [
  "lead_captured",
  "ai_triage",
  "sales_review",
  "assign_owner",
  "discovery",
  "opportunity_qualified",
  "solution_proposal",
  "proposal_review",
  "negotiation_approval",
  "commit_contract",
  "closed_won_onboarded",
] as const;

export type LifecycleStepKey = (typeof lifecycleStepKeys)[number];

/** Total steps in the lifecycle — the "of 11" in "Step 4 of 11". */
export const lifecycleStepCount = lifecycleStepKeys.length;

/** The step every opportunity starts on (and the column default). */
export const firstStepKey: LifecycleStepKey = "lead_captured";

/** The step that means the deal is done and the client is live. */
export const finalStepKey: LifecycleStepKey = "closed_won_onboarded";

export interface LifecycleStep {
  key: LifecycleStepKey;
  /** 1-based position, for the rail and the "Step N of 11" line. */
  number: number;
  /** Rail label and page title. */
  label: string;
  /** The status the record carries while it sits on this step. */
  status: string;
  /** One line under the page title. */
  summary: string;
  /** What actually happens here — the four bullets from the lifecycle map. */
  activities: readonly string[];
  /** Label for the primary advance action out of this step. */
  advanceLabel: string;
}

export const lifecycleSteps: readonly LifecycleStep[] = [
  {
    key: "lead_captured",
    number: 1,
    label: "Lead Captured",
    status: "New Lead",
    summary: "Capture and centralize new leads from all sources.",
    activities: [
      "Lead enters from any source (website, referral, event, email)",
      "Basic details captured",
      "AI automatically scores lead",
      "Assigned to unassigned pool",
    ],
    advanceLabel: "Send to AI Triage",
  },
  {
    key: "ai_triage",
    number: 2,
    label: "AI Triage & Score",
    status: "Triaged",
    summary: "Score, enrich, and prioritize this lead using AI and intent signals.",
    activities: [
      "AI analyzes lead data",
      "Fit, intent, budget, timing",
      "Lead score and priority",
      "Recommended next action",
    ],
    advanceLabel: "Move to Sales Review",
  },
  {
    key: "sales_review",
    number: 3,
    label: "Sales Review",
    status: "Reviewed",
    summary: "Human review and qualification decisions to move leads forward.",
    activities: [
      "Sales reviews AI insights",
      "Confirms or updates score",
      "Decide: Pursue / Hold / Disqualify",
      "Add notes and comments",
    ],
    advanceLabel: "Assign Owner",
  },
  {
    key: "assign_owner",
    number: 4,
    label: "Assign Owner",
    status: "Assigned",
    summary: "Assign accountability and route the opportunity to the right owner.",
    activities: [
      "Assign one accountable owner",
      "Owner gets notified",
      "Ownership drives outcome",
      "SLA clock starts",
    ],
    advanceLabel: "Move to Discovery",
  },
  {
    key: "discovery",
    number: 5,
    label: "Discovery",
    status: "Discovery",
    summary: "Understand the need, the people, and the money behind the deal.",
    activities: [
      "Initial call / meeting held",
      "Identify needs, pain points",
      "Decision makers identified",
      "Budget + timeline discussed",
    ],
    advanceLabel: "Qualify Opportunity",
  },
  {
    key: "opportunity_qualified",
    number: 6,
    label: "Opportunity Qualified",
    status: "Qualified",
    summary: "Confirm this is a real opportunity worth working.",
    activities: [
      "Confirm real opportunity",
      "Authority, need, budget, timeline validated",
      "Competition identified",
      "Probability set",
    ],
    advanceLabel: "Build Solution & Proposal",
  },
  {
    key: "solution_proposal",
    number: 7,
    label: "Solution & Proposal",
    status: "Proposal",
    summary: "Define the solution, price it, and document the value.",
    activities: [
      "Define solution and scope",
      "Select proposal type",
      "Build proposal and pricing",
      "ROI and value documented",
    ],
    advanceLabel: "Move to Proposal Review",
  },
  {
    key: "proposal_review",
    number: 8,
    label: "Proposal Review",
    status: "Review",
    summary: "Client review, feedback, questions, and revisions to ensure alignment and win confidence.",
    activities: [
      "Proposal presented",
      "Stakeholder feedback",
      "Questions / objections",
      "Demos and follow-ups",
    ],
    advanceLabel: "Move to Negotiation / Approval",
  },
  {
    key: "negotiation_approval",
    number: 9,
    label: "Negotiation / Approval",
    status: "Negotiation",
    summary: "Pricing, terms, internal approvals, legal, procurement, and insurance.",
    activities: [
      "Pricing and terms",
      "Legal / security / insurance",
      "Procurement process",
      "Executive approval",
    ],
    advanceLabel: "Move to Commit / Contract",
  },
  {
    key: "commit_contract",
    number: 10,
    label: "Commit / Contract",
    status: "Contract",
    summary: "Finalize commitment, issue contract, capture signatures, PO, and set initial billing requirements.",
    activities: [
      "Verbal commitment",
      "Contract / SOW issued",
      "Signatures / PO received",
      "Payment terms confirmed",
    ],
    advanceLabel: "Move to Closed Won & Onboarded",
  },
  {
    key: "closed_won_onboarded",
    number: 11,
    label: "Closed Won & Onboarded",
    status: "Active Client",
    summary: "Client creation, kickoff, onboarding, invoicing, and transition to active account management.",
    activities: [
      "Deal closed won",
      "Client record created",
      "Kickoff / implementation",
      "Hand-off to Client Success",
    ],
    // The lifecycle ends here; the concept's own header swaps the primary
    // action for "View Client Record" on this step.
    advanceLabel: "",
  },
];

/* -------------------------------------------------------------------------- */
/* Lookups                                                                    */
/* -------------------------------------------------------------------------- */

const byKey = new Map<string, LifecycleStep>(lifecycleSteps.map((step) => [step.key, step]));

/** True for a string that is one of the eleven step keys. */
export function isLifecycleStepKey(key: string | null | undefined): key is LifecycleStepKey {
  return typeof key === "string" && byKey.has(key);
}

/**
 * The step for a key, or null.
 *
 * Returns null rather than throwing so a row carrying an unrecognised key — a
 * hand-edited record, or one written before a key was retired — renders as
 * off-lifecycle instead of taking the page down.
 */
export function lifecycleStep(key: string | null | undefined): LifecycleStep | null {
  return typeof key === "string" ? (byKey.get(key) ?? null) : null;
}

/** 0-based position, or -1 for a key that is not in the lifecycle. */
export function stepIndex(key: string | null | undefined): number {
  const step = lifecycleStep(key);
  return step ? step.number - 1 : -1;
}

/** 1-based position for display, or null for an unknown key. */
export function stepNumber(key: string | null | undefined): number | null {
  return lifecycleStep(key)?.number ?? null;
}

/** The next step, or null at the end of the lifecycle. */
export function nextStepKey(key: string | null | undefined): LifecycleStepKey | null {
  const index = stepIndex(key);
  if (index < 0 || index >= lifecycleStepKeys.length - 1) return null;
  return lifecycleStepKeys[index + 1];
}

/** The previous step, or null at the start. */
export function previousStepKey(key: string | null | undefined): LifecycleStepKey | null {
  const index = stepIndex(key);
  if (index <= 0) return null;
  return lifecycleStepKeys[index - 1];
}

/** How a step draws on the rail relative to where the record actually is. */
export type StepPosition = "done" | "current" | "future";

/**
 * Rail position of `key` for a record sitting on `currentKey`.
 *
 * An unknown current key draws every step as future, so a bad stored value
 * makes the rail look unstarted rather than claiming completed work.
 */
export function stepPosition(key: string, currentKey: string | null | undefined): StepPosition {
  const target = stepIndex(key);
  const current = stepIndex(currentKey);
  if (target < 0 || current < 0) return "future";
  if (target < current) return "done";
  if (target === current) return "current";
  return "future";
}

/**
 * How many steps a move covers, positive forwards and negative backwards.
 * Zero when either key is unknown — callers treat that as "not a real move".
 */
export function stepDistance(from: string | null | undefined, to: string | null | undefined): number {
  const a = stepIndex(from);
  const b = stepIndex(to);
  if (a < 0 || b < 0) return 0;
  return b - a;
}

/** The status word a record carries while it sits on this step. */
export function stepStatus(key: string | null | undefined): string | null {
  return lifecycleStep(key)?.status ?? null;
}
