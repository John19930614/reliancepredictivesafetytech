import "server-only";

// EHS Talent Engine — the Sourcing Agent's web sweep, as one shared routine.
//
// Two callers reach this module and they must behave identically:
//   * GET /api/cron/talent-sourcing — the twice-weekly scheduled sweep, running
//     on the ADMIN client with `triggered_by = 'cron'`.
//   * runSourcingNow() in app/employee/talent-engine/actions.ts — the manual
//     "run it now" button, running on the SIGNED-IN USER's client so RLS still
//     applies, with `triggered_by = <user id>`.
//
// HUMAN AUTHORITY RULE (CLAUDE.md): this sweep writes ONLY to
// `talent_sourcing_leads` with status 'new'. It never creates a candidate, a
// job order or a match. A lead becomes a record exactly one way — a human with
// `canPropose` calls acceptSourcingLead(). Nothing here auto-promotes.
//
// Failure containment is deliberate: one run type throwing must not lose the
// other, and a search provider being unavailable is a FAILED RUN, not a failed
// cron — the scheduler did its job, so the route still answers 200 with the
// per-run detail. Only an infrastructure fault reaches the caller as an error.

import { isMissingSchemaRelationError, getOptionalFeatureSetupMessage } from "@/lib/supabase/errors";
import { buildActivityEntry } from "@/lib/talent-engine/ai";
import {
  SourcingUnavailableError,
  buildSourcingActivitySummary,
  buildSourcingQuerySummary,
  dedupeLeads,
  searchSourcingLeads,
  type SourcingSearchResult,
} from "@/lib/talent-engine/sourcing";
import {
  sourcingMaxLeadsPerRun,
  type SourcingRunStatus,
  type SourcingRunType,
} from "@/lib/talent-engine/types";

/* -------------------------------------------------------------------------- */
/* Bounds                                                                     */
/* -------------------------------------------------------------------------- */

/** Open job orders fed to the candidate search as "what we are trying to fill". */
const openOrderContextLimit = 20;
/** Distinct verticals / certifications / locations fed to the job-order search. */
const candidateSignalLimit = 20;
/** Candidate rows scanned to build those distinct signal lists. */
const candidateScanLimit = 200;

const sourcingTables = {
  runs: "talent_sourcing_runs",
  leads: "talent_sourcing_leads",
  jobOrders: "talent_job_orders",
  candidates: "talent_candidates",
  activity: "talent_activity_log",
} as const;

/** The lead the review queue stores. Kept local so the DB shape is explicit. */
interface SourcingLeadInsert {
  run_id: string | null;
  lead_type: SourcingRunType;
  title: string;
  organization: string | null;
  location: string | null;
  vertical: string | null;
  certifications: string[];
  rate_signal: number | null;
  source_url: string;
  summary: string | null;
  status: "new";
}

export interface SourcingRunOutcome {
  runType: SourcingRunType;
  /** Null when the run row itself could not be opened. */
  runId: string | null;
  status: SourcingRunStatus;
  leadsFound: number;
  leadsInserted: number;
  error?: string;
}

export interface SourcingSweepResult {
  ok: boolean;
  /** True when the sourcing tables are not in the schema cache yet. */
  skipped: boolean;
  /** Populated when `skipped` — the "apply the migrations" message. */
  message?: string;
  runs: SourcingRunOutcome[];
}

