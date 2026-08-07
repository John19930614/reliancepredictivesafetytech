// EHS Talent Engine — weighted match scoring.
//
// Pure module: no server imports, no network, no Supabase, no clock of its own
// (the caller passes `now`). Everything here is a deterministic function of its
// arguments so the money-relevant half of a match decision can be unit-tested
// directly and reproduced from an activity-log row.
//
// ===========================================================================
// EEO GUARDRAIL (blueprint §6) — NON-NEGOTIABLE
// ===========================================================================
// `MatchScoringInput` is the ENTIRE surface the scorer can see, and it carries
// ONLY job-relevant attributes: rates, the agency spread floor, certifications,
// years of experience, industry verticals, work location / relocation
// willingness, and availability dates.
//
// The following are DELIBERATELY EXCLUDED and must never be added to this
// interface, to any scoring signal, or to any weight:
//
//     name, email, phone, date of birth / age, gender, race, ethnicity,
//     national origin, citizenship, marital or family status, disability,
//     veteran status, religion, photo / avatar, or any free-text notes field
//     that could smuggle one of the above in.
//
// A protected characteristic that never reaches the scorer cannot influence a
// score, and cannot be reverse-engineered out of one. `toScoringInput()` below
// is the projection boundary: server actions hand it whole candidate and job
// order rows (which DO contain `full_name`, `email`, `phone`) and it returns a
// value containing none of them. Scoring is never called on a raw row.
//
// `matchScoringInputKeys` is the machine-checkable allow-list; a compile-time
// assertion below and a test in scoring.test.ts both fail if the interface and
// the allow-list ever drift apart.
// ===========================================================================

import { defaultMinSpreadPerHour, type CandidateRow, type JobOrderRow } from "./types";

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

export const scoringSignals = ["spread", "certification", "experience", "location", "availability"] as const;
export type ScoringSignal = (typeof scoringSignals)[number];

export type ScoringWeights = Record<ScoringSignal, number>;

/**
 * Blueprint default weighting. Tunable: pass a different object to
 * `scoreMatch()`. Weights are normalised by their own sum at scoring time, so a
 * partial or unnormalised override still produces a 0..100 total.
 */
export const talentScoringWeights: ScoringWeights = {
  spread: 0.3,
  certification: 0.25,
  experience: 0.2,
  location: 0.15,
  availability: 0.1,
};

// ---------------------------------------------------------------------------
// Tuning constants — named so a score can be explained to a human reviewer
// ---------------------------------------------------------------------------

/** A spread sitting exactly on the floor is acceptable, not excellent. */
export const spreadFloorScore = 60;
/** Credit for a required certification the candidate claims but nobody verified. */
export const unverifiedCertCredit = 0.5;
/** Flat deduction per required certification the candidate does not hold at all. */
export const missingCertPenalty = 20;
/** Years of experience treated as "fully seasoned" when the order states no minimum. */
export const defaultBenchmarkYears = 10;
/** Availability this many days after the requested start scores zero. */
export const availabilityGraceDays = 30;

// ---------------------------------------------------------------------------
// Input — the EEO allow-list
// ---------------------------------------------------------------------------

export interface MatchScoringInput {
  /** What the client is billed per hour. */
  billRate: number;
  /** What the EHS professional is paid per hour. */
  payRate: number;
  /** Agency minimum spread per hour (talent_settings / job order override). */
  spreadFloor: number;
  /** Certifications the job order requires. */
  requiredCertifications: string[];
  /** Certifications the candidate claims. */
  heldCertifications: string[];
  /** Subset of the above confirmed by a human/verification agent. */
  verifiedCertifications: string[];
  yearsExperience: number | null;
  /** Minimum years the order asks for, when it states one. */
  requiredYears: number | null;
  candidateVerticals: string[];
  orderVertical: string | null;
  candidateLocation: string | null;
  orderLocation: string | null;
  willingToRelocate: boolean;
  /** ISO date the candidate can start. */
  availabilityDate: string | null;
  /** ISO date the order wants them on site. */
  orderStartDate: string | null;
}

/**
 * The allow-list, in interface order. Kept in sync with `MatchScoringInput` by
 * the compile-time assertion below AND by a test — if someone adds `age` or
 * `fullName` to the interface, both break.
 */
export const matchScoringInputKeys = [
  "billRate",
  "payRate",
  "spreadFloor",
  "requiredCertifications",
  "heldCertifications",
  "verifiedCertifications",
  "yearsExperience",
  "requiredYears",
  "candidateVerticals",
  "orderVertical",
  "candidateLocation",
  "orderLocation",
  "willingToRelocate",
  "availabilityDate",
  "orderStartDate",
] as const;

