/**
 * EHS Talent Engine — Placement Desk.
 *
 * MODULE_ID: ehs_talent_engine
 * PATH_PREFIX: /employee/talent-engine  (this route is covered by the module's
 *   prefix grant, exactly as /framework and /leads are — no separate catalog
 *   entry, so nobody needs a second grant to reach the money surface they were
 *   already trusted with.)
 *
 * An async SERVER component. Every read below happens here, on the server,
 * against Supabase; the only client code on the page is the three small islands
 * that call Server Actions (CLAUDE.md: no client-side data mutation, no
 * client-side Supabase reads). Every list query is bounded with .limit() and
 * ordered deterministically so two renders of the same data agree.
 *
 * WHY THIS PAGE EXISTS. The console at /employee/talent-engine ends at the
 * approval gate: a match is approved and then disappears from every screen. The
 * work AFTER the decision — putting the candidate in front of the client,
 * opening the placement, and logging the hours that actually realise the spread
 * — had no surface at all, so the Margin Ledger and every money KPI could only
 * ever read $0. This is that surface, and it is deliberately narrow: it shows
 * what is cleared to place, what is placed, and the floor those numbers are
 * measured against. Nothing else.
 *
 * The money here is never read from the denormalised `spread` / `markup_pct`
 * columns. Those exist so SQL can sort on them; the figures on screen are
 * recomputed from bill_rate and pay_rate through lib/talent-engine/pricing.ts,
 * so an operator is always shown the truth rather than a stale copy.
 *
 * Error boundary: inherited from app/employee/talent-engine/error.tsx, which
 * already scrubs thrown messages (they can carry rates and row ids).
 */

import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, CalendarClock, ClipboardCheck, Send, SlidersHorizontal } from "lucide-react";
import { getTalentAccess } from "@/lib/talent-engine/access";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { missingRequiredCerts } from "@/lib/talent-engine/policy";
import { defaultVerticalOptions, normalizeVerticalOptions } from "@/lib/talent-engine/verticals";
import {
  defaultTalentSettings,
  talentAutonomyTiers,
  type MatchQueueRow,
  type TalentAutonomyTier,
} from "@/lib/talent-engine/types";
import { DeskClearedMatch } from "@/components/talent-engine/DeskClearedMatch";
import { DeskPlacementCard, type DeskPlacementRow, type DeskTimesheetRow } from "@/components/talent-engine/DeskPlacementCard";
import { DeskSettingsPanel } from "@/components/talent-engine/DeskSettingsPanel";
import { TalentCard, TalentEmpty, TalentGateTag } from "@/components/talent-engine/TalentCard";
import { toNumber } from "@/components/talent-engine/format";

export const metadata: Metadata = {
  title: "Talent Engine — Placement Desk",
  description:
    "The post-approval working surface for the EHS Talent Engine: submit approved matches to the client, open placements, and log the weekly hours that realise the spread.",
};

/* -------------------------------------------------------------------------- */
/* Query bounds                                                               */
/* -------------------------------------------------------------------------- */

/** Matches sitting in `approved` / `submitted`, i.e. cleared but not yet placed. */
const clearedLimit = 24;
/** Active placements shown with a timesheet form each. */
const placementLimit = 24;
/** Weeks of history shown per placement, so a double entry is obvious. */
const weeksPerPlacement = 6;

/** The two statuses that mean "a human has cleared this, it is not placed yet". */
const clearedStatuses = ["approved", "submitted"] as const;

/* -------------------------------------------------------------------------- */
/* Read helpers (same contract as the console and the leads page)             */
/* -------------------------------------------------------------------------- */

type QueryError = { code?: string; message?: string } | null;

interface ListResult<T> {
  rows: T[];
  count: number;
  error: QueryError;
}

/**
 * Runs one PostgREST query and normalises the result. A missing table is
 * tolerated on purpose — this module ships behind a migration that has to be
 * rehearsed on staging first, so a deploy can legitimately land ahead of it. In
 * that window the desk shows its setup notice instead of throwing. Any OTHER
 * error is re-thrown so error.tsx reports it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readList<T>(query: any): Promise<ListResult<T>> {
  const result = await query;
  const rows: T[] = Array.isArray(result?.data) ? (result.data as T[]) : [];
  const count = typeof result?.count === "number" ? result.count : rows.length;
  return { rows, count, error: (result?.error ?? null) as QueryError };
}

/**
 * Monday (UTC) of the week containing `now`, as a `YYYY-MM-DD` date key.
 *
 * Byte-for-byte the console's `currentWeekStarting()`: the desk writes the week
 * key that the ledger reads, so the two must agree on where a week starts or a
 * logged week would never appear in the ledger it was logged for.
 */
