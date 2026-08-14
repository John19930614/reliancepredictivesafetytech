// What has to be true before a client leaves the step they are on.
//
// PURE. Takes a plain facts object and returns a verdict — no Supabase, no
// session, no I/O. The server action gathers the facts and re-runs this before
// it writes; the case view runs it to decide whether the advance button is
// live and what to say when it is not. One implementation, so the button and
// the write can never disagree.
//
// GATES ARE NOT PERMISSIONS. A blocker here means "this step is not finished",
// not "you may not do this". Who may advance or override is decided in
// lib/pipeline/policy.ts from the caller's role. Keep the two apart: a gate
// that consulted a role would let a promotion silently complete a checklist.

import {
  isLifecycleStage,
  nextStage,
  type LifecycleStage,
} from "@/lib/pipeline/stages";

/* -------------------------------------------------------------------------- */
/* Facts                                                                      */
/* -------------------------------------------------------------------------- */

export interface ChecklistFact {
  title: string;
  lifecycle_stage: string;
  completed: boolean;
}

export interface ProposalFact {
  status: string;
}

export interface InvoiceFact {
  status: string;
}

export interface DocumentRequirementFact {
  title: string;
  required_for_active: boolean;
  satisfied: boolean;
}

export interface ClientWorkflowFacts {
  stage: string;
  /** company_clients.owner — a name, not a user id. */
  owner: string | null;
  checklist: readonly ChecklistFact[];
  proposals: readonly ProposalFact[];
  invoices: readonly InvoiceFact[];
  requiredDocuments: readonly DocumentRequirementFact[];
  hasPrimaryContact: boolean;
}

/* -------------------------------------------------------------------------- */
/* Verdict                                                                    */
/* -------------------------------------------------------------------------- */

export interface StageRequirement {
  /** Stable identifier — safe to store in the transition record. */
  code: string;
  /** What the operator has to do, phrased as the outstanding thing. */
  label: string;
  satisfied: boolean;
}

export interface StageGateResult {
  stage: string;
  /** Where advancing would take the client, or null at the end / unknown stage. */
  nextStage: LifecycleStage | null;
  /** Every requirement for leaving this stage, satisfied or not. */
  requirements: StageRequirement[];
  /** The unsatisfied subset, in declaration order. */
  blockers: StageRequirement[];
  /** True when there is somewhere to go and nothing outstanding. */
  canAdvance: boolean;
  /** Set when there is nowhere to advance to, explaining why. */
  terminalReason?: string;
}

/* -------------------------------------------------------------------------- */
/* Fact helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Checklist lookup by title.
 *
 * Compared case-insensitively on trimmed text. The readiness signal this
 * replaces (ClientDetailManager) compared raw titles with `===`, so an item
 * seeded as "Contract signed" and later re-typed as "Contract Signed" silently
 * stopped counting. A missing item is treated as not done — a gate must never
 * pass because its evidence is absent.
 */
function checklistDone(facts: ClientWorkflowFacts, title: string): boolean {
  const wanted = title.trim().toLowerCase();
  return facts.checklist.some((item) => item.title.trim().toLowerCase() === wanted && item.completed);
}

/** True when every checklist item pinned to `stage` is complete. */
function allStageItemsDone(facts: ClientWorkflowFacts, stage: string): boolean {
  const items = facts.checklist.filter((item) => item.lifecycle_stage === stage);
  return items.length > 0 && items.every((item) => item.completed);
}

/** Proposal statuses that mean the document actually reached the client. */
const DELIVERED_PROPOSAL_STATUSES = new Set(["sent", "accepted"]);

function hasDeliveredProposal(facts: ClientWorkflowFacts): boolean {
  return facts.proposals.some((proposal) => DELIVERED_PROPOSAL_STATUSES.has(proposal.status));
}

function hasAcceptedProposal(facts: ClientWorkflowFacts): boolean {
  return facts.proposals.some((proposal) => proposal.status === "accepted");
}

/**
 * Invoice statuses that mean money has actually been asked for. A draft
 * invoice is a document nobody has seen; it does not clear the billing gate.
 */
const BILLED_INVOICE_STATUSES = new Set(["issued", "paid"]);

function hasIssuedInvoice(facts: ClientWorkflowFacts): boolean {
  return facts.invoices.some((invoice) => BILLED_INVOICE_STATUSES.has(invoice.status));
}

function outstandingActiveDocuments(facts: ClientWorkflowFacts): DocumentRequirementFact[] {
  return facts.requiredDocuments.filter((doc) => doc.required_for_active && !doc.satisfied);
}

/* -------------------------------------------------------------------------- */
/* Requirements per stage                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The requirements for LEAVING each stage.
 *
 * Read as: "to move off Lead, an owner must be assigned." The last stage has
 * no entry because there is nowhere to advance to.
 */
