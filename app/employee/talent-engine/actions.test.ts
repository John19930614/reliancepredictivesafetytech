import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/talent-engine/access", () => ({ getTalentAccess: vi.fn() }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, recordAuditEvent: vi.fn(async () => {}) };
});

import { revalidatePath } from "next/cache";
import { getTalentAccess } from "@/lib/talent-engine/access";
import { recordAuditEvent } from "@/lib/audit/events";
import { resolveTalentRoleFlags } from "@/lib/talent-engine/policy";
import {
  approveMatch,
  counterMatch,
  createCandidate,
  createJobOrder,
  createMatch,
  createPlacement,
  holdMatch,
  logTimesheet,
  rejectMatch,
  setJobOrderStatus,
  submitMatch,
  updateCandidate,
  updateJobOrder,
  updateTalentSettings,
  verifyCandidateCertification,
} from "./actions";

const getAccessMock = vi.mocked(getTalentAccess);
const auditMock = vi.mocked(recordAuditEvent);
const revalidateMock = vi.mocked(revalidatePath);

const JOB_ORDER_ID = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_ID = "22222222-2222-4222-8222-222222222222";
const MATCH_ID = "33333333-3333-4333-8333-333333333333";
const PLACEMENT_ID = "44444444-4444-4444-8444-444444444444";
const SETTINGS_ID = "55555555-5555-4555-8555-555555555555";
const CLIENT_ID = "66666666-6666-4666-8666-666666666666";

// ---------------------------------------------------------------------------
// Minimal chainable stand-in for the Supabase PostgREST client, matching the
// harness in app/employee/proposals/actions.test.ts. Each `from()` records the
// table, operation, filters and payload; the test supplies a route table keyed
// by "<table>:<op>".
// ---------------------------------------------------------------------------
interface QueryRecord {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: Record<string, unknown>;
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
      insert(payload: Record<string, unknown>) {
        record.op = "insert";
        record.payload = payload;
        return api;
      },
      update(payload: Record<string, unknown>) {
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

/** Signs a user in with the flags the real policy would resolve for `role`. */
function signIn(role: string | null, supabase: unknown, overrides: Record<string, unknown> = {}) {
  const flags = resolveTalentRoleFlags(role, role !== null);
  getAccessMock.mockResolvedValue({
    supabase,
    userId: "user-1",
    role,
    ...flags,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function settingsRow(overrides: Record<string, unknown> = {}) {
  return [
    {
      id: SETTINGS_ID,
      min_spread_per_hour: 20,
      target_markup_pct: 33,
      default_hours_per_week: 40,
      pay_rate_autonomy_tier: 2,
      ...overrides,
    },
  ];
}

function jobOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ORDER_ID,
    title: "Site Safety Manager",
    client_id: CLIENT_ID,
    vertical: "Construction",
    location: "Houston, TX",
    cert_requirements: ["CSP"],
    bill_rate: 95,
    min_spread: null,
    status: "open",
    start_date: "2026-09-01",
    ...overrides,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: CANDIDATE_ID,
    full_name: "Dana Reyes",
    certifications: ["CSP"],
    verified_certifications: ["CSP"],
    years_experience: 12,
    verticals: ["Construction"],
    location: "Houston, TX",
    willing_to_relocate: false,
    pay_expectation: 68,
    availability_date: "2026-08-15",
    status: "available",
    ...overrides,
  };
}

function match(overrides: Record<string, unknown> = {}) {
  return {
    id: MATCH_ID,
    job_order_id: JOB_ORDER_ID,
    candidate_id: CANDIDATE_ID,
    status: "pending_approval",
    bill_rate: 95,
    pay_rate: 68,
    spread: 27,
    markup_pct: 39.71,
    floor_ok: true,
    fit_score: 92,
    requires_human_review: true,
    proposed_pay_rate: null,
    ...overrides,
  };
}

function placement(overrides: Record<string, unknown> = {}) {
  return {
    id: PLACEMENT_ID,
    match_id: MATCH_ID,
    job_order_id: JOB_ORDER_ID,
    candidate_id: CANDIDATE_ID,
    bill_rate: 95,
    pay_rate: 68,
    status: "active",
    ...overrides,
  };
}

const okRow = { data: [{ id: MATCH_ID }] };

function findCall(supabase: SupabaseMock, table: string, op: QueryRecord["op"]) {
  return supabase.calls.find((c) => c.table === table && c.op === op);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// PERMISSION MATRIX (CLAUDE.md: correct role can access, incorrect is denied)
// ===========================================================================

describe("permission matrix — approveMatch", () => {
  it("allows an oversight manager (canApprove) to approve", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match() },
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder() },
      "talent_settings:select": { data: settingsRow() },
      "talent_match_approvals:insert": {},
      "talent_activity_log:insert": {},
    });
    signIn("company_admin", supabase);

    const result = await approveMatch(MATCH_ID);

    expect(result).toEqual({ ok: true });
    expect(findCall(supabase, "talent_match_approvals", "insert")?.payload).toMatchObject({
      match_id: MATCH_ID,
      decision: "approve",
      reviewer_id: "user-1",
      reviewer_role: "company_admin",
    });
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(revalidateMock).toHaveBeenCalledWith("/employee/talent-engine");
  });