function currentWeekStarting(now: Date): string {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = day.getUTCDay();
  day.setUTCDate(day.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return day.toISOString().slice(0, 10);
}

/** Today (UTC) as a `YYYY-MM-DD` date key — the default placement start date. */
function todayKey(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

/** "3 waiting" / "1 waiting" — never a bare number in a chip. */
function countChip(count: number, noun: string): string | null {
  if (count <= 0) return null;
  return `${count} ${noun}`;
}

/** Coerces the stored autonomy tier to one the select can actually render. */
function toAutonomyTier(value: unknown): TalentAutonomyTier {
  const tier = Number(value);
  return (talentAutonomyTiers as readonly number[]).includes(tier)
    ? (tier as TalentAutonomyTier)
    : defaultTalentSettings.pay_rate_autonomy_tier;
}

interface SettingsReadRow {
  min_spread_per_hour: number | null;
  target_markup_pct: number | null;
  default_hours_per_week: number | null;
  pay_rate_autonomy_tier: number | null;
  vertical_options: string[] | null;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default async function PlacementDeskPage() {
  const access = await getTalentAccess();
  const { supabase, canRead, canApprove, canPropose, canManagePlacements, isAdmin } = access;

  if (!canRead) {
    return (
      <div className="talent-console">
        <p className="talent-no-access">You do not have access to the Talent Engine.</p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const now = new Date();
  const weekStarting = currentWeekStarting(now);
  const today = todayKey(now);

  const [settingsResult, clearedResult, placementsResult] = await Promise.all([
    readList<SettingsReadRow>(
      db
        .from("talent_settings")
        .select("min_spread_per_hour, target_markup_pct, default_hours_per_week, pay_rate_autonomy_tier, vertical_options")
        .limit(1),
    ),

    // Approved first (it sorts ahead of submitted), because an approved match is
    // the one still owing an action — the submittal that may have failed.
    readList<MatchQueueRow>(
      db
        .from("talent_matches")
        .select(
          "*, job_order:talent_job_orders(id, title, bill_rate, min_spread, cert_requirements, location, client:company_clients(id, name)), candidate:talent_candidates(id, full_name, certifications, verified_certifications, years_experience, pay_expectation, location)",
          { count: "exact" },
        )
        .in("status", clearedStatuses)
        .order("status", { ascending: true })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(clearedLimit),
    ),

    readList<DeskPlacementRow>(
      db
        .from("talent_placements")
        .select(
          "id, bill_rate, pay_rate, start_date, status, candidate:talent_candidates(id, full_name), job_order:talent_job_orders(id, title, min_spread, client:company_clients(id, name))",
          { count: "exact" },
        )
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .order("id", { ascending: true })
        .limit(placementLimit),
    ),
  ]);

  const placements = placementsResult.rows;
  const placementIds = placements.map((placement) => placement.id);

  // Recent weeks for the placements on screen, so the form can show what has
  // already been logged. Bounded by the number of placements actually rendered.
  const timesheetsResult =
    placementIds.length > 0
      ? await readList<DeskTimesheetRow>(
          db
            .from("talent_timesheets")
            // The rate snapshot, not amount_billed / amount_paid: the margin on
            // screen is recomputed through pricing.ts, exactly as the ledger
            // does it, so the two surfaces cannot disagree.
            .select("id, placement_id, week_starting, hours, bill_rate, pay_rate, status")
            .in("placement_id", placementIds)
            .order("week_starting", { ascending: false })
            .order("placement_id", { ascending: true })
            .limit(placementIds.length * weeksPerPlacement),
        )
      : ({ rows: [], count: 0, error: null } as ListResult<DeskTimesheetRow>);

  const results = [settingsResult, clearedResult, placementsResult, timesheetsResult];

  // A table that is not in the schema cache yet means "migration not applied";
  // anything else is a real fault and belongs in error.tsx, not swallowed.
  const schemaMissing = results.some((result) => isMissingSchemaRelationError(result.error));
  const hardError = results.find((result) => result.error && !isMissingSchemaRelationError(result.error));
  if (hardError) {
    throw new Error("The Placement Desk could not read its data.");
  }

  const settings = settingsResult.rows[0] ?? null;
  const minSpread = toNumber(settings?.min_spread_per_hour, defaultTalentSettings.min_spread_per_hour);
  const targetMarkupPct = toNumber(settings?.target_markup_pct, defaultTalentSettings.target_markup_pct);
  const hoursPerWeek =
    toNumber(settings?.default_hours_per_week, defaultTalentSettings.default_hours_per_week) ||
    defaultTalentSettings.default_hours_per_week;
  const autonomyTier = toAutonomyTier(settings?.pay_rate_autonomy_tier);
  const configuredVerticals = normalizeVerticalOptions(settings?.vertical_options ?? []);
  const verticalOptions = configuredVerticals.length > 0 ? configuredVerticals : [...defaultVerticalOptions];

  /* ---- Timesheet weeks, grouped per placement ---------------------------- */

  const weeksByPlacement = new Map<string, DeskTimesheetRow[]>();
  for (const sheet of timesheetsResult.rows) {
    const bucket = weeksByPlacement.get(sheet.placement_id);
    if (bucket) bucket.push(sheet);
    else weeksByPlacement.set(sheet.placement_id, [sheet]);
  }

  const cleared = clearedResult.rows;

  return (
    <div className="talent-console">
      <header className="talent-header">
        <div className="talent-header-id">
          <span className="talent-header-mark" aria-hidden="true">
            <ClipboardCheck size={26} />
          </span>
          <div>
            <h1>Placement Desk</h1>
            <p className="talent-header-sub">After the approval gate · EHS Talent Engine</p>
          </div>
        </div>

        <div className="talent-header-meta">
          <Link className="talent-backlink" href="/employee/talent-engine">
            <ArrowLeft aria-hidden="true" size={15} />
            Back to the live console
          </Link>
        </div>
      </header>

      <section className="talent-desk-intro">
        <p className="talent-desk-lede">
          An approved match leaves the console&apos;s queue and lands here. This is where it is submitted to the
          client, turned into a placement, and where the weekly hours are logged — the spread is only real once
          somebody has actually worked it, so until a timesheet exists the Margin Ledger reads zero on purpose.
        </p>
      </section>

      {schemaMissing ? (
        <p className="success-box portal-alert">
          The EHS Talent Engine tables are not in this environment yet. Apply the latest database migrations and the
          desk will fill in.
        </p>
      ) : null}

      <div className="talent-desk-columns">
        <TalentCard
          count={countChip(clearedResult.count, "waiting")}
          icon={<Send size={15} />}
          tag={<TalentGateTag label="Owed an action" />}
          title="Cleared to place"
        >
          {cleared.length === 0 ? (
            <TalentEmpty
              hint="A match a reviewer approves on the console arrives here so it can be submitted to the client and turned into a placement. Approve one from the match queue and it will show up."
              title="Nothing is cleared to place"
            />
          ) : (
            <div className="talent-desk-list">
              {cleared.map((match) => (
                <DeskClearedMatch
                  canApprove={canApprove}
                  canManagePlacements={canManagePlacements}
                  hoursPerWeek={hoursPerWeek}
                  key={match.id}
                  match={match}
                  minSpread={minSpread}
                  missingCerts={missingRequiredCerts(
                    Array.isArray(match.job_order?.cert_requirements) ? match.job_order.cert_requirements : [],
                    Array.isArray(match.candidate?.verified_certifications)
                      ? match.candidate.verified_certifications
                      : [],
                  )}
                  today={today}
                />
              ))}
            </div>
          )}
        </TalentCard>

        <TalentCard
          count={countChip(placementsResult.count, "active")}
          icon={<CalendarClock size={15} />}
          title="Active placements"
        >
          {placements.length === 0 ? (
            <TalentEmpty
              hint="Open a placement from a submitted match on the left and it appears here with a timesheet form. Hours logged against it are what the Margin Ledger and every money KPI are built from."
              title="No active placements"
            />
          ) : (
            <div className="talent-desk-list">
              {placements.map((placement) => (
                <DeskPlacementCard
                  canPropose={canPropose}
                  hoursPerWeek={hoursPerWeek}
                  key={placement.id}
                  minSpread={minSpread}
                  placement={placement}
                  weekStarting={weekStarting}
                  weeks={weeksByPlacement.get(placement.id) ?? []}
                />
              ))}
            </div>
          )}
        </TalentCard>
      </div>

      {isAdmin ? (
        <TalentCard icon={<SlidersHorizontal size={15} />} title="Money floor">
          <DeskSettingsPanel
            defaultHoursPerWeek={hoursPerWeek}
            minSpreadPerHour={minSpread}
            payRateAutonomyTier={autonomyTier}
            targetMarkupPct={targetMarkupPct}
            verticalOptions={verticalOptions}
          />
        </TalentCard>
      ) : null}

      <p className="talent-foot">
        EHS Talent Engine · Placement Desk. Submitting, placing and logging hours are all human acts — every button
        here writes through a Server Action that re-checks your role and recomputes the money from the stored rates.
      </p>
    </div>
  );
}
