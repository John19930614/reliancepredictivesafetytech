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
 * Volume discount bands, charged MARGINALLY — like tax brackets.
 *
 * The first 250 heads are charged in full, the next 750 at 90%, and so on. This
 * has to be marginal rather than a whole-population factor: applying the band
 * factor to everyone makes each threshold a cliff, so a company that hires ONE
 * more person is quoted less than it was — up to $130,000 less at the 5,000
 * mark. A client who grows should never get a smaller number, and a salesperson
 * should never be able to lower a quote by rounding headcount up.
 */
const volumeBands: ReadonlyArray<{ upTo: number; factor: number }> = [
  { upTo: 250, factor: 1 },
  { upTo: 1_000, factor: 0.9 },
  { upTo: 5_000, factor: 0.8 },
  { upTo: Number.POSITIVE_INFINITY, factor: 0.7 },
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

/**
 * The headcount charge, with the volume discount applied MARGINALLY.
 *
 * Each band prices only the heads that fall inside it, so the curve is
 * continuous and strictly increasing: employee 250 costs 90% of a full head
 * rather than re-pricing the 249 before them, and the total can never fall as
 * the population grows.
 */
export function headcountCharge(employeeCount: number, perHead: number): number {
  let total = 0;
  let counted = 0;

  for (const band of volumeBands) {
    if (employeeCount <= counted) break;
    const inBand = Math.min(employeeCount, band.upTo) - counted;
    total += inBand * perHead * band.factor;
    counted += inBand;
  }

  return Math.round(total);
}

/**
 * The BLENDED per-head rate actually charged, for the driver text.
 *
 * Reported rather than the band factor, because "250 employees at an average of
 * $164/head" is the number a reader can multiply out; a marginal band table is
 * not.
 */
export function blendedRate(employeeCount: number, perHead: number): number {
  if (employeeCount <= 0) return perHead;
  return headcountCharge(employeeCount, perHead) / employeeCount;
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
  input: ContractEstimateInput | null | undefined,
  currency = "USD",
): ContractEstimate {
  // `estimateContractValue(client.profile)` is the obvious call site, and a
  // company with no profile row yet has none. Taking out the render is a worse
  // answer than "no estimate".
  const given = input ?? {};
  const employees = clampInt(given.employeeCount, 1, maxEmployees);
  const missing = missingFields(given);

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

  const hazard = isHazardClass(given.hazardClass) ? given.hazardClass : defaultHazard;
  const perHead = perEmployeeByHazard[hazard];
  const headcountValue = headcountCharge(employees, perHead);
  const rate = blendedRate(employees, perHead);

  const sites = siteSurcharge(given.siteCount);
  const loss = lossRecordMultiplier(given.emr, given.trir);
  const contractor = contractorMultiplier(given.contractorSharePct);

  const beforeFloor = Math.round((headcountValue + sites) * loss * contractor);
  const ceiling = revenueCeiling(given.annualRevenue);

  let mid = Math.max(engagementFloor, beforeFloor);

  // Revenue is a ceiling, never a driver — a company cannot spend what it does
  // not earn, however many people it employs.
  //
  // The flag says the cap CHANGED the answer, not merely that it was computed.
  // When the ceiling lands under the engagement floor the floor wins, so the
  // quote was not capped by revenue at all, and claiming it was would have the
  // screen state a cap of $3,000 directly above a quote of $6,000.
  const cappedByRevenue = ceiling !== null && ceiling < mid && ceiling > engagementFloor;
  if (cappedByRevenue) mid = ceiling;

  // The floor and the ceiling bound the whole QUOTE, not just its midpoint.
  // A `low` under the stated minimum, or a `high` 20% over the stated ceiling,
  // contradicts the driver text sitting beside it — and a client anchors on the
  // end of the band that suits them.
  const rawLow = roundTo(mid * (1 - bandWidth), 500);
  const rawHigh = roundTo(mid * (1 + bandWidth), 500);
  const low = Math.max(engagementFloor, rawLow);
  const high = ceiling !== null ? Math.max(mid, Math.min(ceiling, rawHigh)) : rawHigh;

  const drivers: EstimateDriver[] = [
    {
      label: "Headcount",
      detail: `${employees.toLocaleString("en-US")} employees at an average of ${formatUsd(rate)}/head (${hazard} hazard${
        rate < perHead ? `, ${formatUsd(perHead)} before the marginal volume discount` : ""
      })`,
      amount: headcountValue,
    },
  ];

  if (sites > 0) {
    drivers.push({
      label: "Sites",
      detail: `${clampInt(given.siteCount, 1, maxSites)} locations — coordination beyond the first, charged sub-linearly`,
      amount: sites,
    });
  }
  if (loss !== 1) {
    drivers.push({
      label: "Loss record",
      detail:
        loss > 1
          ? `EMR ${fmt(given.emr)} / TRIR ${fmt(given.trir)} are above average — the need is demonstrated and the insurance saving is bankable`
          : `EMR ${fmt(given.emr)} / TRIR ${fmt(given.trir)} are better than average — a smaller, harder sale`,
      multiplier: round2(loss),
    });
  }
  if (contractor !== 1) {
    drivers.push({
      label: "Contract labour",
      detail: `${Math.round(clamp(given.contractorSharePct ?? 0, 0, 100))}% of the workforce turns over — orientation and verification repeat`,
      multiplier: round2(contractor),
    });
  }
  if (cappedByRevenue) {
    drivers.push({
      label: "Revenue ceiling",
      detail: `Capped at ${Math.round(revenueCeilingShare * 100)}% of ${formatUsd(given.annualRevenue ?? 0)} annual revenue`,
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
    low,
    mid: roundTo(mid, 500),
    high,
    currency,
    confidence: confidenceFor(given),
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

      const numeric = value as number | null | undefined;
      if (!isFiniteNumber(numeric)) return true;

      // The database stores 0 for these quite happily, but the estimator cannot
      // use them: a company with 0 employees is not a company, and an EMR or
      // site count of 0 is a blank someone typed a zero into. Counting them as
      // PRESENT was the bug — the estimate then refused with a gap list that
      // omitted the very field causing the refusal, so nobody could fix it.
      if (key === "employeeCount" || key === "siteCount" || key === "emr") return numeric <= 0;
      return false;
    })
    .map(({ label }) => label);
}

/**
 * Confidence is a statement about the INPUTS, not the arithmetic.
 *
 * Headcount alone is a guess dressed as a number, so it never rates above low.
 */
function confidenceFor(input: ContractEstimateInput): ContractEstimate["confidence"] {
  if (missingFields(input).includes("Number of employees")) return "none";

  // Derived from the same rule as missingFields, so a 0 cannot buy confidence
  // it did not earn.
  const gaps = new Set(missingFields(input));
  const hasHazard = !gaps.has("Hazard class of the work");
  const hasSites = !gaps.has("Number of locations");
  const hasLoss =
    !gaps.has("EMR (experience modification rate)") || !gaps.has("TRIR (recordable incident rate)");

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
