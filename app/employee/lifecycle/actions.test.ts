import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/lifecycle/access", () => ({ getLifecycleAccess: vi.fn() }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, recordAuditEvent: vi.fn(async () => {}) };
});

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { getLifecycleAccess } from "@/lib/lifecycle/access";
import { resolveLifecycleRoleFlags } from "@/lib/lifecycle/policy";
import {
  advanceOpportunity,
  applyTriageDecision,
  createOpportunity,
  exitOpportunity,
  reopenOpportunity,
  skipOpportunityToStep,
  updateOpportunity,
} from "./actions";

const accessMock = vi.mocked(getLifecycleAccess);
const auditMock = vi.mocked(recordAuditEvent);
const revalidateMock = vi.mocked(revalidatePath);

const OPP_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const GOOD_REASON = "Budget pulled for the fiscal year, revisit in Q1.";

/* -------------------------------------------------------------------------- */
/* Chainable Supabase stand-in, following app/employee/files/actions.test.ts   */
/* -------------------------------------------------------------------------- */

interface QueryRecord {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
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
      delete() {
        record.op = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        record.filters.push([column, value]);
        return api;
      },
      order: () => api,
      limit: () => api,
      maybeSingle: () => Promise.resolve(resolve(record)),
      single: () => Promise.resolve(resolve(record)),
      then: (onFulfilled?: any, onRejected?: any) =>
        Promise.resolve(resolve(record)).then(onFulfilled, onRejected),
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

function findCall(supabase: SupabaseMock, table: string, op: QueryRecord["op"]) {
  return supabase.calls.find((call) => call.table === table && call.op === op);
}

/** Signs a user in with the flags the real policy would resolve for `role`. */
function signIn(role: string | null, supabase: unknown) {
  const flags = resolveLifecycleRoleFlags(role, role !== null);
  accessMock.mockResolvedValue({
    supabase,
    userId: USER_ID,
    role,
    userEmail: "dana@example.com",
    ...flags,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function signOut() {
  accessMock.mockResolvedValue({
    supabase: null,
    userId: null,
    role: null,
    userEmail: null,
    canRead: false,
    canManage: false,
    canAdvance: false,
    canSkip: false,
    canExit: false,
    canReopen: false,
    isAdmin: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function opportunity(over: Record<string, unknown> = {}) {
  return {
    id: OPP_ID,
    name: "Northbridge — Predictive Maintenance",
    step: "discovery",
    status: "open",
    client_id: CLIENT_ID,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* RBAC                                                                       */
/* -------------------------------------------------------------------------- */

describe("lifecycle action RBAC", () => {
  it("refuses every action when signed out, and never queries", async () => {
    const supabase = createSupabaseMock({});
    signOut();
    expect((await createOpportunity({ name: "X" })).ok).toBe(false);
    signOut();
    expect(await advanceOpportunity(OPP_ID)).toEqual({ ok: false, error: "You must be signed in." });
    signOut();
    expect((await skipOpportunityToStep(OPP_ID, "discovery", GOOD_REASON)).ok).toBe(false);
    signOut();
    expect((await exitOpportunity(OPP_ID, { status: "closed_lost", reason: GOOD_REASON })).ok).toBe(false);
    signOut();
    expect((await reopenOpportunity(OPP_ID, GOOD_REASON)).ok).toBe(false);
    signOut();
    expect((await updateOpportunity(OPP_ID, { value: 10 })).ok).toBe(false);

    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  // Skipping asserts the intervening work was not needed; reopening un-reports
  // an outcome others have already acted on. Both are admin acts.
  it("refuses skip to a non-admin portal role and never queries", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await skipOpportunityToStep(OPP_ID, "commit_contract", GOOD_REASON);

    expect(result).toEqual({ ok: false, error: "Admin role required to skip or reverse steps." });
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("refuses reopen to a non-admin portal role and never queries", async () => {
    const supabase = createSupabaseMock({});
    signIn("marketing", supabase);

    const result = await reopenOpportunity(OPP_ID, GOOD_REASON);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Admin role required");
    expect(supabase.calls).toHaveLength(0);
  });

  // Deliberately open to everyone — see lib/lifecycle/policy.ts.
  it("lets an in-whitelist non-admin close a deal", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity() },
      "opportunities:update": { data: [{ id: OPP_ID }] },
      "opportunity_stage_events:insert": {},
    });
    signIn("employee", supabase);

    const result = await exitOpportunity(OPP_ID, { status: "closed_lost", reason: GOOD_REASON });

    expect(result).toEqual({ ok: true });
    expect(auditMock.mock.calls[0][0].actor_role).toBe("employee");
  });

  it("refuses every action to a role outside the whitelist", async () => {
    const supabase = createSupabaseMock({});
    signIn("client_user", supabase);

    expect((await createOpportunity({ name: "X" })).ok).toBe(false);
    expect((await advanceOpportunity(OPP_ID)).ok).toBe(false);
    expect((await skipOpportunityToStep(OPP_ID, "discovery", GOOD_REASON)).ok).toBe(false);
    expect((await exitOpportunity(OPP_ID, { status: "closed_lost", reason: GOOD_REASON })).ok).toBe(false);
    expect((await reopenOpportunity(OPP_ID, GOOD_REASON)).ok).toBe(false);

    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed reference before any query", async () => {
    const supabase = createSupabaseMock({});
    signIn("admin", supabase);

    expect(await advanceOpportunity("not-a-uuid")).toEqual({ ok: false, error: "Malformed opportunity reference." });
    expect(supabase.calls).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* createOpportunity                                                          */
/* -------------------------------------------------------------------------- */

describe("createOpportunity", () => {
  // The RLS insert policy enforces the same thing — a deal cannot be conjured
  // straight into Commit / Contract.
  it("always opens at step 1, open, in the creator's name", async () => {
    const supabase = createSupabaseMock({ "opportunities:insert": { data: { id: OPP_ID } } });
    signIn("employee", supabase);

    const result = await createOpportunity({ name: "  Northbridge  ", value: 250000, source: "Website" });

    expect(result.ok).toBe(true);
    expect(findCall(supabase, "opportunities", "insert")?.payload).toMatchObject({
      name: "Northbridge",
      step: "lead_captured",
      status: "open",
      value: 250000,
      created_by: USER_ID,
    });
  });

  it("requires a name", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await createOpportunity({ name: "   " });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.name).toBeTruthy();
    expect(supabase.calls).toHaveLength(0);
  });

  it("treats a missing or negative value as zero rather than refusing", async () => {
    const supabase = createSupabaseMock({ "opportunities:insert": { data: { id: OPP_ID } } });
    signIn("employee", supabase);

    await createOpportunity({ name: "Northbridge", value: -5 });

    expect(findCall(supabase, "opportunities", "insert")?.payload).toMatchObject({ value: 0 });
  });

  it("ignores a malformed close date rather than writing it", async () => {
    const supabase = createSupabaseMock({ "opportunities:insert": { data: { id: OPP_ID } } });
    signIn("employee", supabase);

    await createOpportunity({ name: "Northbridge", expectedCloseDate: "next March" });

    expect(findCall(supabase, "opportunities", "insert")?.payload).toMatchObject({ expected_close_date: null });
  });
});

/* -------------------------------------------------------------------------- */
/* advanceOpportunity                                                         */
/* -------------------------------------------------------------------------- */

describe("advanceOpportunity", () => {
  it("moves forward exactly one step and records the move", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ step: "discovery" }) },
      "opportunities:update": { data: [{ id: OPP_ID }] },
      "opportunity_stage_events:insert": {},
    });
    signIn("employee", supabase);

    expect(await advanceOpportunity(OPP_ID)).toEqual({ ok: true });

    const update = findCall(supabase, "opportunities", "update");
    expect(update?.payload).toMatchObject({ step: "opportunity_qualified", status: "open" });
    // Compare-and-set on BOTH axes: another operator may have moved the step or
    // exited the deal since this page rendered.
    expect(update?.filters).toContainEqual(["step", "discovery"]);
    expect(update?.filters).toContainEqual(["status", "open"]);

    const event = findCall(supabase, "opportunity_stage_events", "insert");
    expect(event?.payload).toMatchObject({
      from_step: "discovery",
      to_step: "opportunity_qualified",
      kind: "advance",
      reason: null,
      steps_skipped: 0,
      changed_by: USER_ID,
    });
  });

  it("refuses at the final step", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ step: "closed_won_onboarded" }) },
    });
    signIn("employee", supabase);

    const result = await advanceOpportunity(OPP_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("last step");
    expect(findCall(supabase, "opportunities", "update")).toBeUndefined();
  });

