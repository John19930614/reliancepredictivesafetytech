"use server";

// EHS Talent Engine — server actions.
//
// House rules this file follows without exception (CLAUDE.md):
//   * No client-side data mutation. Everything the console writes goes through
//     a Server Action here, and `getTalentAccess()` calls
//     `supabase.auth.getUser()` before any of them touch a table.
//   * Every mutation asks for the affected ids back and treats an empty result
//     as failure. PostgREST reports NO error for an UPDATE that matched zero
//     rows — whether the id does not exist or RLS filtered it out — so without
//     this, a blocked write reports success and writes a false audit event.
//   * Every sensitive action calls `recordAuditEvent()` AND appends a
//     `talent_activity_log` row, then `revalidatePath()`.
//   * Ids are shape-checked with `isTalentUuid()` before they reach a filter.
//   * Money is NEVER trusted from the caller. Rates come off the stored row,
//     the floor comes off `talent_settings` / the job order, and the spread,
//     markup, floor check and timesheet amounts are recomputed server-side.
//
// HUMAN AUTHORITY RULE (CLAUDE.md): an AI-drafted recommendation may be stored
// and displayed, but nothing it proposes is applied to a record until a human
// with `canApprove` acts. `requires_human_review` starts true on every match and
// is cleared in exactly one place — `approveMatch()`, after a human decision is
// appended to `talent_match_approvals`.

import { revalidatePath } from "next/cache";
import { getTalentAccess } from "@/lib/talent-engine/access";
import {
  canEditMatchRates,
  canTransitionMatch,
  isTalentUuid,
  missingRequiredCerts,
  requiresHumanApproval,
} from "@/lib/talent-engine/policy";
import { defaultVerticalOptions, normalizeVerticalOptions } from "@/lib/talent-engine/verticals";
import {
  computeMatchMoney,
  meetsSpreadFloor,
  roundMoney,
  validateHoursInput,
  validateRateInput,
} from "@/lib/talent-engine/pricing";
import { scoreMatch, toScoringInput } from "@/lib/talent-engine/scoring";
import { buildActivityEntry, buildMatchRecommendation } from "@/lib/talent-engine/ai";
import { canTransitionLead } from "@/lib/talent-engine/sourcing-policy";
import { runSourcingSweep } from "@/app/api/cron/talent-sourcing/orchestrate";
import {
  candidateStatuses,
  defaultTalentSettings,
  jobOrderPriorities,
  jobOrderStatuses,
  maxHourlyRate,
  sourcingRunTypes,
  talentAutonomyTiers,
  type CandidateStatus,
  type JobOrderPriority,
  type JobOrderStatus,
  type MatchStatus,
  type SourcingLeadStatus,
  type SourcingRunType,
  type TalentAutonomyTier,
} from "@/lib/talent-engine/types";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Field-level messages keyed by input field name, when validation failed. */
  fieldErrors?: Record<string, string>;
}

/**
 * PostgREST returns no error for an UPDATE/DELETE that matched zero rows.
 * Every mutation below asks for the affected ids back and treats an empty
 * result as a failure, so we never report success (or write an audit event)
 * for a no-op.
 */
const NO_ROWS_MESSAGE = "That record was not found, or you do not have permission to change it.";
const SIGNED_OUT_MESSAGE = "You must be signed in.";

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

const tables = {
  jobOrders: "talent_job_orders",
  candidates: "talent_candidates",
  matches: "talent_matches",
  approvals: "talent_match_approvals",
  placements: "talent_placements",
  timesheets: "talent_timesheets",
  activity: "talent_activity_log",
  settings: "talent_settings",
} as const;

const talentPath = "/employee/talent-engine";

function revalidateTalent(): void {
  revalidatePath(talentPath);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorCode(error: any): string | null {
  return typeof error?.code === "string" ? error.code : null;
}

async function recordTalentAudit(
  role: string | null,
  action: "create" | "update" | "delete",
  resourceType: string,
  resourceId: string,
  userId: string | null,
  summary: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): Promise<void> {
  await recordAuditEvent({
    ...buildDataAuditEvent(action, resourceType, resourceId, userId, summary, before, after),
    actor_role: role,
  });
}

/**
 * Appends one line to the console's activity feed. Deliberately fire-and-forget
 * in the same sense as `recordAuditEvent()`: a feed write must never turn a
 * completed mutation into a reported failure.
 */
async function logActivity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entry: ReturnType<typeof buildActivityEntry>,
): Promise<void> {
  try {
    await supabase.from(tables.activity).insert(entry);
  } catch {
    // Activity logging must never crash the calling action.
  }
}

// ---------------------------------------------------------------------------
// Input validation
//
// Server Actions are public POST endpoints: whatever the browser can send, a
// script can send with an arbitrary payload. Everything is bounded here before
// it reaches a numeric(10,2) / date / text[] column.
// ---------------------------------------------------------------------------

const titleMaxLength = 200;
const nameMaxLength = 200;
const notesMaxLength = 5000;
const certListMaxLength = 40;
const certMaxLength = 80;
const maxOpenings = 999;
const maxYearsExperience = 80;
const maxMarkupPct = 1000;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Rejects impossible dates that Date would otherwise roll over (2026-02-30).
  return parsed.toISOString().slice(0, 10) === `${year}-${month}-${day}`;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, maxLength);
}

/** Normalises a free-text certification / vertical array from a form post. */
function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const label = cleanText(entry, certMaxLength);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= certListMaxLength) break;
  }
  return out;
}

function toNullableRate(value: unknown, field: string, errors: Record<string, string>): number | null {
  if (value === null || value === undefined || value === "") return null;
  const check = validateRateInput(value);
  if (!check.ok) {
    errors[field] = check.reason ?? "Enter a valid hourly rate.";
    return null;
  }
  return roundMoney(value);
}

function firstError(errors: Record<string, string>): string | undefined {
  return Object.values(errors)[0];
}

// ---------------------------------------------------------------------------
// Settings + shared loaders
// ---------------------------------------------------------------------------

interface TalentSettings {
  id: string | null;
  minSpreadPerHour: number;
  targetMarkupPct: number;
  defaultHoursPerWeek: number;
  payRateAutonomyTier: TalentAutonomyTier;
  verticalOptions: string[];
}

/**
 * Reads the `talent_settings` singleton. Falls back to the typed defaults from
 * types.ts rather than throwing: a missing settings row must not make the whole
 * console unusable, and every default here matches the migration's seed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadTalentSettings(supabase: any): Promise<TalentSettings> {
  const { data } = await supabase
    .from(tables.settings)
    .select("id, min_spread_per_hour, target_markup_pct, default_hours_per_week, pay_rate_autonomy_tier, vertical_options")
    .limit(1);

  const row = Array.isArray(data) ? data[0] : data;
  const tier = Number(row?.pay_rate_autonomy_tier);
  const verticals = normalizeVerticalOptions(row?.vertical_options);
  return {
    id: typeof row?.id === "string" ? row.id : null,
    minSpreadPerHour: Number.isFinite(Number(row?.min_spread_per_hour))
      ? Number(row.min_spread_per_hour)
      : defaultTalentSettings.min_spread_per_hour,
    targetMarkupPct: Number.isFinite(Number(row?.target_markup_pct))
      ? Number(row.target_markup_pct)
      : defaultTalentSettings.target_markup_pct,
    defaultHoursPerWeek:
      Number.isFinite(Number(row?.default_hours_per_week)) && Number(row.default_hours_per_week) > 0
        ? Number(row.default_hours_per_week)
        : defaultTalentSettings.default_hours_per_week,
    payRateAutonomyTier: (talentAutonomyTiers as readonly number[]).includes(tier)
      ? (tier as TalentAutonomyTier)
      : defaultTalentSettings.pay_rate_autonomy_tier,
    verticalOptions: verticals.length > 0 ? verticals : [...defaultVerticalOptions],
  };
}

const jobOrderColumns =
  "id, title, client_id, vertical, location, cert_requirements, bill_rate, min_spread, status, start_date";

/**
 * Candidate columns the engine reads. `full_name` is here because the audit
 * summary names who was proposed; it never reaches the scorer, which is fed
 * exclusively through `toScoringInput()` (see the EEO note in scoring.ts).
 */
const candidateColumns =
  "id, full_name, certifications, verified_certifications, years_experience, verticals, location, " +
  "willing_to_relocate, pay_expectation, availability_date, status";

const matchColumns =
  "id, job_order_id, candidate_id, status, bill_rate, pay_rate, spread, markup_pct, floor_ok, " +
  "fit_score, requires_human_review, proposed_pay_rate";

/** The effective spread floor for one order: its override, else the agency floor. */
function resolveFloor(jobOrderMinSpread: unknown, settings: TalentSettings): number {
  const override = Number(jobOrderMinSpread);
  return Number.isFinite(override) && jobOrderMinSpread !== null && jobOrderMinSpread !== undefined
    ? roundMoney(override)
    : roundMoney(settings.minSpreadPerHour);
}

