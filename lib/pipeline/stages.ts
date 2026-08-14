// The lead-to-active journey as a workflow rather than a board.
//
// PURE. No I/O, no server-only import — the rail renders on the server and the
// same helpers are unit-tested directly. Every consumer (the case view, the
// board, the server actions, the mobile app) reads stage order from here so
// there is one answer to "what comes next".
//
// The stage STRINGS live in lib/company-data.ts because they are stored values
// in company_clients.lifecycle_stage. This module adds the ordering and the
// per-step copy the workflow view needs, and deliberately does not re-declare
// the vocabulary: a stage list that disagreed with the stored one would show a
// client a step they are not on.

import { lifecycleStages } from "@/lib/company-data";

export type LifecycleStage = (typeof lifecycleStages)[number];

/** The stage a newly created lead starts on (and the DB column default). */
export const firstStage: LifecycleStage = "Lead";

/**
 * Where a stage sits in the journey, 0-based, or -1 for a value that is not a
 * known stage. Callers must handle -1: `lifecycle_stage` is free text in the
 * database, so a legacy or hand-edited row can carry anything at all.
 */
export function stageIndex(stage: string | null | undefined): number {
  if (typeof stage !== "string") return -1;
  return (lifecycleStages as readonly string[]).indexOf(stage);
}

/** True for a string that is one of the known lifecycle stages. */
export function isLifecycleStage(stage: string | null | undefined): stage is LifecycleStage {
  return stageIndex(stage) >= 0;
}

/**
 * Human step number, 1-based, for "STEP 4 OF 13". Returns null for an unknown
 * stage rather than 0, so a caller cannot print "STEP 0".
 */
export function stageNumber(stage: string | null | undefined): number | null {
  const index = stageIndex(stage);
  return index < 0 ? null : index + 1;
}

/** Total steps in the journey. */
export const stageCount = lifecycleStages.length;

/** The stage after this one, or null at the end of the journey. */
export function nextStage(stage: string | null | undefined): LifecycleStage | null {
  const index = stageIndex(stage);
  if (index < 0 || index >= lifecycleStages.length - 1) return null;
  return lifecycleStages[index + 1];
}

/** The stage before this one, or null at the start. */
export function previousStage(stage: string | null | undefined): LifecycleStage | null {
  const index = stageIndex(stage);
  if (index <= 0) return null;
  return lifecycleStages[index - 1];
}

/** Rail position of a stage relative to where the client actually is. */
export type StagePosition = "done" | "current" | "future";

/**
 * How a stage should draw on the rail for a client at `currentStage`.
 *
 * An unknown current stage renders every step as "future" rather than throwing:
 * a bad stored value should make the rail look unstarted, not take the page
 * down. The case view surfaces the bad value separately.
 */
export function stagePosition(stage: string, currentStage: string | null | undefined): StagePosition {
  const target = stageIndex(stage);
  const current = stageIndex(currentStage);
  if (target < 0 || current < 0) return "future";
  if (target < current) return "done";
  if (target === current) return "current";
  return "future";
}

/* -------------------------------------------------------------------------- */
/* Per-stage copy                                                             */
/* -------------------------------------------------------------------------- */

export interface StageDetail {
  /** Short group name shown above the stage on the board and the rail. */
  lane: string;
  /** One line under the stage name on the board column. */
  summary: string;
  /** The current-step card headline — a state, not an instruction. */
  headline: string;
  /** What this step means and who answers for it. Two sentences at most. */
  body: string;
  /** Label for the single primary action that leaves this stage. */
  advanceLabel: string;
}

/**
 * Copy for every stage. `lane` and `summary` were previously hardcoded inside
 * SalesPipelineManager; they moved here so the board and the case view cannot
 * describe the same stage differently.
 */
