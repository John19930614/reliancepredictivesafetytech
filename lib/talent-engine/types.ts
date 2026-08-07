/**
 * EHS Talent Engine — shared type contract.
 *
 * MODULE_ID: ehs_talent_engine
 * PURPOSE: AI-managed markup staffing — bill the client one rate, pay the EHS
 *   professional a lower rate, keep the spread; every submittal, rate change,
 *   and placement passes a human approval gate.
 * GROUP: Commercial
 * PATH_PREFIX: /employee/talent-engine
 *
 * This file is the single source of truth for the module's shapes. The
 * migration, the policy/pricing/scoring libraries, the server actions and the
 * console UI all code against it — nothing here imports from those, so it stays
 * safe to import from both server and client components.
 */

// ============================================================================
// Money model
// ============================================================================

/**
 * spread = bill_rate − pay_rate. Everything else in the money layer is derived
 * from that one subtraction; see lib/talent-engine/pricing.ts for the helpers.
 */
export const defaultMinSpreadPerHour = 20;
export const defaultTargetMarkupPct = 33;
export const defaultHoursPerWeek = 40;

/** Rates are stored as numeric(10,2); these bound what a human may type. */
export const maxHourlyRate = 500;
export const minHourlyRate = 0;
export const maxWeeklyHours = 168;

// ============================================================================
// Autonomy tiers (blueprint §4)
// ============================================================================

export const talentAutonomyTiers = [1, 2, 3] as const;
export type TalentAutonomyTier = (typeof talentAutonomyTiers)[number];

export const talentAutonomyTierLabels: Record<TalentAutonomyTier, string> = {
  1: "Fully Automated",
  2: "AI Acts → Human Approves",
  3: "Human-Only",
};

// ============================================================================
// Job orders
// ============================================================================

export const jobOrderStatuses = ["open", "on_hold", "filled", "closed"] as const;
export type JobOrderStatus = (typeof jobOrderStatuses)[number];

export const jobOrderStatusLabels: Record<JobOrderStatus, string> = {
  open: "Open",
  on_hold: "On Hold",
  filled: "Filled",
  closed: "Closed",
};

export const jobOrderPriorities = ["low", "normal", "high", "urgent"] as const;
export type JobOrderPriority = (typeof jobOrderPriorities)[number];

export interface JobOrderRow {
  id: string;
  client_id: string | null;
  title: string;
  vertical: string | null;
  location: string | null;
  cert_requirements: string[];
  bill_rate: number | null;
  min_spread: number | null;
  openings: number;
  priority: JobOrderPriority;
  status: JobOrderStatus;
  start_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Candidates
// ============================================================================

export const candidateStatuses = ["sourced", "screening", "available", "placed", "inactive"] as const;
export type CandidateStatus = (typeof candidateStatuses)[number];

export const candidateStatusLabels: Record<CandidateStatus, string> = {
  sourced: "Sourced",
  screening: "Screening",
  available: "Available",
  placed: "Placed",
  inactive: "Inactive",
};

/** Certifications the module tracks. Free-text is still allowed on a row. */
export const trackedCertifications = ["CSP", "CHST", "CIH", "ASP", "STSC", "OSHA 30", "OSHA 500"] as const;
export type TrackedCertification = (typeof trackedCertifications)[number];

export interface CandidateRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  years_experience: number | null;
  certifications: string[];
  /** Certifications confirmed by a human/verification agent — subset of `certifications`. */
  verified_certifications: string[];
  cert_expiry_date: string | null;
  verticals: string[];
  location: string | null;
  willing_to_relocate: boolean;
  pay_expectation: number | null;
  availability_date: string | null;
  status: CandidateStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Matches — the approval queue
// ============================================================================

export const matchStatuses = [
  "draft",
  "pending_approval",
  "counter_proposed",
  "approved",
  "submitted",
  "rejected",
  "placed",
  "withdrawn",
] as const;
export type MatchStatus = (typeof matchStatuses)[number];

export const matchStatusLabels: Record<MatchStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  counter_proposed: "Counter Proposed",
  approved: "Approved",
  submitted: "Submitted",
  rejected: "Rejected",
  placed: "Placed",
  withdrawn: "Withdrawn",
};