// ---------------------------------------------------------------------------
// Job orders
// ---------------------------------------------------------------------------

export interface JobOrderInput {
  title: string;
  clientId?: string | null;
  vertical?: string | null;
  location?: string | null;
  certRequirements?: string[];
  /** Setting or changing this requires `canSetRate` — it is the client price. */
  billRate?: number | null;
  /** Per-order override of the agency spread floor. Also a rate. */
  minSpread?: number | null;
  openings?: number;
  priority?: JobOrderPriority;
  startDate?: string | null;
  notes?: string | null;
}

/** Every field optional — an update touches only what it names. */
export type JobOrderPatch = Partial<JobOrderInput>;

interface JobOrderValidation {
  ok: boolean;
  errors: Record<string, string>;
  update: Record<string, unknown>;
  /** True when the payload sets a rate, which needs `canSetRate`. */
  touchesRates: boolean;
}

function validateJobOrderInput(input: JobOrderPatch, requireTitle: boolean): JobOrderValidation {
  const errors: Record<string, string> = {};
  const update: Record<string, unknown> = {};

  if (requireTitle || input.title !== undefined) {
    const title = cleanText(input.title, titleMaxLength);
    if (!title) errors.title = "Give the job order a title.";
    else update.title = title;
  }

  if (input.clientId !== undefined) {
    if (input.clientId === null || input.clientId === "") update.client_id = null;
    else if (typeof input.clientId !== "string" || !isTalentUuid(input.clientId)) {
      errors.clientId = "That company reference is not valid.";
    } else update.client_id = input.clientId.trim();
  }

  if (input.vertical !== undefined) update.vertical = cleanText(input.vertical, nameMaxLength);
  if (input.location !== undefined) update.location = cleanText(input.location, nameMaxLength);
  if (input.notes !== undefined) update.notes = cleanText(input.notes, notesMaxLength);
  if (input.certRequirements !== undefined) update.cert_requirements = cleanStringList(input.certRequirements);

  let touchesRates = false;
  if (input.billRate !== undefined) {
    touchesRates = true;
    update.bill_rate = toNullableRate(input.billRate, "billRate", errors);
  }
  if (input.minSpread !== undefined) {
    touchesRates = true;
    update.min_spread = toNullableRate(input.minSpread, "minSpread", errors);
  }

  if (input.openings !== undefined) {
    const openings = Number(input.openings);
    if (!Number.isFinite(openings) || openings < 1 || openings > maxOpenings) {
      errors.openings = `Openings must be between 1 and ${maxOpenings}.`;
    } else update.openings = Math.floor(openings);
  }

  if (input.priority !== undefined) {
    if (!jobOrderPriorities.includes(input.priority)) errors.priority = "Unknown priority.";
    else update.priority = input.priority;
  }

  if (input.startDate !== undefined) {
    if (input.startDate === null || input.startDate === "") update.start_date = null;
    else if (!isCalendarDate(input.startDate)) errors.startDate = "Start date must be a real date (YYYY-MM-DD).";
    else update.start_date = input.startDate.trim();
  }

  const first = firstError(errors);
  return { ok: !first, errors, update, touchesRates };
}

export async function createJobOrder(input: JobOrderInput): Promise<ActionResult & { jobOrderId?: string }> {
  const { supabase, userId, canRead, canPropose, canSetRate, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canPropose) return { ok: false, error: "You do not have permission to create job orders." };

  const validation = validateJobOrderInput(input ?? ({} as JobOrderInput), true);
  if (!validation.ok) return { ok: false, error: firstError(validation.errors), fieldErrors: validation.errors };
  if (validation.touchesRates && !canSetRate) {
    return { ok: false, error: "You do not have permission to set rates." };
  }

  const { data: created, error } = await supabase
    .from(tables.jobOrders)
    .insert({ ...validation.update, status: "open", created_by: userId })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Failed to create the job order." };

  const title = String(validation.update.title ?? "");
  await recordTalentAudit(role, "create", "talent_job_order", created.id, userId, `Created job order "${title}"`, null, {
    client_id: validation.update.client_id ?? null,
    bill_rate: validation.update.bill_rate ?? null,
    min_spread: validation.update.min_spread ?? null,
  });
  await logActivity(
    supabase,
    buildActivityEntry(null, "job_order.created", 3, `Opened job order "${title}"`, {
      actorType: "human",
      actorId: userId,
      jobOrderId: created.id,
    }),
  );

  revalidateTalent();
  return { ok: true, jobOrderId: created.id };
}

