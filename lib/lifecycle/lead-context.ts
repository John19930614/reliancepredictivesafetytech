import "server-only";

// The lead behind an opportunity, and what the AI made of it.
//
// Steps 1–3 of the lifecycle are about a LEAD, not yet a deal: it arrives
// (Lead Captured), the model scores it (AI Triage & Score), and a person decides
// whether to pursue it (Sales Review). All three of those already have machinery
// in this platform — demo_requests is the public intake, and lead_triage_runs /
// lead_triage_results is the nightly scoring job that runs through
// validateAIOutput(). This module joins them to an opportunity so the lifecycle
// screens show real work rather than a new parallel copy of it.
//
// Tolerant by design: an opportunity may have no lead behind it (someone opened
// it by hand), the lead may never have been triaged, and the triage tables may
// not exist in this environment yet. All three are ordinary, not errors.

import { isMissingSchemaRelationError } from "@/lib/supabase/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

export interface LeadRow {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  role: string | null;
  company_type: string | null;
  interested_products: string[] | null;
  message: string | null;
  status: string;
  created_at: string;
}

export interface TriageRow {
  id: string;
  lead_id: string;
  priority_rank: number;
  priority_score: number;
  segment: string | null;
  next_step: string;
  rationale: string | null;
  confidence: string;
  human_review_required: boolean;
  /** 'suggested' until a person accepts or dismisses it. */
  status: string;
  acted_by: string | null;
  acted_at: string | null;
  created_at: string;
}

export interface LeadContext {
  lead: LeadRow | null;
  triage: TriageRow | null;
  /** True when the triage tables are not in the schema cache yet. */
  triageUnavailable: boolean;
}

/**
 * Loads the lead and its newest triage result for an opportunity.
 *
 * `demoRequestId` is passed in rather than re-read: the caller already has the
 * opportunity row, and a second read could see a different link.
 */
export async function loadLeadContext(
  supabase: LooseClient,
  demoRequestId: string | null,
): Promise<LeadContext> {
  if (!demoRequestId) {
    return { lead: null, triage: null, triageUnavailable: false };
  }

  const [leadResult, triageResult] = await Promise.all([
    supabase
      .from("demo_requests")
      .select("id, name, company, email, phone, role, company_type, interested_products, message, status, created_at")
      .eq("id", demoRequestId)
      .maybeSingle(),
    supabase
      .from("lead_triage_results")
      .select(
        "id, lead_id, priority_rank, priority_score, segment, next_step, rationale, confidence, human_review_required, status, acted_by, acted_at, created_at",
      )
      .eq("lead_id", demoRequestId)
      // Newest run wins: a lead re-scored on a later day should show the later
      // opinion, not the first one anybody ever formed about it.
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const triageError = (triageResult?.error ?? null) as { code?: string; message?: string } | null;
  const triageUnavailable = Boolean(triageError && isMissingSchemaRelationError(triageError));

  const triageRows = Array.isArray(triageResult?.data) ? (triageResult.data as TriageRow[]) : [];

  return {
    lead: (leadResult?.data ?? null) as LeadRow | null,
    triage: triageRows[0] ?? null,
    triageUnavailable,
  };
}

/* -------------------------------------------------------------------------- */
/* Score presentation                                                         */
/* -------------------------------------------------------------------------- */

export type ScoreBand = "high" | "medium" | "low";

/**
 * Which band a 0–100 score falls in.
 *
 * The thresholds match the triage module's own notion of a high-value lead:
 * lib/leads/triage-schema.ts flags anything at or above 80 for human review
 * regardless of confidence, so 80 is where "high" starts here too rather than
 * being a second, quietly different opinion.
 */
export function scoreBand(score: number | null | undefined): ScoreBand | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

/** Whether this triage result is still waiting on a person. */
export function isAwaitingReview(triage: TriageRow | null): boolean {
  return Boolean(triage && triage.status === "suggested");
}