function requirementsFor(stage: LifecycleStage, facts: ClientWorkflowFacts): StageRequirement[] {
  switch (stage) {
    case "Lead":
      return [
        {
          code: "owner_assigned",
          label: "Assign an owner for this account",
          satisfied: Boolean(facts.owner && facts.owner.trim().length > 0),
        },
      ];

    case "First Pitch":
      return [
        {
          code: "first_pitch_completed",
          label: "Mark the first pitch completed",
          satisfied: checklistDone(facts, "First pitch completed"),
        },
      ];

    case "Demo Scheduled":
      return [
        {
          code: "demo_scheduled",
          label: "Put the demo on the calendar",
          satisfied: checklistDone(facts, "Demo scheduled"),
        },
      ];

    case "Demo Completed":
      return [
        {
          code: "demo_completed",
          label: "Mark the demo completed",
          satisfied: checklistDone(facts, "Demo completed"),
        },
      ];

    case "Proposal Sent":
      return [
        {
          code: "proposal_delivered",
          label: "Send a proposal to this client",
          satisfied: hasDeliveredProposal(facts),
        },
      ];

    case "Legal Review":
      return [
        {
          code: "nda_signed",
          label: "Get the NDA signed",
          satisfied: checklistDone(facts, "NDA signed"),
        },
      ];

    case "Contract Sent":
      return [
        {
          code: "contract_prepared",
          label: "Prepare the MSA/SOW",
          satisfied: checklistDone(facts, "MSA/SOW prepared"),
        },
      ];

    case "Signed / Won":
      return [
        {
          code: "contract_signed",
          // Either route proves the same thing: the client committed. An
          // accepted proposal is captured evidence, so it satisfies this on its
          // own without anyone re-ticking a box.
          label: "Capture the signed contract, or accept the proposal",
          satisfied: checklistDone(facts, "Contract signed") || hasAcceptedProposal(facts),
        },
      ];

    case "Invoicing":
      return [
        {
          code: "invoice_issued",
          label: "Raise an invoice and issue it",
          satisfied: hasIssuedInvoice(facts),
        },
      ];

    case "Onboarding":
      return [
        {
          code: "onboarding_items_complete",
          label: "Complete every onboarding checklist item",
          satisfied: allStageItemsDone(facts, "Onboarding"),
        },
        {
          code: "primary_contact",
          label: "Name a primary contact for the account",
          satisfied: facts.hasPrimaryContact,
        },
      ];

    case "Pilot / Setup":
      return [
        {
          code: "platform_access",
          label: "Confirm the client's own people can sign in",
          satisfied: checklistDone(facts, "Platform access confirmed"),
        },
      ];

    case "Active Company": {
      const outstanding = outstandingActiveDocuments(facts);
      return [
        {
          code: "active_approval",
          label: "Complete the active company approval",
          satisfied: checklistDone(facts, "Active company approval complete"),
        },
        {
          code: "required_documents",
          label:
            outstanding.length > 0
              ? `File the documents required for active status (${outstanding.map((d) => d.title).join(", ")})`
              : "File the documents required for active status",
          satisfied: outstanding.length === 0,
        },
      ];
    }

    case "Renewal / Expansion":
      return [];

    default: {
      // Exhaustiveness guard: adding a stage to lifecycleStages without giving
      // it requirements is a compile error here, not a silently open gate.
      const unreachable: never = stage;
      return unreachable;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Evaluation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Whether this client can leave the stage they are on, and what is outstanding.
 *
 * An unrecognised stored stage yields `canAdvance: false` with an explanation
 * rather than an exception — `lifecycle_stage` is free text, and a client whose
 * stage was hand-edited to something unknown should be visibly stuck, not a 500.
 */
export function evaluateStageGate(facts: ClientWorkflowFacts): StageGateResult {
  if (!isLifecycleStage(facts.stage)) {
    return {
      stage: facts.stage,
      nextStage: null,
      requirements: [],
      blockers: [],
      canAdvance: false,
      terminalReason: `"${facts.stage}" is not a stage in the journey, so there is no next step. Set a valid stage on the client record first.`,
    };
  }

  const target = nextStage(facts.stage);
  const requirements = requirementsFor(facts.stage, facts);
  const blockers = requirements.filter((requirement) => !requirement.satisfied);

  if (!target) {
    return {
      stage: facts.stage,
      nextStage: null,
      requirements,
      blockers,
      canAdvance: false,
      terminalReason: "This is the last stage of the journey. New business with this client opens its own proposal.",
    };
  }

  return {
    stage: facts.stage,
    nextStage: target,
    requirements,
    blockers,
    canAdvance: blockers.length === 0,
  };
}

/**
 * One sentence naming what is outstanding, for a button title or an audit
 * summary. Returns null when nothing is blocking.
 */
export function describeBlockers(result: StageGateResult): string | null {
  if (result.blockers.length === 0) return null;
  if (result.blockers.length === 1) return result.blockers[0].label;
  return `${result.blockers.length} steps outstanding: ${result.blockers.map((b) => b.label).join("; ")}`;
}
