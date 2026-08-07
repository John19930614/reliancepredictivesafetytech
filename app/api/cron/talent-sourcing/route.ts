// EHS Talent Engine — the scheduled web-sourcing sweep.
//
// Runs twice a week (vercel.json: Mon + Thu, 12:00 UTC). Each pass opens one
// `talent_sourcing_runs` row per run type, asks the Sourcing Agent for leads,
// and files them in `talent_sourcing_leads` with status 'new'.
//
// It never creates a candidate, a job order or a match: every lead waits for a
// human to accept or dismiss it (Human Authority Rule, CLAUDE.md). The
// orchestration itself lives in ./orchestrate.ts so the manual "run now" server
// action executes exactly the same routine under the user's own RLS.

import { createAdminClient } from "@/lib/supabase/admin";
import { sourcingRunTypes } from "@/lib/talent-engine/types";
import { runSourcingSweep } from "./orchestrate";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // On Vercel, cron jobs include x-vercel-cron: 1. Requiring it in production
  // prevents replaying a leaked Bearer token from outside Vercel's scheduler.
  if (process.env.VERCEL === "1" && request.headers.get("x-vercel-cron") !== "1") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return Response.json({ ok: false, error: "Supabase admin client unavailable." }, { status: 503 });
  }

  try {
    const result = await runSourcingSweep(supabase, {
      runTypes: sourcingRunTypes,
      triggeredBy: "cron",
      // `talent_activity_log.actor_id` is a user column; the scheduler is not a
      // user, so the row is attributed to the named agent alone.
      actorId: null,
    });

    // The migration has not been applied yet. That is a deployment state, not a
    // fault: answer 200 and say so, so the scheduler does not retry-storm.
    if (result.skipped) {
      return Response.json({
        ok: true,
        status: "skipped",
        message: result.message ?? "Talent Engine web sourcing is not set up yet.",
        runs: [],
      });
    }

    // A failed RUN is not a failed cron — one search provider being down must
    // not mark the schedule unhealthy, so the per-run detail carries the news.
    return Response.json({
      ok: true,
      status: "completed",
      runs: result.runs,
      leadsInserted: result.runs.reduce((total, run) => total + run.leadsInserted, 0),
    });
  } catch (error) {
    // Only an infrastructure fault reaches here — runSourcingSweep() contains
    // every per-run failure itself.
    const message = error instanceof Error ? error.message : "Talent sourcing failed.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
