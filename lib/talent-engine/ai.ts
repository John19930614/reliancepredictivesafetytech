// EHS Talent Engine — the "AI recommends:" layer on the match card.
//
// This module is a RULES ENGINE, not a model client. It makes no network call
// and holds no API key: it composes a recommendation deterministically from the
// scored match and the money model, so the same match always produces the same
// sentence and that sentence can be reproduced from the activity log months
// later during a margin dispute.
//
// ===========================================================================
// AI GATEWAY (CLAUDE.md → AI GATEWAY RULES)
// ===========================================================================
// Every string this module emits goes through `validateAIOutput()` before it is
// returned. Empty output BLOCKS, injection patterns BLOCK, PII BLOCKS,
// unresolved {{placeholders}} FAIL, low confidence WARNs and flags for review.
// When the drafted text does not clear the gateway it is SUPPRESSED and
// replaced with a fixed, safe notice — a tainted draft is never handed to the
// console, and never written to `matches.ai_recommendation`.
//
// HUMAN AUTHORITY RULE (quoted from CLAUDE.md):
//   "If `requires_human_review = true` on a prompt template, the output MUST
//    NOT be applied to any record, document, or workflow item until a human has
//    reviewed and approved it. No exceptions."
// Concretely, in this module: a recommendation may be DISPLAYED and STORED as a
// suggestion, but the rates it proposes may not move a match to `approved`, may
// not change `pay_rate`, and may not reach a client until a human with
// `canApprove` acts. The server actions enforce that; this module only ever
// returns a draft.
//
// EEO GUARDRAIL: like the scorer, the recommendation input carries no name,
// email, phone, age, gender, race, national origin or photo. The card text
// talks about the ROLE and the NUMBERS, never about the person.
// ===========================================================================

import { validateAIOutput, type GatewayValidationResult } from "@/lib/ai/gateway";
import { computeMatchMoney, counterPayRate } from "./pricing";
import type { ScoringSignal } from "./scoring";
import {
  defaultHoursPerWeek,
  type TalentActivityRow,
  type TalentActorType,
  type TalentAgentName,
  type TalentAutonomyTier,
} from "./types";

// ---------------------------------------------------------------------------
// Gateway wrapper
// ---------------------------------------------------------------------------

export const matchRecommendationPromptKey = "talent_engine.match_recommendation";

export interface RecommendationContext {
  promptKey?: string;
  expectedSchema?: Record<string, unknown>;
  confidenceThreshold?: number;
  safetyContext?: string;
}

/**
 * The single door every recommendation string leaves through. Thin on purpose:
 * the checks live in `lib/ai/gateway.ts` so this module cannot quietly hold a
 * softer opinion about what is safe to show a human.
 */
export function validateRecommendation(text: string, context: RecommendationContext = {}): GatewayValidationResult {
  return validateAIOutput({
    promptKey: context.promptKey ?? matchRecommendationPromptKey,
    rawOutput: typeof text === "string" ? text : "",
    expectedSchema: context.expectedSchema,
    confidenceThreshold: context.confidenceThreshold,
    safetyContext: context.safetyContext ?? "ehs_talent_engine.match_card",
  });
}

/** Shown instead of a draft that failed the gateway. Deliberately a constant. */
export const suppressedRecommendationText =
  "AI recommendation withheld. The drafted text for this match did not clear the AI gateway checks, so it has been " +
  "suppressed rather than shown. Review the rates, the certifications, and the fit for this match by hand before any " +
  "submittal, rate change, or placement.";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Hand-rolled so output never depends on the host's ICU locale data. */
