// Utilization / dead-time detection for the EHS Talent Engine.
//
// Pure functions only. Build-review spec (2026-08-07): "The system shall
// track billable time / utilization per worker (on-site hours and submitted
// reports) and flag unbilled 'dead' time." The meeting's framing: the team
// cannot afford to pay people to sit idle, so a placement that is active but
// not producing logged hours must be LOUD, not a quiet zero in a rollup.
//
// The inputs are the console's own reads — active placements and the settled
// ledger week's timesheet hours — so the flags always agree with the Margin
// Ledger about which week is being judged.

export interface UtilizationPlacement {
  placement_id: string;
  candidate_name: string;
  client_name: string;
  /** Hours logged for the settled week. 0 when no timesheet exists. */
  logged_hours: number;
}

export type DeadTimeKind = "no_hours" | "under_hours";

export interface DeadTimeFlag extends UtilizationPlacement {
  kind: DeadTimeKind;
  expected_hours: number;
  /** expected − logged, the hours being paid for without billing. */
  deficit_hours: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

function toFinite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Flags active placements whose settled-week hours fall short of the expected
 * week. No timesheet at all is the loudest case; a short week is the quieter
 * one. Sorted worst-first so the biggest hole tops the card.
 */
export function findDeadTime(
  placements: UtilizationPlacement[],
  expectedHoursPerWeek: number,
): DeadTimeFlag[] {
  const expected = toFinite(expectedHoursPerWeek);
  if (expected === 0) return [];

  const flags: DeadTimeFlag[] = [];
  for (const placement of placements) {
    const logged = toFinite(placement.logged_hours);
    if (logged >= expected) continue;
    flags.push({
      ...placement,
      logged_hours: round1(logged),
      kind: logged === 0 ? "no_hours" : "under_hours",
      expected_hours: expected,
      deficit_hours: round1(expected - logged),
    });
  }
  return flags.sort(
    (a, b) => b.deficit_hours - a.deficit_hours || a.candidate_name.localeCompare(b.candidate_name),
  );
}

/**
 * Overall utilization: logged hours ÷ (active placements × expected hours),
 * as a 0–100+ percentage (overtime can push a book past 100). Null when there
 * is nothing to measure — the card renders an empty state, not "0%".
 */
export function utilizationPct(
  placements: UtilizationPlacement[],
  expectedHoursPerWeek: number,
): number | null {
  const expected = toFinite(expectedHoursPerWeek);
  if (expected === 0 || placements.length === 0) return null;
  const logged = placements.reduce((sum, placement) => sum + toFinite(placement.logged_hours), 0);
  return Math.round((logged / (placements.length * expected)) * 1000) / 10;
}