  it("DENIES approveMatch to a recruiter who may propose but not approve", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await approveMatch(MATCH_ID);

    expect(result).toEqual({ ok: false, error: "You do not have permission to approve matches." });
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe("permission matrix — submitMatch", () => {
  it("allows an oversight manager to submit an approved, fully verified match", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match({ status: "approved" }) },
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder() },
      "talent_candidates:select": { data: candidate() },
      "talent_settings:select": { data: settingsRow() },
      "talent_activity_log:insert": {},
    });
    signIn("company_admin", supabase);

    expect(await submitMatch(MATCH_ID)).toEqual({ ok: true });
    expect(findCall(supabase, "talent_matches", "update")?.payload).toMatchObject({ status: "submitted" });
  });

  it("DENIES submitMatch to a recruiter", async () => {
    const supabase = createSupabaseMock({});
    signIn("internal_reviewer", supabase);

    const result = await submitMatch(MATCH_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("permission to submit");
    expect(supabase.calls).toHaveLength(0);
  });
});

describe("permission matrix — createPlacement", () => {
  it("allows a role with canManagePlacements to open a placement", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match({ status: "submitted" }) },
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder() },
      "talent_candidates:select": { data: candidate() },
      "talent_settings:select": { data: settingsRow() },
      "talent_placements:insert": { data: { id: PLACEMENT_ID } },
      "talent_activity_log:insert": {},
    });
    signIn("company_admin", supabase);

    const result = await createPlacement(MATCH_ID, "2026-09-01");

    expect(result).toEqual({ ok: true, placementId: PLACEMENT_ID });
    // The rates are copied off the MATCH, never from the caller.
    expect(findCall(supabase, "talent_placements", "insert")?.payload).toMatchObject({
      match_id: MATCH_ID,
      bill_rate: 95,
      pay_rate: 68,
      start_date: "2026-09-01",
      status: "active",
    });
  });

  it("DENIES createPlacement to a recruiter without canManagePlacements", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await createPlacement(MATCH_ID, "2026-09-01");

    expect(result).toEqual({ ok: false, error: "You do not have permission to open placements." });
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe("permission matrix — counterMatch", () => {
  it("allows a rate-setting role to counter and recomputes the money server-side", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match() },
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder() },
      "talent_candidates:select": { data: candidate() },
      "talent_settings:select": { data: settingsRow() },
      "talent_match_approvals:insert": {},
      "talent_activity_log:insert": {},
    });
    signIn("company_admin", supabase);

    const result = await counterMatch(MATCH_ID, 70, "Best and final");

    expect(result).toEqual({ ok: true });
    const update = findCall(supabase, "talent_matches", "update");
    expect(update?.payload).toMatchObject({
      pay_rate: 70,
      spread: 25,
      floor_ok: true,
      status: "counter_proposed",
      proposed_pay_rate: null,
      // A re-priced match is unreviewed by definition.
      requires_human_review: true,
    });
    expect(update?.payload?.markup_pct).toBeCloseTo(35.71, 2);
    expect(findCall(supabase, "talent_match_approvals", "insert")?.payload).toMatchObject({
      decision: "counter",
      pay_rate_before: 68,
      pay_rate_after: 70,
      bill_rate_before: 95,
      bill_rate_after: 95,
    });
  });

  it("DENIES counterMatch to a recruiter who cannot set rates", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await counterMatch(MATCH_ID, 70);

    expect(result).toEqual({ ok: false, error: "You do not have permission to change rates." });
    expect(supabase.calls).toHaveLength(0);
  });

  it("re-validates the posted rate before it reaches a query", async () => {
    const supabase = createSupabaseMock({ "talent_matches:select": { data: match() } });
    signIn("company_admin", supabase);

    for (const bad of [Number.NaN, -5, 100000]) {
      const result = await counterMatch(MATCH_ID, bad);
      expect(result.ok).toBe(false);
      expect(result.fieldErrors?.newPayRate).toBeTruthy();
    }
    expect(supabase.calls).toHaveLength(0);
  });
});