  it("refuses to move a deal that has left the lifecycle", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ status: "closed_lost" }) },
    });
    signIn("employee", supabase);

    const result = await advanceOpportunity(OPP_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Reopen");
    expect(findCall(supabase, "opportunities", "update")).toBeUndefined();
  });

  // PostgREST reports no error for an UPDATE that matched zero rows.
  it("treats a zero-row update as a concurrent change, not a success", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity() },
      "opportunities:update": { data: [] },
    });
    signIn("employee", supabase);

    const result = await advanceOpportunity(OPP_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("changed while you were looking at it");
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("still succeeds when the history insert fails", async () => {
    // The step has already changed; failing here would report a move that did
    // happen as one that did not.
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity() },
      "opportunities:update": { data: [{ id: OPP_ID }] },
      "opportunity_stage_events:insert": { error: { message: "relation missing" } },
    });
    signIn("employee", supabase);

    expect(await advanceOpportunity(OPP_ID)).toEqual({ ok: true });
  });

  it("revalidates the index and the record", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity() },
      "opportunities:update": { data: [{ id: OPP_ID }] },
      "opportunity_stage_events:insert": {},
    });
    signIn("employee", supabase);

    await advanceOpportunity(OPP_ID);

    expect(revalidateMock).toHaveBeenCalledWith("/employee/lifecycle");
    expect(revalidateMock).toHaveBeenCalledWith(`/employee/lifecycle/${OPP_ID}`);
  });
});