export type MatchScoringInputKey = (typeof matchScoringInputKeys)[number];

// Compile-time proof that the allow-list and the interface describe the same
// key set in both directions. `never` on either side is a type error.
type MissingFromAllowList = Exclude<keyof MatchScoringInput, MatchScoringInputKey>;
type ExtraInAllowList = Exclude<MatchScoringInputKey, keyof MatchScoringInput>;
type AssertNever<T extends never> = T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AllowListIsExact = [AssertNever<MissingFromAllowList>, AssertNever<ExtraInAllowList>];

export interface MatchScoreResult {
  /** 0..100, integer. */
  total: number;
  breakdown: Record<ScoringSignal, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Case/whitespace-insensitive key for comparing free-text certs and verticals. */
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

/** Parses an ISO date (or timestamp) to UTC-midnight ms, or null. */
function parseDay(value: string | Date | null | undefined): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isNaN(time)) return null;
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(parsed)) return null;
  // Rejects rolled-over impossible dates (2026-02-30).
  return new Date(parsed).toISOString().slice(0, 10) === `${year}-${month}-${day}` ? parsed : null;
}

const dayMs = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * Spread / margin fit. Below the floor is a hard zero — a match that loses the
 * agency money is not a "slightly worse" match, it is not a match. Sitting
 * exactly on the floor scores `spreadFloorScore`; the remaining headroom is
 * earned as the spread grows, reaching 100 at twice the floor.
 */
export function scoreSpreadFit(billRate: number, payRate: number, floor: number): number {
  const bill = num(billRate);
  const pay = num(payRate);
  if (bill === null || pay === null) return 0;

  const rawFloor = num(floor);
  const effectiveFloor = rawFloor !== null && rawFloor > 0 ? rawFloor : 0;
  const spread = bill - pay;
  if (spread < effectiveFloor) return 0;

  // With no meaningful floor there is no headroom to measure against, so fall
  // back to the agency default rather than dividing by zero.
  const headroom = effectiveFloor > 0 ? effectiveFloor : defaultMinSpreadPerHour;
  const surplus = Math.min(1, (spread - effectiveFloor) / headroom);
  return clamp(Math.round(spreadFloorScore + (100 - spreadFloorScore) * surplus));
}

/**
 * Certification fit. Verified certs earn full credit, held-but-unverified certs
 * earn partial credit (they can still be verified before submittal), and a
 * required cert the candidate does not hold at all takes a flat penalty on top
 * of scoring nothing — an unqualified submittal is the expensive mistake this
 * module exists to prevent. No required certs means nothing to fail on: 100.
 */
export function scoreCertificationFit(required: string[], held: string[], verified: string[]): number {
  const requiredTokens = [...tokenSet(required)];
  if (requiredTokens.length === 0) return 100;

  const heldSet = tokenSet(held);
  const verifiedSet = tokenSet(verified);

  let credit = 0;
  let missing = 0;
  for (const token of requiredTokens) {
    if (verifiedSet.has(token)) credit += 1;
    else if (heldSet.has(token)) credit += unverifiedCertCredit;
    else missing += 1;
  }

  const base = (credit / requiredTokens.length) * 100;
  return clamp(Math.round(base - missing * missingCertPenalty));
}

/**
 * Experience fit: 70% years-of-experience, 30% vertical overlap. When the order
 * states no minimum the years component is scored against
 * `defaultBenchmarkYears` from a generous base, because "unspecified" must not
 * read as "failed".
 */
export function scoreExperienceFit(
  yearsExperience: number | null,
  requiredYears: number | null,
  candidateVerticals: string[],
  orderVertical: string | null,
): number {
  const years = Math.max(0, num(yearsExperience) ?? 0);
  const required = num(requiredYears);

  let yearsScore: number;
  if (required !== null && required > 0) {
    yearsScore = years >= required ? 100 : clamp((years / required) * 100);
  } else {
    yearsScore = clamp(30 + (years / defaultBenchmarkYears) * 70);
  }

  const wanted = normalizeToken(orderVertical);
  const verticalScore = !wanted ? 100 : tokenSet(candidateVerticals).has(wanted) ? 100 : 40;

  return clamp(Math.round(yearsScore * 0.7 + verticalScore * 0.3));
}

/**
 * Location fit. An order with no stated location cannot be failed on location.
 * Same location is a clean 100; a different location is only workable if the
 * candidate said they would relocate, and is scored low otherwise because it is
 * the likeliest reason a placement falls through after submittal.
 */