export async function updateJobOrder(jobOrderId: string, patch: JobOrderPatch): Promise<ActionResult> {
  const { supabase, userId, canRead, canPropose, canSetRate, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canPropose) return { ok: false, error: "You do not have permission to edit job orders." };
  if (!isTalentUuid(jobOrderId)) return { ok: false, error: "Missing or invalid job order id." };

  const validation = validateJobOrderInput(patch ?? {}, false);
  if (!validation.ok) return { ok: false, error: firstError(validation.errors), fieldErrors: validation.errors };
  if (validation.touchesRates && !canSetRate) {
    return { ok: false, error: "You do not have permission to change the bill rate." };
  }
  if (Object.keys(validation.update).length === 0) return { ok: true };

  const { data: before } = await supabase
    .from(tables.jobOrders)
    .select(jobOrderColumns)
    .eq("id", jobOrderId)
    .maybeSingle();
  if (!before) return { ok: false, error: NO_ROWS_MESSAGE };

  const { data: updated, error } = await supabase
    .from(tables.jobOrders)
    .update(validation.update)
    .eq("id", jobOrderId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordTalentAudit(
    role,
    "update",
    "talent_job_order",
    jobOrderId,
    userId,
    `Updated job order "${before.title}"`,
    before,
    validation.update,
  );
  await logActivity(
    supabase,
    buildActivityEntry(null, "job_order.updated", 3, `Updated job order "${before.title}"`, {
      actorType: "human",
      actorId: userId,
      jobOrderId,
    }),
  );

  revalidateTalent();
  return { ok: true };
}

export async function setJobOrderStatus(jobOrderId: string, status: JobOrderStatus): Promise<ActionResult> {
  const { supabase, userId, canRead, canPropose, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canPropose) return { ok: false, error: "You do not have permission to update job orders." };
  if (!isTalentUuid(jobOrderId)) return { ok: false, error: "Missing or invalid job order id." };
  if (!jobOrderStatuses.includes(status)) return { ok: false, error: "Unknown job order status." };

  const { data: before } = await supabase
    .from(tables.jobOrders)
    .select("id, title, status")
    .eq("id", jobOrderId)
    .maybeSingle();
  if (!before) return { ok: false, error: NO_ROWS_MESSAGE };
  if (before.status === status) return { ok: false, error: "The job order is already in that status." };

  const { data: updated, error } = await supabase
    .from(tables.jobOrders)
    .update({ status })
    .eq("id", jobOrderId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordTalentAudit(
    role,
    "update",
    "talent_job_order",
    jobOrderId,
    userId,
    `Moved job order "${before.title}" from ${before.status} to ${status}`,
    { status: before.status },
    { status },
  );
  await logActivity(
    supabase,
    buildActivityEntry(null, "job_order.status_changed", 3, `Job order "${before.title}" is now ${status}`, {
      actorType: "human",
      actorId: userId,
      jobOrderId,
    }),
  );

  revalidateTalent();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export interface CandidateInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  yearsExperience?: number | null;
  /** Claimed certifications. Verification is a separate, gated action. */
  certifications?: string[];
  certExpiryDate?: string | null;
  verticals?: string[];
  location?: string | null;
  willingToRelocate?: boolean;
  payExpectation?: number | null;
  availabilityDate?: string | null;
  status?: CandidateStatus;
  notes?: string | null;
}

/** Every field optional — an update touches only what it names. */
export type CandidatePatch = Partial<CandidateInput>;

function validateCandidateInput(
  input: CandidatePatch,
  requireName: boolean,
): { ok: boolean; errors: Record<string, string>; update: Record<string, unknown> } {
  const errors: Record<string, string> = {};
  const update: Record<string, unknown> = {};

  if (requireName || input.fullName !== undefined) {
    const name = cleanText(input.fullName, nameMaxLength);
    if (!name) errors.fullName = "Give the candidate a name.";
    else update.full_name = name;
  }

  if (input.email !== undefined) {
    const email = cleanText(input.email, nameMaxLength);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "That email address is not valid.";
    else update.email = email;
  }
  if (input.phone !== undefined) update.phone = cleanText(input.phone, 40);
  if (input.location !== undefined) update.location = cleanText(input.location, nameMaxLength);
  if (input.notes !== undefined) update.notes = cleanText(input.notes, notesMaxLength);
  if (input.certifications !== undefined) update.certifications = cleanStringList(input.certifications);
  if (input.verticals !== undefined) update.verticals = cleanStringList(input.verticals);
  if (input.willingToRelocate !== undefined) update.willing_to_relocate = Boolean(input.willingToRelocate);

  if (input.yearsExperience !== undefined) {
    if (input.yearsExperience === null) update.years_experience = null;
    else {
      const years = Number(input.yearsExperience);
      if (!Number.isFinite(years) || years < 0 || years > maxYearsExperience) {
        errors.yearsExperience = `Years of experience must be between 0 and ${maxYearsExperience}.`;
      } else update.years_experience = Math.floor(years);
    }
  }

  if (input.payExpectation !== undefined) {
    update.pay_expectation = toNullableRate(input.payExpectation, "payExpectation", errors);
  }

  for (const [key, column] of [
    ["certExpiryDate", "cert_expiry_date"],
    ["availabilityDate", "availability_date"],
  ] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (value === null || value === "") update[column] = null;
    else if (!isCalendarDate(value)) errors[key] = "That date must be a real date (YYYY-MM-DD).";
    else update[column] = value.trim();
  }

  if (input.status !== undefined) {
    if (!candidateStatuses.includes(input.status)) errors.status = "Unknown candidate status.";
    else update.status = input.status;
  }

  return { ok: !firstError(errors), errors, update };
}

export async function createCandidate(input: CandidateInput): Promise<ActionResult & { candidateId?: string }> {
  const { supabase, userId, canRead, canPropose, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canPropose) return { ok: false, error: "You do not have permission to add candidates." };

  const validation = validateCandidateInput(input ?? ({} as CandidateInput), true);
  if (!validation.ok) return { ok: false, error: firstError(validation.errors), fieldErrors: validation.errors };

  // `verified_certifications` is deliberately absent: only
  // verifyCandidateCertification() may write it, and that needs `canApprove`.
  const { data: created, error } = await supabase
    .from(tables.candidates)
    .insert({ status: "sourced", ...validation.update, verified_certifications: [], created_by: userId })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Failed to add the candidate." };

  const name = String(validation.update.full_name ?? "");
  await recordTalentAudit(role, "create", "talent_candidate", created.id, userId, `Added candidate ${name}`, null, {
    certifications: validation.update.certifications ?? [],
  });
  await logActivity(
    supabase,
    buildActivityEntry("Sourcing Agent", "candidate.created", 2, `Sourced candidate ${name}`, {
      actorType: "human",
      actorId: userId,
      candidateId: created.id,
    }),
  );

  revalidateTalent();
  return { ok: true, candidateId: created.id };
}

export async function updateCandidate(candidateId: string, patch: CandidatePatch): Promise<ActionResult> {
  const { supabase, userId, canRead, canPropose, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canPropose) return { ok: false, error: "You do not have permission to edit candidates." };
  if (!isTalentUuid(candidateId)) return { ok: false, error: "Missing or invalid candidate id." };

  const validation = validateCandidateInput(patch ?? {}, false);
  if (!validation.ok) return { ok: false, error: firstError(validation.errors), fieldErrors: validation.errors };
  if (Object.keys(validation.update).length === 0) return { ok: true };

  const { data: before } = await supabase
    .from(tables.candidates)
    .select(candidateColumns)
    .eq("id", candidateId)
    .maybeSingle();
  if (!before) return { ok: false, error: NO_ROWS_MESSAGE };

  // Editing the claimed cert list must not silently keep a verification that
  // was granted against a cert the candidate no longer claims.
  if (Array.isArray(validation.update.certifications)) {
    const claimed = new Set((validation.update.certifications as string[]).map((c) => c.toLowerCase()));
    const keptVerified = (Array.isArray(before.verified_certifications) ? before.verified_certifications : []).filter(
      (cert: unknown) => typeof cert === "string" && claimed.has(cert.trim().toLowerCase()),
    );
    validation.update.verified_certifications = keptVerified;
  }

  const { data: updated, error } = await supabase
    .from(tables.candidates)
    .update(validation.update)
    .eq("id", candidateId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordTalentAudit(
    role,
    "update",
    "talent_candidate",
    candidateId,
    userId,
    `Updated candidate ${before.full_name}`,
    before,
    validation.update,
  );
  await logActivity(
    supabase,
    buildActivityEntry(null, "candidate.updated", 3, `Updated candidate ${before.full_name}`, {
      actorType: "human",
      actorId: userId,
      candidateId,
    }),
  );

  revalidateTalent();
  return { ok: true };
}

/**
 * Marks one claimed certification as verified.
 *
 * This needs `canApprove`, not `canPropose`, because it is a GATE rather than a
 * data edit: `missingRequiredCerts()` blocks submittal until the required certs
 * appear in `verified_certifications`, so whoever can write this list can
 * unblock a submittal. A recruiter proposing the candidate must not be able to
 * clear their own blocker.
 */
export async function verifyCandidateCertification(
  candidateId: string,
  certification: string,
): Promise<ActionResult> {
  const { supabase, userId, canRead, canApprove, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canApprove) return { ok: false, error: "You do not have permission to verify certifications." };
  if (!isTalentUuid(candidateId)) return { ok: false, error: "Missing or invalid candidate id." };

  const cert = cleanText(certification, certMaxLength);
  if (!cert) return { ok: false, error: "Name the certification to verify." };

  const { data: candidate } = await supabase
    .from(tables.candidates)
    .select("id, full_name, certifications, verified_certifications")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) return { ok: false, error: NO_ROWS_MESSAGE };

  const claimed: string[] = Array.isArray(candidate.certifications) ? candidate.certifications : [];
  const verified: string[] = Array.isArray(candidate.verified_certifications)
    ? candidate.verified_certifications
    : [];
  const key = cert.toLowerCase();

  // A verification must point at something the candidate actually claims.
  const claimedMatch = claimed.find((entry) => typeof entry === "string" && entry.trim().toLowerCase() === key);
  if (!claimedMatch) {
    return { ok: false, error: `${cert} is not on this candidate's certification list.` };
  }
  if (verified.some((entry) => typeof entry === "string" && entry.trim().toLowerCase() === key)) {
    return { ok: false, error: `${cert} is already verified.` };
  }

  const nextVerified = [...verified, claimedMatch.trim()];
  const { data: updated, error } = await supabase
    .from(tables.candidates)
    .update({ verified_certifications: nextVerified })
    .eq("id", candidateId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordTalentAudit(
    role,
    "update",
    "talent_candidate",
    candidateId,
    userId,
    `Verified ${cert} for candidate ${candidate.full_name}`,
    { verified_certifications: verified },
    { verified_certifications: nextVerified },
  );
  await logActivity(
    supabase,
    buildActivityEntry(null, "candidate.cert_verified", 3, `Verified ${cert} for ${candidate.full_name}`, {
      actorType: "human",
      actorId: userId,
      candidateId,
    }),
  );

  revalidateTalent();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

interface MatchContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobOrder: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  candidate: any;
  settings: TalentSettings;
  floor: number;
  hours: number;
}

/** Loads the order + candidate + settings a match's money and score derive from. */
async function loadMatchContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jobOrderId: string,
  candidateId: string,
): Promise<MatchContext | null> {
  const [{ data: jobOrder }, { data: candidate }, settings] = await Promise.all([
    supabase.from(tables.jobOrders).select(jobOrderColumns).eq("id", jobOrderId).maybeSingle(),
    supabase.from(tables.candidates).select(candidateColumns).eq("id", candidateId).maybeSingle(),
    loadTalentSettings(supabase),
  ]);
  if (!jobOrder || !candidate) return null;
  return {
    jobOrder,
    candidate,
    settings,
    floor: resolveFloor(jobOrder.min_spread, settings),
    hours: settings.defaultHoursPerWeek,
  };
}

/** Score + money + drafted recommendation for one (order, candidate, pay rate). */
function deriveMatchProposal(context: MatchContext, billRate: number, payRate: number) {
  const money = computeMatchMoney(billRate, payRate, context.floor, context.hours);
  const score = scoreMatch(
    toScoringInput({
      candidate: context.candidate,
      jobOrder: context.jobOrder,
      billRate,
      payRate,
      spreadFloor: context.floor,
    }),
  );
  const recommendation = buildMatchRecommendation({
    jobTitle: context.jobOrder.title,
    billRate,
    payRate,
    spreadFloor: context.floor,
    hoursPerWeek: context.hours,
    fitScore: score.total,
    breakdown: score.breakdown,
    requiredCertifications: context.jobOrder.cert_requirements ?? [],
    heldCertifications: context.candidate.certifications ?? [],
    verifiedCertifications: context.candidate.verified_certifications ?? [],
    candidateVerticals: context.candidate.verticals ?? [],
    orderVertical: context.jobOrder.vertical ?? null,
  });

  // The Human Authority gate. The probe passes `requires_human_review: false`
  // so the OTHER conditions (floor, certs, well-formedness) decide — then the
  // recommendation's own verdict is OR'd in. A match can only ever come out of
  // here needing MORE review, never less.
  const needsReview =
    requiresHumanApproval({
      requires_human_review: false,
      spread: money.spread,
      min_spread: context.floor,
      floor_ok: money.floorOk,
      cert_requirements: Array.isArray(context.jobOrder.cert_requirements)
        ? context.jobOrder.cert_requirements
        : [],
      verified_certifications: Array.isArray(context.candidate.verified_certifications)
        ? context.candidate.verified_certifications
        : [],
    }) || recommendation.requiresHumanReview;

  return { money, score, recommendation, needsReview };
}

/**
 * Proposes a candidate against a job order.
 *
 * The rates are NOT taken from the caller: the bill rate is the job order's
 * client price and the pay rate is the candidate's recorded expectation. A
 * browser cannot post a spread into existence.
 */
export async function createMatch(
  jobOrderId: string,
  candidateId: string,
): Promise<ActionResult & { matchId?: string }> {
  const { supabase, userId, canRead, canPropose, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canPropose) return { ok: false, error: "You do not have permission to propose matches." };
  if (!isTalentUuid(jobOrderId)) return { ok: false, error: "Missing or invalid job order id." };
  if (!isTalentUuid(candidateId)) return { ok: false, error: "Missing or invalid candidate id." };

  const context = await loadMatchContext(supabase, jobOrderId, candidateId);
  if (!context) return { ok: false, error: NO_ROWS_MESSAGE };

  if (context.jobOrder.status === "closed" || context.jobOrder.status === "filled") {
    return { ok: false, error: `Job order "${context.jobOrder.title}" is ${context.jobOrder.status}.` };
  }

  const billRate = Number(context.jobOrder.bill_rate);
  if (!Number.isFinite(billRate) || billRate <= 0) {
    return { ok: false, error: "Set a bill rate on the job order before proposing a candidate." };
  }
  // `Number(null)` is 0, which would sail through a finiteness check and invent
  // an unpaid placement — so an absent expectation is rejected by identity.
  const rawPay = context.candidate.pay_expectation;
  const payRate = Number(rawPay);
  if (rawPay === null || rawPay === undefined || rawPay === "" || !Number.isFinite(payRate) || payRate <= 0 || payRate > maxHourlyRate) {
    return { ok: false, error: "Record the candidate's pay expectation before proposing them." };
  }

  const { money, score, recommendation, needsReview } = deriveMatchProposal(context, billRate, payRate);

  const { data: created, error } = await supabase
    .from(tables.matches)
    .insert({
      job_order_id: jobOrderId,
      candidate_id: candidateId,
      fit_score: score.total,
      bill_rate: roundMoney(billRate),
      pay_rate: roundMoney(payRate),
      spread: money.spread,
      markup_pct: money.markupPct,
      floor_ok: money.floorOk,
      // Never `draft`: a proposal exists to be decided on by a human.
      status: "pending_approval",
      ai_recommendation: recommendation.text,
      ai_confidence: recommendation.confidence,
      proposed_pay_rate: recommendation.proposedPayRate,
      requires_human_review: needsReview,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    if (errorCode(error) === UNIQUE_VIOLATION) {
      return { ok: false, error: "This candidate has already been proposed for that job order." };
    }
    return { ok: false, error: error?.message ?? "Failed to create the match." };
  }

  await recordTalentAudit(
    role,
    "create",
    "talent_match",
    created.id,
    userId,
    `Proposed ${context.candidate.full_name} for "${context.jobOrder.title}" at a ${money.spread} spread`,
    null,
    {
      job_order_id: jobOrderId,
      candidate_id: candidateId,
      bill_rate: roundMoney(billRate),
      pay_rate: roundMoney(payRate),
      spread: money.spread,
      floor_ok: money.floorOk,
      fit_score: score.total,
      requires_human_review: needsReview,
      ai_gateway_status: recommendation.gateway.status,
    },
  );
  await logActivity(
    supabase,
    buildActivityEntry(recommendation.agentName, "match.proposed", recommendation.tier, recommendation.text, {
      actorId: userId,
      matchId: created.id,
      jobOrderId,
      candidateId,
    }),
  );

  revalidateTalent();
  return { ok: true, matchId: created.id };
}

/** Append-only decision row on a match. Never updated, never deleted. */
async function appendApproval(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  matchId: string,
  reviewerId: string,
  reviewerRole: string | null,
  decision: "approve" | "reject" | "counter" | "hold",
  rates: { billBefore: number; billAfter: number; payBefore: number; payAfter: number },
  note: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from(tables.approvals).insert({
    match_id: matchId,
    reviewer_id: reviewerId,
    reviewer_role: reviewerRole,
    decision,
    bill_rate_before: rates.billBefore,
    bill_rate_after: rates.billAfter,
    pay_rate_before: rates.payBefore,
    pay_rate_after: rates.payAfter,
    note,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadMatch(supabase: any, matchId: string) {
  const { data } = await supabase.from(tables.matches).select(matchColumns).eq("id", matchId).maybeSingle();
  return data ?? null;
}

/**
 * Approves a match.
 *
 * The floor is re-checked HERE, from the rates stored on the row and the floor
 * stored on the job order / settings — never from anything the browser posted.
 * A below-floor approval is allowed (that IS the human override the module
 * exists for) but demands a written note, so `submitMatch()` can later point at
 * a real, justified approval rather than an empty one.
 */
export async function approveMatch(matchId: string, note?: string): Promise<ActionResult> {
  const { supabase, userId, canRead, canApprove, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canApprove) return { ok: false, error: "You do not have permission to approve matches." };
  if (!isTalentUuid(matchId)) return { ok: false, error: "Missing or invalid match id." };

  const match = await loadMatch(supabase, matchId);
  if (!match) return { ok: false, error: NO_ROWS_MESSAGE };

  const gate = canTransitionMatch(match.status as MatchStatus, "approved");
  if (!gate.ok) return { ok: false, error: gate.reason };

  const { data: jobOrder } = await supabase
    .from(tables.jobOrders)
    .select("id, title, min_spread")
    .eq("id", match.job_order_id)
    .maybeSingle();
  const settings = await loadTalentSettings(supabase);
  const floor = resolveFloor(jobOrder?.min_spread, settings);

  const billRate = Number(match.bill_rate) || 0;
  const payRate = Number(match.pay_rate) || 0;
  const money = computeMatchMoney(billRate, payRate, floor, settings.defaultHoursPerWeek);
  const cleanNote = cleanText(note, notesMaxLength);

  if (!money.floorOk && !cleanNote) {
    return {
      ok: false,
      error: `This match's ${money.spread} spread is under the ${floor} floor. Add a note explaining the exception, or counter the pay rate first.`,
    };
  }

  const { data: updated, error } = await supabase
    .from(tables.matches)
    .update({
      status: "approved",
      // Re-derived, not carried over: the stored flags must agree with the
      // arithmetic a human is being asked to sign off on.
      spread: money.spread,
      markup_pct: money.markupPct,
      floor_ok: money.floorOk,
      // The ONE place this is cleared. A human has now reviewed the match.
      requires_human_review: false,
      decided_at: new Date().toISOString(),
    })
    .eq("id", matchId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  const approval = await appendApproval(
    supabase,
    matchId,
    userId,
    role,
    "approve",
    { billBefore: billRate, billAfter: billRate, payBefore: payRate, payAfter: payRate },
    cleanNote,
  );
  if (!approval.ok) {
    return { ok: false, error: `The match was approved but the approval record failed: ${approval.error}` };
  }

  await recordTalentAudit(
    role,
    "update",
    "talent_match",
    matchId,
    userId,
    `Approved match for "${jobOrder?.title ?? match.job_order_id}" at a ${money.spread} spread`,
    { status: match.status, floor_ok: match.floor_ok, requires_human_review: match.requires_human_review },
    { status: "approved", floor_ok: money.floorOk, spread: money.spread, floor, note: cleanNote },
  );
  await logActivity(
    supabase,
    buildActivityEntry(
      null,
      "match.approved",
      3,
      `Approved a ${money.spread} spread against a ${floor} floor`,
      { actorType: "human", actorId: userId, matchId, jobOrderId: match.job_order_id, candidateId: match.candidate_id },
    ),
  );

  revalidateTalent();
  return { ok: true };
}

export async function rejectMatch(matchId: string, note?: string): Promise<ActionResult> {
  const { supabase, userId, canRead, canApprove, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canApprove) return { ok: false, error: "You do not have permission to reject matches." };
  if (!isTalentUuid(matchId)) return { ok: false, error: "Missing or invalid match id." };

  const match = await loadMatch(supabase, matchId);
  if (!match) return { ok: false, error: NO_ROWS_MESSAGE };

  const gate = canTransitionMatch(match.status as MatchStatus, "rejected");
  if (!gate.ok) return { ok: false, error: gate.reason };

  const cleanNote = cleanText(note, notesMaxLength);
  const billRate = Number(match.bill_rate) || 0;
  const payRate = Number(match.pay_rate) || 0;

  const { data: updated, error } = await supabase
    .from(tables.matches)
    .update({ status: "rejected", requires_human_review: false, decided_at: new Date().toISOString() })
    .eq("id", matchId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  const approval = await appendApproval(
    supabase,
    matchId,
    userId,
    role,
    "reject",
    { billBefore: billRate, billAfter: billRate, payBefore: payRate, payAfter: payRate },
    cleanNote,
  );
  if (!approval.ok) {
    return { ok: false, error: `The match was rejected but the approval record failed: ${approval.error}` };
  }

  await recordTalentAudit(
    role,
    "update",
    "talent_match",
    matchId,
    userId,
    "Rejected a proposed match",
    { status: match.status },
    { status: "rejected", note: cleanNote },
  );
  await logActivity(
    supabase,
    buildActivityEntry(null, "match.rejected", 3, cleanNote ?? "Rejected a proposed match", {
      actorType: "human",
      actorId: userId,
      matchId,
      jobOrderId: match.job_order_id,
      candidateId: match.candidate_id,
    }),
  );

  revalidateTalent();
  return { ok: true };
}

/**
 * Parks a match without deciding it.
 *
 * There is no `on_hold` match status — the transition graph in policy.ts has
 * none — and inventing one here would put the app and the database's CHECK
 * constraint out of step. A hold is therefore recorded as what it actually is:
 * an append-only `hold` decision by a named reviewer, with the match left where
 * it was and flagged for review.
 */
export async function holdMatch(matchId: string, note?: string): Promise<ActionResult> {
  const { supabase, userId, canRead, canApprove, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canApprove) return { ok: false, error: "You do not have permission to hold matches." };
  if (!isTalentUuid(matchId)) return { ok: false, error: "Missing or invalid match id." };

  const match = await loadMatch(supabase, matchId);
  if (!match) return { ok: false, error: NO_ROWS_MESSAGE };

  if (match.status !== "pending_approval" && match.status !== "counter_proposed") {
    return { ok: false, error: `Only a match awaiting a decision can be held — this one is ${match.status}.` };
  }

  const cleanNote = cleanText(note, notesMaxLength);
  const billRate = Number(match.bill_rate) || 0;
  const payRate = Number(match.pay_rate) || 0;

  const { data: updated, error } = await supabase
    .from(tables.matches)
    .update({ requires_human_review: true })
    .eq("id", matchId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  const approval = await appendApproval(
    supabase,
    matchId,
    userId,
    role,
    "hold",
    { billBefore: billRate, billAfter: billRate, payBefore: payRate, payAfter: payRate },
    cleanNote,
  );
  if (!approval.ok) {
    return { ok: false, error: `The match was held but the approval record failed: ${approval.error}` };
  }

  await recordTalentAudit(
    role,
    "update",
    "talent_match",
    matchId,
    userId,
    "Held a match for further review",
    { requires_human_review: match.requires_human_review },
    { requires_human_review: true, note: cleanNote },
  );
  await logActivity(
    supabase,
    buildActivityEntry(null, "match.held", 3, cleanNote ?? "Held a match for further review", {
      actorType: "human",
      actorId: userId,
      matchId,
      jobOrderId: match.job_order_id,
      candidateId: match.candidate_id,
    }),
  );

  revalidateTalent();
  return { ok: true };
}

/**
 * Counters the pay rate on a match.
 *
 * The posted rate is re-validated and the spread, markup, floor check, fit
 * score and recommendation are all recomputed from it server-side — the caller
 * supplies one number and nothing else. The match returns to
 * `counter_proposed`, which the transition graph routes back through
 * `pending_approval`, so a re-priced match gets a fresh sign-off instead of
 * inheriting the old one.
 */
export async function counterMatch(matchId: string, newPayRate: number, note?: string): Promise<ActionResult> {
  const { supabase, userId, canRead, canSetRate, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canSetRate) return { ok: false, error: "You do not have permission to change rates." };
  if (!isTalentUuid(matchId)) return { ok: false, error: "Missing or invalid match id." };

  const rateCheck = validateRateInput(newPayRate);
  if (!rateCheck.ok) {
    return { ok: false, error: rateCheck.reason, fieldErrors: { newPayRate: rateCheck.reason ?? "Invalid rate." } };
  }

  const match = await loadMatch(supabase, matchId);
  if (!match) return { ok: false, error: NO_ROWS_MESSAGE };

  const rateGate = canEditMatchRates(match.status as MatchStatus);
  if (!rateGate.ok) return { ok: false, error: rateGate.reason };
  const gate = canTransitionMatch(match.status as MatchStatus, "counter_proposed");
  if (!gate.ok) return { ok: false, error: gate.reason };

  const context = await loadMatchContext(supabase, match.job_order_id, match.candidate_id);
  if (!context) return { ok: false, error: NO_ROWS_MESSAGE };

  const billRate = Number(match.bill_rate) || 0;
  const payBefore = Number(match.pay_rate) || 0;
  const payAfter = roundMoney(newPayRate);
  const { money, score, recommendation } = deriveMatchProposal(context, billRate, payAfter);
  const cleanNote = cleanText(note, notesMaxLength);

  const { data: updated, error } = await supabase
    .from(tables.matches)
    .update({
      pay_rate: payAfter,
      spread: money.spread,
      markup_pct: money.markupPct,
      floor_ok: money.floorOk,
      fit_score: score.total,
      status: "counter_proposed",
      ai_recommendation: recommendation.text,
      ai_confidence: recommendation.confidence,
      // The counter has been applied, so there is no outstanding draft.
      proposed_pay_rate: null,
      // A re-priced match is unreviewed by definition — the previous sign-off
      // was against the OLD spread, so it cannot carry over. Unconditionally
      // true; `deriveMatchProposal` cannot lower it.
      requires_human_review: true,
      decided_at: new Date().toISOString(),
    })
    .eq("id", matchId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  const approval = await appendApproval(
    supabase,
    matchId,
    userId,
    role,
    "counter",
    { billBefore: billRate, billAfter: billRate, payBefore, payAfter },
    cleanNote,
  );
  if (!approval.ok) {
    return { ok: false, error: `The counter was applied but the approval record failed: ${approval.error}` };
  }

  await recordTalentAudit(
    role,
    "update",
    "talent_match",
    matchId,
    userId,
    `Countered the pay rate from ${payBefore} to ${payAfter}`,
    { pay_rate: payBefore, spread: match.spread, floor_ok: match.floor_ok, status: match.status },
    { pay_rate: payAfter, spread: money.spread, floor_ok: money.floorOk, status: "counter_proposed", note: cleanNote },
  );
  await logActivity(
    supabase,
    buildActivityEntry(
      "Margin Agent",
      "match.countered",
      2,
      `Countered pay at ${payAfter} for a ${money.spread} spread`,
      { actorId: userId, matchId, jobOrderId: match.job_order_id, candidateId: match.candidate_id },
    ),
  );

  revalidateTalent();
  return { ok: true };
}

/**
 * Everything that must be true before a candidate is put in front of a client.
 * Shared by submitMatch() and createPlacement() so a placement cannot be used
 * as a back door around the certification gate.
 */
async function assertSubmittable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  match: any,
): Promise<{ ok: boolean; error?: string }> {
  const { data: jobOrder } = await supabase
    .from(tables.jobOrders)
    .select("id, title, cert_requirements, min_spread")
    .eq("id", match.job_order_id)
    .maybeSingle();
  const { data: candidate } = await supabase
    .from(tables.candidates)
    .select("id, full_name, verified_certifications")
    .eq("id", match.candidate_id)
    .maybeSingle();
  if (!jobOrder || !candidate) return { ok: false, error: NO_ROWS_MESSAGE };

  // Blueprint guardrail: an unverified required certification BLOCKS submittal.
  const missing = missingRequiredCerts(
    Array.isArray(jobOrder.cert_requirements) ? jobOrder.cert_requirements : [],
    Array.isArray(candidate.verified_certifications) ? candidate.verified_certifications : [],
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Cannot submit: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required by "${jobOrder.title}" and has not been verified.`,
    };
  }

  // Money guardrail: a below-floor spread needs a recorded human approval.
  const settings = await loadTalentSettings(supabase);
  const floor = resolveFloor(jobOrder.min_spread, settings);
  if (!meetsSpreadFloor(Number(match.bill_rate) || 0, Number(match.pay_rate) || 0, floor)) {
    const { data: approvals } = await supabase
      .from(tables.approvals)
      .select("id")
      .eq("match_id", match.id)
      .eq("decision", "approve")
      .limit(1);
    if (!Array.isArray(approvals) || approvals.length === 0) {
      return {
        ok: false,
        error: `Cannot submit: the spread is under the ${floor} floor and no approval is on record for this match.`,
      };
    }
  }

  return { ok: true };
}

export async function submitMatch(matchId: string): Promise<ActionResult> {
  const { supabase, userId, canRead, canApprove, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canApprove) return { ok: false, error: "You do not have permission to submit candidates to clients." };
  if (!isTalentUuid(matchId)) return { ok: false, error: "Missing or invalid match id." };

  const match = await loadMatch(supabase, matchId);
  if (!match) return { ok: false, error: NO_ROWS_MESSAGE };

  const gate = canTransitionMatch(match.status as MatchStatus, "submitted");
  if (!gate.ok) return { ok: false, error: gate.reason };

  const submittable = await assertSubmittable(supabase, match);
  if (!submittable.ok) return { ok: false, error: submittable.error };

  const { data: updated, error } = await supabase
    .from(tables.matches)
    .update({ status: "submitted", decided_at: new Date().toISOString() })
    .eq("id", matchId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordTalentAudit(
    role,
    "update",
    "talent_match",
    matchId,
    userId,
    "Submitted a candidate to the client",
    { status: match.status },
    { status: "submitted", bill_rate: match.bill_rate, pay_rate: match.pay_rate, spread: match.spread },
  );
  await logActivity(
    supabase,
    buildActivityEntry(null, "match.submitted", 3, "Submitted the candidate to the client", {
      actorType: "human",
      actorId: userId,
      matchId,
      jobOrderId: match.job_order_id,
      candidateId: match.candidate_id,
    }),
  );

  revalidateTalent();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Placements + timesheets
// ---------------------------------------------------------------------------

/**
 * Opens a placement — the Tier-3, human-only commitment where the spread starts
 * being realised. The rates are copied off the MATCH, which is the row a human
 * approved; nothing about the money comes from the caller.
 */
export async function createPlacement(
  matchId: string,
  startDate: string,
): Promise<ActionResult & { placementId?: string }> {
  const { supabase, userId, canRead, canManagePlacements, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canManagePlacements) return { ok: false, error: "You do not have permission to open placements." };
  if (!isTalentUuid(matchId)) return { ok: false, error: "Missing or invalid match id." };
  if (!isCalendarDate(startDate)) {
    return { ok: false, error: "Start date must be a real date (YYYY-MM-DD).", fieldErrors: { startDate: "Start date must be a real date (YYYY-MM-DD)." } };
  }

  const match = await loadMatch(supabase, matchId);
  if (!match) return { ok: false, error: NO_ROWS_MESSAGE };
  if (match.status !== "submitted" && match.status !== "approved") {
    return { ok: false, error: `Only a submitted or approved match can be placed — this one is ${match.status}.` };
  }

  // An `approved` match reaches `placed` through `submitted`; both hops are
  // validated, and the submittal guardrails are re-run either way so a
  // placement can never be the back door around them.
  const hops: MatchStatus[] =
    match.status === "approved" ? ["submitted", "placed"] : ["placed"];
  let cursor = match.status as MatchStatus;
  for (const hop of hops) {
    const gate = canTransitionMatch(cursor, hop);
    if (!gate.ok) return { ok: false, error: gate.reason };
    cursor = hop;
  }

  const submittable = await assertSubmittable(supabase, match);
  if (!submittable.ok) return { ok: false, error: submittable.error };

  const billRate = roundMoney(match.bill_rate);
  const payRate = roundMoney(match.pay_rate);

  const { data: created, error } = await supabase
    .from(tables.placements)
    .insert({
      match_id: matchId,
      job_order_id: match.job_order_id,
      candidate_id: match.candidate_id,
      start_date: startDate.trim(),
      bill_rate: billRate,
      pay_rate: payRate,
      status: "active",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    if (errorCode(error) === UNIQUE_VIOLATION) {
      return { ok: false, error: "That match already has a placement." };
    }
    return { ok: false, error: error?.message ?? "Failed to open the placement." };
  }

  const { data: movedMatch, error: matchError } = await supabase
    .from(tables.matches)
    .update({ status: "placed", decided_at: new Date().toISOString() })
    .eq("id", matchId)
    .select("id");
  if (matchError || !movedMatch || movedMatch.length === 0) {
    return {
      ok: false,
      error: `The placement was created but the match could not be moved to placed: ${matchError?.message ?? NO_ROWS_MESSAGE}`,
    };
  }

  await recordTalentAudit(
    role,
    "create",
    "talent_placement",
    created.id,
    userId,
    `Opened a placement starting ${startDate.trim()} at a ${roundMoney(billRate - payRate)} spread`,
    null,
    { match_id: matchId, bill_rate: billRate, pay_rate: payRate, start_date: startDate.trim() },
  );
  await logActivity(
    supabase,
    buildActivityEntry(
      null,
      "placement.created",
      3,
      `Opened a placement starting ${startDate.trim()} at a ${roundMoney(billRate - payRate)} spread`,
      { actorType: "human", actorId: userId, matchId, jobOrderId: match.job_order_id, candidateId: match.candidate_id },
    ),
  );

  revalidateTalent();
  return { ok: true, placementId: created.id };
}

/**
 * Logs a week of hours against a placement.
 *
 * `amount_billed` and `amount_paid` are computed from the PLACEMENT's stored
 * rates. The caller supplies hours and nothing else — there is no parameter for
 * a rate, and none is read from the payload, so a browser cannot inflate what
 * the client is billed or what the professional is paid.
 */
export async function logTimesheet(
  placementId: string,
  weekStarting: string,
  hours: number,
): Promise<ActionResult & { timesheetId?: string }> {
  const { supabase, userId, canRead, canPropose, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canPropose) return { ok: false, error: "You do not have permission to log timesheets." };
  if (!isTalentUuid(placementId)) return { ok: false, error: "Missing or invalid placement id." };
  if (!isCalendarDate(weekStarting)) {
    return { ok: false, error: "Week starting must be a real date (YYYY-MM-DD)." };
  }
  const hoursCheck = validateHoursInput(hours);
  if (!hoursCheck.ok) return { ok: false, error: hoursCheck.reason, fieldErrors: { hours: hoursCheck.reason ?? "" } };

  const { data: placement } = await supabase
    .from(tables.placements)
    .select("id, match_id, job_order_id, candidate_id, bill_rate, pay_rate, status")
    .eq("id", placementId)
    .maybeSingle();
  if (!placement) return { ok: false, error: NO_ROWS_MESSAGE };
  if (placement.status !== "active") {
    return { ok: false, error: `Only an active placement can take hours — this one is ${placement.status}.` };
  }

  const week = weekStarting.trim();
  const workedHours = roundMoney(hours);
  const billRate = roundMoney(placement.bill_rate);
  const payRate = roundMoney(placement.pay_rate);
  const payload = {
    hours: workedHours,
    bill_rate: billRate,
    pay_rate: payRate,
    amount_billed: roundMoney(workedHours * billRate),
    amount_paid: roundMoney(workedHours * payRate),
  };

  const { data: created, error } = await supabase
    .from(tables.timesheets)
    .insert({ placement_id: placementId, week_starting: week, status: "draft", created_by: userId, ...payload })
    .select("id")
    .single();

  let timesheetId: string | undefined = created?.id;
  if (error) {
    // One timesheet per placement per week — a correction updates in place.
    if (errorCode(error) !== UNIQUE_VIOLATION) return { ok: false, error: error.message };
    const { data: corrected, error: updateError } = await supabase
      .from(tables.timesheets)
      .update(payload)
      .eq("placement_id", placementId)
      .eq("week_starting", week)
      .select("id");
    if (updateError) return { ok: false, error: updateError.message };
    if (!corrected || corrected.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };
    timesheetId = corrected[0].id;
  }
  if (!timesheetId) return { ok: false, error: "Failed to log the timesheet." };

  await recordTalentAudit(
    role,
    "create",
    "talent_timesheet",
    timesheetId,
    userId,
    `Logged ${workedHours} hours for the week of ${week}`,
    null,
    { placement_id: placementId, week_starting: week, ...payload },
  );
  await logActivity(
    supabase,
    buildActivityEntry(
      "Timesheet Agent",
      "timesheet.logged",
      2,
      `Logged ${workedHours} hours for the week of ${week}`,
      {
        actorId: userId,
        matchId: placement.match_id ?? null,
        jobOrderId: placement.job_order_id ?? null,
        candidateId: placement.candidate_id ?? null,
      },
    ),
  );

  revalidateTalent();
  return { ok: true, timesheetId };
}

// ---------------------------------------------------------------------------
// Settings — the money floor
// ---------------------------------------------------------------------------

export interface TalentSettingsPatch {
  minSpreadPerHour?: number;
  targetMarkupPct?: number;
  defaultHoursPerWeek?: number;
  payRateAutonomyTier?: TalentAutonomyTier;
  /** Replaces the vertical/trade list the intake pickers offer. */
  verticalOptions?: string[];
}

/**
 * Changes the agency-level money floor. Admin-only: `min_spread_per_hour` is
 * the number every floor check, every counter-offer and every submittal block
 * in this module is measured against, so lowering it silently re-prices the
 * entire pipeline.
 */
export async function updateTalentSettings(patch: TalentSettingsPatch): Promise<ActionResult> {
  const { supabase, userId, canRead, isAdmin, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!isAdmin) return { ok: false, error: "Admin role required to change the Talent Engine settings." };

  const input = patch ?? {};
  const errors: Record<string, string> = {};
  const update: Record<string, unknown> = {};

  if (input.minSpreadPerHour !== undefined) {
    const check = validateRateInput(input.minSpreadPerHour);
    if (!check.ok) errors.minSpreadPerHour = check.reason ?? "Enter a valid spread floor.";
    else update.min_spread_per_hour = roundMoney(input.minSpreadPerHour);
  }
  if (input.targetMarkupPct !== undefined) {
    const markup = Number(input.targetMarkupPct);
    if (!Number.isFinite(markup) || markup < 0 || markup > maxMarkupPct) {
      errors.targetMarkupPct = `Target markup must be between 0 and ${maxMarkupPct}%.`;
    } else update.target_markup_pct = roundMoney(markup);
  }
  if (input.defaultHoursPerWeek !== undefined) {
    const check = validateHoursInput(input.defaultHoursPerWeek);
    if (!check.ok) errors.defaultHoursPerWeek = check.reason ?? "Enter valid weekly hours.";
    else if (Number(input.defaultHoursPerWeek) <= 0) {
      errors.defaultHoursPerWeek = "Default weekly hours must be greater than zero.";
    } else update.default_hours_per_week = roundMoney(input.defaultHoursPerWeek);
  }
  if (input.payRateAutonomyTier !== undefined) {
    if (!(talentAutonomyTiers as readonly number[]).includes(Number(input.payRateAutonomyTier))) {
      errors.payRateAutonomyTier = "Autonomy tier must be 1, 2, or 3.";
    } else update.pay_rate_autonomy_tier = Number(input.payRateAutonomyTier);
  }
  if (input.verticalOptions !== undefined) {
    if (!Array.isArray(input.verticalOptions)) {
      errors.verticalOptions = "The vertical list must be a list.";
    } else {
      const options = normalizeVerticalOptions(input.verticalOptions);
      if (options.length === 0) {
        errors.verticalOptions = "Keep at least one vertical — the pickers need something to offer.";
      } else {
        update.vertical_options = options;
      }
    }
  }

  const first = firstError(errors);
  if (first) return { ok: false, error: first, fieldErrors: errors };
  if (Object.keys(update).length === 0) return { ok: true };

  const before = await loadTalentSettings(supabase);
  update.updated_by = userId;

  // UPDATE only. `talent_settings` is a migration-seeded singleton — a unique
  // index on the constant `true` blocks a second row and the table carries NO
  // insert policy, so an upsert would fail rather than self-heal. If the row is
  // unreadable, say so instead of writing a second source of truth.
  if (!before.id) {
    return { ok: false, error: "The Talent Engine settings row could not be read, so it cannot be changed." };
  }

  const { data: updated, error } = await supabase
    .from(tables.settings)
    .update(update)
    .eq("id", before.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordTalentAudit(
    role,
    "update",
    "talent_settings",
    before.id,
    userId,
    "Updated the Talent Engine money floor and defaults",
    {
      min_spread_per_hour: before.minSpreadPerHour,
      target_markup_pct: before.targetMarkupPct,
      default_hours_per_week: before.defaultHoursPerWeek,
      pay_rate_autonomy_tier: before.payRateAutonomyTier,
      vertical_options: before.verticalOptions,
    },
    update,
  );
  await logActivity(
    supabase,
    buildActivityEntry(null, "settings.updated", 3, "Updated the Talent Engine money floor and defaults", {
      actorType: "human",
      actorId: userId,
    }),
  );

  revalidateTalent();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Web sourcing — the human review gate on every lead
//
// The Sourcing Agent sweeps the public web and files what it finds in
// `talent_sourcing_leads` with status 'new'. NOTHING it finds becomes a
// candidate, a job order or a match on its own: the four actions below are the
// only door out of that queue, and every one of them needs a signed-in human
// with `canPropose` (the manual sweep needs `canApprove`).
//
// This is the Human Authority Rule applied to sourcing (CLAUDE.md). The AI may
// gather and summarise; a person admits.
//
// PRIVACY / EEO: a lead carries only published professional information. When
// one is accepted, the fields copied across are exactly the ones a recruiter
// would have typed by hand — name/title, claimed certifications, vertical,
// location, a rate signal and the public source URL. Nothing else is copied,
// and `verified_certifications` is NEVER seeded from a lead.
// ---------------------------------------------------------------------------

const sourcingTables = {
  runs: "talent_sourcing_runs",
  leads: "talent_sourcing_leads",
} as const;

const talentLeadsPath = "/employee/talent-engine/leads";

/** The console and the review queue both change when a lead is decided. */
function revalidateSourcing(): void {
  revalidatePath(talentPath);
  revalidatePath(talentLeadsPath);
}

const sourcingLeadColumns =
  "id, run_id, lead_type, title, organization, location, vertical, certifications, rate_signal, " +
  "source_url, summary, status, reviewed_by, reviewed_at, created_record_id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSourcingLead(supabase: any, leadId: string) {
  const { data } = await supabase
    .from(sourcingTables.leads)
    .select(sourcingLeadColumns)
    .eq("id", leadId)
    .maybeSingle();
  return data ?? null;
}

const leadTypeLabels: Record<SourcingRunType, string> = {
  candidates: "candidate",
  job_orders: "job order",
};

/**
 * The provenance note written onto the record an accepted lead creates.
 *
 * The source URL is kept verbatim so a reviewer can always go back to what the
 * agent actually read — an accepted lead must never become an unattributable
 * row that nobody can audit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildLeadProvenance(lead: any): string | null {
  const summary = cleanText(lead?.summary, notesMaxLength);
  const sourceUrl = cleanText(lead?.source_url, notesMaxLength);
  const organization = cleanText(lead?.organization, nameMaxLength);
  const parts = [
    summary,
    organization ? `Organisation: ${organization}` : null,
    sourceUrl ? `Web-sourced lead: ${sourceUrl}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join("\n\n").slice(0, notesMaxLength) : null;
}

/**
 * A scraped rate is a SIGNAL, not a quote. It is re-validated through the same
 * bounds a typed rate goes through, and a malformed one is simply dropped
 * rather than blocking the human's decision.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function leadRateSignal(lead: any): number | null {
  const errors: Record<string, string> = {};
  const rate = toNullableRate(lead?.rate_signal, "rateSignal", errors);
  return firstError(errors) ? null : rate;
}

/**
 * Admits one lead into the pipeline.
 *
 * `canPropose`, not `canApprove`: accepting a lead is the same act as typing a
 * candidate or a job order in by hand, and it lands in exactly the same
 * unapproved state (`sourced` / `open`). What it may NOT do is skip a gate the
 * manual path enforces — so no verified certifications are seeded, and a
 * reviewer without `canSetRate` cannot use a lead to put a client price on a
 * job order.
 */
export async function acceptSourcingLead(leadId: string): Promise<ActionResult & { createdId?: string }> {
  const { supabase, userId, canRead, canPropose, canSetRate, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canPropose) return { ok: false, error: "You do not have permission to review sourcing leads." };
  if (!isTalentUuid(leadId)) return { ok: false, error: "Missing or invalid lead id." };

  const lead = await loadSourcingLead(supabase, leadId);
  if (!lead) return { ok: false, error: NO_ROWS_MESSAGE };

  const gate = canTransitionLead(lead.status as SourcingLeadStatus, "accepted");
  if (!gate.ok) return { ok: false, error: gate.reason };

  const title = cleanText(lead.title, nameMaxLength);
  if (!title) return { ok: false, error: "That lead has nothing to create a record from." };

  const certifications = cleanStringList(lead.certifications);
  const vertical = cleanText(lead.vertical, nameMaxLength);
  const location = cleanText(lead.location, nameMaxLength);
  const notes = buildLeadProvenance(lead);
  const rate = leadRateSignal(lead);

  const leadType: SourcingRunType = lead.lead_type === "job_orders" ? "job_orders" : "candidates";
  const resourceType = leadType === "job_orders" ? "talent_job_order" : "talent_candidate";

  let created: { id: string } | null = null;
  let insertError: { message?: string } | null = null;
  let auditAfter: Record<string, unknown>;

  if (leadType === "job_orders") {
    // The bill rate is the CLIENT PRICE. A reviewer who cannot set rates may
    // admit the order but not price it — the scraped signal is dropped, not
    // smuggled in through the back door.
    const billRate = canSetRate ? rate : null;
    const result = await supabase
      .from(tables.jobOrders)
      .insert({
        title,
        vertical,
        location,
        cert_requirements: certifications,
        bill_rate: billRate,
        status: "open",
        notes,
        created_by: userId,
      })
      .select("id")
      .single();
    created = result.data ?? null;
    insertError = result.error ?? null;
    auditAfter = { title, vertical, cert_requirements: certifications, bill_rate: billRate };
  } else {
    const result = await supabase
      .from(tables.candidates)
      .insert({
        full_name: title,
        certifications,
        // NEVER from a lead. Only verifyCandidateCertification() writes this
        // list, and that needs `canApprove` — a sourced claim is not a
        // verification, and treating it as one would unblock a submittal.
        verified_certifications: [],
        verticals: vertical ? [vertical] : [],
        location,
        pay_expectation: rate,
        status: "sourced",
        notes,
        created_by: userId,
      })
      .select("id")
      .single();
    created = result.data ?? null;
    insertError = result.error ?? null;
    auditAfter = { full_name: title, certifications, verified_certifications: [], pay_expectation: rate };
  }

  if (insertError || !created?.id) {
    return { ok: false, error: insertError?.message ?? `Failed to create the ${leadTypeLabels[leadType]}.` };
  }

  const reviewedAt = new Date().toISOString();
  const { data: reviewed, error: reviewError } = await supabase
    .from(sourcingTables.leads)
    .update({
      status: "accepted",
      reviewed_by: userId,
      reviewed_at: reviewedAt,
      created_record_id: created.id,
    })
    .eq("id", leadId)
    .select("id");
  if (reviewError || !reviewed || reviewed.length === 0) {
    return {
      ok: false,
      error: `The ${leadTypeLabels[leadType]} was created but the lead could not be marked accepted: ${
        reviewError?.message ?? NO_ROWS_MESSAGE
      }`,
    };
  }

  await recordTalentAudit(
    role,
    "create",
    resourceType,
    created.id,
    userId,
    `Accepted a web-sourced ${leadTypeLabels[leadType]} lead: "${title}"`,
    { lead_id: leadId, lead_status: lead.status, source_url: lead.source_url ?? null },
    auditAfter,
  );
  await logActivity(
    supabase,
    buildActivityEntry(null, "sourcing_lead_accepted", 2, `Accepted the sourced ${leadTypeLabels[leadType]} "${title}"`, {
      actorType: "human",
      actorId: userId,
      jobOrderId: leadType === "job_orders" ? created.id : null,
      candidateId: leadType === "candidates" ? created.id : null,
    }),
  );

  revalidateSourcing();
  return { ok: true, createdId: created.id };
}

/** Turns a lead down. Nothing is deleted — the row stays for the audit trail. */
export async function dismissSourcingLead(leadId: string, note?: string): Promise<ActionResult> {
  const { supabase, userId, canRead, canPropose, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canPropose) return { ok: false, error: "You do not have permission to review sourcing leads." };
  if (!isTalentUuid(leadId)) return { ok: false, error: "Missing or invalid lead id." };

  const lead = await loadSourcingLead(supabase, leadId);
  if (!lead) return { ok: false, error: NO_ROWS_MESSAGE };

  const gate = canTransitionLead(lead.status as SourcingLeadStatus, "dismissed");
  if (!gate.ok) return { ok: false, error: gate.reason };

  const cleanNote = cleanText(note, notesMaxLength);
  const title = cleanText(lead.title, nameMaxLength) ?? "an untitled lead";
  const reviewedAt = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from(sourcingTables.leads)
    .update({ status: "dismissed", reviewed_by: userId, reviewed_at: reviewedAt })
    .eq("id", leadId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordTalentAudit(
    role,
    "update",
    "talent_sourcing_lead",
    leadId,
    userId,
    `Dismissed the web-sourced lead "${title}"`,
    { status: lead.status },
    { status: "dismissed", reviewed_by: userId, note: cleanNote },
  );
  await logActivity(
    supabase,
    buildActivityEntry(null, "sourcing_lead_dismissed", 2, cleanNote ?? `Dismissed the sourced lead "${title}"`, {
      actorType: "human",
      actorId: userId,
    }),
  );

  revalidateSourcing();
  return { ok: true };
}

/**
 * Puts a dismissed lead back in the queue.
 *
 * The reviewer stamp is cleared with it: `new` means "awaiting review", and
 * leaving a reviewer's name on a row nobody has decided yet would misreport who
 * looked at it. Who restored it is recorded in the audit event and the feed.
 */
export async function restoreSourcingLead(leadId: string): Promise<ActionResult> {
  const { supabase, userId, canRead, canPropose, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canPropose) return { ok: false, error: "You do not have permission to review sourcing leads." };
  if (!isTalentUuid(leadId)) return { ok: false, error: "Missing or invalid lead id." };

  const lead = await loadSourcingLead(supabase, leadId);
  if (!lead) return { ok: false, error: NO_ROWS_MESSAGE };

  const gate = canTransitionLead(lead.status as SourcingLeadStatus, "new");
  if (!gate.ok) return { ok: false, error: gate.reason };

  const title = cleanText(lead.title, nameMaxLength) ?? "an untitled lead";

  const { data: updated, error } = await supabase
    .from(sourcingTables.leads)
    .update({ status: "new", reviewed_by: null, reviewed_at: null })
    .eq("id", leadId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordTalentAudit(
    role,
    "update",
    "talent_sourcing_lead",
    leadId,
    userId,
    `Restored the web-sourced lead "${title}" to the review queue`,
    { status: lead.status, reviewed_by: lead.reviewed_by ?? null },
    { status: "new", reviewed_by: null },
  );
  await logActivity(
    supabase,
    buildActivityEntry(null, "sourcing_lead_restored", 2, `Restored the sourced lead "${title}"`, {
      actorType: "human",
      actorId: userId,
    }),
  );

  revalidateSourcing();
  return { ok: true };
}

/**
 * Runs the sourcing sweep by hand, outside the twice-weekly schedule.
 *
 * `canApprove`, not `canPropose`: this spends the search budget, writes to the
 * queue every reviewer works from, and is the oversight lever on an autonomous
 * agent — so it sits with the same people who hold the approval gate. It runs
 * on the CALLER's client, so RLS applies exactly as it would to any other write
 * they make; the cron path is the only one that uses the service role.
 */
export async function runSourcingNow(runType: SourcingRunType): Promise<ActionResult & { inserted?: number }> {
  const { supabase, userId, canRead, canApprove, role } = await getTalentAccess();
  if (!supabase || !userId) return { ok: false, error: SIGNED_OUT_MESSAGE };
  if (!canRead) return { ok: false, error: "You do not have access to the Talent Engine." };
  if (!canApprove) return { ok: false, error: "You do not have permission to run the sourcing agent." };
  if (!sourcingRunTypes.includes(runType)) return { ok: false, error: "Unknown sourcing run type." };

  const sweep = await runSourcingSweep(supabase, {
    runTypes: [runType],
    triggeredBy: userId,
    actorId: userId,
  });

  if (sweep.skipped) {
    return { ok: false, error: sweep.message ?? "Talent Engine web sourcing is not set up yet." };
  }

  const run = sweep.runs[0];
  if (!run) return { ok: false, error: "The sourcing run did not start." };

  if (run.runId) {
    await recordTalentAudit(
      role,
      "create",
      "talent_sourcing_run",
      run.runId,
      userId,
      `Ran a ${leadTypeLabels[runType]} web sourcing sweep by hand`,
      null,
      {
        run_type: runType,
        status: run.status,
        leads_found: run.leadsFound,
        leads_inserted: run.leadsInserted,
        error: run.error ?? null,
      },
    );
  }

  // The sweep writes its own activity-feed line (one per run, from the Sourcing
  // Agent), so nothing is logged twice here.
  revalidateSourcing();

  if (run.status === "failed") {
    return { ok: false, error: run.error ?? "The sourcing run failed.", inserted: 0 };
  }
  return { ok: true, inserted: run.leadsInserted };
}
