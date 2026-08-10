import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { estimateCostCents } from "./pricing";
import { checkAiBudget, recordAiUsage } from "./metering";

const adminMock = vi.mocked(createAdminClient);

// ---------------------------------------------------------------------------
// Chainable stand-in for the service-role client, following the pattern in
// lib/proposals/acceptance-filing.test.ts. Routes are keyed `${table}:${op}`.
// ---------------------------------------------------------------------------
interface QueryRecord {
  table: string;
  op: "select" | "insert";
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

type Route = QueryResult | ((query: QueryRecord) => QueryResult);

function createDbMock(routes: Record<string, Route>) {
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
      insert(payload: Record<string, unknown>) {
        record.op = "insert";
        record.payload = payload;
        return api;
      },
      eq(column: string, value: unknown) {
        record.filters.push([column, value]);
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
  };
}

type DbMock = ReturnType<typeof createDbMock>;

function useDb(routes: Record<string, Route>): DbMock {
  const db = createDbMock(routes);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminMock.mockReturnValue(db as any);
  return db;
}

function settingsRow(overrides: Record<string, unknown> = {}) {
  return { daily_cap_cents: 500, enforcement: "log_only", ...overrides };
}

function featureRow(overrides: Record<string, unknown> = {}) {
  return { daily_cap_cents: 100, model_override: null, enabled: true, ...overrides };
}

/** Ledger rows for today: [featureKey, cents] pairs. */
function ledger(rows: Array<[string, number]>) {
  return rows.map(([feature_key, est_cost_cents]) => ({ feature_key, est_cost_cents }));
}

const DENIAL_MESSAGE = "AI budget reached for today. It resets at midnight UTC.";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// checkAiBudget
// ---------------------------------------------------------------------------
describe("checkAiBudget", () => {
  it("fails open with the bootstrap cap when service-role credentials are missing", async () => {
    adminMock.mockReturnValue(null);

    expect(await checkAiBudget("ai_command")).toEqual({
      allowed: true,
      remainingCents: 500,
      modelOverride: null,
    });
  });

  it("fails open when the metering tables do not exist yet", async () => {
    useDb({
      "platform_ai_budget_settings:select": {
        error: { code: "42P01", message: 'relation "platform_ai_budget_settings" does not exist' },
      },
    });

    expect((await checkAiBudget("legal_research")).allowed).toBe(true);
  });

  it("fails open on a settings read error, since the mode is unknown", async () => {
    useDb({ "platform_ai_budget_settings:select": { error: { message: "network down" } } });

    expect((await checkAiBudget("legal_research")).allowed).toBe(true);
  });

  it("log_only allows even when spending exceeds every cap", async () => {
    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow() },
      "platform_ai_feature_budgets:select": { data: featureRow() },
      "platform_ai_usage_events:select": {
        data: ledger([["legal_research", 400], ["ai_command", 300]]),
      },
    });

    const decision = await checkAiBudget("legal_research");
    expect(decision).toEqual({ allowed: true, remainingCents: 0, modelOverride: null });
  });

  it("log_only allows a disabled feature — only enforce turns features off", async () => {
    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow() },
      "platform_ai_feature_budgets:select": { data: featureRow({ enabled: false }) },
      "platform_ai_usage_events:select": { data: [] },
    });

    expect((await checkAiBudget("lead_triage")).allowed).toBe(true);
  });

  it("passes the feature's model override through on an allowed decision", async () => {
    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow() },
      "platform_ai_feature_budgets:select": { data: featureRow({ model_override: "gpt-4o-mini" }) },
      "platform_ai_usage_events:select": { data: [] },
    });

    const decision = await checkAiBudget("talent_sourcing");
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.modelOverride).toBe("gpt-4o-mini");
  });

  it("sums only today's UTC ledger", async () => {
    const db = useDb({
      "platform_ai_budget_settings:select": { data: settingsRow() },
      "platform_ai_feature_budgets:select": { data: featureRow() },
      "platform_ai_usage_events:select": { data: [] },
    });

    await checkAiBudget("ai_command");

    const ledgerQuery = db.calls.find((call) => call.table === "platform_ai_usage_events");
    expect(ledgerQuery?.filters).toEqual([["usage_date", new Date().toISOString().slice(0, 10)]]);
  });

  it("kill_switch denies even with an empty ledger", async () => {
    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow({ enforcement: "kill_switch" }) },
      "platform_ai_usage_events:select": { data: [] },
    });

    expect(await checkAiBudget("ai_command")).toEqual({
      allowed: false,
      reason: "kill_switch",
      message: DENIAL_MESSAGE,
    });
  });

  it("enforce denies at the platform daily cap", async () => {
    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow({ enforcement: "enforce" }) },
      "platform_ai_feature_budgets:select": { data: featureRow() },
      "platform_ai_usage_events:select": {
        data: ledger([["legal_research", 300], ["talent_sourcing", 200]]),
      },
    });

    expect(await checkAiBudget("ai_command")).toEqual({
      allowed: false,
      reason: "platform_cap",
      message: DENIAL_MESSAGE,
    });
  });

  it("enforce denies at the feature daily cap while the platform cap has room", async () => {
    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow({ enforcement: "enforce" }) },
      "platform_ai_feature_budgets:select": { data: featureRow({ daily_cap_cents: 25 }) },
      "platform_ai_usage_events:select": { data: ledger([["lead_triage", 25]]) },
    });

    expect(await checkAiBudget("lead_triage")).toEqual({
      allowed: false,
      reason: "feature_cap",
      message: DENIAL_MESSAGE,
    });
  });

  it("enforce denies a disabled feature", async () => {
    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow({ enforcement: "enforce" }) },
      "platform_ai_feature_budgets:select": { data: featureRow({ enabled: false }) },
      "platform_ai_usage_events:select": { data: [] },
    });

    const decision = await checkAiBudget("website_command");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("feature_disabled");
  });

  it("enforce denies at the 200-calls/day platform backstop even when cents are cheap", async () => {
    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow({ enforcement: "enforce" }) },
      "platform_ai_feature_budgets:select": { data: featureRow() },
      "platform_ai_usage_events:select": {
        data: ledger(Array.from({ length: 200 }, () => ["ai_command", 0.01] as [string, number])),
      },
    });

    const decision = await checkAiBudget("legal_research");
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toBe("call_backstop");
  });

  it("enforce allows under every cap and reports the tighter remaining budget", async () => {
    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow({ enforcement: "enforce" }) },
      "platform_ai_feature_budgets:select": { data: featureRow() },
      "platform_ai_usage_events:select": {
        data: ledger([["ai_command", 20], ["legal_research", 30]]),
      },
    });

    // platform: 500 - 50 = 450; feature: 100 - 20 = 80 — the tighter one wins.
    expect(await checkAiBudget("ai_command")).toEqual({
      allowed: true,
      remainingCents: 80,
      modelOverride: null,
    });
  });

  it("fails open on a ledger read error in log_only, closed in enforce", async () => {
    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow() },
      "platform_ai_feature_budgets:select": { data: featureRow() },
      "platform_ai_usage_events:select": { error: { message: "timeout" } },
    });
    expect((await checkAiBudget("ai_command")).allowed).toBe(true);

    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow({ enforcement: "enforce" }) },
      "platform_ai_feature_budgets:select": { data: featureRow() },
      "platform_ai_usage_events:select": { error: { message: "timeout" } },
    });
    expect((await checkAiBudget("ai_command")).allowed).toBe(false);
  });

  it("fails open on a feature read error in log_only, closed in enforce", async () => {
    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow() },
      "platform_ai_feature_budgets:select": { error: { message: "timeout" } },
    });
    expect((await checkAiBudget("ai_command")).allowed).toBe(true);

    useDb({
      "platform_ai_budget_settings:select": { data: settingsRow({ enforcement: "enforce" }) },
      "platform_ai_feature_budgets:select": { error: { message: "timeout" } },
    });
    expect((await checkAiBudget("ai_command")).allowed).toBe(false);
  });

  it("uses seeded defaults when settings and feature rows are missing", async () => {
    useDb({
      "platform_ai_budget_settings:select": { data: null },
      "platform_ai_feature_budgets:select": { data: null },
      "platform_ai_usage_events:select": { data: [] },
    });

    // Missing rows, mode unknown => log_only defaults: platform 500, feature 100.
    expect(await checkAiBudget("ai_command")).toEqual({
      allowed: true,
      remainingCents: 100,
      modelOverride: null,
    });
  });
});

