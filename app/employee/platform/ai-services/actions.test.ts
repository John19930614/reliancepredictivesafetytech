import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ requireClient: vi.fn() }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, recordAuditEvent: vi.fn(async () => {}) };
});

import { revalidatePath } from "next/cache";
import { requireClient } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/events";
import { getAiUsageSummary, updateAiBudgets } from "./actions";

const requireClientMock = vi.mocked(requireClient);
const auditMock = vi.mocked(recordAuditEvent);
const revalidateMock = vi.mocked(revalidatePath);

const SETTINGS_ID = "11111111-1111-4111-8111-111111111111";

// ---------------------------------------------------------------------------
// Minimal chainable stand-in for the Supabase client, following the pattern in
// app/employee/files/actions.test.ts, extended with the upsert/gte surface the
// budget actions use. Routes are keyed `${table}:${op}`.
// ---------------------------------------------------------------------------
interface QueryRecord {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  payload?: unknown;
  options?: unknown;
  filters: Array<[string, unknown]>;
}

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

type Route = QueryResult | ((query: QueryRecord) => QueryResult);

function createSupabaseMock(routes: Record<string, Route>) {
  const calls: QueryRecord[] = [];

  function resolve(record: QueryRecord): { data: unknown; error: unknown } {
    const route = routes[`${record.table}:${record.op}`];
    const result = typeof route === "function" ? route(record) : route;
    return { data: result?.data ?? null, error: result?.error ?? null };
  }

  function builder(record: QueryRecord) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const api: any = {
      select: () => api,
      insert(payload: unknown) {
        record.op = "insert";
        record.payload = payload;
        return api;
      },
      update(payload: unknown) {
        record.op = "update";
        record.payload = payload;
        return api;
      },
      upsert(payload: unknown, options?: unknown) {
        record.op = "upsert";
        record.payload = payload;
        record.options = options;
        return api;
      },
      eq(column: string, value: unknown) {
        record.filters.push([column, value]);
        return api;
      },
      gte(column: string, value: unknown) {
        record.filters.push([`gte:${column}`, value]);
        return api;
      },
      maybeSingle: () => Promise.resolve(resolve(record)),
      single: () => Promise.resolve(resolve(record)),
      then: (onFulfilled?: any, onRejected?: any) => Promise.resolve(resolve(record)).then(onFulfilled, onRejected),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return api;
  }

  return {
    calls,
    from(table: string) {
      const record: QueryRecord = { table, op: "select", filters: [] };
      calls.push(record);
      return builder(record);
    },
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
  };
}

type SupabaseMock = ReturnType<typeof createSupabaseMock>;

function signIn(supabase: SupabaseMock) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requireClientMock.mockResolvedValue(supabase as any);
}

function budgetForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("enforcement", "log_only");
  form.set("platform_daily_cap_cents", "500");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

const utcDay = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString().slice(0, 10);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getAiUsageSummary
// ---------------------------------------------------------------------------
describe("getAiUsageSummary", () => {
  it("reports unavailable instead of crashing when the metering tables are missing", async () => {
    const missing = { error: { code: "42P01", message: "relation does not exist" } };
    const supabase = createSupabaseMock({
      "platform_ai_budget_settings:select": missing,
      "platform_ai_feature_budgets:select": missing,
      "platform_ai_usage_events:select": missing,
    });
    signIn(supabase);

    const summary = await getAiUsageSummary();

    expect(summary).toEqual({
      available: false,
      settings: null,
      todayTotalCents: 0,
      fourteenDayTotalCents: 0,
      features: [],
    });
  });

  it("returns all seven features zeroed when the tables are empty", async () => {
    const supabase = createSupabaseMock({
      "platform_ai_feature_budgets:select": { data: [] },
      "platform_ai_usage_events:select": { data: [] },
    });
    signIn(supabase);

    const summary = await getAiUsageSummary();

    expect(summary.available).toBe(true);
    expect(summary.settings).toBeNull();
    expect(summary.todayTotalCents).toBe(0);
    expect(summary.fourteenDayTotalCents).toBe(0);
    expect(summary.features).toHaveLength(7);
    for (const feature of summary.features) {
      expect(feature.todayCalls).toBe(0);
      expect(feature.fourteenDayCostCents).toBe(0);
      expect(feature.capCents).toBeNull();
      expect(feature.enabled).toBe(true);
    }
  });

  it("groups today's usage per feature inside a 14-day window and maps the budgets", async () => {
    const today = utcDay();
    const fiveDaysAgo = utcDay(5 * 24 * 60 * 60 * 1000);
    const supabase = createSupabaseMock({
      "platform_ai_budget_settings:select": { data: { daily_cap_cents: 750, enforcement: "enforce" } },
      "platform_ai_feature_budgets:select": {
        data: [
          { feature_key: "legal_research", daily_cap_cents: 150, model_override: "gpt-4o-mini", enabled: true },
          { feature_key: "lead_triage", daily_cap_cents: 25, model_override: null, enabled: false },
        ],
      },
      "platform_ai_usage_events:select": {
        data: [
          { feature_key: "legal_research", usage_date: today, input_tokens: 1000, output_tokens: 200, est_cost_cents: 5 },
          { feature_key: "legal_research", usage_date: today, input_tokens: 500, output_tokens: 100, est_cost_cents: 2.5 },
          { feature_key: "talent_sourcing", usage_date: fiveDaysAgo, input_tokens: 100, output_tokens: 10, est_cost_cents: 1 },
        ],
      },
    });
    signIn(supabase);

    const summary = await getAiUsageSummary();

    expect(summary.available).toBe(true);
    expect(summary.settings).toEqual({ dailyCapCents: 750, enforcement: "enforce" });
    expect(summary.todayTotalCents).toBe(7.5);
    expect(summary.fourteenDayTotalCents).toBe(8.5);

    const legal = summary.features.find((f) => f.featureKey === "legal_research");
    expect(legal).toMatchObject({
      todayCalls: 2,
      todayInputTokens: 1500,
      todayOutputTokens: 300,
      todayCostCents: 7.5,
      fourteenDayCostCents: 7.5,
      capCents: 150,
      modelOverride: "gpt-4o-mini",
      enabled: true,
    });

    const talent = summary.features.find((f) => f.featureKey === "talent_sourcing");
    expect(talent).toMatchObject({ todayCalls: 0, todayCostCents: 0, fourteenDayCostCents: 1, capCents: null });

    expect(summary.features.find((f) => f.featureKey === "lead_triage")?.enabled).toBe(false);

    // The ledger query is bounded to the window, not the whole table.
    const eventsQuery = supabase.calls.find((c) => c.table === "platform_ai_usage_events");
    expect(eventsQuery?.filters).toEqual([["gte:usage_date", utcDay(13 * 24 * 60 * 60 * 1000)]]);
  });
});