describe("permission matrix — updateTalentSettings", () => {
  it("allows a platform owner to move the money floor", async () => {
    const supabase = createSupabaseMock({
      "talent_settings:select": { data: settingsRow() },
      "talent_settings:update": { data: [{ id: SETTINGS_ID }] },
      "talent_activity_log:insert": {},
    });
    signIn("platform_admin", supabase);

    const result = await updateTalentSettings({ minSpreadPerHour: 25 });

    expect(result).toEqual({ ok: true });
    const update = findCall(supabase, "talent_settings", "update");
    expect(update?.payload).toMatchObject({ min_spread_per_hour: 25, updated_by: "user-1" });
    expect(update?.filters).toContainEqual(["id", SETTINGS_ID]);
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  it("DENIES updateTalentSettings to a company admin who is not a platform owner", async () => {
    const supabase = createSupabaseMock({});
    signIn("company_admin", supabase);

    const result = await updateTalentSettings({ minSpreadPerHour: 1 });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Admin role required");
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("never INSERTs into the migration-seeded singleton", async () => {
    const supabase = createSupabaseMock({
      "talent_settings:select": { data: [] },
      "talent_settings:update": { data: [{ id: SETTINGS_ID }] },
    });
    signIn("platform_admin", supabase);

    const result = await updateTalentSettings({ minSpreadPerHour: 25 });

    expect(result.ok).toBe(false);
    expect(supabase.calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("bounds every settings field before it reaches a numeric column", async () => {
    const supabase = createSupabaseMock({ "talent_settings:select": { data: settingsRow() } });
    signIn("platform_admin", supabase);

    expect((await updateTalentSettings({ minSpreadPerHour: -1 })).fieldErrors?.minSpreadPerHour).toBeTruthy();
    expect((await updateTalentSettings({ targetMarkupPct: 99999 })).fieldErrors?.targetMarkupPct).toBeTruthy();
    expect((await updateTalentSettings({ defaultHoursPerWeek: 200 })).fieldErrors?.defaultHoursPerWeek).toBeTruthy();
    expect((await updateTalentSettings({ defaultHoursPerWeek: 0 })).fieldErrors?.defaultHoursPerWeek).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await updateTalentSettings({ payRateAutonomyTier: 9 as any })).fieldErrors?.payRateAutonomyTier)
      .toBeTruthy();
    expect(supabase.calls).toHaveLength(0);
  });
});

describe("permission matrix — the read-only account manager", () => {
  it("denies every mutating action to a role with read access only", async () => {
    const supabase = createSupabaseMock({});
    signIn("marketing", supabase);

    expect((await createJobOrder({ title: "X" })).ok).toBe(false);
    expect((await updateJobOrder(JOB_ORDER_ID, { title: "X" })).ok).toBe(false);
    expect((await setJobOrderStatus(JOB_ORDER_ID, "closed")).ok).toBe(false);
    expect((await createCandidate({ fullName: "X" })).ok).toBe(false);
    expect((await updateCandidate(CANDIDATE_ID, { fullName: "X" })).ok).toBe(false);
    expect((await verifyCandidateCertification(CANDIDATE_ID, "CSP")).ok).toBe(false);
    expect((await createMatch(JOB_ORDER_ID, CANDIDATE_ID)).ok).toBe(false);
    expect((await approveMatch(MATCH_ID)).ok).toBe(false);
    expect((await rejectMatch(MATCH_ID)).ok).toBe(false);
    expect((await holdMatch(MATCH_ID)).ok).toBe(false);
    expect((await counterMatch(MATCH_ID, 70)).ok).toBe(false);
    expect((await submitMatch(MATCH_ID)).ok).toBe(false);
    expect((await createPlacement(MATCH_ID, "2026-09-01")).ok).toBe(false);
    expect((await logTimesheet(PLACEMENT_ID, "2026-09-07", 40)).ok).toBe(false);
    expect((await updateTalentSettings({ minSpreadPerHour: 1 })).ok).toBe(false);

    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("denies everything to a role outside the portal whitelist", async () => {
    const supabase = createSupabaseMock({});
    signIn("client_user", supabase);

    expect((await createJobOrder({ title: "X" })).error).toContain("access to the Talent Engine");
    expect((await createMatch(JOB_ORDER_ID, CANDIDATE_ID)).error).toContain("access to the Talent Engine");
    expect(supabase.calls).toHaveLength(0);
  });

  it("denies a signed-out caller before any query", async () => {
    getAccessMock.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: null, userId: null, role: null, canRead: false, canPropose: false, canSetRate: false,
      canApprove: false, canManagePlacements: false, isAdmin: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(await createJobOrder({ title: "X" })).toEqual({ ok: false, error: "You must be signed in." });
    expect(await approveMatch(MATCH_ID)).toEqual({ ok: false, error: "You must be signed in." });
  });
});

// ===========================================================================
// BLUEPRINT GUARDRAILS
// ===========================================================================

describe("submittal is blocked by an unverified required certification", () => {
  it("refuses to submit when a required cert is held but not verified", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match({ status: "approved" }) },
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder({ cert_requirements: ["CSP", "OSHA 30"] }) },
      "talent_candidates:select": { data: candidate({ certifications: ["CSP", "OSHA 30"], verified_certifications: ["CSP"] }) },
      "talent_settings:select": { data: settingsRow() },
    });
    signIn("company_admin", supabase);

    const result = await submitMatch(MATCH_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("OSHA 30");
    expect(result.error).toContain("has not been verified");
    expect(supabase.calls.some((c) => c.table === "talent_matches" && c.op === "update")).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("blocks a placement through the same gate, so it cannot be a back door", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match({ status: "submitted" }) },
      "talent_job_orders:select": { data: jobOrder({ cert_requirements: ["CIH"] }) },
      "talent_candidates:select": { data: candidate({ certifications: ["CIH"], verified_certifications: [] }) },
      "talent_settings:select": { data: settingsRow() },
      "talent_placements:insert": { data: { id: PLACEMENT_ID } },
    });
    signIn("company_admin", supabase);

    const result = await createPlacement(MATCH_ID, "2026-09-01");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("CIH");
    expect(supabase.calls.some((c) => c.table === "talent_placements" && c.op === "insert")).toBe(false);
  });

  it("submits once the certification has been verified", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match({ status: "approved" }) },
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder({ cert_requirements: ["CSP", "OSHA 30"] }) },
      "talent_candidates:select": {
        data: candidate({ certifications: ["CSP", "OSHA 30"], verified_certifications: ["CSP", "osha 30"] }),
      },
      "talent_settings:select": { data: settingsRow() },
      "talent_activity_log:insert": {},
    });
    signIn("company_admin", supabase);

    expect((await submitMatch(MATCH_ID)).ok).toBe(true);
  });
});

