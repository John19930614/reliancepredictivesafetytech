// Row shapes for the Client Lifecycle.
//
// Hand-written rather than taken from lib/supabase/types.ts, which is generated
// from the live database and therefore postdates this migration. Same
// convention the File Center used when company_files was new.

import type { LifecycleStepKey } from "./steps";
import type { OpportunityStatus } from "./exits";

export interface OpportunityRow {
  id: string;
  client_id: string | null;
  demo_request_id: string | null;
  name: string;

  step: LifecycleStepKey | string;
  status: OpportunityStatus | string;
  step_changed_at: string;

  owner_user_id: string | null;
  assigned_at: string | null;

  value: number;
  currency: string;
  probability: number;
  expected_close_date: string | null;

  ai_score: number | null;
  ai_confidence: string | null;
  ai_scored_at: string | null;
  ai_recommendation: string | null;

  source: string | null;
  industry: string | null;
  region: string | null;
  product_interest: string | null;

  next_action: string | null;
  next_action_due: string | null;
  last_contact_at: string | null;
  notes: string | null;

  exit_reason: string | null;
  exit_competitor: string | null;
  exited_at: string | null;
  exited_by: string | null;
  hold_until: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type StageEventKind = "advance" | "skip" | "back" | "exit" | "reopen";

export interface OpportunityStageEventRow {
  id: string;
  opportunity_id: string;
  from_step: string | null;
  to_step: string;
  from_status: string | null;
  to_status: string;
  kind: StageEventKind;
  reason: string | null;
  steps_skipped: number;
  changed_by: string | null;
  changed_at: string;
}

/** The columns every lifecycle read needs. Kept in one place so a new column
 *  reaches the page and the action together. */
export const opportunitySelect =
  "id, client_id, demo_request_id, name, step, status, step_changed_at, " +
  "owner_user_id, assigned_at, value, currency, probability, expected_close_date, " +
  "ai_score, ai_confidence, ai_scored_at, ai_recommendation, " +
  "source, industry, region, product_interest, " +
  "next_action, next_action_due, last_contact_at, notes, " +
  "exit_reason, exit_competitor, exited_at, exited_by, hold_until, " +
  "created_by, created_at, updated_at";