/* -------------------------------------------------------------------------- */
/* skipOpportunityToStep                                                      */
/* -------------------------------------------------------------------------- */

describe("skipOpportunityToStep", () => {
  it("jumps forward, records the distance, and audits at warn", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ step: "lead_captured" }) },
      "opportunities:update": { data: [{ id: OPP_ID }] },
      "opportunity_stage_events:insert": {},
    });
    signIn("super_admin", supabase);

    const result = await skipOpportunityToStep(OPP_ID, "solution_proposal", "Existing client, discovery already done.");

    expect(result).toEqual({ ok: true });
    const event = findCall(supabase, "opportunity_stage_events", "insert");
    expect(event?.payload).toMatchObject({ kind: "skip", steps_skipped: 6 });
    expect(auditMock.mock.calls[0][0].severity).toBe("warn");
  });

  it("records a backwards move as a reversal rather than a skip", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ step: "commit_contract" }) },
      "opportunities:update": { data: [{ id: OPP_ID }] },
      "opportunity_stage_events:insert": {},
    });
    signIn("super_admin", supabase);

    await skipOpportunityToStep(OPP_ID, "discovery", "Scope reopened, back to discovery.");

    expect(findCall(supabase, "opportunity_stage_events", "insert")?.payload).toMatchObject({ kind: "back" });
  });

  it("refuses a reason too short to be worth reading, before any query", async () => {
    const supabase = createSupabaseMock({});
    signIn("super_admin", supabase);

    const result = await skipOpportunityToStep(OPP_ID, "discovery", "later");

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.reason).toBeTruthy();
    expect(supabase.calls).toHaveLength(0);
  });

  it("refuses an unknown step", async () => {
    const supabase = createSupabaseMock({});
    signIn("super_admin", supabase);

    expect((await skipOpportunityToStep(OPP_ID, "nonsense", GOOD_REASON)).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });

  it("refuses a jump to the step it is already on", async () => {
    const supabase = createSupabaseMock({ "opportunities:select": { data: opportunity({ step: "discovery" }) } });
    signIn("super_admin", supabase);

    const result = await skipOpportunityToStep(OPP_ID, "discovery", GOOD_REASON);

    expect(result.ok).toBe(false);
    expect(findCall(supabase, "opportunities", "update")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* exitOpportunity / reopenOpportunity                                        */
/* -------------------------------------------------------------------------- */

describe("exitOpportunity", () => {
  // "Lost at Negotiation" and "lost at Discovery" are different problems.
  it("leaves the step where it was and stamps the exit evidence", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ step: "negotiation_approval" }) },
      "opportunities:update": { data: [{ id: OPP_ID }] },
      "opportunity_stage_events:insert": {},
    });
    signIn("employee", supabase);

    await exitOpportunity(OPP_ID, {
      status: "closed_lost",
      reason: GOOD_REASON,
      competitor: "Acme Safety",
    });

    const update = findCall(supabase, "opportunities", "update");
    expect(update?.payload).toMatchObject({
      step: "negotiation_approval",
      status: "closed_lost",
      exit_reason: GOOD_REASON,
      exit_competitor: "Acme Safety",
      exited_by: USER_ID,
    });
  });

  it("records an On Hold with its follow-up date", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity() },
      "opportunities:update": { data: [{ id: OPP_ID }] },
      "opportunity_stage_events:insert": {},
    });
    signIn("employee", supabase);

    await exitOpportunity(OPP_ID, { status: "on_hold", reason: GOOD_REASON, holdUntil: "2026-11-01" });

    expect(findCall(supabase, "opportunities", "update")?.payload).toMatchObject({
      status: "on_hold",
      hold_until: "2026-11-01",
    });
  });

  it("refuses an exit with no reason, before any query", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await exitOpportunity(OPP_ID, { status: "closed_lost", reason: "" });

    expect(result.ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });

  it("refuses to exit a deal that has already left", async () => {
    const supabase = createSupabaseMock({ "opportunities:select": { data: opportunity({ status: "on_hold" }) } });
    signIn("employee", supabase);

    const result = await exitOpportunity(OPP_ID, { status: "closed_lost", reason: GOOD_REASON });

    expect(result.ok).toBe(false);
    expect(findCall(supabase, "opportunities", "update")).toBeUndefined();
  });
});

