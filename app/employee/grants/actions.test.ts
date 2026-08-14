import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/grants/access", () => ({ getGrantTrackerAccess: vi.fn() }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  // buildDataAuditEvent must survive so the payload shape is genuinely asserted.
  return { ...actual, recordAuditEvent: vi.fn(async () => {}) };
});

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { getGrantTrackerAccess } from "@/lib/grants/access";
import { resolveGrantRoleFlags } from "@/lib/grants/policy";
import {
  changeGrantStatus,
  createGrantOpportunity,
  deleteGrantOpportunity,
  recordGrantFeePayment,
  updateGrantOpportunity,
} from "./actions";

const accessMock = vi.mocked(getGrantTrackerAccess);
const auditMock = vi.mocked(recordAuditEvent);
const revalidateMock = vi.mocked(revalidatePath);

const GRANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const TABLE = "company_grant_opportunities";
const GOOD_REASON = "Programme requires Canadian revenue, which we do not have.";

/* -------------------------------------------------------------------------- */
/* Chainable Supabase stand-in, following app/employee/lifecycle/actions.test.ts */
/* -------------------------------------------------------------------------- */

interface QueryRecord {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
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
      or: () => api,
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

function findCall(supabase: SupabaseMock, table: string, op: QueryRecord["op"]) {
  return supabase.calls.find((call) => call.table === table && call.op === op);
}

/** Signs a user in with the flags the real policy would resolve for `role`. */
function signIn(role: string | null, supabase: unknown) {
  const flags = resolveGrantRoleFlags(role, role !== null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  accessMock.mockResolvedValue({ supabase, userId: USER_ID, role, ...flags } as any);
}

function signOut() {
  accessMock.mockResolvedValue({
    supabase: null,
    userId: null,
    role: null,
    canRead: false,
    canManage: false,
    canChangeStatus: false,
    canRecordOutcome: false,
    canEditClosed: false,
    canDelete: false,
    isAdmin: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function grant(over: Record<string, unknown> = {}) {
  return {
    id: GRANT_ID,
    name: "SBIR",
    status: "researching",
    fee_amount: 15,
    fee_paid: false,
    award_amount: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* RBAC                                                                       */
/* -------------------------------------------------------------------------- */

describe("grant actions — RBAC", () => {
  it("refuses every action when signed out, without touching the database", async () => {
    signOut();

    for (const result of [
      await createGrantOpportunity({ name: "SBIR" }),
      await updateGrantOpportunity(GRANT_ID, { name: "SBIR" }),
      await changeGrantStatus(GRANT_ID, { status: "application_submitted" }),
      await recordGrantFeePayment(GRANT_ID, true),
      await deleteGrantOpportunity(GRANT_ID),
    ]) {
      expect(result.ok).toBe(false);
      expect(result.error).toBe("You must be signed in.");
    }

    expect(auditMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("refuses a delete for a non-admin and never queries", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await deleteGrantOpportunity(GRANT_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Admin role required to permanently delete a grant.");
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("allows an admin to delete, and audits the whole row", async () => {
    const supabase = createSupabaseMock({
      [`${TABLE}:select`]: { data: grant() },
      [`${TABLE}:delete`]: { data: [{ id: GRANT_ID }] },
    });
    signIn("admin", supabase);

    const result = await deleteGrantOpportunity(GRANT_ID);

    expect(result.ok).toBe(true);
    expect(findCall(supabase, TABLE, "delete")).toBeDefined();
    expect(auditMock).toHaveBeenCalledTimes(1);
    const payload = auditMock.mock.calls[0][0];
    expect(payload.event_type).toBe("data.delete");
    expect(payload.resource_type).toBe("grant_opportunity");
    expect(payload.actor_role).toBe("admin");
    expect(payload.severity).toBe("warn");
    // The audit event is the only remaining record of the row.
    expect(payload.before_state).toMatchObject({ name: "SBIR" });
  });

  it("refuses to edit a decided grant unless the caller is an admin", async () => {
    const closed = { [`${TABLE}:select`]: { data: grant({ status: "not_eligible" }) } };

    const employeeDb = createSupabaseMock(closed);
    signIn("employee", employeeDb);
    const denied = await updateGrantOpportunity(GRANT_ID, { name: "Zensurance" });
    expect(denied.ok).toBe(false);
    expect(denied.error).toBe("Admin role required to edit a grant that has already been decided.");
    expect(findCall(employeeDb, TABLE, "update")).toBeUndefined();

    const adminDb = createSupabaseMock({ ...closed, [`${TABLE}:update`]: { data: [{ id: GRANT_ID }] } });
    signIn("company_admin", adminDb);
    const allowed = await updateGrantOpportunity(GRANT_ID, { name: "Zensurance" });
    expect(allowed.ok).toBe(true);
  });

  it("lets a non-admin record a decline — reporting a 'no' is not an admin act", async () => {
    // Asserted explicitly so tightening this later is a conscious change.
    const supabase = createSupabaseMock({
      [`${TABLE}:select`]: { data: grant({ status: "application_submitted" }) },
      [`${TABLE}:update`]: { data: [{ id: GRANT_ID }] },
    });
    signIn("marketing", supabase);

    const result = await changeGrantStatus(GRANT_ID, { status: "declined", outcomeReason: GOOD_REASON });

    expect(result.ok).toBe(true);
  });

  it("refuses to reopen a decided grant for a non-admin", async () => {
    const supabase = createSupabaseMock({ [`${TABLE}:select`]: { data: grant({ status: "declined" }) } });
    signIn("employee", supabase);

    const result = await changeGrantStatus(GRANT_ID, { status: "researching" });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Admin role required to reopen a grant that has already been decided.");
    expect(findCall(supabase, TABLE, "update")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* createGrantOpportunity                                                     */
/* -------------------------------------------------------------------------- */

describe("createGrantOpportunity", () => {
  it("pins created_by to the caller and defaults to identified", async () => {
    const supabase = createSupabaseMock({ [`${TABLE}:insert`]: { data: { id: GRANT_ID } } });
    signIn("employee", supabase);

    const result = await createGrantOpportunity({ name: "  SBIR  ", subAgency: "NOAA" });

    expect(result.ok).toBe(true);
    const payload = findCall(supabase, TABLE, "insert")?.payload as Record<string, unknown>;
    expect(payload.created_by).toBe(USER_ID);
    expect(payload.name).toBe("SBIR");
    expect(payload.sub_agency).toBe("NOAA");
    expect(payload.status).toBe("identified");
    expect(revalidateMock).toHaveBeenCalledWith("/employee/grants");
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0].event_type).toBe("data.create");
  });

  it("rejects an invalid grant before any query", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await createGrantOpportunity({ name: "" });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.name).toBe("Program name is required.");
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("translates a duplicate into a sentence rather than a constraint string", async () => {
    const supabase = createSupabaseMock({
      [`${TABLE}:insert`]: { error: { code: "23505", message: "duplicate key value violates unique constraint" } },
    });
    signIn("employee", supabase);

    const result = await createGrantOpportunity({ name: "SBIR", subAgency: "NOAA" });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("That record already exists.");
    expect(auditMock).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* updateGrantOpportunity                                                     */
/* -------------------------------------------------------------------------- */

describe("updateGrantOpportunity", () => {
  it("patches only the keys the caller supplied", async () => {
    const supabase = createSupabaseMock({
      [`${TABLE}:select`]: { data: grant() },
      [`${TABLE}:update`]: { data: [{ id: GRANT_ID }] },
    });
    signIn("employee", supabase);

    const result = await updateGrantOpportunity(GRANT_ID, { nextAction: "Pay the filing fee" });

    expect(result.ok).toBe(true);
    const payload = findCall(supabase, TABLE, "update")?.payload as Record<string, unknown>;
    expect(payload).toEqual({ next_action: "Pay the filing fee" });
    // An edit to one field must not blank fields the form never rendered.
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("notes");
  });

  it("never lets status or outcome_reason through the field patch", async () => {
    const supabase = createSupabaseMock({
      [`${TABLE}:select`]: { data: grant() },
      [`${TABLE}:update`]: { data: [{ id: GRANT_ID }] },
    });
    signIn("employee", supabase);

    await updateGrantOpportunity(GRANT_ID, {
      nextAction: "Chase NOAA",
      // Smuggled in — these belong to changeGrantStatus.
      status: "awarded",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const payload = findCall(supabase, TABLE, "update")?.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("outcome_reason");
    expect(payload).not.toHaveProperty("decided_at");
  });

  it("is a no-op when nothing was supplied", async () => {
    const supabase = createSupabaseMock({ [`${TABLE}:select`]: { data: grant() } });
    signIn("employee", supabase);

    const result = await updateGrantOpportunity(GRANT_ID, {});

    expect(result.ok).toBe(true);
    expect(findCall(supabase, TABLE, "update")).toBeUndefined();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("treats an empty update result as a denial, not a success", async () => {
    // PostgREST reports no error for an UPDATE that matched zero rows.
    const supabase = createSupabaseMock({
      [`${TABLE}:select`]: { data: grant() },
      [`${TABLE}:update`]: { data: [] },
    });
    signIn("employee", supabase);

    const result = await updateGrantOpportunity(GRANT_ID, { nextAction: "Chase NOAA" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("raises severity when the patch touches money", async () => {
    const supabase = createSupabaseMock({
      [`${TABLE}:select`]: { data: grant() },
      [`${TABLE}:update`]: { data: [{ id: GRANT_ID }] },
    });
    signIn("employee", supabase);

    await updateGrantOpportunity(GRANT_ID, { feeAmount: 125, feeKind: "membership" });

    expect(auditMock.mock.calls[0][0].severity).toBe("warn");
  });

  it("rejects a malformed grant id before querying", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await updateGrantOpportunity("not-a-uuid", { nextAction: "x" });

    expect(result.ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* changeGrantStatus                                                          */
/* -------------------------------------------------------------------------- */

describe("changeGrantStatus", () => {
  it("compare-and-sets on the status it validated against", async () => {
    const supabase = createSupabaseMock({
      [`${TABLE}:select`]: { data: grant({ status: "researching" }) },
      [`${TABLE}:update`]: { data: [{ id: GRANT_ID }] },
    });
    signIn("employee", supabase);

    const result = await changeGrantStatus(GRANT_ID, { status: "application_submitted" });

    expect(result.ok).toBe(true);
    const call = findCall(supabase, TABLE, "update");
    expect(call?.filters).toContainEqual(["id", GRANT_ID]);
    expect(call?.filters).toContainEqual(["status", "researching"]);
  });

  it("leaves the trigger-owned timestamps out of the patch", async () => {
    const supabase = createSupabaseMock({
      [`${TABLE}:select`]: { data: grant() },
      [`${TABLE}:update`]: { data: [{ id: GRANT_ID }] },
    });
    signIn("employee", supabase);

    await changeGrantStatus(GRANT_ID, { status: "application_submitted" });

    const payload = findCall(supabase, TABLE, "update")?.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("status_changed_at");
    expect(payload).not.toHaveProperty("decided_at");
    expect(payload).not.toHaveProperty("submitted_at");
  });

  it("reports a concurrent change instead of claiming success", async () => {
    const supabase = createSupabaseMock({
      [`${TABLE}:select`]: { data: grant() },
      [`${TABLE}:update`]: { data: [] },
    });
    signIn("employee", supabase);

    const result = await changeGrantStatus(GRANT_ID, { status: "application_submitted" });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("This grant changed while you were looking at it. Reload and try again.");
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rejects a no-op transition without querying for an update", async () => {
    const supabase = createSupabaseMock({ [`${TABLE}:select`]: { data: grant({ status: "researching" }) } });
    signIn("employee", supabase);

    const result = await changeGrantStatus(GRANT_ID, { status: "researching" });

    expect(result.ok).toBe(false);
    expect(findCall(supabase, TABLE, "update")).toBeUndefined();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rejects a thin closing reason", async () => {
    const supabase = createSupabaseMock({ [`${TABLE}:select`]: { data: grant() } });
    signIn("employee", supabase);

    const result = await changeGrantStatus(GRANT_ID, { status: "declined", outcomeReason: "no" });

    expect(result.ok).toBe(false);
    expect(findCall(supabase, TABLE, "update")).toBeUndefined();
  });

  it("audits a closure at warn severity", async () => {
    const supabase = createSupabaseMock({
      [`${TABLE}:select`]: { data: grant({ status: "application_submitted" }) },
      [`${TABLE}:update`]: { data: [{ id: GRANT_ID }] },
    });
    signIn("admin", supabase);

    await changeGrantStatus(GRANT_ID, { status: "awarded", outcomeReason: GOOD_REASON, awardAmount: 20000 });

    expect(auditMock).toHaveBeenCalledTimes(1);
    const payload = auditMock.mock.calls[0][0];
    expect(payload.severity).toBe("warn");
    expect(payload.summary).toContain("application_submitted");
    expect(payload.summary).toContain("awarded");
  });
});

/* -------------------------------------------------------------------------- */
/* recordGrantFeePayment                                                      */
/* -------------------------------------------------------------------------- */

describe("recordGrantFeePayment", () => {
  it("refuses to mark a fee paid when there is no amount", async () => {
    // Checked before the write so the CHECK constraint never fires.
    const supabase = createSupabaseMock({ [`${TABLE}:select`]: { data: grant({ fee_amount: null }) } });
    signIn("employee", supabase);

    const result = await recordGrantFeePayment(GRANT_ID, true);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Record the fee amount before marking it paid.");
    expect(findCall(supabase, TABLE, "update")).toBeUndefined();
  });

  it("records a payment and audits it as a money event", async () => {
    const supabase = createSupabaseMock({
      [`${TABLE}:select`]: { data: grant({ fee_amount: 15, fee_paid: false }) },
      [`${TABLE}:update`]: { data: [{ id: GRANT_ID }] },
    });
    signIn("employee", supabase);

    const result = await recordGrantFeePayment(GRANT_ID, true);

    expect(result.ok).toBe(true);
    expect(findCall(supabase, TABLE, "update")?.payload).toEqual({ fee_paid: true });
    expect(auditMock.mock.calls[0][0].severity).toBe("warn");
  });

  it("is a no-op when the flag already matches", async () => {
    const supabase = createSupabaseMock({ [`${TABLE}:select`]: { data: grant({ fee_paid: true }) } });
    signIn("employee", supabase);

    const result = await recordGrantFeePayment(GRANT_ID, true);

    expect(result.ok).toBe(true);
    expect(findCall(supabase, TABLE, "update")).toBeUndefined();
    expect(auditMock).not.toHaveBeenCalled();
  });
});
