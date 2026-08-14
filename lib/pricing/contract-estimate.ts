// What a safety contract is worth, estimated from the company's own profile.
//
// PURE. No I/O, no server-only import, no AI. Every number below is arithmetic
// on the profile, so the same inputs always produce the same estimate and a
// salesperson can be shown exactly how it was derived. The AI layer sits ON TOP
// of this and explains the result — it does not produce the number.
//
// WHY A FORMULA RATHER THAN A MODEL. An estimate a client eventually sees has
// to be defensible: "why is it $84,000" must have an answer better than "the
// model said so". A formula is also testable, free to run, and cannot invent a
// price. The cost is that it is blunt on odd-shaped companies, which is exactly
// what the AI narrative and the `missing` list are for.
//
// WHAT DRIVES PRICE FOR A SAFETY VENDOR. Not revenue — revenue is a rough proxy
// for size and nothing else. The real drivers are:
//
//   headcount  — every worker is a person to train, track and keep safe
//   sites      — each location is its own inspection, its own culture, its own
//                regulator visit; coordination cost grows with sites, but
//                sub-linearly, because the programme is written once
//   hazard     — a roofing contractor and an accounting firm with identical
//                headcount are not the same job
//   loss record— EMR and TRIR say how much pain the company is already in.
//                A poor record RAISES the value: the need is proven, the
//                insurance saving is bankable, and the buyer knows it.
//
// Revenue is used only as a sanity ceiling, never as a driver — see
// `revenueCeiling` below.

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/** How dangerous the work is. Drives the per-employee rate. */
export const hazardClasses = ["low", "moderate", "high", "severe"] as const;

export type HazardClass = (typeof hazardClasses)[number];

export function isHazardClass(value: string | null | undefined): value is HazardClass {
  return typeof value === "string" && (hazardClasses as readonly string[]).includes(value);
}

/**
 * The profile fields the estimate reads.
 *
 * Every one is nullable: a lead captured this morning has none of them, and the
 * estimator's job is to say what it can with what it has rather than refuse.
 */
export interface ContractEstimateInput {
  employeeCount?: number | null;
  siteCount?: number | null;
  annualRevenue?: number | null;
  hazardClass?: string | null;
  /** Experience Modification Rate. 1.00 is the industry average. */
  emr?: number | null;
  /** Total Recordable Incident Rate, per 100 workers per year. */
  trir?: number | null;
  /** Share of the workforce that is contract labour, 0-100. */
  contractorSharePct?: number | null;
}

/* -------------------------------------------------------------------------- */
/* Constants — every one of these is a business decision, not a magic number   */
/* -------------------------------------------------------------------------- */

/**
 * Annual programme fee per employee, by hazard class, in USD.
 *
 * Anchored on the low band: a low-hazard office population is largely training
 * and recordkeeping, which is cheap per head. Severe work carries site
 * inspection, competent-person coverage and incident response, which is not.
 */
const perEmployeeByHazard: Record<HazardClass, number> = {
  low: 45,
  moderate: 90,
  high: 165,
  severe: 260,
};

/** Used when nobody has classified the work yet — the middle of the range. */
const defaultHazard: HazardClass = "moderate";

/**
 * Floor per engagement. Below roughly this, the work costs more to run than it
 * bills: onboarding, a named contact and a reporting line all cost the same
 * whether the client has 8 employees or 80.
 */
const engagementFloor = 6_000;

/**
 * Per-site coordination fee, applied to sites BEYOND the first. Sub-linear on
 * purpose — see `siteMultiplier`.
 */
const perAdditionalSite = 2_400;

/**
 * Volume discount bands. Large populations cost less per head to serve because
 * the programme, the templates and the training library are written once.
 */
const volumeBands: ReadonlyArray<{ from: number; factor: number }> = [
  { from: 0, factor: 1 },
  { from: 250, factor: 0.9 },
  { from: 1_000, factor: 0.8 },
  { from: 5_000, factor: 0.7 },
];

/** Estimates are quoted as a band this wide either side of the midpoint. */
const bandWidth = 0.2;

/**
 * A contract almost never exceeds this share of a client's annual revenue. It
 * is a sanity ceiling, not a driver: a 400-person firm on thin margins cannot
 * spend what the headcount maths alone would suggest.
 */
const revenueCeilingShare = 0.03;

/** Guards against a fat-fingered profile driving an absurd number. */
const maxEmployees = 500_000;
const maxSites = 5_000;

/* -------------------------------------------------------------------------- */
/* Multipliers                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Sites beyond the first, charged sub-linearly.
 *
 * A company with 20 sites is not 20× the work of one: the written programme is
 * shared. Square root keeps the curve honest — 4 sites costs ~2 extra units,
 * 16 costs ~4 — rather than pretending sites are free OR charging them flat.
 */