describe("a below-floor match cannot be submitted without an approval", () => {
  const belowFloor = match({ status: "approved", pay_rate: 85, spread: 10, floor_ok: false });

  it("blocks the submittal when no approval is on record", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: belowFloor },
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder() },
      "talent_candidates:select": { data: candidate() },
      "talent_settings:select": { data: settingsRow() },
      "talent_match_approvals:select": { data: [] },
    });
    signIn("company_admin", supabase);

    const result = await submitMatch(MATCH_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no approval is on record");
    expect(supabase.calls.some((c) => c.table === "talent_matches" && c.op === "update")).toBe(false);
  });

  it("allows the submittal once a human approval exists", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: belowFloor },
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder() },
      "talent_candidates:select": { data: candidate() },
      "talent_settings:select": { data: settingsRow() },
      "talent_match_approvals:select": { data: [{ id: "approval-1" }] },
      "talent_activity_log:insert": {},
    });
    signIn("company_admin", supabase);

    expect((await submitMatch(MATCH_ID)).ok).toBe(true);
    const approvalQuery = supabase.calls.find((c) => c.table === "talent_match_approvals" && c.op === "select");
    expect(approvalQuery?.filters).toContainEqual(["decision", "approve"]);
  });

  it("makes a below-floor approval demand a written justification", async () => {
    const routes = {
      "talent_matches:select": { data: match({ pay_rate: 85, spread: 10, floor_ok: false }) },
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder() },
      "talent_settings:select": { data: settingsRow() },
      "talent_match_approvals:insert": {},
      "talent_activity_log:insert": {},
    };

    const bare = createSupabaseMock(routes);
    signIn("company_admin", bare);
    const refused = await approveMatch(MATCH_ID);
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain("under the");
    expect(bare.calls.some((c) => c.op === "update")).toBe(false);

    const justified = createSupabaseMock(routes);
    signIn("company_admin", justified);
    const accepted = await approveMatch(MATCH_ID, "Strategic account, approved by the CFO.");
    expect(accepted.ok).toBe(true);
    expect(findCall(justified, "talent_matches", "update")?.payload).toMatchObject({ floor_ok: false });
    expect(findCall(justified, "talent_match_approvals", "insert")?.payload).toMatchObject({
      note: "Strategic account, approved by the CFO.",
    });
  });

  it("re-derives the floor check from the stored rates, not the stored flag", async () => {
    // The row LIES: floor_ok says true while the rates say otherwise. The
    // server must believe the arithmetic.
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match({ pay_rate: 90, spread: 27, floor_ok: true }) },
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder() },
      "talent_settings:select": { data: settingsRow() },
    });
    signIn("company_admin", supabase);

    const result = await approveMatch(MATCH_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("under the");
  });

  it("honours a per-order floor override above the agency default", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match() }, // $27 spread
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder({ min_spread: 30 }) },
      "talent_settings:select": { data: settingsRow() },
    });
    signIn("company_admin", supabase);

    expect((await approveMatch(MATCH_ID)).ok).toBe(false);
  });
});

// ===========================================================================
// NO SILENT NO-OP WRITES
// ===========================================================================