function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe < 0 ? "-" : "";
  const fixed = Math.abs(safe).toFixed(2);
  const [whole, cents] = fixed.split(".");
  return `${sign}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

function formatRate(value: number): string {
  return `${formatMoney(value)}/hr`;
}

function formatPct(value: number): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
}

/**
 * Certification names, verticals and job titles are free text typed by a user,
 * so they are an injection surface into a string the console renders and the
 * gateway inspects. Strip control characters and template braces, collapse
 * whitespace, cap the length. Anything that survives this and is still hostile
 * is caught by the gateway, and the recommendation is suppressed.
 */
export function sanitizeLabel(value: unknown, maxLength = 80): string {
  if (typeof value !== "string") return "";
  // Character-by-character rather than a control-character regex: the intent
  // stays readable and no literal control byte ever lands in this source file.
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    // Template braces would trip the gateway's referential check.
    if (char === "{" || char === "}") continue;
    // C0 controls plus DEL — newlines and tabs collapse into the space run below.
    out += code < 0x20 || code === 0x7f ? " " : char;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function tokenSet(values: readonly unknown[] | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const value of Array.isArray(values) ? values : []) {
    const token = normalizeToken(value);
    if (token) set.add(token);
  }
  return set;
}

function uniqueLabels(values: readonly unknown[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of Array.isArray(values) ? values : []) {
    const label = sanitizeLabel(value);
    if (!label) continue;
    const token = label.toLowerCase();
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(label);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Input / output
// ---------------------------------------------------------------------------

export const recommendationShapes = ["submit", "submit_with_flag", "counter_below_floor"] as const;
export type RecommendationShape = (typeof recommendationShapes)[number];

export interface MatchRecommendationInput {
  /** The ROLE being filled. Never a person's name — see the EEO note above. */
  jobTitle: string;
  billRate: number;
  payRate: number;
  spreadFloor: number;
  hoursPerWeek?: number;
  /** 0..100 from `scoreMatch()`. */
  fitScore: number;
  /** Per-signal scores from `scoreMatch()`, used to name the fit gap. */
  breakdown?: Partial<Record<ScoringSignal, number>>;
  requiredCertifications: string[];
  heldCertifications: string[];
  verifiedCertifications: string[];
  candidateVerticals: string[];
  orderVertical: string | null;
}

export interface MatchRecommendation {
  /** Gateway-cleared text. Never a suppressed draft. */
  text: string;
  /** 0..1. */
  confidence: number;
  requiresHumanReview: boolean;
  agentName: TalentAgentName;
  tier: TalentAutonomyTier;
  /** Drafted counter pay rate — set only on the below-floor shape. */
  proposedPayRate: number | null;
  shape: RecommendationShape;
  /** The verdict for the emitted text. Persist it; never discard it. */
  gateway: GatewayValidationResult;
}

// ---------------------------------------------------------------------------
// Fit gaps
// ---------------------------------------------------------------------------

/** Score below which a signal is worth naming out loud on the card. */
const gapThresholds: Record<ScoringSignal, number> = {
  spread: 0, // handled by the below-floor shape, never as a soft "gap"
  certification: 0, // handled explicitly per certification below
  experience: 70,
  location: 60,
  availability: 70,
};

/**
 * Names every reason a human should look twice before this match goes to a
 * client. Order matters: certifications first, because an unverified required
 * cert is the one gap that HARD BLOCKS submittal (see `submitMatch`).
 */
export function detectFitGaps(input: MatchRecommendationInput): string[] {
  const gaps: string[] = [];

  const held = tokenSet(input.heldCertifications);
  const verified = tokenSet(input.verifiedCertifications);
  const missing: string[] = [];
  const unverified: string[] = [];
  for (const cert of uniqueLabels(input.requiredCertifications)) {
    const token = normalizeToken(cert);
    if (verified.has(token)) continue;
    if (held.has(token)) unverified.push(cert);
    else missing.push(cert);
  }
  // "awaiting verification" rather than "not yet verified": the gateway's logic
  // heuristic treats "not ... yet" as a contradiction and would WARN on it.
  if (unverified.length > 0) gaps.push(`${unverified.join(", ")} awaiting verification`);
  if (missing.length > 0) gaps.push(`${missing.join(", ")} missing from the candidate file`);

  const wantedVertical = sanitizeLabel(input.orderVertical);
  if (wantedVertical && !tokenSet(input.candidateVerticals).has(normalizeToken(wantedVertical))) {
    gaps.push(`limited ${wantedVertical} vertical experience`);
  }

  const breakdown = input.breakdown ?? {};
  const experience = breakdown.experience;
  if (typeof experience === "number" && experience < gapThresholds.experience) {
    gaps.push("experience below the level this order asks for");
  }
  const location = breakdown.location;
  if (typeof location === "number" && location < gapThresholds.location) {
    gaps.push("location gap against the job site");
  }
  const availability = breakdown.availability;
  if (typeof availability === "number" && availability < gapThresholds.availability) {
    gaps.push("start date later than the requested date");
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// The three blueprint shapes
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildMatchRecommendation(input: MatchRecommendationInput): MatchRecommendation {
  const hours = Number.isFinite(input.hoursPerWeek) && (input.hoursPerWeek as number) > 0
    ? (input.hoursPerWeek as number)
    : defaultHoursPerWeek;
  const floor = Number.isFinite(input.spreadFloor) ? input.spreadFloor : 0;
  const money = computeMatchMoney(input.billRate, input.payRate, floor, hours);
  const title = sanitizeLabel(input.jobTitle) || "this role";
  const fitScore = Math.round(clamp01(input.fitScore / 100) * 100);

  let shape: RecommendationShape;
  let agentName: TalentAgentName;
  let proposedPayRate: number | null = null;
  let draft: string;

  if (!money.floorOk) {
    // Shape 3 — the Margin Agent's job. Always human-reviewed: a rate move is
    // the most consequential thing this module can suggest.
    shape = "counter_below_floor";
    agentName = "Margin Agent";
    proposedPayRate = round2(counterPayRate(input.billRate, floor));
    const shortfall = Math.max(0, floor - money.spread);
    const restoredMargin = Math.max(0, floor) * hours;
    draft =
      `Spread below your ${formatRate(floor)} floor. Billing ${formatRate(input.billRate)} against a pay rate of ` +
      `${formatRate(input.payRate)} leaves ${formatRate(money.spread)}, a shortfall of ${formatRate(shortfall)} on ` +
      `every billable hour. Counter at ${formatRate(proposedPayRate)} pay to restore the floor and recover ` +
      `${formatMoney(restoredMargin)} of weekly gross margin across ${hours} hours. Hold this match for human ` +
      `approval before any rate moves.`;
  } else {
    const gaps = detectFitGaps(input);
    const moneyClause =
      `Billing ${formatRate(input.billRate)} against a pay rate of ${formatRate(input.payRate)} holds a ` +
      `${formatRate(money.spread)} spread at ${formatPct(money.markupPct)} markup, clearing the ` +
      `${formatRate(floor)} floor and returning ${formatMoney(money.weeklyMargin)} of weekly gross margin across ` +
      `${hours} hours.`;

    if (gaps.length === 0) {
      // Shape 1 — clean submittal.
      shape = "submit";
      agentName = "Matching Agent";
      const certCount = uniqueLabels(input.requiredCertifications).length;
      const certClause =
        certCount === 0
          ? `This ${title} order lists no mandatory certifications.`
          : `All ${certCount} required certification${certCount === 1 ? "" : "s"} for this ${title} order are verified.`;
      draft = `Submit to client. ${moneyClause} ${certClause} Fit score ${fitScore} of 100.`;
    } else {
      // Shape 2 — the money works, the fit needs a human look first.
      shape = "submit_with_flag";
      agentName = "Matching Agent";
      draft =
        `Submit for interview on this ${title} order. ${moneyClause} Fit score ${fitScore} of 100. ` +
        `flag: ${gaps.join("; ")}. Confirm with the client before the submittal goes out.`;
    }
  }

  const gateway = validateRecommendation(draft);

  // The gateway is a gate, not a report. A draft it blocks or fails is thrown
  // away, and the caller gets a fixed notice that itself clears the gateway.
  if (gateway.status === "blocked" || gateway.status === "fail") {
    return {
      text: suppressedRecommendationText,
      confidence: 0,
      requiresHumanReview: true,
      agentName,
      tier: 2,
      proposedPayRate,
      shape,
      gateway,
    };
  }

  return {
    text: draft,
    confidence: round2(Math.min(clamp01(input.fitScore / 100), clamp01(gateway.overallConfidence))),
    // Below-floor is ALWAYS human-reviewed. Otherwise the gateway decides:
    // any warn/fail or a sub-threshold confidence flags the card for review.
    requiresHumanReview: shape === "counter_below_floor" || gateway.requiresHumanReview,
    agentName,
    tier: 2,
    proposedPayRate,
    shape,
    gateway,
  };
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

/** A `talent_activity_log` insert payload — the row's defaults fill the rest. */
export type TalentActivityInsert = Omit<TalentActivityRow, "id" | "created_at">;

export interface TalentActivityRefs {
  /** Defaults to `ai_agent` when an agent is named, `human` otherwise. */
  actorType?: TalentActorType;
  actorId?: string | null;
  matchId?: string | null;
  jobOrderId?: string | null;
  candidateId?: string | null;
}

/**
 * Builds one line of the blueprint's activity feed. This is the defensible
 * trail on the money: who (or which agent) did what, at which autonomy tier,
 * against which match. It complements `recordAuditEvent()` rather than
 * replacing it — the audit table is platform-wide and admin-only, this feed is
 * what the staffing console actually renders.
 */
export function buildActivityEntry(
  agentName: string | null,
  action: string,
  tier: TalentAutonomyTier | null,
  summary: string,
  refs: TalentActivityRefs = {},
): TalentActivityInsert {
  const agent = sanitizeLabel(agentName, 60) || null;
  return {
    actor_type: refs.actorType ?? (agent ? "ai_agent" : "human"),
    actor_id: refs.actorId ?? null,
    agent_name: agent,
    action: sanitizeLabel(action, 80),
    tier,
    summary: sanitizeLabel(summary, 500),
    match_id: refs.matchId ?? null,
    job_order_id: refs.jobOrderId ?? null,
    candidate_id: refs.candidateId ?? null,
  };
}