export function siteSurcharge(siteCount: number | null | undefined): number {
  const sites = clampInt(siteCount, 1, maxSites) ?? 1;
  if (sites <= 1) return 0;
  return Math.round(Math.sqrt(sites - 1) * perAdditionalSite);
}

/**
 * The loss-record multiplier, from EMR.
 *
 * EMR 1.00 is the industry average and multiplies by 1. Above average means a
 * worse record, which RAISES the estimate: the need is demonstrated and the
 * insurance saving is real money the buyer can already see. Below 0.80 the
 * company is already good, and the sale is harder and smaller.
 *
 * Clamped hard at both ends — an EMR of 3 is usually a data-entry error, and
 * even when it is real it does not triple what anyone will sign.
 */
export function lossRecordMultiplier(emr: number | null | undefined, trir: number | null | undefined): number {
  let multiplier = 1;

  if (isFiniteNumber(emr) && emr > 0) {
    const clamped = clamp(emr, 0.5, 2.5);
    // ±40% of the distance from average, so EMR 1.5 → 1.2, EMR 0.8 → 0.92.
    multiplier *= 1 + (clamped - 1) * 0.4;
  }

  // TRIR corroborates EMR rather than stacking with it, so its influence is
  // deliberately smaller. 3.0 is roughly the all-industry average.
  if (isFiniteNumber(trir) && trir >= 0) {
    const clamped = clamp(trir, 0, 12);
    multiplier *= 1 + (clamped - 3) * 0.03;
  }

  return clamp(multiplier, 0.75, 1.6);
}

/**
 * Contract labour raises the work: a rotating population needs orientation and
 * verification every time it turns over, and the client owns the liability
 * without owning the training records.
 */
export function contractorMultiplier(sharePct: number | null | undefined): number {
  if (!isFiniteNumber(sharePct)) return 1;
  const share = clamp(sharePct, 0, 100) / 100;
  return 1 + share * 0.25;
}

/** The per-head volume discount for a given population. */
export function volumeFactor(employeeCount: number): number {
  let factor = 1;
  for (const band of volumeBands) {
    if (employeeCount >= band.from) factor = band.factor;
  }
  return factor;
}

/* -------------------------------------------------------------------------- */
/* The estimate                                                                */
/* -------------------------------------------------------------------------- */

/** One line of "why is it this number", for the screen and the AI narrative. */
export interface EstimateDriver {
  label: string;
  detail: string;
  /** Dollar contribution, where the driver adds an amount rather than scaling. */
  amount?: number;
  /** Multiplier applied, where the driver scales instead. */
  multiplier?: number;
}

export interface ContractEstimate {
  /** True when there was enough to compute anything at all. */
  ok: boolean;
  low: number;
  mid: number;
  high: number;
  currency: string;
  /**
   * How much to trust it. Driven by how many inputs are present, NOT by how
   * confident the arithmetic feels — the formula is equally certain either way,
   * and the honest uncertainty is in the data.
   */
  confidence: "none" | "low" | "medium" | "high";
  drivers: EstimateDriver[];
  /** Fields that would sharpen the estimate, most valuable first. */
  missing: string[];
  /** Set when the revenue ceiling bound the result. */
  cappedByRevenue: boolean;
}

/** What the estimator cannot work without. */
const requiredField = "employeeCount";

/**
 * Estimates the annual contract value.
 *
 * Headcount is the one field with no substitute — everything else scales or
 * corroborates it, so without it there is no estimate, only a prompt for the
 * number that would produce one.
 */