export const stageDetails: Record<LifecycleStage, StageDetail> = {
  Lead: {
    lane: "Intake",
    summary: "New account fit and ownership",
    headline: "Logged — needs an owner",
    body: "Every account needs one name against it. The owner is who answers for this company reaching a signed deal — not who sourced it, and not who happens to be free.",
    advanceLabel: "Move to First Pitch",
  },
  "First Pitch": {
    lane: "Intake",
    summary: "First conversation booked or held",
    headline: "Owned — ready for the first pitch",
    body: "The first substantive conversation with the buyer. Mark the pitch complete once it has happened, whatever the outcome.",
    advanceLabel: "Move to Demo Scheduled",
  },
  "Demo Scheduled": {
    lane: "Discovery",
    summary: "Demo on the calendar",
    headline: "Pitched — demo being scheduled",
    body: "A demo with a date on it. Until it is scheduled, this deal has no next event and will quietly go cold.",
    advanceLabel: "Move to Demo Completed",
  },
  "Demo Completed": {
    lane: "Discovery",
    summary: "Demo held, buyer reaction captured",
    headline: "Demo booked — waiting on the session",
    body: "Run the demo and record what the buyer reacted to. That reaction is what the proposal has to answer.",
    advanceLabel: "Move to Proposal Sent",
  },
  "Proposal Sent": {
    lane: "Negotiating",
    summary: "Priced proposal in the buyer's hands",
    headline: "Demo done — ready to price",
    body: "A proposal reaches the client only after an approver has reviewed the exact revision being sent. That gate lives in the Proposals module and is enforced there.",
    advanceLabel: "Move to Legal Review",
  },
  "Legal Review": {
    lane: "Negotiating",
    summary: "NDA and terms under review",
    headline: "Proposal out — legal review open",
    body: "NDA and commercial terms reviewed before paper goes out. This is the last cheap moment to change the shape of the deal.",
    advanceLabel: "Move to Contract Sent",
  },
  "Contract Sent": {
    lane: "Negotiating",
    summary: "MSA/SOW with the client",
    headline: "Legal clear — contract to prepare",
    body: "The MSA and SOW go to the client for signature. Nothing here is billable yet.",
    advanceLabel: "Move to Signed / Won",
  },
  "Signed / Won": {
    lane: "Negotiating",
    summary: "Signature captured, deal closed",
    headline: "Contract out — awaiting signature",
    body: "Signature captured. Accepting a proposal files the expected income automatically and lands the client here.",
    advanceLabel: "Move to Invoicing",
  },
  Invoicing: {
    lane: "Billing",
    summary: "First invoice raised and issued",
    headline: "Won — ready to invoice",
    body: "A won deal is not an onboarding client until it has been billed. Raise the invoice from the accepted proposal, then issue it — an invoice sitting in draft has not asked anyone for money.",
    advanceLabel: "Move to Onboarding",
  },
  Onboarding: {
    lane: "Delivery",
    summary: "Access, data, and kickoff",
    headline: "Invoiced — onboarding can start",
    body: "Billing is settled, so delivery can begin: contacts named, sample data in, kickoff held.",
    advanceLabel: "Move to Pilot / Setup",
  },
  "Pilot / Setup": {
    lane: "Delivery",
    summary: "Platform configured and in use",
    headline: "Onboarded — configuring the platform",
    body: "The client is being stood up on the platform. Confirm access works for their own people, not just for us.",
    advanceLabel: "Move to Active Company",
  },
  "Active Company": {
    lane: "Live",
    summary: "Live account in normal service",
    headline: "Set up — ready to go live",
    body: "Going active is a commitment to serve this company under contract. Everything required for active status has to be on file before that claim is made.",
    advanceLabel: "Move to Renewal / Expansion",
  },
  "Renewal / Expansion": {
    lane: "Live",
    summary: "Renewal or growth conversation",
    headline: "Live — in renewal and expansion",
    body: "The account is live and the conversation is now about renewal and growth. This is the end of the journey; further deals open their own proposals.",
    advanceLabel: "",
  },
};

/** Copy for a stage, or null when the stored value is not a known stage. */
export function stageDetail(stage: string | null | undefined): StageDetail | null {
  return isLifecycleStage(stage) ? stageDetails[stage] : null;
}

/** The stages that mean "this company is a live customer". */
export const liveStages: readonly LifecycleStage[] = ["Active Company", "Renewal / Expansion"];

/** True once the deal is closed — used to decide whether money records apply. */
export function isAtOrPastStage(stage: string | null | undefined, marker: LifecycleStage): boolean {
  const current = stageIndex(stage);
  const at = stageIndex(marker);
  return current >= 0 && at >= 0 && current >= at;
}
