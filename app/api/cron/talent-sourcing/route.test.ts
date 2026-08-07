import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The admin client and the search provider are the two things this route must
// not really reach: one holds the service role key, the other goes to the web.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

// The error class is declared INSIDE the factory: `vi.mock` is hoisted above
// every import, so a class declared in the module body would still be in its
// temporal dead zone when the factory runs.
vi.mock("@/lib/talent-engine/sourcing", () => {
  class SourcingUnavailableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "SourcingUnavailableError";
    }
  }

  return {
    searchSourcingLeads: vi.fn(),
    // Deduped by source url, matching the real helper's contract closely
    // enough that the in-batch dedupe path is exercised rather than skipped.
    dedupeLeads: vi.fn((leads: Array<{ source_url: string }>) => {
      const seen = new Set<string>();
      return leads.filter((lead) => {
        const key = String(lead?.source_url ?? "").toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }),
    buildSourcingActivitySummary: vi.fn(
      (runType: string, inserted: number, found: number) =>
        `Sourcing Agent reviewed ${found} ${runType} result(s) and filed ${inserted} new lead(s).`,
    ),
    buildSourcingQuerySummary: vi.fn((runType: string) => `Planned search for ${runType}`),
    SourcingUnavailableError,
  };
});

import { createAdminClient } from "@/lib/supabase/admin";
import { searchSourcingLeads, SourcingUnavailableError } from "@/lib/talent-engine/sourcing";
import { GET } from "./route";

const adminMock = vi.mocked(createAdminClient);

// Loosely typed on purpose: the search returns a provider-shaped payload that
// these fixtures only need to be structurally compatible with.
type LooseMock = ReturnType<typeof vi.fn>;
const searchMock = searchSourcingLeads as unknown as LooseMock;
const UnavailableError = SourcingUnavailableError as unknown as new (message: string) => Error;

const CRON_SECRET = "test-cron-secret";
const RUNS = "talent_sourcing_runs";
const LEADS = "talent_sourcing_leads";
const ACTIVITY = "talent_activity_log";

