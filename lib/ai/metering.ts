import "server-only";

// AI usage metering: every AI feature calls checkAiBudget() before spending
// tokens and recordAiUsage() after, building a daily cents ledger in
// platform_ai_usage_events. Enforcement is graduated via
// platform_ai_budget_settings.enforcement:
//
//   log_only     (default) — the ledger fills but nothing is ever blocked
//   enforce      — deny past the platform cap, the feature cap, a disabled
//                  feature, or the hardcoded daily call backstop
//   kill_switch  — deny everything
//
// FAILURE POSTURE: this module must never take an AI feature down with it.
// When the mode cannot be read (missing tables because the migration has not
// been applied yet, missing settings row, service-role env absent, any read
// error) the mode is unknown and the check fails OPEN. Only a read error
// while the mode is known to be 'enforce' fails CLOSED — an admin who turned
// enforcement on has said they prefer a blocked call to an unmetered one.
// recordAiUsage never throws: a lost ledger row is a metering gap, not a
// reason to fail the user's request.

import { createAdminClient } from "@/lib/supabase/admin";
import { estimateCostCents } from "@/lib/ai/pricing";

/** Same convention as lib/proposals/acceptance-filing.ts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

export type AiFeatureKey =
  | "legal_research"
  | "document_builder"
  | "lead_triage"
  | "talent_sourcing"
  | "ai_command"
  | "website_command"
  | "sales_meeting_notes"
  | "proposal_narrative";

export type BudgetDecision =
  | { allowed: true; remainingCents: number; modelOverride: string | null }
  | {
      allowed: false;
      reason: "platform_cap" | "feature_cap" | "feature_disabled" | "kill_switch" | "call_backstop";
      message: string;
    };

const DENIAL_MESSAGE = "AI budget reached for today. It resets at midnight UTC.";

/** Absolute ceiling on AI calls per UTC day, across all features — the last
 * line against a runaway loop even when the cents caps are misconfigured. */
const PLATFORM_DAILY_CALL_BACKSTOP = 200;

/** Mirrors the platform_ai_feature_budgets.daily_cap_cents column default. */
const DEFAULT_FEATURE_CAP_CENTS = 100;

/** Platform cap used until the settings row exists (bootstrap). */
function defaultPlatformCapCents(): number {
  const parsed = Number(process.env.AI_BUDGET_DEFAULT_CAP_CENTS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
}

function allow(remainingCents: number, modelOverride: string | null = null): BudgetDecision {
  return { allowed: true, remainingCents: Math.max(0, remainingCents), modelOverride };
}

function deny(
  reason: "platform_cap" | "feature_cap" | "feature_disabled" | "kill_switch" | "call_backstop",
): BudgetDecision {
  return { allowed: false, reason, message: DENIAL_MESSAGE };
}

export async function checkAiBudget(featureKey: AiFeatureKey): Promise<BudgetDecision> {
  const fallbackCap = defaultPlatformCapCents();
  try {
    const db: LooseClient | null = createAdminClient();
    if (!db) return allow(fallbackCap);

    // Enforcement mode. A read error here (including 42P01 while the metering
    // migration is still unapplied) leaves the mode unknown — fail open.
    const { data: settings, error: settingsError } = await db
      .from("platform_ai_budget_settings")
      .select("daily_cap_cents, enforcement")
      .maybeSingle();
    if (settingsError) return allow(fallbackCap);

    const enforcement =
      settings?.enforcement === "enforce" || settings?.enforcement === "kill_switch"
        ? settings.enforcement
        : "log_only";
    if (enforcement === "kill_switch") return deny("kill_switch");
    const enforcing = enforcement === "enforce";

    const platformCap =
      typeof settings?.daily_cap_cents === "number" ? settings.daily_cap_cents : fallbackCap;

    // Per-feature budget. A missing row means the seeded defaults; a read
    // ERROR follows the failure posture above.
    const { data: feature, error: featureError } = await db
      .from("platform_ai_feature_budgets")
      .select("daily_cap_cents, model_override, enabled")
      .eq("feature_key", featureKey)
      .maybeSingle();
    if (featureError) return enforcing ? deny("feature_cap") : allow(platformCap);

    const featureCap =
      typeof feature?.daily_cap_cents === "number" ? feature.daily_cap_cents : DEFAULT_FEATURE_CAP_CENTS;
    const modelOverride = (feature?.model_override as string | null) ?? null;
    const enabled = feature?.enabled !== false;

    // Today's ledger, summed here — the row count is bounded by the call
    // backstop, so pulling the rows is cheaper than two aggregate round trips.
    const today = new Date().toISOString().slice(0, 10);
    const { data: rows, error: ledgerError } = await db
      .from("platform_ai_usage_events")
      .select("feature_key, est_cost_cents")
      .eq("usage_date", today);
    if (ledgerError) return enforcing ? deny("platform_cap") : allow(platformCap, modelOverride);

    const events: Array<{ feature_key?: string; est_cost_cents?: unknown }> = Array.isArray(rows)
      ? rows
      : [];
    let platformSpentCents = 0;
    let featureSpentCents = 0;
    for (const event of events) {
      const cents = Number(event.est_cost_cents) || 0;
      platformSpentCents += cents;
      if (event.feature_key === featureKey) featureSpentCents += cents;
    }

    const remaining = Math.min(platformCap - platformSpentCents, featureCap - featureSpentCents);

    // log_only: the ledger was the point; over-cap still runs.
    if (!enforcing) return allow(remaining, modelOverride);

    if (!enabled) return deny("feature_disabled");
    if (platformSpentCents >= platformCap) return deny("platform_cap");
    if (featureSpentCents >= featureCap) return deny("feature_cap");
    if (events.length >= PLATFORM_DAILY_CALL_BACKSTOP) return deny("call_backstop");
    return allow(remaining, modelOverride);
  } catch {
    // Unexpected throw before the mode was established — fail open.
    return allow(fallbackCap);
  }
}

export async function recordAiUsage(entry: {
  featureKey: AiFeatureKey;
  callKind?: string;
  runSource: "user" | "cron";
  userId?: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearchCalls?: number;
}): Promise<void> {
  try {
    const db: LooseClient | null = createAdminClient();
    if (!db) {
      console.error("recordAiUsage: service-role credentials are not configured; usage not recorded.");
      return;
    }

    // int columns: round and floor at zero so a provider quirk (undefined,
    // float, negative) degrades to an imprecise row, never a failed insert.
    const inputTokens = Math.max(0, Math.round(Number(entry.inputTokens) || 0));
    const outputTokens = Math.max(0, Math.round(Number(entry.outputTokens) || 0));
    const webSearchCalls = Math.max(0, Math.round(Number(entry.webSearchCalls) || 0));

    const { error } = await db.from("platform_ai_usage_events").insert({
      feature_key: entry.featureKey,
      call_kind: entry.callKind ?? null,
      run_source: entry.runSource,
      user_id: entry.userId ?? null,
      model: entry.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      web_search_calls: webSearchCalls,
      est_cost_cents: estimateCostCents(entry.model, inputTokens, outputTokens, webSearchCalls),
    });
    if (error) console.error("recordAiUsage: ledger insert failed:", error.message ?? error);
  } catch (caught) {
    console.error("recordAiUsage: ledger insert failed:", caught);
  }
}