// ---------------------------------------------------------------------------
// recordAiUsage
// ---------------------------------------------------------------------------
describe("recordAiUsage", () => {
  it("writes one ledger row with the estimated cost", async () => {
    const db = useDb({ "platform_ai_usage_events:insert": { data: null } });

    await recordAiUsage({
      featureKey: "legal_research",
      callKind: "research",
      runSource: "user",
      userId: "user-1",
      model: "openai/gpt-4o-mini",
      inputTokens: 1000,
      outputTokens: 500,
      webSearchCalls: 2,
    });

    const insert = db.calls.find((call) => call.op === "insert");
    expect(insert?.table).toBe("platform_ai_usage_events");
    expect(insert?.payload).toEqual({
      feature_key: "legal_research",
      call_kind: "research",
      run_source: "user",
      user_id: "user-1",
      model: "openai/gpt-4o-mini",
      input_tokens: 1000,
      output_tokens: 500,
      web_search_calls: 2,
      est_cost_cents: estimateCostCents("openai/gpt-4o-mini", 1000, 500, 2),
    });
  });

  it("defaults the optional fields to null and zero", async () => {
    const db = useDb({ "platform_ai_usage_events:insert": { data: null } });

    await recordAiUsage({
      featureKey: "talent_sourcing",
      runSource: "cron",
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 20,
    });

    expect(db.calls.find((call) => call.op === "insert")?.payload).toMatchObject({
      call_kind: null,
      user_id: null,
      web_search_calls: 0,
    });
  });

  it("never throws when the insert fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    useDb({ "platform_ai_usage_events:insert": { error: { message: "permission denied" } } });

    await expect(
      recordAiUsage({ featureKey: "ai_command", runSource: "user", model: "gpt-4o", inputTokens: 1, outputTokens: 1 }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("never throws when the admin client is missing or blows up", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    adminMock.mockReturnValue(null);
    await expect(
      recordAiUsage({ featureKey: "ai_command", runSource: "user", model: "gpt-4o", inputTokens: 1, outputTokens: 1 }),
    ).resolves.toBeUndefined();

    adminMock.mockImplementation(() => {
      throw new Error("env exploded");
    });
    await expect(
      recordAiUsage({ featureKey: "ai_command", runSource: "user", model: "gpt-4o", inputTokens: 1, outputTokens: 1 }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
