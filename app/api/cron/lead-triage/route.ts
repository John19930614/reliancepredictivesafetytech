import { validateAIOutput } from "@/lib/ai/gateway";
import { recordAuditEvent } from "@/lib/audit/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { rankFindings, requiresHumanReview, type TriageLeadInput } from "@/lib/leads/triage-schema";
import { runLeadTriage } from "@/lib/leads/triage";

export const maxDuration = 300;

/** Leads older than this are considered cold and are left out of the daily pass. */
const LOOKBACK_DAYS = 60;
const MAX_LEADS_PER_RUN = 60;

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

  const today = new Date().toISOString().slice(0, 10);

  // One run per calendar day. A same-day retry reuses the row rather than
  // creating a duplicate (run_date is unique).
  const { data: run, error: runError } = await supabase
    .from("lead_triage_runs")
    .upsert({ run_date: today, status: "running", error_message: null }, { onConflict: "run_date" })
    .select("id")
    .single();

  if (runError || !run) {
    return Response.json({ ok: false, error: runError?.message ?? "Could not start run." }, { status: 500 });
  }

  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Only leads that still need work — anything already won or closed is skipped.
    const { data: leads, error: leadsError } = await supabase
      .from("demo_requests")
      .select("id, name, company, email, phone, role, company_type, interested_products, message, status, created_at")
      .gte("created_at", since)
      .not("status", "in", '("converted","closed","archived")')
      .order("created_at", { ascending: false })
      .limit(MAX_LEADS_PER_RUN);

    if (leadsError) throw new Error(leadsError.message);

    const leadList = (leads ?? []) as TriageLeadInput[];

    if (leadList.length === 0) {
      await supabase
        .from("lead_triage_runs")
        .update({ status: "completed", leads_analyzed: 0, completed_at: new Date().toISOString() })
        .eq("id", run.id);
      return Response.json({ ok: true, leadsAnalyzed: 0, message: "No open leads to triage." });
    }

    const { result, model } = await runLeadTriage(leadList, today);

    // AI Gateway — nothing reaches a workflow record without passing this.
    const gateway = validateAIOutput({
      rawOutput: [result.summary, ...result.findings.map((f) => `${f.segment} ${f.next_step} ${f.rationale}`)].join(" "),
    });

    if (gateway.status === "blocked") {
      await supabase
        .from("lead_triage_runs")
        .update({
          status: "error",
          gateway_status: gateway.status,
          error_message: gateway.blockedReason || "AI gateway blocked output",
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      return Response.json({ ok: false, error: "Lead triage output was blocked by the AI safety gateway." }, { status: 422 });
    }

    const ranked = rankFindings(result.findings);

    // Replace this run's previous rows so a same-day retry is idempotent.
    await supabase.from("lead_triage_results").delete().eq("run_id", run.id);

    if (ranked.length > 0) {
      const { error: insertError } = await supabase.from("lead_triage_results").insert(
        ranked.map((finding) => ({
          run_id: run.id,
          lead_id: finding.lead_id,
          priority_rank: finding.priority_rank,
          priority_score: finding.priority_score,
          segment: finding.segment,
          next_step: finding.next_step,
          rationale: finding.rationale,
          confidence: finding.confidence,
          human_review_required: requiresHumanReview(finding),
          status: "suggested",
        })),
      );
      if (insertError) throw new Error(insertError.message);
    }

    await supabase
      .from("lead_triage_runs")
      .update({
        status: "completed",
        leads_analyzed: ranked.length,
        model,
        gateway_status: gateway.status,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    await recordAuditEvent({
      event_type: "ai.lead_triage_completed",
      event_category: "ai",
      severity: gateway.status === "pass" ? "info" : "warn",
      resource_type: "lead_triage_run",
      resource_id: run.id,
      summary: `Triaged ${ranked.length} lead(s) (gateway: ${gateway.status})`,
      after_state: { leadsAnalyzed: ranked.length, model, gatewayStatus: gateway.status },
    });

    return Response.json({ ok: true, runId: run.id, leadsAnalyzed: ranked.length, gatewayStatus: gateway.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lead triage failed.";
    await supabase
      .from("lead_triage_runs")
      .update({ status: "error", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", run.id);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