// ---------------------------------------------------------------------------
// Chainable PostgREST stand-in, extended from the harness in
// app/employee/talent-engine/actions.test.ts with `upsert` (which records the
// conflict options) and `neq`.
// ---------------------------------------------------------------------------
interface QueryRecord {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  options?: Record<string, unknown>;
  selected?: string;
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
      select(columns?: string) {
        record.selected = columns;
        return api;
      },
      insert(payload: unknown) {
        record.op = "insert";
        record.payload = payload;
        return api;
      },
      upsert(payload: unknown, options?: Record<string, unknown>) {
        record.op = "upsert";
        record.payload = payload;
        record.options = options;
        return api;
      },
      update(payload: unknown) {
        record.op = "update";
        record.payload = payload;
        return api;
      },
      delete() {
        record.op = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        record.filters.push([column, value]);
        return api;
      },
      neq(column: string, value: unknown) {
        record.filters.push([`not:${column}`, value]);
        return api;
      },
      in: () => api,
      is: () => api,
      order: () => api,
      limit: () => api,
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

type SupabaseMock = ReturnType<typeof createSupabaseMock>;

function callsFor(supabase: SupabaseMock, table: string, op: QueryRecord["op"]) {
  return supabase.calls.filter((call) => call.table === table && call.op === op);
}

function lead(overrides: Record<string, unknown> = {}) {
  return {
    title: "Site Safety Manager",
    organization: "Gulf Coast Industrial",
    location: "Houston, TX",
    vertical: "Construction",
    certifications: ["CSP"],
    rate_signal: 92,
    source_url: "https://example.com/jobs/1",
    summary: "Open contract role listing a CSP requirement.",
    ...overrides,
  };
}

function searchResult(leads: Array<Record<string, unknown>>, found?: number) {
  return {
    leads,
    querySummary: "Searched public boards for CSP contract roles",
    raw: { found: found ?? leads.length, rejected: 0 },
  };
}

/** A run row insert that hands back a distinct id per run type. */
function runInsertRoute() {
  let counter = 0;
  return (query: QueryRecord) => {
    counter += 1;
    const payload = query.payload as { run_type?: string } | undefined;
    return { data: { id: `run-${payload?.run_type ?? counter}` } };
  };
}

function request(headers: Record<string, string> = {}) {
  return new Request("https://example.com/api/cron/talent-sourcing", { headers });
}

function authorized() {
  return request({ authorization: `Bearer ${CRON_SECRET}` });
}

const originalSecret = process.env.CRON_SECRET;
const originalVercel = process.env.VERCEL;

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` clears calls but keeps implementations, so the search stub
  // is reset explicitly — otherwise one test's result leaks into the next.
  searchMock.mockReset();
  process.env.CRON_SECRET = CRON_SECRET;
  delete process.env.VERCEL;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
});

// ===========================================================================
// The CRON_SECRET gate
// ===========================================================================

describe("CRON_SECRET verification", () => {
  it("rejects a request with no authorization header", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(adminMock).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret and a bare token without the Bearer scheme", async () => {
    for (const header of [{ authorization: "Bearer nope" }, { authorization: CRON_SECRET }]) {
      const response = await GET(request(header));
      expect(response.status).toBe(401);
    }
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("rejects every request when CRON_SECRET is unset, even a matching one", async () => {
    delete process.env.CRON_SECRET;

    expect((await GET(request({ authorization: "Bearer undefined" }))).status).toBe(401);
    expect((await GET(authorized())).status).toBe(401);
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("requires the x-vercel-cron header in production, so a leaked token cannot be replayed", async () => {
    process.env.VERCEL = "1";

    expect((await GET(authorized())).status).toBe(401);
    expect(adminMock).not.toHaveBeenCalled();

    const supabase = createSupabaseMock({
      [`${RUNS}:insert`]: runInsertRoute(),
      [`${RUNS}:update`]: { data: [{ id: "run-1" }] },
      "talent_job_orders:select": { data: [] },
      "talent_candidates:select": { data: [] },
      [`${LEADS}:upsert`]: { data: [] },
      [`${ACTIVITY}:insert`]: {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminMock.mockReturnValue(supabase as any);
    searchMock.mockResolvedValue(searchResult([]));

    const allowed = await GET(request({ authorization: `Bearer ${CRON_SECRET}`, "x-vercel-cron": "1" }));
    expect(allowed.status).toBe(200);
  });

  it("answers 503 when the admin client cannot be built", async () => {
    adminMock.mockReturnValue(null);

    const response = await GET(authorized());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false });
    expect(searchMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// The happy path
// ===========================================================================

describe("the twice-weekly sweep", () => {
  it("runs both types, files the leads and closes each run row", async () => {
    const supabase = createSupabaseMock({
      [`${RUNS}:insert`]: runInsertRoute(),
      [`${RUNS}:update`]: { data: [{ id: "run-1" }] },
      "talent_job_orders:select": {
        data: [{ id: "jo-1", title: "Site Safety Manager", vertical: "Construction", location: "Houston, TX", cert_requirements: ["CSP"] }],
      },
      "talent_candidates:select": {
        data: [{ id: "c-1", verticals: ["Construction"], certifications: ["CSP", "OSHA 30"], location: "Houston, TX" }],
      },
      [`${LEADS}:upsert`]: (query: QueryRecord) => ({
        data: (query.payload as unknown[]).map((_, index) => ({ id: `lead-${index}` })),
      }),
      [`${ACTIVITY}:insert`]: {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminMock.mockReturnValue(supabase as any);
    searchMock.mockResolvedValue(searchResult([lead(), lead({ source_url: "https://example.com/jobs/2" })], 5));

    const response = await GET(authorized());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.runs).toHaveLength(2);
    expect(body.runs.map((run: { runType: string }) => run.runType)).toEqual(["candidates", "job_orders"]);
    expect(body.runs.every((run: { status: string }) => run.status === "completed")).toBe(true);
    expect(body.leadsInserted).toBe(4);

    // One run row per type, opened as `running` and attributed to the scheduler.
    const runInserts = callsFor(supabase, RUNS, "insert");
    expect(runInserts).toHaveLength(2);
    expect(runInserts[0].payload).toMatchObject({ run_type: "candidates", status: "running", triggered_by: "cron" });
    expect(runInserts[1].payload).toMatchObject({ run_type: "job_orders", status: "running", triggered_by: "cron" });

    // Each one is finalised with the counts and a finish time.
    const runUpdates = callsFor(supabase, RUNS, "update");
    expect(runUpdates).toHaveLength(2);
    expect(runUpdates[0].payload).toMatchObject({ status: "completed", leads_found: 5, leads_inserted: 2, error: null });
    expect(runUpdates[0].payload).toHaveProperty("finished_at");
    expect(runUpdates[0].filters).toContainEqual(["id", "run-candidates"]);

    // Exactly one activity line per run — never one per lead.
    const activity = callsFor(supabase, ACTIVITY, "insert");
    expect(activity).toHaveLength(2);
    expect(activity[0].payload).toMatchObject({
      actor_type: "ai_agent",
      agent_name: "Sourcing Agent",
      action: "web_sourcing_run",
      tier: 1,
    });
    expect(String((activity[0].payload as { summary: string }).summary)).toContain("filed 2 new lead(s)");
  });

  it("builds each run's context from our own tables", async () => {
    const supabase = createSupabaseMock({
      [`${RUNS}:insert`]: runInsertRoute(),
      [`${RUNS}:update`]: { data: [{ id: "run-1" }] },
      "talent_job_orders:select": {
        data: [
          { id: "jo-1", title: "Site Safety Manager", vertical: "Construction", location: "Houston, TX", cert_requirements: ["CSP", "csp", ""] },
          { id: "jo-2", title: "  ", vertical: null, location: null, cert_requirements: null },
        ],
      },
      "talent_candidates:select": {
        data: [
          { id: "c-1", verticals: ["Construction"], certifications: ["CSP"], location: "Houston, TX" },
          { id: "c-2", verticals: ["Construction", "Oil & Gas"], certifications: ["CIH"], location: "Houston, TX" },
        ],
      },
      [`${LEADS}:upsert`]: { data: [] },
      [`${ACTIVITY}:insert`]: {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminMock.mockReturnValue(supabase as any);
    searchMock.mockResolvedValue(searchResult([]));

    await GET(authorized());

    expect(searchMock).toHaveBeenCalledTimes(2);
    const [candidateType, candidateContext] = searchMock.mock.calls[0];
    expect(candidateType).toBe("candidates");
    // Blank titles are dropped, cert lists are de-duplicated case-insensitively.
    expect(candidateContext).toEqual({
      openOrders: [
        { title: "Site Safety Manager", vertical: "Construction", location: "Houston, TX", certRequirements: ["CSP"] },
      ],
    });

    const [orderType, orderContext] = searchMock.mock.calls[1];
    expect(orderType).toBe("job_orders");
    expect(orderContext).toEqual({
      verticals: ["Construction", "Oil & Gas"],
      certifications: ["CSP", "CIH"],
      locations: ["Houston, TX"],
    });

    // Only the live bench informs what work to chase.
    const candidateScan = supabase.calls.find((call) => call.table === "talent_candidates" && call.op === "select");
    expect(candidateScan?.filters).toContainEqual(["not:status", "inactive"]);
    const orderScan = supabase.calls.find((call) => call.table === "talent_job_orders" && call.op === "select");
    expect(orderScan?.filters).toContainEqual(["status", "open"]);
  });
});

// ===========================================================================
// Duplicates
// ===========================================================================

describe("a lead already in the queue is never filed twice", () => {
  it("upserts with ON CONFLICT DO NOTHING and counts only the rows that landed", async () => {
    const supabase = createSupabaseMock({
      [`${RUNS}:insert`]: runInsertRoute(),
      [`${RUNS}:update`]: { data: [{ id: "run-1" }] },
      "talent_job_orders:select": { data: [] },
      "talent_candidates:select": { data: [] },
      // Two rows are sent, the unique index swallows one: PostgREST returns the
      // single row that actually landed.
      [`${LEADS}:upsert`]: { data: [{ id: "lead-1" }] },
      [`${ACTIVITY}:insert`]: {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminMock.mockReturnValue(supabase as any);
    searchMock.mockResolvedValue(
      searchResult([
        lead(),
        // Same URL twice in one batch — dropped before the insert.
        lead({ title: "Site Safety Manager (repost)" }),
        lead({ source_url: "https://example.com/jobs/2" }),
      ]),
    );

    const body = await (await GET(authorized())).json();

    const upserts = callsFor(supabase, LEADS, "upsert");
    expect(upserts).toHaveLength(2);
    // The conflict target and DO NOTHING are what stop a re-run from
    // overwriting a human's accepted/dismissed decision with a fresh `new`.
    expect(upserts[0].options).toEqual({ onConflict: "lead_type,source_url", ignoreDuplicates: true });
    expect(upserts[0].selected).toBe("id");
    // In-batch duplicate removed: three found, two sent.
    expect(upserts[0].payload).toHaveLength(2);
    expect((upserts[0].payload as Array<{ source_url: string }>).map((row) => row.source_url)).toEqual([
      "https://example.com/jobs/1",
      "https://example.com/jobs/2",
    ]);
    // Every row is filed for review only — never promoted.
    expect(upserts[0].payload).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "new", lead_type: "candidates", run_id: "run-candidates" })]),
    );

    // One row landed, not two.
    expect(callsFor(supabase, RUNS, "update")[0].payload).toMatchObject({ leads_found: 3, leads_inserted: 1 });
    expect(body.runs[0].leadsInserted).toBe(1);
  });

  it("skips the insert entirely when the search returns nothing", async () => {
    const supabase = createSupabaseMock({
      [`${RUNS}:insert`]: runInsertRoute(),
      [`${RUNS}:update`]: { data: [{ id: "run-1" }] },
      "talent_job_orders:select": { data: [] },
      "talent_candidates:select": { data: [] },
      [`${ACTIVITY}:insert`]: {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminMock.mockReturnValue(supabase as any);
    searchMock.mockResolvedValue(searchResult([]));

    const response = await GET(authorized());

    expect(response.status).toBe(200);
    expect(callsFor(supabase, LEADS, "upsert")).toHaveLength(0);
    expect(callsFor(supabase, RUNS, "update")[0].payload).toMatchObject({ status: "completed", leads_inserted: 0 });
  });
});

// ===========================================================================
// Failure isolation
// ===========================================================================

describe("one failing run type never costs the other", () => {
  it("records the candidates failure and still completes job orders, at 200", async () => {
    const supabase = createSupabaseMock({
      [`${RUNS}:insert`]: runInsertRoute(),
      [`${RUNS}:update`]: { data: [{ id: "run-1" }] },
      "talent_job_orders:select": { data: [] },
      "talent_candidates:select": { data: [] },
      [`${LEADS}:upsert`]: { data: [{ id: "lead-1" }] },
      [`${ACTIVITY}:insert`]: {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminMock.mockReturnValue(supabase as any);
    searchMock
      .mockRejectedValueOnce(new UnavailableError("The sourcing provider is not configured."))
      .mockResolvedValueOnce(searchResult([lead()]));

    const response = await GET(authorized());
    const body = await response.json();

    // The CRON did its job — a provider outage is not a scheduler failure.
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.runs).toHaveLength(2);
    expect(body.runs[0]).toMatchObject({ runType: "candidates", status: "failed" });
    expect(body.runs[0].error).toContain("not configured");
    expect(body.runs[1]).toMatchObject({ runType: "job_orders", status: "completed", leadsInserted: 1 });

    const runUpdates = callsFor(supabase, RUNS, "update");
    expect(runUpdates[0].payload).toMatchObject({ status: "failed", leads_inserted: 0 });
    expect(String((runUpdates[0].payload as { error: string }).error)).toContain("not configured");
    // A failed run still records what it set out to search for.
    expect(runUpdates[0].payload).toMatchObject({ query_summary: "Planned search for candidates" });
    expect(runUpdates[1].payload).toMatchObject({ status: "completed", leads_inserted: 1 });
  });

  it("marks the run failed when the lead insert is refused", async () => {
    const supabase = createSupabaseMock({
      [`${RUNS}:insert`]: runInsertRoute(),
      [`${RUNS}:update`]: { data: [{ id: "run-1" }] },
      "talent_job_orders:select": { data: [] },
      "talent_candidates:select": { data: [] },
      [`${LEADS}:upsert`]: { error: { code: "42501", message: "permission denied for table talent_sourcing_leads" } },
      [`${ACTIVITY}:insert`]: {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminMock.mockReturnValue(supabase as any);
    searchMock.mockResolvedValue(searchResult([lead()]));

    const body = await (await GET(authorized())).json();

    expect(body.runs.every((run: { status: string }) => run.status === "failed")).toBe(true);
    expect(callsFor(supabase, RUNS, "update")[0].payload).toMatchObject({ status: "failed", leads_inserted: 0 });
  });

  it("does not let a failed activity-log write fail the run", async () => {
    const supabase = createSupabaseMock({
      [`${RUNS}:insert`]: runInsertRoute(),
      [`${RUNS}:update`]: { data: [{ id: "run-1" }] },
      "talent_job_orders:select": { data: [] },
      "talent_candidates:select": { data: [] },
      [`${LEADS}:upsert`]: { data: [{ id: "lead-1" }] },
      [`${ACTIVITY}:insert`]: { error: { code: "42501", message: "permission denied" } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminMock.mockReturnValue(supabase as any);
    searchMock.mockResolvedValue(searchResult([lead()]));

    const body = await (await GET(authorized())).json();

    expect(body.runs.every((run: { status: string }) => run.status === "completed")).toBe(true);
  });
});

// ===========================================================================
// Migration not applied
// ===========================================================================

describe("the sourcing tables are not in the schema cache yet", () => {
  it("answers 200 with a skipped status instead of erroring", async () => {
    const supabase = createSupabaseMock({
      [`${RUNS}:insert`]: {
        error: { code: "PGRST205", message: "Could not find the table 'public.talent_sourcing_runs' in the schema cache" },
      },
      "talent_job_orders:select": { data: [] },
      "talent_candidates:select": { data: [] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminMock.mockReturnValue(supabase as any);

    const response = await GET(authorized());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("skipped");
    expect(String(body.message)).toContain("migrations");
    expect(body.runs).toEqual([]);

    // It stops on the first run type rather than repeating a doomed search.
    expect(searchMock).not.toHaveBeenCalled();
    expect(callsFor(supabase, LEADS, "upsert")).toHaveLength(0);
    expect(callsFor(supabase, RUNS, "insert")).toHaveLength(1);
  });

  it("treats an ordinary run-row failure as a failed run, not a skip", async () => {
    const supabase = createSupabaseMock({
      [`${RUNS}:insert`]: { error: { code: "42501", message: "permission denied for table talent_sourcing_runs" } },
      "talent_job_orders:select": { data: [] },
      "talent_candidates:select": { data: [] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminMock.mockReturnValue(supabase as any);

    const body = await (await GET(authorized())).json();

    expect(body.status).toBe("completed");
    expect(body.runs).toHaveLength(2);
    expect(body.runs.every((run: { status: string; runId: string | null }) => run.status === "failed" && run.runId === null)).toBe(true);
    expect(searchMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Infrastructure faults
// ===========================================================================

describe("infrastructure faults", () => {
  it("returns 500 only when the sweep itself throws", async () => {
    const exploding = {
      from() {
        throw new Error("connection reset");
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminMock.mockReturnValue(exploding as any);

    const response = await GET(authorized());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, error: "connection reset" });
  });
});
