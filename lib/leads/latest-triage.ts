import "server-only";
import type { LeadSuggestion } from "@/components/LeadTriagePanel";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";

export interface LatestTriage {
  runDate: string | null;
  suggestions: LeadSuggestion[];
}

const EMPTY: LatestTriage = { runDate: null, suggestions: [] };

/**
 * Loads the most recent completed triage run and its suggestions, joined to the
 * lead so the UI can show who each suggestion is about.
 *
 * Returns an empty result (never throws) when the tables do not exist yet or
 * no run has completed — both surfaces render a neutral empty state.
 */
export async function loadLatestLeadTriage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<LatestTriage> {
  if (!supabase) return EMPTY;

  const { data: run, error: runError } = await supabase
    .from("lead_triage_runs")
    .select("id, run_date")
    .eq("status", "completed")
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    if (!isMissingSchemaRelationError(runError)) {
      console.error("Could not load lead triage run.", runError);
    }
    return EMPTY;
  }
  if (!run) return EMPTY;

  const { data: rows, error: rowsError } = await supabase
    .from("lead_triage_results")
    .select(
      "id, lead_id, priority_rank, priority_score, segment, next_step, rationale, confidence, human_review_required, status, demo_requests(name, company)",
    )
    .eq("run_id", run.id)
    .order("priority_rank", { ascending: true });

  if (rowsError) {
    if (!isMissingSchemaRelationError(rowsError)) {
      console.error("Could not load lead triage results.", rowsError);
    }
    return { runDate: run.run_date, suggestions: [] };
  }

  const suggestions: LeadSuggestion[] = (rows ?? []).map(
    (row: {
      id: string;
      lead_id: string;
      priority_rank: number;
      priority_score: number;
      segment: string | null;
      next_step: string;
      rationale: string | null;
      confidence: string;
      human_review_required: boolean;
      status: string;
      demo_requests?: { name?: string | null; company?: string | null } | null;
    }) => ({
      id: row.id,
      leadId: row.lead_id,
      leadName: row.demo_requests?.name ?? "Unknown lead",
      leadCompany: row.demo_requests?.company ?? null,
      priorityRank: row.priority_rank,
      priorityScore: Number(row.priority_score),
      segment: row.segment,
      nextStep: row.next_step,
      rationale: row.rationale,
      confidence: row.confidence,
      humanReviewRequired: row.human_review_required,
      status: row.status,
    }),
  );

  return { runDate: run.run_date, suggestions };
}