// ---------------------------------------------------------------------------
// updateAiBudgets — validation happens before any database access
// ---------------------------------------------------------------------------
describe("updateAiBudgets validation", () => {
  it("rejects an unknown enforcement mode without touching the database", async () => {
    const result = await updateAiBudgets(budgetForm({ enforcement: "unlimited" }));

    expect(result).toEqual({ ok: false, error: "Pick a valid enforcement mode." });
    expect(requireClientMock).not.toHaveBeenCalled();
  });

  it("rejects a negative platform cap", async () => {
    const result = await updateAiBudgets(budgetForm({ platform_daily_cap_cents: "-1" }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("non-negative");
    expect(requireClientMock).not.toHaveBeenCalled();
  });

  it("rejects a fractional feature cap", async () => {
    const result = await updateAiBudgets(budgetForm({ cap_legal_research: "12.5" }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("non-negative");
    expect(requireClientMock).not.toHaveBeenCalled();
  });

  it("rejects an empty platform cap", async () => {
    const result = await updateAiBudgets(budgetForm({ platform_daily_cap_cents: "  " }));

    expect(result.ok).toBe(false);
    expect(requireClientMock).not.toHaveBeenCalled();
  });

  it("rejects an over-long model override", async () => {
    const result = await updateAiBudgets(
      budgetForm({ cap_legal_research: "100", model_legal_research: "x".repeat(81) }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("80 characters");
    expect(requireClientMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// updateAiBudgets — persistence
// ---------------------------------------------------------------------------
describe("updateAiBudgets", () => {
  it("updates the singleton settings row, upserts feature budgets, audits, and revalidates", async () => {
    const supabase = createSupabaseMock({
      "platform_ai_budget_settings:select": { data: { id: SETTINGS_ID } },
      "platform_ai_budget_settings:update": { data: null },
      "platform_ai_feature_budgets:upsert": { data: null },
    });
    signIn(supabase);

    const result = await updateAiBudgets(
      budgetForm({
        enforcement: "enforce",
        platform_daily_cap_cents: "750",
        cap_legal_research: "200",
        model_legal_research: "  gpt-4o-mini  ",
        enabled_legal_research: "on",
        cap_lead_triage: "25",
      }),
    );

    expect(result).toEqual({ ok: true });

    const update = supabase.calls.find((c) => c.op === "update");
    expect(update?.table).toBe("platform_ai_budget_settings");
    expect(update?.payload).toEqual({ daily_cap_cents: 750, enforcement: "enforce", updated_by: "user-1" });
    expect(update?.filters).toEqual([["id", SETTINGS_ID]]);

    const upsert = supabase.calls.find((c) => c.op === "upsert");
    expect(upsert?.table).toBe("platform_ai_feature_budgets");
    expect(upsert?.options).toEqual({ onConflict: "feature_key" });
    // Trimmed override; unchecked checkbox means disabled; absent override is null.
    expect(upsert?.payload).toEqual([
      { feature_key: "legal_research", daily_cap_cents: 200, model_override: "gpt-4o-mini", enabled: true },
      { feature_key: "lead_triage", daily_cap_cents: 25, model_override: null, enabled: false },
    ]);

    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(revalidateMock).toHaveBeenCalledWith("/employee/platform/ai-services");
  });

  it("seeds the settings row when the singleton is missing", async () => {
    const supabase = createSupabaseMock({
      "platform_ai_budget_settings:select": { data: null },
      "platform_ai_budget_settings:insert": { data: null },
    });
    signIn(supabase);

    const result = await updateAiBudgets(budgetForm({ platform_daily_cap_cents: "300" }));

    expect(result).toEqual({ ok: true });
    const insert = supabase.calls.find((c) => c.op === "insert");
    expect(insert?.table).toBe("platform_ai_budget_settings");
    expect(insert?.payload).toMatchObject({ daily_cap_cents: 300, enforcement: "log_only" });
  });

  it("surfaces an RLS denial as a friendly permission error and stops", async () => {
    const supabase = createSupabaseMock({
      "platform_ai_budget_settings:select": { data: { id: SETTINGS_ID } },
      "platform_ai_budget_settings:update": { error: { code: "42501", message: "permission denied" } },
    });
    signIn(supabase);

    const result = await updateAiBudgets(budgetForm({ cap_legal_research: "100" }));

    expect(result).toEqual({ ok: false, error: "You do not have permission to do that." });
    expect(supabase.calls.some((c) => c.op === "upsert")).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