export interface SourcingSweepOptions {
  runTypes: readonly SourcingRunType[];
  /** 'cron' for the scheduled sweep, else the triggering user's id. */
  triggeredBy: string;
  /** Activity-feed actor. Null for cron — `actor_id` is a user column. */
  actorId?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function toCount(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function cleanList(values: unknown, limit: number): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const label = value.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Appends one line to the console's activity feed. Fire-and-forget in the same
 * sense as `logActivity()` in actions.ts: a feed write must never turn a
 * completed sweep into a reported failure, and under `runSourcingNow()` this
 * runs on the user's client where RLS may legitimately refuse it.
 */
async function logSourcingActivity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  summary: string,
  actorId: string | null,
): Promise<void> {
  try {
    await supabase.from(sourcingTables.activity).insert(
      buildActivityEntry("Sourcing Agent", "web_sourcing_run", 1, summary, {
        actorType: "ai_agent",
        actorId,
      }),
    );
  } catch {
    // Activity logging must never crash the sweep.
  }
}

/* -------------------------------------------------------------------------- */
/* Search context — built from what the agency is actually working on         */
/* -------------------------------------------------------------------------- */

/** Candidate search: the open orders we are trying to fill. */
async function buildCandidateContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ openOrders: Array<{ title: string; vertical: string | null; location: string | null; certRequirements: string[] }> }> {
  const { data, error } = await supabase
    .from(sourcingTables.jobOrders)
    .select("id, title, vertical, location, cert_requirements")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(openOrderContextLimit);
  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  return {
    openOrders: rows
      .filter((row: { title?: unknown }) => typeof row?.title === "string" && row.title.trim() !== "")
      .map((row: { title: string; vertical?: unknown; location?: unknown; cert_requirements?: unknown }) => ({
        title: row.title.trim(),
        vertical: typeof row.vertical === "string" && row.vertical.trim() ? row.vertical.trim() : null,
        location: typeof row.location === "string" && row.location.trim() ? row.location.trim() : null,
        certRequirements: cleanList(row.cert_requirements, candidateSignalLimit),
      })),
  };
}

/** Job-order search: the verticals, certifications and markets our bench covers. */
async function buildJobOrderContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ verticals: string[]; certifications: string[]; locations: string[] }> {
  // An inactive professional is not a reason to chase work, so they are left
  // out of the signal entirely.
  const { data, error } = await supabase
    .from(sourcingTables.candidates)
    .select("id, verticals, certifications, location")
    .neq("status", "inactive")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(candidateScanLimit);
  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  const verticals: string[] = [];
  const certifications: string[] = [];
  const locations: string[] = [];
  for (const row of rows) {
    if (Array.isArray(row?.verticals)) verticals.push(...row.verticals);
    if (Array.isArray(row?.certifications)) certifications.push(...row.certifications);
    if (typeof row?.location === "string") locations.push(row.location);
  }

  return {
    verticals: cleanList(verticals, candidateSignalLimit),
    certifications: cleanList(certifications, candidateSignalLimit),
    locations: cleanList(locations, candidateSignalLimit),
  };
}

/* -------------------------------------------------------------------------- */
/* One run                                                                    */
/* -------------------------------------------------------------------------- */

interface RunAttempt {
  outcome: SourcingRunOutcome;
  /** Set when the tables are absent — the caller aborts the whole sweep. */
  schemaMissing?: boolean;
}