describe("reopenOpportunity", () => {
  it("clears the exit evidence and returns it to open at the same step", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ step: "discovery", status: "closed_lost" }) },
      "opportunities:update": { data: [{ id: OPP_ID }] },
      "opportunity_stage_events:insert": {},
    });
    signIn("super_admin", supabase);

    const result = await reopenOpportunity(OPP_ID, "Client came back with funding approved.");

    expect(result).toEqual({ ok: true });
    expect(findCall(supabase, "opportunities", "update")?.payload).toMatchObject({
      step: "discovery",
      status: "open",
      exit_reason: null,
      exit_competitor: null,
      exited_at: null,
    });
    expect(auditMock.mock.calls[0][0].severity).toBe("warn");
  });

  it("refuses to reopen a deal that is already open", async () => {
    const supabase = createSupabaseMock({ "opportunities:select": { data: opportunity({ status: "open" }) } });
    signIn("super_admin", supabase);

    expect((await reopenOpportunity(OPP_ID, GOOD_REASON)).ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* updateOpportunity                                                          */
/* -------------------------------------------------------------------------- */

describe("updateOpportunity", () => {
  it("writes only the keys supplied", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity() },
      "opportunities:update": { data: [{ id: OPP_ID }] },
    });
    signIn("employee", supabase);

    await updateOpportunity(OPP_ID, { probability: 60 });

    const payload = findCall(supabase, "opportunities", "update")?.payload as Record<string, unknown>;
    expect(payload).toEqual({ probability: 60 });
    expect(payload).not.toHaveProperty("value");
  });

  it("starts the SLA clock when an owner is assigned", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity() },
      "opportunities:update": { data: [{ id: OPP_ID }] },
    });
    signIn("employee", supabase);

    await updateOpportunity(OPP_ID, { ownerUserId: USER_ID });

    const payload = findCall(supabase, "opportunities", "update")?.payload as Record<string, unknown>;
    expect(payload.owner_user_id).toBe(USER_ID);
    expect(payload.assigned_at).toBeTruthy();
  });

  it("clears the SLA clock when the owner is removed", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity() },
      "opportunities:update": { data: [{ id: OPP_ID }] },
    });
    signIn("employee", supabase);

    await updateOpportunity(OPP_ID, { ownerUserId: null });

    expect(findCall(supabase, "opportunities", "update")?.payload).toMatchObject({
      owner_user_id: null,
      assigned_at: null,
    });
  });

  it("refuses a probability outside 0-100", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    expect((await updateOpportunity(OPP_ID, { probability: 140 })).ok).toBe(false);
    expect((await updateOpportunity(OPP_ID, { probability: -1 })).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });

  it("refuses a negative value", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await updateOpportunity(OPP_ID, { value: -100 });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.value).toBeTruthy();
  });

  it("is a no-op when nothing was supplied", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    expect(await updateOpportunity(OPP_ID, {})).toEqual({ ok: true });
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* applyTriageDecision — the Human Authority gate                             */
/* -------------------------------------------------------------------------- */

const LEAD_ID = "44444444-4444-4444-8444-444444444444";
const TRIAGE_ID = "55555555-5555-4555-8555-555555555555";

function triageRow(over: Record<string, unknown> = {}) {
  return {
    id: TRIAGE_ID,
    priority_score: 82,
    segment: "Enterprise manufacturing",
    next_step: "Call the safety director to book a demo.",
    rationale: "Senior role, named product.",
    confidence: "high",
    status: "suggested",
    ...over,
  };
}

describe("applyTriageDecision", () => {
  // THE RULE: the nightly triage job writes to lead_triage_results and nowhere
  // else. The score reaches the deal here, because a person pressed accept.
  it("carries the score onto the opportunity only on accept", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ demo_request_id: LEAD_ID }) },
      "lead_triage_results:select": { data: [triageRow()] },
      "lead_triage_results:update": { data: [{ id: TRIAGE_ID }] },
      "opportunities:update": { data: [{ id: OPP_ID }] },
    });
    signIn("employee", supabase);

    expect(await applyTriageDecision(OPP_ID, "accepted")).toEqual({ ok: true });

    const scored = findCall(supabase, "opportunities", "update");
    expect(scored?.payload).toMatchObject({ ai_score: 82, ai_confidence: "high" });
    expect((scored?.payload as Record<string, unknown>).ai_recommendation).toContain("Enterprise manufacturing");

    const decision = findCall(supabase, "lead_triage_results", "update");
    expect(decision?.payload).toMatchObject({ status: "accepted", acted_by: USER_ID });
    expect(auditMock.mock.calls[0][0].event_category).toBe("ai");
  });

  // Dismissing leaves the opportunity unscored, which is the honest state when
  // nobody has agreed with the model.
  it("records a dismissal without touching the opportunity", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ demo_request_id: LEAD_ID }) },
      "lead_triage_results:select": { data: [triageRow()] },
      "lead_triage_results:update": { data: [{ id: TRIAGE_ID }] },
    });
    signIn("employee", supabase);

    expect(await applyTriageDecision(OPP_ID, "dismissed")).toEqual({ ok: true });

    expect(findCall(supabase, "opportunities", "update")).toBeUndefined();
    expect(findCall(supabase, "lead_triage_results", "update")?.payload).toMatchObject({ status: "dismissed" });
  });

  it("refuses a decision that has already been made", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ demo_request_id: LEAD_ID }) },
      "lead_triage_results:select": { data: [triageRow({ status: "accepted" })] },
    });
    signIn("employee", supabase);

    const result = await applyTriageDecision(OPP_ID, "accepted");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("already accepted");
    expect(findCall(supabase, "opportunities", "update")).toBeUndefined();
  });

  // Two reviewers pressing accept at once: the second is told, not silently
  // ignored, because the guarded update matches zero rows.
  it("treats a raced decision as a conflict", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ demo_request_id: LEAD_ID }) },
      "lead_triage_results:select": { data: [triageRow()] },
      "lead_triage_results:update": { data: [] },
    });
    signIn("employee", supabase);

    const result = await applyTriageDecision(OPP_ID, "accepted");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Someone else acted");
    expect(findCall(supabase, "opportunities", "update")).toBeUndefined();
  });

  it("says so when the lead has never been triaged", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ demo_request_id: LEAD_ID }) },
      "lead_triage_results:select": { data: [] },
    });
    signIn("employee", supabase);

    const result = await applyTriageDecision(OPP_ID, "accepted");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not been triaged");
  });

  it("says so when the opportunity has no inbound lead behind it", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ demo_request_id: null }) },
    });
    signIn("employee", supabase);

    const result = await applyTriageDecision(OPP_ID, "accepted");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no inbound lead");
  });

  it("refuses on a deal that has left the lifecycle", async () => {
    const supabase = createSupabaseMock({
      "opportunities:select": { data: opportunity({ demo_request_id: LEAD_ID, status: "closed_lost" }) },
    });
    signIn("employee", supabase);

    expect((await applyTriageDecision(OPP_ID, "accepted")).ok).toBe(false);
  });

  it("refuses an unrecognised decision before any query", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await applyTriageDecision(OPP_ID, "maybe" as any)).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });

  it("refuses when signed out, and never queries", async () => {
    const supabase = createSupabaseMock({});
    signOut();

    expect((await applyTriageDecision(OPP_ID, "accepted")).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });
});
