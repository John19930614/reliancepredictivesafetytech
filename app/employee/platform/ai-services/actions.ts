"use server";

import { requireClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";
import { friendlyError } from "@/lib/friendly-error";
import type { AiFeatureKey } from "@/lib/ai/metering";

export async function getPromptTemplates() {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("ai_prompt_templates")
    .select("*")
    .order("category")
    .order("name");
  return data ?? [];
}

export async function getModelRegistry() {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("ai_model_registry")
    .select("*")
    .order("status")
    .order("name");
  return data ?? [];
}

export async function getGatewayLog(limit = 50) {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("ai_gateway_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getFeedbackEntries(limit = 50) {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("ai_feedback_entries")
    .select("*")
    .order("submitted_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function createPromptTemplate(form: FormData) {
  const supabase = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("ai_prompt_templates").insert({
    prompt_key: String(form.get("prompt_key")),
    name: String(form.get("name")),
    category: String(form.get("category") ?? "general"),
    template_text: String(form.get("template_text")),
    description: form.get("description") ? String(form.get("description")) : null,
    confidence_threshold: form.get("confidence_threshold") ? Number(form.get("confidence_threshold")) : 0.70,
    requires_human_review: form.get("requires_human_review") === "on",
    created_by: user?.id ?? null,
  });
  revalidatePath("/employee/platform/ai-services");
}

export async function updateModelStatus(id: string, status: string) {
  const supabase = await requireClient();
  await supabase.from("ai_model_registry").update({ status }).eq("id", id);
  revalidatePath("/employee/platform/ai-services");
}

export async function submitFeedback(form: FormData) {
  const supabase = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("ai_feedback_entries").insert({
    prompt_key: form.get("prompt_key") ? String(form.get("prompt_key")) : null,
    feedback_type: String(form.get("feedback_type")),
    original_output: form.get("original_output") ? String(form.get("original_output")) : null,
    corrected_output: form.get("corrected_output") ? String(form.get("corrected_output")) : null,
    rejection_reason: form.get("rejection_reason") ? String(form.get("rejection_reason")) : null,
    submitted_by: user?.id ?? null,
    notes: form.get("notes") ? String(form.get("notes")) : null,
  });
  revalidatePath("/employee/platform/ai-services");
}

// ---------------------------------------------------------------------------
// AI usage & budgets (platform_ai_* tables from 20260810110000_ai_usage_metering)
// ---------------------------------------------------------------------------

/** The metering tables are not in the generated Supabase types yet (regen is
 * manual on this machine); same loose-client convention as lib/ai/metering.ts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/** Mirrors AiFeatureKey in lib/ai/metering.ts — drives the summary rows and
 * which per-feature budget fields updateAiBudgets accepts. */
const AI_FEATURE_KEYS: AiFeatureKey[] = [
  "legal_research",
  "document_builder",
  "lead_triage",
  "talent_sourcing",
  "ai_command",
  "website_command",
  "sales_meeting_notes",
];

const ENFORCEMENT_MODES = ["log_only", "enforce", "kill_switch"] as const;

const MAX_MODEL_OVERRIDE_LENGTH = 80;

export interface AiFeatureUsageRow {
  featureKey: AiFeatureKey;
  todayCalls: number;
  todayInputTokens: number;
  todayOutputTokens: number;
  todayCostCents: number;
  fourteenDayCostCents: number;
  capCents: number | null;
  enabled: boolean;
  modelOverride: string | null;
}

export interface AiUsageSummary {
  /** False when the metering tables are missing or unreadable (migration not
   * applied yet, or RLS denied the caller) — the page shows its empty state. */
  available: boolean;
  settings: { dailyCapCents: number; enforcement: string } | null;
  todayTotalCents: number;
  fourteenDayTotalCents: number;
  features: AiFeatureUsageRow[];
}

export async function getAiUsageSummary(): Promise<AiUsageSummary> {
  const supabase: LooseClient = await requireClient();

  const today = new Date().toISOString().slice(0, 10);
  // 14-day window inclusive of today, on the ledger's UTC day boundary.
  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [settingsRes, budgetsRes, eventsRes] = await Promise.all([
    supabase.from("platform_ai_budget_settings").select("daily_cap_cents, enforcement").maybeSingle(),
    supabase.from("platform_ai_feature_budgets").select("feature_key, daily_cap_cents, model_override, enabled"),
    supabase
      .from("platform_ai_usage_events")
      .select("feature_key, usage_date, input_tokens, output_tokens, est_cost_cents")
      .gte("usage_date", since),
  ]);

  if (eventsRes.error || budgetsRes.error) {
    return { available: false, settings: null, todayTotalCents: 0, fourteenDayTotalCents: 0, features: [] };
  }

  const budgets = new Map<string, { daily_cap_cents?: unknown; model_override?: unknown; enabled?: unknown }>();
  for (const row of budgetsRes.data ?? []) budgets.set(String(row.feature_key), row);

  const byFeature = new Map<string, AiFeatureUsageRow>();
  for (const key of AI_FEATURE_KEYS) {
    const budget = budgets.get(key);
    byFeature.set(key, {
      featureKey: key,
      todayCalls: 0,
      todayInputTokens: 0,
      todayOutputTokens: 0,
      todayCostCents: 0,
      fourteenDayCostCents: 0,
      capCents: typeof budget?.daily_cap_cents === "number" ? budget.daily_cap_cents : null,
      enabled: budget?.enabled !== false,
      modelOverride: typeof budget?.model_override === "string" ? budget.model_override : null,
    });
  }

  let todayTotalCents = 0;
  let fourteenDayTotalCents = 0;
  for (const event of eventsRes.data ?? []) {
    const row = byFeature.get(String(event.feature_key));
    const cents = Number(event.est_cost_cents) || 0;
    fourteenDayTotalCents += cents;
    if (row) row.fourteenDayCostCents += cents;
    if (event.usage_date === today) {
      todayTotalCents += cents;
      if (row) {
        row.todayCalls += 1;
        row.todayInputTokens += Number(event.input_tokens) || 0;
        row.todayOutputTokens += Number(event.output_tokens) || 0;
        row.todayCostCents += cents;
      }
    }
  }

  const settings =
    settingsRes.error || !settingsRes.data
      ? null
      : {
          dailyCapCents: Number(settingsRes.data.daily_cap_cents) || 0,
          enforcement:
            typeof settingsRes.data.enforcement === "string" ? settingsRes.data.enforcement : "log_only",
        };

  return { available: true, settings, todayTotalCents, fourteenDayTotalCents, features: [...byFeature.values()] };
}

/** Caps arrive as form text; only whole non-negative cent amounts are valid. */
function parseCapCents(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function updateAiBudgets(form: FormData): Promise<{ ok: boolean; error?: string }> {
  const enforcement = String(form.get("enforcement") ?? "");
  if (!(ENFORCEMENT_MODES as readonly string[]).includes(enforcement)) {
    return { ok: false, error: "Pick a valid enforcement mode." };
  }

  const platformCap = parseCapCents(form.get("platform_daily_cap_cents"));
  if (platformCap === null) {
    return { ok: false, error: "Caps must be whole non-negative cent amounts." };
  }

  // A feature's fields may be absent (older form, partial submit) — that row is
  // simply left untouched. Present fields are validated strictly.
  const featureRows: Array<{
    feature_key: AiFeatureKey;
    daily_cap_cents: number;
    model_override: string | null;
    enabled: boolean;
  }> = [];
  for (const key of AI_FEATURE_KEYS) {
    const rawCap = form.get(`cap_${key}`);
    if (rawCap === null) continue;
    const cap = parseCapCents(rawCap);
    if (cap === null) {
      return { ok: false, error: "Caps must be whole non-negative cent amounts." };
    }
    const modelOverride = String(form.get(`model_${key}`) ?? "").trim();
    if (modelOverride.length > MAX_MODEL_OVERRIDE_LENGTH) {
      return { ok: false, error: `Model overrides must be ${MAX_MODEL_OVERRIDE_LENGTH} characters or fewer.` };
    }
    featureRows.push({
      feature_key: key,
      daily_cap_cents: cap,
      model_override: modelOverride || null,
      enabled: form.get(`enabled_${key}`) === "on",
    });
  }

  const supabase: LooseClient = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Singleton settings row: update it when present, seed it otherwise.
  const { data: existing, error: readError } = await supabase
    .from("platform_ai_budget_settings")
    .select("id")
    .maybeSingle();
  if (readError) return { ok: false, error: friendlyError(readError, "Could not load the budget settings.") };

  const settingsPayload = { daily_cap_cents: platformCap, enforcement, updated_by: user?.id ?? null };
  const { error: settingsError } = existing
    ? await supabase.from("platform_ai_budget_settings").update(settingsPayload).eq("id", existing.id)
    : await supabase.from("platform_ai_budget_settings").insert(settingsPayload);
  if (settingsError) return { ok: false, error: friendlyError(settingsError, "Could not save the budget settings.") };

  if (featureRows.length > 0) {
    const { error: featureError } = await supabase
      .from("platform_ai_feature_budgets")
      .upsert(featureRows, { onConflict: "feature_key" });
    if (featureError) return { ok: false, error: friendlyError(featureError, "Could not save the feature budgets.") };
  }

  await recordAuditEvent(
    buildDataAuditEvent(
      "update",
      "platform_ai_budget_settings",
      "singleton",
      user?.id ?? null,
      `AI budgets updated: platform cap ${platformCap}¢/day, enforcement ${enforcement}`,
      null,
      { daily_cap_cents: platformCap, enforcement, features: featureRows },
    ),
  );
  revalidatePath("/employee/platform/ai-services");
  return { ok: true };
}
