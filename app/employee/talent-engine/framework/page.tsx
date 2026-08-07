import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { resolveTalentRoleFlags, talentMatchTransitions, type TalentRoleFlags } from "@/lib/talent-engine/policy";
import {
  computeGrossMarginPct,
  computeMarkupPct,
  computeSpread,
  computeWeeklyMargin,
} from "@/lib/talent-engine/pricing";
import { scoringSignals, talentScoringWeights, type ScoringSignal } from "@/lib/talent-engine/scoring";
import {
  approvalDecisions,
  candidateStatuses,
  certExpiryWarningDays,
  defaultHoursPerWeek,
  defaultMinSpreadPerHour,
  defaultTalentSettings,
  defaultTargetMarkupPct,
  jobOrderStatuses,
  matchStatuses,
  placementStatuses,
  talentActorTypes,
  talentAutonomyTierLabels,
  talentAutonomyTiers,
  timesheetStatuses,
  type MatchStatus,
  type TalentAutonomyTier,
} from "@/lib/talent-engine/types";

// The Framework & Architecture tab of the EHS Talent Engine: the developer-ready
// blueprint that sits beside the live console.
//
// THE RULE THIS PAGE IS BUILT AROUND: a reference page that restates numbers the
// code already owns is a reference page that will be wrong within a release. So
// every figure here that exists in code is READ FROM THAT CODE —
//
//   the money band            lib/talent-engine/pricing.ts + types.ts
//   the status graph          talentMatchTransitions (policy.ts)
//   the roles matrix          resolveTalentRoleFlags() (policy.ts)
//   the autonomy tier labels  talentAutonomyTierLabels (types.ts)
//   the data model's enums    the status/decision tuples in types.ts
//   the scoring weights       talentScoringWeights (scoring.ts)
//
// What remains hand-written is prose that has no code to drift from: the
// explanatory copy, the six workflow step descriptions, the table/column list
// (mirrored from supabase/migrations/20260806140000_ehs_talent_engine.sql, which
// is the only place those column names exist as data), and the guardrail list.
// Those are marked in the page itself where a reader could otherwise mistake a
// sentence for an enforced rule.
//
// Access: the module key `ehs_talent_engine` covers this path via prefix match,
// and lib/supabase/middleware.ts rejects a user without the grant before this
// component renders. The page reads nothing per-user, so it is fully static —
// no async work, and therefore no loading.tsx.

export const metadata: Metadata = {
  title: "Talent Engine — Framework & Architecture",
  description:
    "Blueprint for the EHS Talent Engine: the markup-staffing money model, the approval-gated workflow, the permissions matrix, AI autonomy tiers, the talent_* data model, and match scoring.",
};

/* -------------------------------------------------------------------------- */
/* 1. The money model — one assumption, everything else computed              */
/* -------------------------------------------------------------------------- */

// The ONLY invented number on this page. Everything in the band below is
// derived from it plus the frozen defaults in types.ts, so raising the floor in
// types.ts moves the whole worked example rather than leaving it stale.
const illustrativePayRate = 60;
const illustrativeBillRate = illustrativePayRate + defaultMinSpreadPerHour;

const exampleSpread = computeSpread(illustrativeBillRate, illustrativePayRate);
const exampleWeeklyMargin = computeWeeklyMargin(exampleSpread, defaultHoursPerWeek);
const exampleGrossMarginPct = computeGrossMarginPct(illustrativeBillRate, illustrativePayRate);
const exampleMarkupPct = computeMarkupPct(illustrativeBillRate, illustrativePayRate);