export interface MatchRow {
  id: string;
  job_order_id: string;
  candidate_id: string;
  fit_score: number;
  bill_rate: number;
  pay_rate: number;
  /** Denormalised bill_rate − pay_rate, written by the app so SQL can sort on it. */
  spread: number;
  markup_pct: number;
  floor_ok: boolean;
  status: MatchStatus;
  ai_recommendation: string | null;
  ai_confidence: number | null;
  /** Counter-offer the AI drafted when the spread fell under the floor. */
  proposed_pay_rate: number | null;
  requires_human_review: boolean;
  created_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Approvals — append-only decision log on a match
// ============================================================================

export const approvalDecisions = ["approve", "reject", "counter", "hold"] as const;
export type ApprovalDecision = (typeof approvalDecisions)[number];

export const approvalDecisionLabels: Record<ApprovalDecision, string> = {
  approve: "Approved",
  reject: "Rejected",
  counter: "Counter Proposed",
  hold: "Held",
};

export interface MatchApprovalRow {
  id: string;
  match_id: string;
  reviewer_id: string | null;
  reviewer_role: string | null;
  decision: ApprovalDecision;
  bill_rate_before: number | null;
  bill_rate_after: number | null;
  pay_rate_before: number | null;
  pay_rate_after: number | null;
  note: string | null;
  decided_at: string;
}

// ============================================================================
// Placements
// ============================================================================

export const placementStatuses = ["active", "completed", "terminated"] as const;
export type PlacementStatus = (typeof placementStatuses)[number];

export const placementStatusLabels: Record<PlacementStatus, string> = {
  active: "Active",
  completed: "Completed",
  terminated: "Terminated",
};

export interface PlacementRow {
  id: string;
  match_id: string;
  job_order_id: string;
  candidate_id: string;
  start_date: string;
  end_date: string | null;
  bill_rate: number;
  pay_rate: number;
  status: PlacementStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Timesheets — where margin is actually realised
// ============================================================================

export const timesheetStatuses = ["draft", "approved", "invoiced"] as const;
export type TimesheetStatus = (typeof timesheetStatuses)[number];

export const timesheetStatusLabels: Record<TimesheetStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  invoiced: "Invoiced",
};

export interface TimesheetRow {
  id: string;
  placement_id: string;
  week_starting: string;
  hours: number;
  bill_rate: number;
  pay_rate: number;
  /** hours × bill_rate, written by the app. */
  amount_billed: number;
  /** hours × pay_rate, written by the app. */
  amount_paid: number;
  status: TimesheetStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Activity log — the defensible audit trail on the money (blueprint §6)
// ============================================================================

export const talentActorTypes = ["ai_agent", "human", "system"] as const;
export type TalentActorType = (typeof talentActorTypes)[number];

/** Named agents from the blueprint's activity feed. */
export const talentAgentNames = [
  "Sourcing Agent",
  "Screening Agent",
  "Matching Agent",
  "Margin Agent",
  "Timesheet Agent",
] as const;
export type TalentAgentName = (typeof talentAgentNames)[number];

export interface TalentActivityRow {
  id: string;
  actor_type: TalentActorType;
  actor_id: string | null;
  agent_name: string | null;
  action: string;
  tier: TalentAutonomyTier | null;
  summary: string;
  match_id: string | null;
  job_order_id: string | null;
  candidate_id: string | null;
  created_at: string;
}

// ============================================================================
// Settings — the agency-level money floor
// ============================================================================

export interface TalentSettingsRow {
  id: string;
  min_spread_per_hour: number;
  target_markup_pct: number;
  default_hours_per_week: number;
  /** Tier 2 = AI may propose a pay rate; tier 3 = pay rates are human-only. */
  pay_rate_autonomy_tier: TalentAutonomyTier;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const defaultTalentSettings: Omit<
  TalentSettingsRow,
  "id" | "updated_by" | "created_at" | "updated_at"
> = {
  min_spread_per_hour: defaultMinSpreadPerHour,
  target_markup_pct: defaultTargetMarkupPct,
  default_hours_per_week: defaultHoursPerWeek,
  pay_rate_autonomy_tier: 2,
};

// ============================================================================
// Joined shapes the console reads
// ============================================================================

export interface JobOrderWithClient extends JobOrderRow {
  client: { id: string; name: string } | null;
}

export interface MatchQueueRow extends MatchRow {
  job_order: Pick<JobOrderRow, "id" | "title" | "bill_rate" | "min_spread" | "cert_requirements" | "location"> & {
    client: { id: string; name: string } | null;
  };
  candidate: Pick<
    CandidateRow,
    "id" | "full_name" | "certifications" | "verified_certifications" | "years_experience" | "pay_expectation" | "location"
  >;
}

export interface LedgerRow {
  placement_id: string;
  candidate_name: string;
  client_name: string;
  bill_rate: number;
  pay_rate: number;
  spread: number;
  hours: number;
  weekly_margin: number;
}

// ============================================================================
// Console summary — everything the KPI strip and right rail render
// ============================================================================

export interface TalentConsoleSummary {
  activePlacements: number;
  billableHours: number;
  avgSpreadPerHour: number;
  weeklyGrossMargin: number;
  revenueRunRate: number;
  pendingApprovals: number;
  clientBillings: number;
  workerPay: number;
  grossMarginPct: number;
  avgMarkupPct: number;
}

export interface CertificationCoverage {
  certification: string;
  heldCount: number;
  verifiedCount: number;
  verifiedPct: number;
}

/** Certifications expiring inside this window are surfaced as a warning. */
export const certExpiryWarningDays = 60;

// ============================================================================
// Web sourcing — the daily Sourcing Agent sweep (Tier 1 gathers, Tier 2 gate
// admits). Leads NEVER auto-promote into talent_candidates / talent_job_orders:
// a human accepts or dismisses every one (Human Authority Rule, CLAUDE.md).
// ============================================================================

export const sourcingRunTypes = ["candidates", "job_orders"] as const;
export type SourcingRunType = (typeof sourcingRunTypes)[number];

export const sourcingRunStatuses = ["running", "completed", "failed"] as const;
export type SourcingRunStatus = (typeof sourcingRunStatuses)[number];

export interface SourcingRunRow {
  id: string;
  run_type: SourcingRunType;
  status: SourcingRunStatus;
  /** Human-readable description of what was searched, for the review UI. */
  query_summary: string | null;
  leads_found: number;
  leads_inserted: number;
  /** Populated when status = 'failed'. */
  error: string | null;
  /** 'cron' for the scheduled sweep, or the triggering user's id. */
  triggered_by: string | null;
  started_at: string;
  finished_at: string | null;
}

export const sourcingLeadStatuses = ["new", "accepted", "dismissed"] as const;
export type SourcingLeadStatus = (typeof sourcingLeadStatuses)[number];

/**
 * One web-sourced lead awaiting human review.
 *
 * PRIVACY / EEO CONTRACT: candidate leads carry only public professional
 * information — name or handle as published, title, claimed certifications,
 * vertical, location, pay signal, and the public source URL. Protected
 * attributes are never requested, extracted, or stored, and the scoring
 * surface in scoring.ts cannot receive them.
 */
export interface SourcingLeadRow {
  id: string;
  run_id: string | null;
  lead_type: SourcingRunType;
  /** Candidate: person's published name. Job order: the role title. */
  title: string;
  /** Candidate: current employer/affiliation if published. Job order: hiring company. */
  organization: string | null;
  location: string | null;
  vertical: string | null;
  certifications: string[];
  /** Candidate: published pay ask $/hr if any. Job order: published bill/contract rate $/hr if any. */
  rate_signal: number | null;
  source_url: string;
  /** Short gateway-validated summary of why the agent surfaced this lead. */
  summary: string | null;
  status: SourcingLeadStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** Set when an accepted lead created a row, for the audit trail. */
  created_record_id: string | null;
  created_at: string;
}

/** Caps per run, so a runaway search cannot flood the review queue. */
export const sourcingMaxLeadsPerRun = 25;
/** Leads older than this in `new` status are surfaced as stale in the UI. */
export const sourcingLeadStaleDays = 14;