export function estimateContractValue(
  input: ContractEstimateInput,
  currency = "USD",
): ContractEstimate {
  const employees = clampInt(input.employeeCount, 1, maxEmployees);
  const missing = missingFields(input);

  if (employees === null) {
    return {
      ok: false,
      low: 0,
      mid: 0,
      high: 0,
      currency,
      confidence: "none",
      drivers: [],
      missing,
      cappedByRevenue: false,
    };
  }

  const hazard = isHazardClass(input.hazardClass) ? input.hazardClass : defaultHazard;
  const perHead = perEmployeeByHazard[hazard];
  const volume = volumeFactor(employees);
  const headcountValue = Math.round(employees * perHead * volume);

  const sites = siteSurcharge(input.siteCount);
  const loss = lossRecordMultiplier(input.emr, input.trir);
  const contractor = contractorMultiplier(input.contractorSharePct);

  const beforeFloor = Math.round((headcountValue + sites) * loss * contractor);
  let mid = Math.max(engagementFloor, beforeFloor);

  // Revenue is a ceiling, never a driver — a company cannot spend what it does
  // not earn, however many people it employs.
  let cappedByRevenue = false;
  const ceiling = revenueCeiling(input.annualRevenue);
  if (ceiling !== null && mid > ceiling) {
    // Never below the floor: if even the ceiling is under it, the engagement is
    // too small to run, and saying so is more useful than quoting an
    // uneconomic number.
    mid = Math.max(engagementFloor, ceiling);
    cappedByRevenue = true;
  }

  const drivers: EstimateDriver[] = [
    {
      label: "Headcount",
      detail: `${employees.toLocaleString("en-US")} employees at ${formatUsd(perHead)}/head (${hazard} hazard)${
        volume < 1 ? `, less a ${Math.round((1 - volume) * 100)}% volume discount` : ""
      }`,
      amount: headcountValue,
    },
  ];

  if (sites > 0) {
    drivers.push({
      label: "Sites",
      detail: `${clampInt(input.siteCount, 1, maxSites)} locations — coordination beyond the first, charged sub-linearly`,
      amount: sites,
    });
  }
  if (loss !== 1) {
    drivers.push({
      label: "Loss record",
      detail:
        loss > 1
          ? `EMR ${fmt(input.emr)} / TRIR ${fmt(input.trir)} are above average — the need is demonstrated and the insurance saving is bankable`
          : `EMR ${fmt(input.emr)} / TRIR ${fmt(input.trir)} are better than average — a smaller, harder sale`,
      multiplier: round2(loss),
    });
  }
  if (contractor !== 1) {
    drivers.push({
      label: "Contract labour",
      detail: `${Math.round(clamp(input.contractorSharePct ?? 0, 0, 100))}% of the workforce turns over — orientation and verification repeat`,
      multiplier: round2(contractor),
    });
  }
  if (cappedByRevenue) {
    drivers.push({
      label: "Revenue ceiling",
      detail: `Capped at ${Math.round(revenueCeilingShare * 100)}% of ${formatUsd(input.annualRevenue ?? 0)} annual revenue`,
    });
  }
  if (mid === engagementFloor && beforeFloor < engagementFloor) {
    drivers.push({
      label: "Engagement floor",
      detail: `Raised to the ${formatUsd(engagementFloor)} minimum — below this the programme costs more to run than it bills`,
    });
  }

  return {
    ok: true,
    low: roundTo(mid * (1 - bandWidth), 500),
    mid: roundTo(mid, 500),
    high: roundTo(mid * (1 + bandWidth), 500),
    currency,
    confidence: confidenceFor(input),
    drivers,
    missing,
    cappedByRevenue,
  };
}

/* -------------------------------------------------------------------------- */
/* Confidence and gaps                                                         */
/* -------------------------------------------------------------------------- */

/** Ordered by how much each would move the estimate. */
const gapLabels: ReadonlyArray<{ key: keyof ContractEstimateInput; label: string }> = [
  { key: "employeeCount", label: "Number of employees" },
  { key: "hazardClass", label: "Hazard class of the work" },
  { key: "siteCount", label: "Number of locations" },
  { key: "emr", label: "EMR (experience modification rate)" },
  { key: "trir", label: "TRIR (recordable incident rate)" },
  { key: "annualRevenue", label: "Annual revenue" },
  { key: "contractorSharePct", label: "Share of contract labour" },
];

export function missingFields(input: ContractEstimateInput): string[] {
  return gapLabels
    .filter(({ key }) => {
      const value = input[key];
      if (key === "hazardClass") return !isHazardClass(value as string | null | undefined);
      return !isFiniteNumber(value as number | null | undefined);
    })
    .map(({ label }) => label);
}

/**
 * Confidence is a statement about the INPUTS, not the arithmetic.
 *
 * Headcount alone is a guess dressed as a number, so it never rates above low.
 */
function confidenceFor(input: ContractEstimateInput): ContractEstimate["confidence"] {
  if (!isFiniteNumber(input.employeeCount)) return "none";

  const hasHazard = isHazardClass(input.hazardClass);
  const hasSites = isFiniteNumber(input.siteCount);
  const hasLoss = isFiniteNumber(input.emr) || isFiniteNumber(input.trir);

  if (hasHazard && hasSites && hasLoss) return "high";
  if (hasHazard && (hasSites || hasLoss)) return "medium";
  return "low";
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

function revenueCeiling(annualRevenue: number | null | undefined): number | null {
  if (!isFiniteNumber(annualRevenue) || annualRevenue <= 0) return null;
  return Math.round(annualRevenue * revenueCeilingShare);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Whole number within bounds, or null when absent or nonsensical. */
function clampInt(value: number | null | undefined, min: number, max: number): number | null {
  if (!isFiniteNumber(value)) return null;
  const rounded = Math.round(value);
  if (rounded < min) return null;
  return Math.min(max, rounded);
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fmt(value: number | null | undefined): string {
  return isFiniteNumber(value) ? String(round2(value)) : "—";
}

function formatUsd(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