export function scoreLocationFit(
  candidateLocation: string | null,
  orderLocation: string | null,
  willingToRelocate: boolean,
): number {
  const wanted = normalizeToken(orderLocation);
  if (!wanted) return 100;

  const have = normalizeToken(candidateLocation);
  if (!have) return willingToRelocate ? 70 : 50;
  if (have === wanted) return 100;
  return willingToRelocate ? 70 : 20;
}

/**
 * Availability fit. Available on or before the requested start is 100; every
 * day late decays linearly to 0 at `availabilityGraceDays`. An unknown
 * availability date is neutral (50) rather than disqualifying — it is a data
 * gap, not a candidate flaw.
 */
export function scoreAvailabilityFit(
  availabilityDate: string | null,
  orderStartDate: string | null,
  now: Date = new Date(),
): number {
  const available = parseDay(availabilityDate);
  if (available === null) return 50;

  // With no requested start date, "can they start now?" is the question.
  const target = parseDay(orderStartDate) ?? parseDay(now) ?? available;
  if (available <= target) return 100;

  const daysLate = (available - target) / dayMs;
  return clamp(Math.round(100 - (daysLate / availabilityGraceDays) * 100));
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

export function scoreMatch(
  input: MatchScoringInput,
  weights: ScoringWeights = talentScoringWeights,
  now: Date = new Date(),
): MatchScoreResult {
  const breakdown: Record<ScoringSignal, number> = {
    spread: scoreSpreadFit(input.billRate, input.payRate, input.spreadFloor),
    certification: scoreCertificationFit(
      input.requiredCertifications,
      input.heldCertifications,
      input.verifiedCertifications,
    ),
    experience: scoreExperienceFit(
      input.yearsExperience,
      input.requiredYears,
      input.candidateVerticals,
      input.orderVertical,
    ),
    location: scoreLocationFit(input.candidateLocation, input.orderLocation, input.willingToRelocate),
    availability: scoreAvailabilityFit(input.availabilityDate, input.orderStartDate, now),
  };

  // Normalising by the weight sum keeps a hand-tuned override honest: weights
  // that add up to 0.9 or 1.4 still produce a 0..100 total.
  let weightSum = 0;
  let weighted = 0;
  for (const signal of scoringSignals) {
    const weight = num(weights?.[signal]) ?? 0;
    if (weight <= 0) continue;
    weightSum += weight;
    weighted += weight * breakdown[signal];
  }

  const total = weightSum > 0 ? clamp(Math.round(weighted / weightSum)) : 0;
  return { total, breakdown };
}

// ---------------------------------------------------------------------------
// Projection boundary
// ---------------------------------------------------------------------------

export interface ScoringProjectionArgs {
  /** Only these columns are read — `full_name`, `email` and `phone` are not. */
  candidate: Pick<
    CandidateRow,
    | "certifications"
    | "verified_certifications"
    | "years_experience"
    | "verticals"
    | "location"
    | "willing_to_relocate"
    | "availability_date"
  >;
  jobOrder: Pick<JobOrderRow, "cert_requirements" | "vertical" | "location" | "start_date">;
  billRate: number;
  payRate: number;
  spreadFloor: number;
  /** Job orders carry no minimum-years column today; pass one if that changes. */
  requiredYears?: number | null;
}

/**
 * THE EEO PROJECTION BOUNDARY. Server actions load whole rows — which contain
 * name, email and phone — and hand them here. What comes back is a
 * `MatchScoringInput` containing none of those fields, so the scorer is
 * structurally incapable of seeing them. Never call `scoreMatch()` with an
 * object assembled anywhere else.
 */
export function toScoringInput(args: ScoringProjectionArgs): MatchScoringInput {
  const { candidate, jobOrder } = args;
  return {
    billRate: args.billRate,
    payRate: args.payRate,
    spreadFloor: args.spreadFloor,
    requiredCertifications: jobOrder.cert_requirements ?? [],
    heldCertifications: candidate.certifications ?? [],
    verifiedCertifications: candidate.verified_certifications ?? [],
    yearsExperience: candidate.years_experience ?? null,
    requiredYears: args.requiredYears ?? null,
    candidateVerticals: candidate.verticals ?? [],
    orderVertical: jobOrder.vertical ?? null,
    candidateLocation: candidate.location ?? null,
    orderLocation: jobOrder.location ?? null,
    willingToRelocate: Boolean(candidate.willing_to_relocate),
    availabilityDate: candidate.availability_date ?? null,
    orderStartDate: jobOrder.start_date ?? null,
  };
}