async function runOne(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  runType: SourcingRunType,
  options: SourcingSweepOptions,
): Promise<RunAttempt> {
  // 1. Open the run row FIRST, so an in-flight sweep is visible and a crash
  //    leaves a `running` row rather than no trace at all.
  const { data: run, error: runError } = await supabase
    .from(sourcingTables.runs)
    .insert({ run_type: runType, status: "running", triggered_by: options.triggeredBy })
    .select("id")
    .single();

  if (runError || !run?.id) {
    if (isMissingSchemaRelationError(runError)) {
      return {
        schemaMissing: true,
        outcome: {
          runType,
          runId: null,
          status: "failed",
          leadsFound: 0,
          leadsInserted: 0,
          error: getOptionalFeatureSetupMessage("Talent Engine web sourcing"),
        },
      };
    }
    return {
      outcome: {
        runType,
        runId: null,
        status: "failed",
        leadsFound: 0,
        leadsInserted: 0,
        error: runError?.message ?? "Could not open the sourcing run.",
      },
    };
  }

  const runId: string = run.id;
  let leadsFound = 0;
  // Recorded BEFORE the search so a run that dies mid-sweep still says what it
  // set out to look for — a failed run with an empty query_summary tells the
  // reviewer nothing.
  let querySummary: string | null = null;

  try {
    // 2. Search. The context comes off our own tables; the run type decides
    //    which one, branched here so the search keeps its literal run type.
    let search: SourcingSearchResult;
    if (runType === "candidates") {
      const context = await buildCandidateContext(supabase);
      querySummary = buildSourcingQuerySummary("candidates", context);
      search = await searchSourcingLeads("candidates", context);
    } else {
      const context = await buildJobOrderContext(supabase);
      querySummary = buildSourcingQuerySummary("job_orders", context);
      search = await searchSourcingLeads("job_orders", context);
    }

    const parsed = Array.isArray(search?.leads) ? search.leads : [];
    leadsFound = toCount(search?.raw?.found, parsed.length);

    // 3. Dedupe inside the batch, then cap it. The unique index is the backstop
    //    across runs; this stops one runaway search flooding the review queue.
    const deduped = dedupeLeads(parsed, runType).slice(0, sourcingMaxLeadsPerRun);

    const rows: SourcingLeadInsert[] = deduped.map((lead) => ({
      run_id: runId,
      lead_type: runType,
      title: lead.title,
      organization: lead.organization ?? null,
      location: lead.location ?? null,
      vertical: lead.vertical ?? null,
      certifications: Array.isArray(lead.certifications) ? lead.certifications : [],
      rate_signal: typeof lead.rate_signal === "number" && Number.isFinite(lead.rate_signal) ? lead.rate_signal : null,
      source_url: lead.source_url,
      summary: lead.summary ?? null,
      status: "new",
    }));

    let leadsInserted = 0;
    if (rows.length > 0) {
      // ON CONFLICT (lead_type, source_url) DO NOTHING. `ignoreDuplicates` is
      // what makes PostgREST emit DO NOTHING rather than DO UPDATE — an update
      // would overwrite a human's `accepted`/`dismissed` review with a fresh
      // `new`, silently reopening a decision someone already made.
      const { data: inserted, error: insertError } = await supabase
        .from(sourcingTables.leads)
        .upsert(rows, { onConflict: "lead_type,source_url", ignoreDuplicates: true })
        .select("id");
      if (insertError) throw new Error(insertError.message);
      // Only the rows that actually landed come back, so duplicates are not
      // counted as new work.
      leadsInserted = Array.isArray(inserted) ? inserted.length : 0;
    }

    await supabase
      .from(sourcingTables.runs)
      .update({
        status: "completed",
        query_summary: typeof search?.querySummary === "string" ? search.querySummary : querySummary,
        leads_found: leadsFound,
        leads_inserted: leadsInserted,
        error: null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .select("id");

    await logSourcingActivity(
      supabase,
      buildSourcingActivitySummary(runType, leadsInserted, leadsFound),
      options.actorId ?? null,
    );

    return { outcome: { runType, runId, status: "completed", leadsFound, leadsInserted } };
  } catch (error) {
    // A provider outage is a failed RUN, not a failed sweep. It is recorded on
    // the row with its own message so the review UI can say what happened.
    //
    // Two tiers arrive here: `SourcingUnavailableError` means this deployment
    // has no model access at all (nothing to retry), while a plain Error means
    // the search ran and went wrong. Both mark the run failed and both keep
    // their own message — the fallbacks differ only for a message-less throw.
    const message =
      error instanceof SourcingUnavailableError
        ? errorMessage(error, "Web sourcing is unavailable.")
        : errorMessage(error, "The sourcing run failed.");

    await supabase
      .from(sourcingTables.runs)
      .update({
        status: "failed",
        query_summary: querySummary,
        leads_found: leadsFound,
        leads_inserted: 0,
        error: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .select("id");

    await logSourcingActivity(
      supabase,
      `Web sourcing run for ${runType === "candidates" ? "candidates" : "job orders"} did not complete: ${message}`,
      options.actorId ?? null,
    );

    return { outcome: { runType, runId, status: "failed", leadsFound, leadsInserted: 0, error: message } };
  }
}

/* -------------------------------------------------------------------------- */
/* The sweep                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Runs the requested sourcing types in order and returns one outcome each.
 *
 * Never throws for a run-level fault: a caller gets `ok: true` with a `failed`
 * outcome in the list. The only non-ok result is `skipped`, which means the
 * migration has not been applied yet.
 */
export async function runSourcingSweep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  options: SourcingSweepOptions,
): Promise<SourcingSweepResult> {
  const runs: SourcingRunOutcome[] = [];

  for (const runType of options.runTypes) {
    const attempt = await runOne(supabase, runType, options);
    if (attempt.schemaMissing) {
      return {
        ok: true,
        skipped: true,
        message: getOptionalFeatureSetupMessage("Talent Engine web sourcing"),
        runs,
      };
    }
    runs.push(attempt.outcome);
  }

  return { ok: true, skipped: false, runs };
}
