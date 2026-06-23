import { NextResponse } from "next/server";
import { runStructuredLegalResearch } from "@/lib/legal/research";
import { validateAIOutput } from "@/lib/ai/gateway";
import { getLegalAccess } from "@/lib/legal/access";
import { mapFindingToRow } from "@/lib/legal/register-mapping";
import type {
  GapFinding,
  ModuleRecommendationFinding,
  AuditChecklistFinding,
  ResearchFinding,
  ResearchRunInput,
  StructuredResearchResult,
} from "@/lib/legal/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { supabase, userId, isAdmin } = await getLegalAccess();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Admin role required to run legal research." }, { status: 403 });

  let input: ResearchRunInput;
  try {
    input = (await req.json()) as ResearchRunInput;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const query = (input.question || input.title || input.program || "").trim();
  if (!query && !input.industry && !input.program) {
    return NextResponse.json({ error: "Provide at least a question, program, or industry." }, { status: 400 });
  }

  const { data: run, error: runError } = await supabase
    .from("research_runs")
    .insert({
      user_id: userId,
      title: input.title || query || input.program || "Untitled research run",
      query: query || input.program || input.industry || "",
      industry: input.industry || null,
      jurisdiction: input.jurisdiction || null,
      state: input.state || null,
      program: input.program || null,
      scope: input.scope || null,
      work_activity: input.work_activity || null,
      equipment: input.equipment || null,
      chemicals_materials: input.chemicals_materials || null,
      vehicle_type: input.vehicle_type || null,
      contractor_type: input.contractor_type || null,
      employee_type: input.employee_type || null,
      risk_level: input.risk_level || null,
      status: "running",
    })
    .select("id")
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: "Failed to create research run." }, { status: 500 });
  }

  try {
    const result: StructuredResearchResult = await runStructuredLegalResearch(input);

    const gatewayText =
      result.research_summary + " " + result.findings.map((f) => `${f.title} ${f.summary}`).join(" ");
    const gatewayCheck = validateAIOutput({ rawOutput: gatewayText });

    if (gatewayCheck.status === "blocked") {
      await supabase
        .from("research_runs")
        .update({ status: "error", error_message: "AI gateway blocked output", completed_at: new Date().toISOString() })
        .eq("id", run.id);
      return NextResponse.json({ error: "Research output was blocked by the AI safety gateway." }, { status: 422 });
    }

    const highRisk = result.findings.filter((f) => f.risk_level === "high").length;
    const criticalRisk = result.findings.filter((f) => f.risk_level === "critical").length;
    const needsReview = result.findings.filter((f) => f.human_review_required).length;

    // Persist child collections tied to this run (consumed by gap/audit/module pages).
    if (result.gap_analysis.length > 0) {
      await supabase.from("gap_analysis_results").insert(
        result.gap_analysis.map((g: GapFinding) => ({
          research_run_id: run.id,
          existing_item: g.existing_item || null,
          finding: g.finding || null,
          status: g.status || null,
          gap_description: g.gap_description || null,
          recommended_update: g.recommended_update || null,
          module_assignment: g.module_assignment || null,
          risk_level: g.risk_level || null,
          human_review_required: g.human_review_required,
        })),
      );
    }
    if (result.module_recommendations.length > 0) {
      await supabase.from("module_recommendations").insert(
        result.module_recommendations.map((m: ModuleRecommendationFinding) => ({
          research_run_id: run.id,
          module_name: m.module_name,
          reason_needed: m.reason_needed || null,
          required_forms: m.required_forms || null,
          required_permits: m.required_permits || null,
          required_inspections: m.required_inspections || null,
          required_training: m.required_training || null,
          required_dashboards: m.required_dashboards || null,
          required_alerts: m.required_alerts || null,
          required_reports: m.required_reports || null,
          priority_level: m.priority_level || null,
          build_status: m.build_status || "planned",
        })),
      );
    }
    if (result.audit_checklist_items.length > 0) {
      await supabase.from("audit_checklist_items").insert(
        result.audit_checklist_items.map((a: AuditChecklistFinding) => ({
          research_run_id: run.id,
          program: a.program || null,
          checklist_item: a.checklist_item || null,
          question_text: a.question_text || null,
          answer_type: a.answer_type || "Yes/No/NA",
          citation: a.citation || null,
          evidence_required: a.evidence_required || null,
          risk_level: a.risk_level || null,
          corrective_action_trigger: a.corrective_action_trigger || null,
          responsible_role: a.responsible_role || null,
          frequency: a.frequency || null,
          module_assignment: a.module_assignment || null,
        })),
      );
    }

    await supabase
      .from("research_runs")
      .update({
        status: needsReview > 0 ? "needs_review" : "completed",
        result_summary: result.research_summary,
        total_findings: result.findings.length,
        high_risk_count: highRisk,
        critical_risk_count: criticalRisk,
        needs_review_count: needsReview,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return NextResponse.json({ runId: run.id, result, gatewayStatus: gatewayCheck.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("research_runs")
      .update({ status: "error", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", run.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const { supabase, userId, isAdmin } = await getLegalAccess();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Admin role required." }, { status: 403 });

  let body: { runId: string; query: string; program?: string; findings: ResearchFinding[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(body.findings) || body.findings.length === 0) {
    return NextResponse.json({ error: "No findings to save." }, { status: 400 });
  }

  // De-dupe by title (a single upsert cannot contain the same conflict key twice).
  const byTitle = new Map<string, ResearchFinding>();
  for (const f of body.findings) {
    const key = (f.title || "").trim().toLowerCase();
    if (key) byTitle.set(key, f);
  }

  const rows = [...byTitle.values()].map((f) =>
    mapFindingToRow(f, body.runId, body.query || "", userId, body.program || ""),
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid findings to save (missing titles)." }, { status: 400 });
  }

  const { data: saved, error } = await supabase
    .from("legal_register_items")
    .upsert(rows, { onConflict: "title" })
    .select("id, review_status");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const savedCount = Array.isArray(saved) ? saved.length : rows.length;

  // Append a change-log entry per saved item (created).
  if (Array.isArray(saved) && saved.length > 0) {
    await supabase.from("legal_register_change_log").insert(
      saved.map((s: { id: string }) => ({
        entry_id: s.id,
        change_type: "Created",
        new_value: "Saved from research run",
        changed_by: userId,
        change_reason: body.runId ? `Research run ${body.runId}` : null,
      })),
    );
  }

  const needsReview = rows.filter((r) => r.review_status === "needs_review").length;
  return NextResponse.json({ saved: savedCount, needsReview });
}
