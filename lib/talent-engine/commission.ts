// Commission and staffing-economics math for the EHS Talent Engine.
//
// Pure functions only — no Supabase, no I/O. The recruiter dashboard, the
// owner's team-economics card and the break-even model all compute through
// here so the three surfaces can never disagree about what a placement pays.
//
// Decisions of record (build review, 2026-08-07):
//   * The recruiter is credited a configurable % (default 5) of each
//     placement's weekly margin; the owner retains the remainder.
//   * Base salary is configurable per person.
//   * The owner back end includes a model that solves salary vs. required
//     placements/hours to break even, with configurable base, spread, hours.

export const defaultCommissionPct = 5;
/** Mirrors the CHECK bounds on talent_commission_plans. */
export const maxCommissionPct = 50;
export const maxBaseSalary = 1_000_000;

const round2 = (value: number): number => Math.round(value * 100) / 100;

function toFinite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** $/week the recruiter earns on one placement's weekly margin. */
export function weeklyCommission(weeklyMargin: number, commissionPct: number): number {
  const margin = Math.max(0, toFinite(weeklyMargin));
  const pct = Math.min(maxCommissionPct, Math.max(0, toFinite(commissionPct)));
  return round2((margin * pct) / 100);
}

/** $/week the margin's owner keeps after the recruiter's cut. */
export function ownerRetainedMargin(weeklyMargin: number, commissionPct: number): number {
  return round2(Math.max(0, toFinite(weeklyMargin)) - weeklyCommission(weeklyMargin, commissionPct));
}

/** An annual base salary as the weekly cost the economics card compares against. */
export function weeklyBaseCost(baseSalary: number): number {
  return round2(Math.max(0, toFinite(baseSalary)) / 52);
}

/** Base + 52 weeks of a given weekly commission — the recruiter's projected year. */
export function projectedAnnualComp(baseSalary: number, weeklyCommissionTotal: number): number {
  return round2(Math.max(0, toFinite(baseSalary)) + Math.max(0, toFinite(weeklyCommissionTotal)) * 52);
}

export interface BreakEvenInput {
  /** Annual base salary being covered, dollars. */
  baseSalary: number;
  /** Spread per hour on a typical placement (bill − pay). */
  spreadPerHour: number;
  /** Billable hours per week per placement. */
  hoursPerWeek: number;
  /** Recruiter's share of the weekly margin, percent. */
  commissionPct: number;
}

export interface BreakEvenResult {
  /** base / 52 — what one week of the salary costs. */
  weeklyCost: number;
  /** spread × hours — gross margin one placement produces in a week. */
  marginPerPlacement: number;
  /** Margin per placement after the recruiter's cut. */
  ownerSharePerPlacement: number;
  /**
   * Whole placements needed for retained margin to cover the weekly salary
   * cost. Null when the inputs can never break even (no spread, no hours, or
   * a 100% giveaway) — the UI says so instead of printing Infinity.
   */
  placementsNeeded: number | null;
  /** placementsNeeded × hoursPerWeek, for the "billable hours" framing. */
  hoursNeeded: number | null;
}

export function solveBreakEven(input: BreakEvenInput): BreakEvenResult {
  const weeklyCost = weeklyBaseCost(input.baseSalary);
  const spread = Math.max(0, toFinite(input.spreadPerHour));
  const hours = Math.max(0, toFinite(input.hoursPerWeek));
  const marginPerPlacement = round2(spread * hours);
  const ownerSharePerPlacement = ownerRetainedMargin(marginPerPlacement, input.commissionPct);

  if (weeklyCost === 0) {
    return { weeklyCost, marginPerPlacement, ownerSharePerPlacement, placementsNeeded: 0, hoursNeeded: 0 };
  }
  if (ownerSharePerPlacement <= 0) {
    return { weeklyCost, marginPerPlacement, ownerSharePerPlacement, placementsNeeded: null, hoursNeeded: null };
  }

  const placementsNeeded = Math.ceil(weeklyCost / ownerSharePerPlacement);
  return {
    weeklyCost,
    marginPerPlacement,
    ownerSharePerPlacement,
    placementsNeeded,
    hoursNeeded: placementsNeeded * hours,
  };
}

/**
 * One recruiter's aggregate for a week: margin their placements produced,
 * their commission on it, their weekly cost (base + commission), and what the
 * owner keeps after paying them.
 */
export interface RecruiterWeekEconomics {
  weeklyMargin: number;
  commission: number;
  weeklyBase: number;
  totalCompCost: number;
  ownerNet: number;
  /** Margin ÷ (base + commission). > 1 means the desk pays for itself. */
  coverageRatio: number | null;
}

export function recruiterWeekEconomics(
  weeklyMargin: number,
  plan: { base_salary: number; commission_pct: number },
): RecruiterWeekEconomics {
  const margin = Math.max(0, toFinite(weeklyMargin));
  const commission = weeklyCommission(margin, plan.commission_pct);
  const weeklyBase = weeklyBaseCost(plan.base_salary);
  const totalCompCost = round2(weeklyBase + commission);
  return {
    weeklyMargin: round2(margin),
    commission,
    weeklyBase,
    totalCompCost,
    ownerNet: round2(margin - totalCompCost),
    coverageRatio: totalCompCost > 0 ? Math.round((margin / totalCompCost) * 100) / 100 : null,
  };
}