describe("no silent no-op writes", () => {
  it("reports failure when an approve update affects zero rows", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match() },
      "talent_matches:update": { data: [] },
      "talent_job_orders:select": { data: jobOrder() },
      "talent_settings:select": { data: settingsRow() },
    });
    signIn("company_admin", supabase);

    const result = await approveMatch(MATCH_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("That record was not found, or you do not have permission to change it.");
    // No approval row and no audit event for a write that never landed.
    expect(supabase.calls.some((c) => c.table === "talent_match_approvals")).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("reports failure when a job order update affects zero rows", async () => {
    const supabase = createSupabaseMock({
      "talent_job_orders:select": { data: jobOrder() },
      "talent_job_orders:update": { data: [] },
    });
    signIn("employee", supabase);

    const result = await updateJobOrder(JOB_ORDER_ID, { title: "Renamed" });

    expect(result.ok).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("reports failure when a settings update affects zero rows", async () => {
    const supabase = createSupabaseMock({
      "talent_settings:select": { data: settingsRow() },
      "talent_settings:update": { data: [] },
    });
    signIn("platform_admin", supabase);

    expect((await updateTalentSettings({ minSpreadPerHour: 25 })).ok).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("reports failure for an id that does not exist", async () => {
    const supabase = createSupabaseMock({ "talent_matches:select": { data: null } });
    signIn("company_admin", supabase);

    expect((await approveMatch("99999999-9999-4999-8999-999999999999")).ok).toBe(false);
    expect(supabase.calls.some((c) => c.op === "update")).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed id before it reaches a filter", async () => {
    const supabase = createSupabaseMock({});
    signIn("company_admin", supabase);

    for (const bad of ["", "not-a-uuid", "'; drop table talent_matches; --"]) {
      expect((await approveMatch(bad)).ok).toBe(false);
      expect((await submitMatch(bad)).ok).toBe(false);
      expect((await counterMatch(bad, 70)).ok).toBe(false);
      expect((await createPlacement(bad, "2026-09-01")).ok).toBe(false);
      expect((await logTimesheet(bad, "2026-09-07", 40)).ok).toBe(false);
      expect((await verifyCandidateCertification(bad, "CSP")).ok).toBe(false);
    }
    expect(supabase.calls).toHaveLength(0);
  });
});

// ===========================================================================
// TIMESHEETS — the caller supplies hours, never money
// ===========================================================================

describe("logTimesheet ignores caller-supplied rates", () => {
  it("computes the amounts from the placement's stored rates", async () => {
    const supabase = createSupabaseMock({
      // The placement's rates differ from the match's on purpose.
      "talent_placements:select": { data: placement({ bill_rate: 95, pay_rate: 68 }) },
      "talent_timesheets:insert": { data: { id: "ts-1" } },
      "talent_activity_log:insert": {},
    });
    signIn("employee", supabase);

    const result = await logTimesheet(PLACEMENT_ID, "2026-09-07", 40);

    expect(result).toEqual({ ok: true, timesheetId: "ts-1" });
    expect(findCall(supabase, "talent_timesheets", "insert")?.payload).toMatchObject({
      placement_id: PLACEMENT_ID,
      week_starting: "2026-09-07",
      hours: 40,
      bill_rate: 95,
      pay_rate: 68,
      amount_billed: 3800,
      amount_paid: 2720,
      status: "draft",
    });
  });

  it("drops any rate the caller smuggles into the payload", async () => {
    const supabase = createSupabaseMock({
      "talent_placements:select": { data: placement() },
      "talent_timesheets:insert": { data: { id: "ts-1" } },
      "talent_activity_log:insert": {},
    });
    signIn("employee", supabase);

    // A script posting an object where a number belongs must not get a rate in.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const smuggled = await logTimesheet(PLACEMENT_ID, "2026-09-07", { hours: 40, bill_rate: 9999 } as any);
    expect(smuggled.ok).toBe(false);
    expect(supabase.calls.some((c) => c.op === "insert")).toBe(false);

    const honest = await logTimesheet(PLACEMENT_ID, "2026-09-07", 40);
    expect(honest.ok).toBe(true);
    const payload = findCall(supabase, "talent_timesheets", "insert")?.payload ?? {};
    expect(payload.bill_rate).toBe(95);
    expect(JSON.stringify(payload)).not.toContain("9999");
  });

  it("bounds the hours against the column check", async () => {
    const supabase = createSupabaseMock({ "talent_placements:select": { data: placement() } });
    signIn("employee", supabase);

    expect((await logTimesheet(PLACEMENT_ID, "2026-09-07", 200)).ok).toBe(false);
    expect((await logTimesheet(PLACEMENT_ID, "2026-09-07", -1)).ok).toBe(false);
    expect((await logTimesheet(PLACEMENT_ID, "2026-09-07", Number.NaN)).ok).toBe(false);
    expect((await logTimesheet(PLACEMENT_ID, "2026-02-30", 40)).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });

  it("refuses hours against a placement that is not active", async () => {
    const supabase = createSupabaseMock({ "talent_placements:select": { data: placement({ status: "completed" }) } });
    signIn("employee", supabase);

    expect((await logTimesheet(PLACEMENT_ID, "2026-09-07", 40)).ok).toBe(false);
  });

  it("corrects an existing week in place rather than failing on the unique index", async () => {
    const supabase = createSupabaseMock({
      "talent_placements:select": { data: placement() },
      "talent_timesheets:insert": { error: { code: "23505", message: "duplicate key value" } },
      "talent_timesheets:update": { data: [{ id: "ts-1" }] },
      "talent_activity_log:insert": {},
    });
    signIn("employee", supabase);

    const result = await logTimesheet(PLACEMENT_ID, "2026-09-07", 32);

    expect(result).toEqual({ ok: true, timesheetId: "ts-1" });
    expect(result.error).toBeUndefined();
    const correction = findCall(supabase, "talent_timesheets", "update");
    expect(correction?.payload).toMatchObject({ hours: 32, amount_billed: 3040, amount_paid: 2176 });
    expect(correction?.filters).toContainEqual(["placement_id", PLACEMENT_ID]);
    expect(correction?.filters).toContainEqual(["week_starting", "2026-09-07"]);
  });
});

// ===========================================================================
// createMatch — the Human Authority gate
// ===========================================================================

describe("createMatch", () => {
  it("scores, prices and drafts the recommendation server-side and lands in pending_approval", async () => {
    const supabase = createSupabaseMock({
      "talent_job_orders:select": { data: jobOrder() },
      "talent_candidates:select": { data: candidate() },
      "talent_settings:select": { data: settingsRow() },
      "talent_matches:insert": { data: { id: MATCH_ID } },
      "talent_activity_log:insert": {},
    });
    signIn("employee", supabase);

    const result = await createMatch(JOB_ORDER_ID, CANDIDATE_ID);

    expect(result).toEqual({ ok: true, matchId: MATCH_ID });
    const payload = findCall(supabase, "talent_matches", "insert")?.payload ?? {};
    expect(payload).toMatchObject({
      job_order_id: JOB_ORDER_ID,
      candidate_id: CANDIDATE_ID,
      bill_rate: 95,
      pay_rate: 68,
      spread: 27,
      floor_ok: true,
      status: "pending_approval",
      requires_human_review: false,
    });
    expect(payload.fit_score).toBeGreaterThan(0);
    expect(String(payload.ai_recommendation)).toContain("Submit to client");
  });

  it("never writes requires_human_review false when a required cert is unverified", async () => {
    const supabase = createSupabaseMock({
      "talent_job_orders:select": { data: jobOrder({ cert_requirements: ["CSP", "OSHA 30"] }) },
      "talent_candidates:select": {
        data: candidate({ certifications: ["CSP", "OSHA 30"], verified_certifications: ["CSP"] }),
      },
      "talent_settings:select": { data: settingsRow() },
      "talent_matches:insert": { data: { id: MATCH_ID } },
      "talent_activity_log:insert": {},
    });
    signIn("employee", supabase);

    await createMatch(JOB_ORDER_ID, CANDIDATE_ID);

    expect(findCall(supabase, "talent_matches", "insert")?.payload?.requires_human_review).toBe(true);
  });

  it("never writes requires_human_review false when the spread is under the floor", async () => {
    const supabase = createSupabaseMock({
      "talent_job_orders:select": { data: jobOrder() },
      "talent_candidates:select": { data: candidate({ pay_expectation: 85 }) },
      "talent_settings:select": { data: settingsRow() },
      "talent_matches:insert": { data: { id: MATCH_ID } },
      "talent_activity_log:insert": {},
    });
    signIn("employee", supabase);

    await createMatch(JOB_ORDER_ID, CANDIDATE_ID);

    const payload = findCall(supabase, "talent_matches", "insert")?.payload ?? {};
    expect(payload.requires_human_review).toBe(true);
    expect(payload.floor_ok).toBe(false);
    // The Margin Agent drafts the counter that restores the floor.
    expect(payload.proposed_pay_rate).toBe(75);
    expect(String(payload.ai_recommendation)).toContain("Spread below your");
  });

  it("takes the rates from the stored rows, never from the caller", async () => {
    const supabase = createSupabaseMock({
      "talent_job_orders:select": { data: jobOrder({ bill_rate: 120 }) },
      "talent_candidates:select": { data: candidate({ pay_expectation: 70 }) },
      "talent_settings:select": { data: settingsRow() },
      "talent_matches:insert": { data: { id: MATCH_ID } },
      "talent_activity_log:insert": {},
    });
    signIn("employee", supabase);

    await createMatch(JOB_ORDER_ID, CANDIDATE_ID);

    expect(findCall(supabase, "talent_matches", "insert")?.payload).toMatchObject({
      bill_rate: 120,
      pay_rate: 70,
      spread: 50,
    });
  });

  it("refuses a job order with no bill rate and a candidate with no pay expectation", async () => {
    const noBill = createSupabaseMock({
      "talent_job_orders:select": { data: jobOrder({ bill_rate: null }) },
      "talent_candidates:select": { data: candidate() },
      "talent_settings:select": { data: settingsRow() },
    });
    signIn("employee", noBill);
    expect((await createMatch(JOB_ORDER_ID, CANDIDATE_ID)).error).toContain("bill rate");
    expect(noBill.calls.some((c) => c.op === "insert")).toBe(false);

    const noPay = createSupabaseMock({
      "talent_job_orders:select": { data: jobOrder() },
      "talent_candidates:select": { data: candidate({ pay_expectation: null }) },
      "talent_settings:select": { data: settingsRow() },
    });
    signIn("employee", noPay);
    expect((await createMatch(JOB_ORDER_ID, CANDIDATE_ID)).error).toContain("pay expectation");
  });

  it("refuses to propose against a closed job order", async () => {
    const supabase = createSupabaseMock({
      "talent_job_orders:select": { data: jobOrder({ status: "closed" }) },
      "talent_candidates:select": { data: candidate() },
      "talent_settings:select": { data: settingsRow() },
    });
    signIn("employee", supabase);

    expect((await createMatch(JOB_ORDER_ID, CANDIDATE_ID)).error).toContain("closed");
  });

  it("translates the duplicate-proposal unique violation into a readable message", async () => {
    const supabase = createSupabaseMock({
      "talent_job_orders:select": { data: jobOrder() },
      "talent_candidates:select": { data: candidate() },
      "talent_settings:select": { data: settingsRow() },
      "talent_matches:insert": { error: { code: "23505", message: 'duplicate key value violates unique constraint' } },
    });
    signIn("employee", supabase);

    const result = await createMatch(JOB_ORDER_ID, CANDIDATE_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("This candidate has already been proposed for that job order.");
    expect(result.error).not.toContain("duplicate key");
  });
});

// ===========================================================================
// Certification verification is a gate, not a data edit
// ===========================================================================

describe("verifyCandidateCertification", () => {
  it("appends a claimed certification to the verified list", async () => {
    const supabase = createSupabaseMock({
      "talent_candidates:select": { data: candidate({ certifications: ["CSP", "OSHA 30"], verified_certifications: ["CSP"] }) },
      "talent_candidates:update": { data: [{ id: CANDIDATE_ID }] },
      "talent_activity_log:insert": {},
    });
    signIn("company_admin", supabase);

    expect(await verifyCandidateCertification(CANDIDATE_ID, "osha 30")).toEqual({ ok: true });
    expect(findCall(supabase, "talent_candidates", "update")?.payload).toEqual({
      verified_certifications: ["CSP", "OSHA 30"],
    });
  });

  it("refuses to verify a certification the candidate does not claim", async () => {
    const supabase = createSupabaseMock({ "talent_candidates:select": { data: candidate() } });
    signIn("company_admin", supabase);

    const result = await verifyCandidateCertification(CANDIDATE_ID, "CIH");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not on this candidate's certification list");
    expect(supabase.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("DENIES verification to the recruiter who proposed the candidate", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await verifyCandidateCertification(CANDIDATE_ID, "CSP");

    expect(result).toEqual({ ok: false, error: "You do not have permission to verify certifications." });
    expect(supabase.calls).toHaveLength(0);
  });

  it("drops a verification when the claimed cert is removed by an edit", async () => {
    const supabase = createSupabaseMock({
      "talent_candidates:select": { data: candidate({ certifications: ["CSP"], verified_certifications: ["CSP"] }) },
      "talent_candidates:update": { data: [{ id: CANDIDATE_ID }] },
      "talent_activity_log:insert": {},
    });
    signIn("employee", supabase);

    expect((await updateCandidate(CANDIDATE_ID, { fullName: "Dana Reyes", certifications: ["CHST"] })).ok).toBe(true);
    expect(findCall(supabase, "talent_candidates", "update")?.payload).toMatchObject({
      certifications: ["CHST"],
      verified_certifications: [],
    });
  });

  it("never lets createCandidate seed its own verifications", async () => {
    const supabase = createSupabaseMock({
      "talent_candidates:insert": { data: { id: CANDIDATE_ID } },
      "talent_activity_log:insert": {},
    });
    signIn("employee", supabase);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createCandidate({ fullName: "Dana Reyes", certifications: ["CSP"], ...({ verified_certifications: ["CSP"] } as any) });

    expect(findCall(supabase, "talent_candidates", "insert")?.payload?.verified_certifications).toEqual([]);
  });
});

// ===========================================================================
// Status gates
// ===========================================================================

describe("match status gates", () => {
  it("refuses to approve a match that is already placed", async () => {
    const supabase = createSupabaseMock({ "talent_matches:select": { data: match({ status: "placed" }) } });
    signIn("company_admin", supabase);

    const result = await approveMatch(MATCH_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("final");
    expect(supabase.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("refuses to submit a match that has not been approved", async () => {
    const supabase = createSupabaseMock({ "talent_matches:select": { data: match({ status: "pending_approval" }) } });
    signIn("company_admin", supabase);

    const result = await submitMatch(MATCH_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("cannot move to submitted");
  });

  it("refuses to re-price a match whose rates are locked", async () => {
    const supabase = createSupabaseMock({ "talent_matches:select": { data: match({ status: "approved" }) } });
    signIn("company_admin", supabase);

    const result = await counterMatch(MATCH_ID, 70);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("locked");
    expect(supabase.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("holds a pending match without changing its status", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match() },
      "talent_matches:update": okRow,
      "talent_match_approvals:insert": {},
      "talent_activity_log:insert": {},
    });
    signIn("company_admin", supabase);

    expect(await holdMatch(MATCH_ID, "Waiting on the client")).toEqual({ ok: true });
    const update = findCall(supabase, "talent_matches", "update");
    expect(update?.payload).toEqual({ requires_human_review: true });
    expect(update?.payload).not.toHaveProperty("status");
    expect(findCall(supabase, "talent_match_approvals", "insert")?.payload).toMatchObject({ decision: "hold" });
  });

  it("rejects a pending match and records the decision", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match() },
      "talent_matches:update": okRow,
      "talent_match_approvals:insert": {},
      "talent_activity_log:insert": {},
    });
    signIn("company_admin", supabase);

    expect(await rejectMatch(MATCH_ID, "Rate too high")).toEqual({ ok: true });
    expect(findCall(supabase, "talent_matches", "update")?.payload).toMatchObject({ status: "rejected" });
    expect(findCall(supabase, "talent_match_approvals", "insert")?.payload).toMatchObject({
      decision: "reject",
      note: "Rate too high",
    });
  });
});

// ===========================================================================
// Append-only tables
// ===========================================================================

describe("append-only tables", () => {
  it("only ever INSERTs into talent_match_approvals and talent_activity_log", async () => {
    const routes: Record<string, Route> = {
      "talent_matches:select": { data: match() },
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder() },
      "talent_candidates:select": { data: candidate() },
      "talent_settings:select": { data: settingsRow() },
      "talent_match_approvals:insert": {},
      "talent_match_approvals:select": { data: [{ id: "approval-1" }] },
      "talent_activity_log:insert": {},
      "talent_placements:insert": { data: { id: PLACEMENT_ID } },
      "talent_timesheets:insert": { data: { id: "ts-1" } },
      "talent_placements:select": { data: placement() },
    };

    const supabase = createSupabaseMock(routes);
    signIn("company_admin", supabase);

    await approveMatch(MATCH_ID, "note");
    await rejectMatch(MATCH_ID, "note");
    await holdMatch(MATCH_ID, "note");
    await counterMatch(MATCH_ID, 70, "note");
    await createJobOrder({ title: "New order" });
    await logTimesheet(PLACEMENT_ID, "2026-09-07", 40);

    const forbidden = supabase.calls.filter(
      (c) =>
        (c.table === "talent_match_approvals" || c.table === "talent_activity_log") &&
        (c.op === "update" || c.op === "delete"),
    );
    expect(forbidden).toEqual([]);
    expect(supabase.calls.some((c) => c.table === "talent_activity_log" && c.op === "insert")).toBe(true);
  });

  it("does not turn a failed activity-log write into a failed action", async () => {
    const supabase = createSupabaseMock({
      "talent_job_orders:insert": { data: { id: JOB_ORDER_ID } },
      "talent_activity_log:insert": { error: { code: "42501", message: "permission denied" } },
    });
    signIn("employee", supabase);

    expect((await createJobOrder({ title: "New order" })).ok).toBe(true);
  });
});

// ===========================================================================
// Input validation
// ===========================================================================

describe("server-side input validation", () => {
  it("rejects hostile createJobOrder payloads before reaching the database", async () => {
    const supabase = createSupabaseMock({});
    signIn("company_admin", supabase);

    expect((await createJobOrder({ title: "   " })).fieldErrors?.title).toBeTruthy();
    expect((await createJobOrder({ title: "T", clientId: "not-a-uuid" })).fieldErrors?.clientId).toBeTruthy();
    expect((await createJobOrder({ title: "T", billRate: 1e9 })).fieldErrors?.billRate).toBeTruthy();
    expect((await createJobOrder({ title: "T", billRate: Number.NaN })).fieldErrors?.billRate).toBeTruthy();
    expect((await createJobOrder({ title: "T", startDate: "2026-02-30" })).fieldErrors?.startDate).toBeTruthy();
    expect((await createJobOrder({ title: "T", openings: 0 })).fieldErrors?.openings).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await createJobOrder({ title: "T", priority: "asap" as any })).fieldErrors?.priority).toBeTruthy();
    expect(supabase.calls).toHaveLength(0);
  });

  it("requires canSetRate to put a bill rate on a job order", async () => {
    const priced = createSupabaseMock({});
    signIn("employee", priced);
    const denied = await createJobOrder({ title: "T", billRate: 95 });
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("permission to set rates");
    expect(priced.calls).toHaveLength(0);

    const unpriced = createSupabaseMock({
      "talent_job_orders:insert": { data: { id: JOB_ORDER_ID } },
      "talent_activity_log:insert": {},
    });
    signIn("employee", unpriced);
    expect((await createJobOrder({ title: "T" })).ok).toBe(true);
  });

  it("requires canSetRate to change an existing bill rate", async () => {
    const supabase = createSupabaseMock({ "talent_job_orders:select": { data: jobOrder() } });
    signIn("employee", supabase);

    const result = await updateJobOrder(JOB_ORDER_ID, { billRate: 120 });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("permission to change the bill rate");
    expect(supabase.calls).toHaveLength(0);
  });

  it("bounds candidate fields", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    expect((await createCandidate({ fullName: "" })).fieldErrors?.fullName).toBeTruthy();
    expect((await createCandidate({ fullName: "D", email: "nope" })).fieldErrors?.email).toBeTruthy();
    expect((await createCandidate({ fullName: "D", yearsExperience: 500 })).fieldErrors?.yearsExperience).toBeTruthy();
    expect((await createCandidate({ fullName: "D", payExpectation: -1 })).fieldErrors?.payExpectation).toBeTruthy();
    expect((await createCandidate({ fullName: "D", availabilityDate: "soon" })).fieldErrors?.availabilityDate)
      .toBeTruthy();
    expect(supabase.calls).toHaveLength(0);
  });

  it("normalises and caps free-text certification lists", async () => {
    const supabase = createSupabaseMock({
      "talent_candidates:insert": { data: { id: CANDIDATE_ID } },
      "talent_activity_log:insert": {},
    });
    signIn("employee", supabase);

    await createCandidate({
      fullName: "Dana Reyes",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      certifications: ["CSP", " CSP ", "", null as any, 7 as any, "a".repeat(200)],
    });

    // Blanks, duplicates (case-insensitive) and non-strings are dropped; what
    // survives is trimmed and capped at the column's practical width.
    const certs = findCall(supabase, "talent_candidates", "insert")?.payload?.certifications as string[];
    expect(certs).toHaveLength(2);
    expect(certs[0]).toBe("CSP");
    expect(certs[1]).toHaveLength(80);
  });

  it("rejects an unknown job order status", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await setJobOrderStatus(JOB_ORDER_ID, "cancelled" as any)).toEqual({
      ok: false,
      error: "Unknown job order status.",
    });
    expect(supabase.calls).toHaveLength(0);
  });
});

// ===========================================================================
// Audit enrichment
// ===========================================================================

describe("audit events", () => {
  it("stamps the actor role and resource on every sensitive action", async () => {
    const supabase = createSupabaseMock({
      "talent_matches:select": { data: match() },
      "talent_matches:update": okRow,
      "talent_job_orders:select": { data: jobOrder() },
      "talent_settings:select": { data: settingsRow() },
      "talent_match_approvals:insert": {},
      "talent_activity_log:insert": {},
    });
    signIn("company_admin", supabase);

    await approveMatch(MATCH_ID);

    expect(auditMock).toHaveBeenCalledTimes(1);
    const event = auditMock.mock.calls[0][0];
    expect(event.actor_role).toBe("company_admin");
    expect(event.actor_id).toBe("user-1");
    expect(event.resource_type).toBe("talent_match");
    expect(event.resource_id).toBe(MATCH_ID);
    expect(event.after_state).toMatchObject({ status: "approved" });
  });
});