function money(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function percent(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
}

/* -------------------------------------------------------------------------- */
/* 2. Operating workflow                                                      */
/* -------------------------------------------------------------------------- */

const workflowSteps = [
  {
    kind: "ai" as const,
    title: "Source",
    body: "Agents pull open EHS orders with the client bill rate attached, and scout candidates across the internal pool, referrals and boards.",
  },
  {
    kind: "ai" as const,
    title: "Screen",
    body: "Experience, verticals and geography are scored; certifications are checked against the order's requirements. The candidate's pay expectation is captured here.",
  },
  {
    kind: "ai" as const,
    title: "Price",
    body: `Spread = bill − pay, checked against the floor. Under it, the agent drafts a counter pay rate instead of letting the match through.`,
  },
  {
    kind: "gate" as const,
    title: "Approval Gate",
    body: "An Oversight Manager reads the match, the spread and the draft, then approves, re-prices or rejects. Nothing reaches a client without this step.",
  },
  {
    kind: "done" as const,
    title: "Place & Bill",
    body: "An approved match becomes a placement at the signed-off rates. Timesheets carry those frozen rates into amount_billed and amount_paid.",
  },
  {
    kind: "done" as const,
    title: "Learn",
    body: "Realised spread, fill speed and win/loss feed back into sourcing targets and the scoring weights below.",
  },
];

// Derived proof that the gate is structural rather than procedural: the only
// route into `submitted` is out of `approved`.
const statusesReachingSubmitted = (Object.keys(talentMatchTransitions) as MatchStatus[]).filter((status) =>
  talentMatchTransitions[status].includes("submitted"),
);

/* -------------------------------------------------------------------------- */
/* 3. Roles & permissions — derived from resolveTalentRoleFlags()             */
/* -------------------------------------------------------------------------- */

type CellState = "full" | "propose" | "none";

const cellGlyph: Record<CellState, string> = { full: "●", propose: "◐", none: "—" };
const cellLabel: Record<CellState, string> = {
  full: "Full",
  propose: "Propose only, needs approval",
  none: "None",
};

/**
 * The five blueprint columns, each expressed as a function of the flags the
 * policy module actually returns. Nothing here is hand-dotted: change
 * resolveTalentRoleFlags() and this table changes with it.
 */
const permissionColumns: { key: string; label: string; state: (flags: TalentRoleFlags) => CellState }[] = [
  { key: "source", label: "Source", state: (f) => (f.canPropose ? "full" : "none") },
  { key: "screen", label: "Screen", state: (f) => (f.canPropose ? "full" : "none") },
  {
    key: "rate",
    label: "Set rate",
    state: (f) => (f.canSetRate ? "full" : f.canPropose ? "propose" : "none"),
  },
  {
    key: "submit",
    label: "Submit",
    state: (f) => (f.canApprove ? "full" : f.canPropose ? "propose" : "none"),
  },
  { key: "approve", label: "Approve", state: (f) => (f.canApprove ? "full" : "none") },
  { key: "place", label: "Place", state: (f) => (f.canManagePlacements ? "full" : "none") },
];

// AI agents are not portal roles and hold no row in `user_roles`, so they cannot
// be derived from the policy module. They act as the signed-in human's session
// through a server action, and the ceiling on what they may do is the row-level
// `requires_human_review` default rather than a role. These three rows are
// therefore blueprint prose, and are labelled as such in the table.
const aiAgentRows: { name: string; note: string; states: Record<string, CellState> }[] = [
  {
    name: "AI Sourcing Agent",
    note: "Tier 1 — runs unattended, writes to the activity log",
    states: { source: "full", screen: "none", rate: "none", submit: "none", approve: "none", place: "none" },
  },
  {
    name: "AI Screening Agent",
    note: "Tier 1 — parses and scores, never contacts anyone",
    states: { source: "none", screen: "full", rate: "none", submit: "none", approve: "none", place: "none" },
  },
  {
    name: "AI Pricing / Match Agent",
    note: "Tier 2 — drafts rates and submittals for a human to release",
    states: { source: "none", screen: "full", rate: "propose", submit: "propose", approve: "none", place: "none" },
  },
];

// One representative role per blueprint persona. The flags are identical across
// the roles listed in each `roles` string, because resolveTalentRoleFlags()
// buckets them — that is exactly why this is derived rather than transcribed.
const humanRoleRows: { persona: string; roles: string; role: string; active: boolean }[] = [
  {
    persona: "Oversight Manager",
    roles: "company_admin, admin",
    role: "company_admin",
    active: true,
  },
  {
    persona: "Recruiter / Reviewer",
    roles: "internal_reviewer, employee",
    role: "internal_reviewer",
    active: true,
  },
  { persona: "Account Manager", roles: "marketing", role: "marketing", active: true },
  {
    persona: "Platform Admin",
    roles: "platform_admin, super_admin",
    role: "platform_admin",
    active: true,
  },
  {
    persona: "Archived account",
    roles: "any role, account_status ≠ active",
    role: "super_admin",
    active: false,
  },
];

/* -------------------------------------------------------------------------- */
/* 4. Autonomy tiers                                                          */
/* -------------------------------------------------------------------------- */

const activeAutonomyTier: TalentAutonomyTier = defaultTalentSettings.pay_rate_autonomy_tier;

const autonomyTierDetail: Record<TalentAutonomyTier, { tone: string; body: string }> = {
  1: {
    tone: "teal",
    body: "Sourcing, resume parsing, certification checks, fit scoring, spread arithmetic, timesheet capture and invoice drafts. Runs unattended; every action lands in talent_activity_log with its tier.",
  },
  2: {
    tone: "amber",
    body: "Submitting a candidate, contacting a worker, proposing a bill or pay rate, sending a client shortlist. The agent drafts and recommends; the row carries requires_human_review and nothing is applied until a human clears it.",
  },
  3: {
    tone: "red",
    body: "Final rate agreement, offers, client contracts and MSAs, opening or ending a placement, terminating a worker. Never automated — talent_placements is writable by admin roles only.",
  },
};

/* -------------------------------------------------------------------------- */
/* 5. Data model — the real talent_* tables                                   */
/* -------------------------------------------------------------------------- */

type Column = { name: string; money?: boolean; note?: string };

// Column names mirror supabase/migrations/20260806140000_ehs_talent_engine.sql
// and the row interfaces in lib/talent-engine/types.ts. The `enum` line under
// each table IS read from those types, so a new status cannot appear in the code
// without appearing here.
const dataModel: {
  table: string;
  purpose: string;
  access: string;
  columns: Column[];
  enums?: { column: string; values: readonly string[] }[];
}[] = [
  {
    table: "talent_job_orders",
    purpose: "An open requisition, carrying what the client pays us.",
    access: "Read / write: any active portal employee. Delete: admin.",
    columns: [
      { name: "id" },
      { name: "client_id", note: "→ company_clients" },
      { name: "title" },
      { name: "vertical" },
      { name: "location" },
      { name: "cert_requirements[]" },
      { name: "bill_rate", money: true, note: "what the client pays per hour" },
      { name: "min_spread", money: true, note: "per-order override of the agency floor" },
      { name: "openings" },
      { name: "priority" },
      { name: "status" },
      { name: "start_date" },
      { name: "notes" },
      { name: "created_by" },
      { name: "created_at" },
      { name: "updated_at" },
    ],
    enums: [{ column: "status", values: jobOrderStatuses }],
  },
  {
    table: "talent_candidates",
    purpose: "An EHS professional we can place, carrying what they want paid.",
    access: "Read / write: any active portal employee. Delete: admin.",
    columns: [
      { name: "id" },
      { name: "full_name" },
      { name: "email" },
      { name: "phone" },
      { name: "years_experience" },
      { name: "certifications[]" },
      { name: "verified_certifications[]", note: "subset confirmed by a human; required certs must appear here" },
      { name: "cert_expiry_date" },
      { name: "verticals[]" },
      { name: "location" },
      { name: "willing_to_relocate" },
      { name: "pay_expectation", money: true, note: "the pay side of the spread" },
      { name: "availability_date" },
      { name: "status" },
      { name: "notes" },
      { name: "created_by" },
      { name: "created_at" },
      { name: "updated_at" },
    ],
    enums: [{ column: "status", values: candidateStatuses }],
  },
  {
    table: "talent_matches",
    purpose: "The approval queue. One row per candidate per requisition — this is where the money is decided.",
    access: "Read / write: any active portal employee. requires_human_review defaults to true.",
    columns: [
      { name: "id" },
      { name: "job_order_id", note: "unique together with candidate_id" },
      { name: "candidate_id" },
      { name: "fit_score", note: "0–100, from scoreMatch()" },
      { name: "bill_rate", money: true },
      { name: "pay_rate", money: true },
      { name: "spread", money: true, note: "denormalised bill_rate − pay_rate so SQL can sort on margin" },
      { name: "markup_pct", money: true, note: "spread ÷ pay × 100" },
      { name: "floor_ok", money: true, note: "spread ≥ the applicable floor" },
      { name: "status" },
      { name: "ai_recommendation" },
      { name: "ai_confidence" },
      { name: "proposed_pay_rate", money: true, note: "the counter drafted when the spread fell short" },
      { name: "requires_human_review", note: "the Human Authority Rule, as a column" },
      { name: "created_by" },
      { name: "decided_at" },
      { name: "created_at" },
      { name: "updated_at" },
    ],
    enums: [{ column: "status", values: matchStatuses }],
  },
  {
    table: "talent_match_approvals",
    purpose: "Append-only decision log. Records the rates on both sides of every decision, so a sign-off can never point at rates nobody approved.",
    access: "Read + insert only — there is deliberately no UPDATE policy.",
    columns: [
      { name: "id" },
      { name: "match_id" },
      { name: "reviewer_id" },
      { name: "reviewer_role" },
      { name: "decision" },
      { name: "bill_rate_before", money: true },
      { name: "bill_rate_after", money: true },
      { name: "pay_rate_before", money: true },
      { name: "pay_rate_after", money: true },
      { name: "note" },
      { name: "decided_at" },
    ],
    enums: [{ column: "decision", values: approvalDecisions }],
  },
  {
    table: "talent_placements",
    purpose: "The Tier-3 commitment: a real worker billing a real client at frozen, signed-off rates.",
    access: "Read: any active portal employee. Insert / update: ADMIN ROLES ONLY.",
    columns: [
      { name: "id" },
      { name: "match_id", note: "unique — one placement per approved match" },
      { name: "job_order_id" },
      { name: "candidate_id" },
      { name: "start_date" },
      { name: "end_date" },
      { name: "bill_rate", money: true, note: "frozen copy of the approved rate" },
      { name: "pay_rate", money: true, note: "frozen copy of the approved rate" },
      { name: "status" },
      { name: "created_by" },
      { name: "created_at" },
      { name: "updated_at" },
    ],
    enums: [{ column: "status", values: placementStatuses }],
  },
  {
    table: "talent_timesheets",
    purpose: "Where the margin is actually realised — one row per placement per week.",
    access: "Read / write: any active portal employee. Delete: admin.",
    columns: [
      { name: "id" },
      { name: "placement_id", note: "unique together with week_starting" },
      { name: "week_starting" },
      { name: "hours", note: "0–168, checked in the column constraint" },
      { name: "bill_rate", money: true },
      { name: "pay_rate", money: true },
      { name: "amount_billed", money: true, note: "hours × bill_rate" },
      { name: "amount_paid", money: true, note: "hours × pay_rate" },
      { name: "status" },
      { name: "created_by" },
      { name: "created_at" },
      { name: "updated_at" },
    ],
    enums: [{ column: "status", values: timesheetStatuses }],
  },
  {
    table: "talent_activity_log",
    purpose: "Append-only audit trail over agents and humans alike. The defensible record on the money.",
    access: "Read + insert only. Subject FKs detach rather than cascade, so deleting a match cannot erase its history.",
    columns: [
      { name: "id" },
      { name: "actor_type" },
      { name: "actor_id", note: "set for humans; agents carry agent_name instead" },
      { name: "agent_name" },
      { name: "action" },
      { name: "tier", note: "the autonomy tier the action was taken at" },
      { name: "summary" },
      { name: "match_id" },
      { name: "job_order_id" },
      { name: "candidate_id" },
      { name: "created_at" },
    ],
    enums: [{ column: "actor_type", values: talentActorTypes }],
  },
  {
    table: "talent_settings",
    purpose: "The agency money floor. A single row, held to one by a unique index on the constant true.",
    access: "Read: any active portal employee. Update: ADMIN ONLY.",
    columns: [
      { name: "id" },
      { name: "min_spread_per_hour", money: true, note: `seeded at ${money(defaultMinSpreadPerHour)}` },
      { name: "target_markup_pct", money: true, note: `seeded at ${defaultTargetMarkupPct}%` },
      { name: "default_hours_per_week", note: `seeded at ${defaultHoursPerWeek}` },
      { name: "pay_rate_autonomy_tier", note: `seeded at tier ${activeAutonomyTier}` },
      { name: "updated_by" },
      { name: "created_at" },
      { name: "updated_at" },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* 6. Architecture & guardrails                                               */
/* -------------------------------------------------------------------------- */

// The blueprint HTML listed Supabase Edge Functions and pgvector. This platform
// uses neither, and printing them would describe a system that does not exist —
// so they are moved into `plannedStack` and labelled.
const liveStack = [
  { name: "Next.js App Router", detail: "Server Components render the console and this page" },
  { name: "Server Actions", detail: "every mutation; no client-side writes" },
  { name: "Supabase Postgres", detail: "the talent_* tables above" },
  { name: "Row Level Security", detail: "enabled on all eight tables" },
  { name: "validateAIOutput()", detail: "lib/ai/gateway.ts — every AI string passes through it" },
  { name: "Vitest", detail: "unit + RBAC suites for policy, pricing and scoring" },
  { name: "Vercel", detail: "hosting and the server runtime" },
];

const plannedStack = [
  { name: "Supabase Edge Functions", detail: "not used — agent work runs in Server Actions on Vercel" },
  { name: "pgvector resume ↔ role matching", detail: "not used — scoring is a deterministic weighted function" },
  { name: "Automated invoicing / payroll export", detail: "timesheets carry the amounts; no export job yet" },
];

// Each of these is a rule some function or policy actually enforces — not an
// intention. Anything aspirational belongs in `plannedStack` above.
const guardrails = [
  `Minimum spread floor of ${money(defaultMinSpreadPerHour)}/hr is enforced in code, not in copy: meetsSpreadFloor() decides floor_ok, and a match under the floor always requires human approval.`,
  "requires_human_review defaults to true on every match row, and requiresHumanApproval() returns false only for a complete, well-typed, above-floor, fully-verified match. Missing or malformed input returns true.",
  "Approved and submitted matches have their rates locked. Re-pricing means countering — which returns to pending_approval — or withdrawing, so the new spread gets its own sign-off.",
  "talent_match_approvals and talent_activity_log have no UPDATE policy at all. An approval, and the rates it was made against, cannot be rewritten.",
  `Certification verification blocks submittal: a required cert with no verified counterpart forces review, and certifications lapsing within ${certExpiryWarningDays} days are flagged.`,
  "EEO guardrail — the scorer's entire input surface is an allow-list of job-relevant attributes. Name, contact details, age, gender, race, national origin, marital status, disability and veteran status never reach it, and a compile-time assertion plus a unit test fail if the allow-list drifts.",
  "AI is reached only from the server. No model key is ever shipped to the browser, and no AI text is displayed without clearing validateAIOutput() first.",
  "Rate and hours inputs are validated before they are written, so a NaN can never reach a spread calculation or a floor check.",
];

/* -------------------------------------------------------------------------- */
/* 7. Match scoring                                                           */
/* -------------------------------------------------------------------------- */

const signalCopy: Record<ScoringSignal, { label: string; measures: string }> = {
  spread: { label: "Spread / margin fit", measures: "Bill − pay against the applicable floor; a wider spread ranks higher" },
  certification: { label: "Certification fit", measures: "Required certs held and verified (CSP, CHST, CIH, OSHA 30/500…)" },
  experience: { label: "Experience fit", measures: "Years and vertical relevance against the order" },
  location: { label: "Location / relocation", measures: "Geographic match, or a confirmed willingness to relocate" },
  availability: { label: "Availability", measures: "Start date against the order's requested start" },
};

const weightTotal = scoringSignals.reduce((sum, signal) => sum + talentScoringWeights[signal], 0);

/* -------------------------------------------------------------------------- */
/* Scoped presentation                                                        */
/* -------------------------------------------------------------------------- */

// Local to this route. globals.css belongs to the console, and the shapes below
// (the money band, the workflow rail, the tier stack, the schema block) exist
// nowhere else in the portal, so they are not worth a global class each.
// Scoped to this route, and deliberately thin. The page renders inside
// `.talent-console`, which is the console's own wrapper in app/globals.css: it
// carries the module's design tokens (--talent-money, --talent-ai, --talent-ok,
// --talent-flag, --talent-line…), the element reset, and the 18px stack gap. So
// the card shells here are `.talent-card` / `.talent-card-head` /
// `.talent-card-body` — the same components the live console uses — and every
// colour below resolves through those tokens rather than a second palette that
// could drift away from the other tab. What remains are the four shapes this
// page alone needs: the money band, the workflow rail, the tier stack and the
// schema column pills.
const frameworkStyles = `
.tef-tabs { display: flex; gap: 6px; margin: 0 0 20px; border-bottom: 1px solid #e2e8f0; }
.tef-tab { display: inline-flex; align-items: center; gap: 7px; padding: 10px 18px; margin-bottom: -1px;
  border-bottom: 3px solid transparent; color: var(--portal-muted); font-size: 0.9rem; font-weight: 750;
  text-decoration: none; }
.tef-tab:hover { color: #0e2438; }
.tef-tab-current { color: #0e2438; border-bottom-color: var(--portal-gold); }

.tef-num { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px;
  border-radius: 6px; background: #0e2438; color: var(--portal-gold-bright); font-size: 0.72rem; font-weight: 850; }
.tef-lede { margin: 0 0 14px; color: var(--portal-muted); line-height: 1.6; max-width: 78ch; }
.tef-note { margin: 12px 0 0; color: var(--portal-muted); font-size: 0.8rem; line-height: 1.6; max-width: 92ch; }
.tef-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
@media (max-width: 1180px) { .tef-two { grid-template-columns: minmax(0, 1fr); } }

.tef-band { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 16px;
  padding: 18px; border: 1px solid var(--talent-money-line); border-radius: 9px; background: var(--talent-money-soft); }
.tef-band-cell { min-width: 108px; text-align: center; }
.tef-band-cell b { display: block; font-size: 1.75rem; font-weight: 900; color: var(--talent-ink); line-height: 1.1; }
.tef-band-cell span { display: block; margin-top: 3px; color: var(--portal-muted); font-size: 0.7rem;
  font-weight: 850; letter-spacing: .05em; text-transform: uppercase; }
.tef-band-money b { color: var(--talent-money); }
.tef-op { font-size: 1.3rem; font-weight: 900; color: var(--talent-slate); }

.tef-flow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 900px) { .tef-flow { grid-template-columns: minmax(0, 1fr); } }
.tef-step { padding: 13px 14px; border: 1px solid var(--talent-line); border-top-width: 3px; border-radius: 9px;
  background: var(--talent-paper); }
.tef-step h3 { margin: 0 0 5px; font-size: 0.76rem; font-weight: 850; letter-spacing: .05em; text-transform: uppercase; }
.tef-step p { margin: 0; color: var(--portal-muted); font-size: 0.83rem; line-height: 1.5; }
.tef-step-ai { border-top-color: var(--talent-ai); } .tef-step-ai h3 { color: var(--talent-ai); }
.tef-step-done { border-top-color: var(--talent-ok); } .tef-step-done h3 { color: var(--talent-ok); }
.tef-step-gate { border-top-color: var(--talent-flag-line); background: var(--talent-flag-soft);
  box-shadow: 0 0 0 1px var(--talent-flag-line); }
.tef-step-gate h3 { color: var(--talent-flag); }

.tef-cell { text-align: center; font-weight: 900; }
.tef-cell-full { color: var(--talent-ok); }
.tef-cell-propose { color: var(--talent-flag); }
.tef-cell-none { color: #c2c8d0; }
.tef-legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 12px 0 0; color: var(--portal-muted); font-size: 0.78rem; }

.tef-tier { padding: 12px 14px; margin-bottom: 10px; border: 1px solid var(--talent-line); border-radius: 9px;
  background: var(--talent-paper); }
.tef-tier:last-child { margin-bottom: 0; }
.tef-tier-active { border-color: var(--talent-flag-line); background: var(--talent-flag-soft);
  box-shadow: 0 0 0 1px var(--talent-flag-line); }
.tef-tier h3 { display: flex; flex-wrap: wrap; align-items: center; gap: 9px; margin: 0 0 5px; font-size: 0.92rem;
  font-weight: 800; }
.tef-tier p { margin: 0; color: var(--portal-muted); font-size: 0.84rem; line-height: 1.55; }
.tef-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.tef-dot-teal { background: var(--talent-ai); }
.tef-dot-amber { background: var(--talent-flag-line); }
.tef-dot-red { background: var(--talent-danger); }

.tef-table { margin-bottom: 16px; }
.tef-table:last-child { margin-bottom: 0; }
.tef-table h3 { margin: 0 0 3px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9rem;
  font-weight: 800; color: var(--talent-ink); }
.tef-table > p { margin: 0 0 8px; color: var(--portal-muted); font-size: 0.82rem; line-height: 1.5; }
.tef-cols { display: flex; flex-wrap: wrap; gap: 6px; }
.tef-col { padding: 3px 8px; border: 1px solid var(--talent-line); border-radius: 5px; background: var(--talent-paper);
  color: var(--talent-slate); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.74rem; }
.tef-col-money { border-color: var(--talent-money-line); background: var(--talent-money-soft);
  color: #0b6b47; font-weight: 700; }
.tef-enum { margin-top: 7px; color: var(--portal-muted); font-size: 0.76rem; line-height: 1.6; }
.tef-enum code { color: var(--talent-slate); }
.tef-access { margin-top: 6px; color: var(--portal-muted); font-size: 0.76rem; }

.tef-pills { display: flex; flex-wrap: wrap; gap: 7px; }
.tef-pill { padding: 5px 11px; border: 1px solid var(--talent-line); border-radius: 999px;
  background: var(--talent-paper); color: var(--talent-slate); font-size: 0.78rem; font-weight: 700; }
.tef-pill b { font-weight: 850; }
.tef-pill-planned { border-style: dashed; background: var(--talent-card); color: var(--portal-muted); font-weight: 600; }
.tef-checks { margin: 0; padding: 0; list-style: none; }
.tef-checks li { position: relative; padding: 8px 0 8px 26px; border-bottom: 1px dashed var(--talent-line);
  color: var(--talent-slate); font-size: 0.84rem; line-height: 1.55; }
.tef-checks li:last-child { border-bottom: none; }
.tef-checks li::before { content: "✓"; position: absolute; left: 0; top: 8px; color: var(--talent-ok); font-weight: 900; }

.tef-sub { margin: 16px 0 8px; color: var(--portal-muted); font-size: 0.78rem; font-weight: 850;
  letter-spacing: .05em; text-transform: uppercase; }
.tef-sub:first-of-type { margin-top: 0; }
.tef-muted { color: var(--portal-muted); }
.tef-rowhead { font-weight: 700; }
.tef-total { font-weight: 900; }
.tef-caption { padding: 10px 12px; text-align: left; color: var(--portal-muted); font-size: 0.78rem; }
.tef-scroll { margin-top: 14px; }
.tef-shield { vertical-align: -2px; margin-right: 6px; color: var(--talent-ok); }
.tef-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* The card head lays its own h2 out as a flex row, so the section number just
   needs the gap; and the tier badge is the same tag component the console uses. */
.talent-card-head h2 .tef-num { flex: none; }
`;

function Cell({ state }: { state: CellState }) {
  return (
    <td className={`tef-cell tef-cell-${state}`}>
      <span aria-hidden="true">{cellGlyph[state]}</span>
      <span className="tef-sr">{cellLabel[state]}</span>
    </td>
  );
}

/** One numbered blueprint section, in the console's own card shell. */
function Section({
  children,
  id,
  number,
  tag,
  title,
}: {
  children: ReactNode;
  id: string;
  number: number;
  tag?: ReactNode;
  title: string;
}) {
  return (
    <section aria-labelledby={id} className="talent-card">
      <div className="talent-card-head">
        <h2 id={id}>
          <span className="tef-num" aria-hidden="true">
            {number}
          </span>
          {title}
        </h2>
        {tag}
      </div>
      <div className="talent-card-body">{children}</div>
    </section>
  );
}

export default function TalentEngineFrameworkPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: frameworkStyles }} />

      <div className="portal-topline">
        <div>
          <div className="eyebrow">EHS Talent Engine</div>
          <h1>Framework &amp; architecture</h1>
          <p>
            The developer-ready blueprint for AI-managed markup staffing: bill the client one hourly rate, pay the EHS
            professional a lower one, keep the spread — and route every submittal, rate change and placement through a
            human approval gate.
          </p>
        </div>
        <span className="badge">Blueprint v1</span>
      </div>

      <nav className="tef-tabs" aria-label="Talent Engine views">
        <Link className="tef-tab" href="/employee/talent-engine">
          <ArrowLeft size={15} aria-hidden="true" />
          Live Console
        </Link>
        <span className="tef-tab tef-tab-current" aria-current="page">
          Framework &amp; Architecture
        </span>
      </nav>

      <div className="talent-console">
        {/* ------------------------------------------------------------- 1 */}
        <Section id="tef-money" number={1} title="The money model — bill rate → pay rate → spread">
          <p className="tef-lede">
            One subtraction drives the entire module. Every figure below is computed from the frozen defaults in{" "}
            <code>lib/talent-engine/types.ts</code> through the helpers in <code>lib/talent-engine/pricing.ts</code>, so
            raising the floor moves this worked example rather than leaving it stale.
          </p>

          <div className="tef-band">
            <div className="tef-band-cell">
              <b>{money(illustrativeBillRate)}</b>
              <span>Bill rate (client)</span>
            </div>
            <div className="tef-op" aria-hidden="true">
              −
            </div>
            <div className="tef-band-cell">
              <b>{money(illustrativePayRate)}</b>
              <span>Pay rate (worker)</span>
            </div>
            <div className="tef-op" aria-hidden="true">
              =
            </div>
            <div className="tef-band-cell tef-band-money">
              <b>{money(exampleSpread)}</b>
              <span>Spread / hour</span>
            </div>
            <div className="tef-op" aria-hidden="true">
              →
            </div>
            <div className="tef-band-cell tef-band-money">
              <b>{money(exampleWeeklyMargin)}</b>
              <span>Margin / wk ({defaultHoursPerWeek} hrs)</span>
            </div>
          </div>

          <p className="tef-note">
            That same {money(exampleSpread)} is <b>{percent(exampleGrossMarginPct)} gross margin</b> and a{" "}
            <b>{percent(exampleMarkupPct)} markup</b>, and the difference matters the moment a client negotiates. Gross
            margin divides the spread by the <i>bill</i> rate — the share of the client&apos;s money we keep. Markup
            divides it by the <i>pay</i> rate — what we add on top of the worker&apos;s cost. A 33% markup and a 33%
            margin are not the same offer; the margin version is roughly a fifth more expensive for the client.
          </p>
          <p className="tef-note">
            <b>Floor, not target.</b> {money(defaultMinSpreadPerHour)}/hr is the agency minimum spread, held in{" "}
            <code>talent_settings.min_spread_per_hour</code> and overridable per requisition via{" "}
            <code>talent_job_orders.min_spread</code>. The {defaultTargetMarkupPct}% target markup is the ambition; the
            floor is the line the platform will not let a match cross unattended. A match under it is not blocked
            outright — it gets a drafted counter-offer and a mandatory human decision.
          </p>
        </Section>

        {/* ------------------------------------------------------------- 2 */}
        <Section
          id="tef-flow"
          number={2}
          title="Operating workflow — AI acts, human approves"
          tag={<span className="talent-tag-gate">Step 4 is human</span>}
        >
          <p className="tef-lede">
            Six stages. Five are things the platform does on its own; the fourth is the one it cannot do without you.
          </p>

          <div className="tef-flow">
            {workflowSteps.map((step, index) => (
              <article className={`tef-step tef-step-${step.kind}`} key={step.title}>
                <h3>
                  {index + 1} · {step.title}
                  {step.kind === "gate" ? " — human" : null}
                </h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>

          <p className="tef-note">
            The gate is structural, not procedural. <code>talentMatchTransitions</code> in{" "}
            <code>lib/talent-engine/policy.ts</code> is the entire status graph, and the only status that can reach{" "}
            <code>submitted</code> is{" "}
            {statusesReachingSubmitted.map((status, index) => (
              <span key={status}>
                {index > 0 ? ", " : ""}
                <code>{status}</code>
              </span>
            ))}
            . A candidate cannot be put in front of a client on AI say-so, because no edge in the graph gets there.
          </p>

          <div className="table-card tef-scroll">
            <table className="data-table">
              <caption className="tef-caption">
                Match status graph, read from <code>talentMatchTransitions</code>.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">May move to</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(talentMatchTransitions) as MatchStatus[]).map((status) => (
                  <tr key={status}>
                    <th className="tef-rowhead" scope="row">
                      <code>{status}</code>
                    </th>
                    <td>
                      {talentMatchTransitions[status].length === 0 ? (
                        <span className="tef-muted">terminal — nothing follows</span>
                      ) : (
                        talentMatchTransitions[status].map((next, index) => (
                          <span key={next}>
                            {index > 0 ? ", " : ""}
                            <code>{next}</code>
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <div className="tef-two">
          {/* ----------------------------------------------------------- 3 */}
          <Section id="tef-roles" number={3} title="Roles & permissions">
            <p className="tef-lede">
              The human rows are generated by calling <code>resolveTalentRoleFlags()</code> once per role, so this table
              cannot disagree with the policy the server actions enforce.
            </p>

            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Role</th>
                    {permissionColumns.map((column) => (
                      <th className="tef-cell" key={column.key} scope="col">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aiAgentRows.map((row) => (
                    <tr key={row.name}>
                      <th className="tef-rowhead" scope="row">
                        {row.name}
                        <div className="table-subtext">{row.note}</div>
                      </th>
                      {permissionColumns.map((column) => (
                        <Cell key={column.key} state={row.states[column.key] ?? "none"} />
                      ))}
                    </tr>
                  ))}

                  {humanRoleRows.map((row) => {
                    const flags = resolveTalentRoleFlags(row.role, row.active);
                    return (
                      <tr key={row.persona}>
                        <th className="tef-rowhead" scope="row">
                          {row.persona}
                          <div className="table-subtext">{row.roles}</div>
                        </th>
                        {permissionColumns.map((column) => (
                          <Cell key={column.key} state={column.state(flags)} />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="tef-legend">
              <span>
                <b className="tef-cell-full">●</b> full
              </span>
              <span>
                <b className="tef-cell-propose">◐</b> propose only, needs approval
              </span>
              <span>
                <b className="tef-cell-none">—</b> none
              </span>
            </p>

            <p className="tef-note">
              A proposer who can approve their own proposal is not a gate, which is why Recruiter / Reviewer carries{" "}
              <code>canPropose</code> without <code>canApprove</code> and cannot type a rate at all. The three AI rows
              are blueprint prose rather than derived: agents hold no row in <code>user_roles</code>, so their ceiling is
              the <code>requires_human_review</code> column, not a role.
            </p>
          </Section>

          {/* ----------------------------------------------------------- 4 */}
          <Section
            id="tef-tiers"
            number={4}
            title="AI autonomy tiers"
            tag={<span className="talent-tag-ai">Tier {activeAutonomyTier} active</span>}
          >
            <p className="tef-lede">
              Tier names come from <code>talentAutonomyTierLabels</code>; the active mode is read from{" "}
              <code>defaultTalentSettings.pay_rate_autonomy_tier</code>.
            </p>

            {talentAutonomyTiers.map((tier) => {
              const detail = autonomyTierDetail[tier];
              const active = tier === activeAutonomyTier;
              return (
                <article className={`tef-tier${active ? " tef-tier-active" : ""}`} key={tier}>
                  <h3>
                    <span className={`tef-dot tef-dot-${detail.tone}`} aria-hidden="true" />
                    Tier {tier} · {talentAutonomyTierLabels[tier]}
                    {active ? <span className="talent-tag-gate">Active mode</span> : null}
                  </h3>
                  <p>{detail.body}</p>
                </article>
              );
            })}

            <p className="tef-note">
              The active tier governs pay-rate proposals specifically. At tier {activeAutonomyTier} an agent may draft a
              rate and a counter-offer; at tier 3 it may not name a number at all. Either way the placement itself stays
              tier 3, because <code>talent_placements</code> is writable only by admin roles.
            </p>
          </Section>
        </div>

        {/* ------------------------------------------------------------- 5 */}
        <Section id="tef-data" number={5} title="Data model">
          <p className="tef-lede">
            Eight tables, all with row level security enabled. The green columns are the money layer:{" "}
            <b>spread = bill_rate − pay_rate</b>, <b>markup = spread ÷ pay_rate</b>, and margin is realised per timesheet
            as <b>hours × spread</b>. The enum lines are read from <code>lib/talent-engine/types.ts</code>; the column
            lists mirror <code>supabase/migrations/20260806140000_ehs_talent_engine.sql</code>.
          </p>

          <div className="tef-two">
            {dataModel.map((entry) => (
              <div className="tef-table" key={entry.table}>
                <h3>{entry.table}</h3>
                <p>{entry.purpose}</p>
                <div className="tef-cols">
                  {entry.columns.map((column) => (
                    <span
                      className={`tef-col${column.money ? " tef-col-money" : ""}`}
                      key={column.name}
                      title={column.note}
                    >
                      {column.name}
                    </span>
                  ))}
                </div>
                {entry.enums?.map((enumEntry) => (
                  <div className="tef-enum" key={enumEntry.column}>
                    <code>{enumEntry.column}</code>: {enumEntry.values.join(" · ")}
                  </div>
                ))}
                <div className="tef-access">{entry.access}</div>
              </div>
            ))}
          </div>

          <p className="tef-note">
            There is no tenant column. This is an internal portal, so every row belongs to the agency and access is
            decided by portal role — the same model <code>company_clients</code> and <code>client_proposals</code> use.
          </p>
        </Section>

        {/* ------------------------------------------------------------- 6 */}
        <Section id="tef-arch" number={6} title="Architecture & guardrails">
          <h3 className="tef-sub">In the build today</h3>
          <div className="tef-pills">
            {liveStack.map((item) => (
              <span className="tef-pill" key={item.name}>
                <b>{item.name}</b> — {item.detail}
              </span>
            ))}
          </div>

          <h3 className="tef-sub">Planned — not built</h3>
          <div className="tef-pills">
            {plannedStack.map((item) => (
              <span className="tef-pill tef-pill-planned" key={item.name}>
                <b>{item.name}</b> — {item.detail}
              </span>
            ))}
          </div>
          <p className="tef-note">
            The original blueprint sketched Edge Functions and a pgvector resume index. Neither is in this platform, and
            listing them as though they were would describe a system nobody can point at — so they sit above, dashed and
            labelled, until they exist.
          </p>

          <h3 className="tef-sub">Guardrails</h3>
          <ul className="tef-checks">
            {guardrails.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </Section>

        {/* ------------------------------------------------------------- 7 */}
        <Section id="tef-scoring" number={7} title="Match scoring — fit + margin">
          <p className="tef-lede">
            A candidate reaches the approval queue only by clearing both the fit score and the spread floor. Weights are
            rendered from <code>talentScoringWeights</code> in <code>lib/talent-engine/scoring.ts</code> and are tunable:{" "}
            <code>scoreMatch()</code> normalises whatever it is given by its own sum, so a partial override still
            produces a 0–100 total.
          </p>

          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Signal</th>
                  <th scope="col">What it measures</th>
                  <th className="tef-cell" scope="col">
                    Weight
                  </th>
                </tr>
              </thead>
              <tbody>
                {scoringSignals.map((signal) => (
                  <tr key={signal}>
                    <th className="tef-rowhead" scope="row">
                      {signalCopy[signal].label}
                      <div className="table-subtext">
                        <code>{signal}</code>
                      </div>
                    </th>
                    <td>{signalCopy[signal].measures}</td>
                    <td className="tef-cell tef-total">{Math.round(talentScoringWeights[signal] * 100)}%</td>
                  </tr>
                ))}
                <tr>
                  <th className="tef-total" scope="row">
                    Total
                  </th>
                  <td className="tef-muted">Normalised by its own sum at scoring time</td>
                  <td className="tef-cell tef-total">{Math.round(weightTotal * 100)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="tef-note">
            <ShieldCheck aria-hidden="true" className="tef-shield" size={14} />
            Every signal above is job-relevant by construction. The scorer never sees a name, a photo, contact details,
            an age, or any free-text note that could carry a protected characteristic — its input type is an explicit
            allow-list, and both a compile-time assertion and a unit test fail if anything is added to it.
          </p>
        </Section>

        <p className="talent-foot">
          EHS Talent Engine · module <code>ehs_talent_engine</code> · Commercial group ·{" "}
          <Link href="/employee/talent-engine">back to the live console</Link>
        </p>
      </div>
    </>
  );
}
