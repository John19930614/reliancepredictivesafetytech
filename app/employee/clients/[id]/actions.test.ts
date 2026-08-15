// Server-action tests for the company record — currently the proposal-numbering
// half of it: assignCompanySlug (decision of record, call 2026-08-14).
//
// The properties under test are the ones that make a numbering identifier safe
// to hand out, and each has a failure it exists to prevent:
//
//   ROLE GATE          a slug is a permanent prefix on documents a client signs
//   COMPARE-AND-SET    PostgREST returns no error for a zero-row UPDATE, so a
//                      write that lost a race must not report success
//   NEVER OVERWRITTEN  an existing slug cannot be replaced by a caller that did
//                      not name the value it was looking at
//   LOCKED IS GRACEFUL the immutability trigger lives in the database and can
//                      fire at any time; its rejection must read as English
//   DUPLICATE IS CLEAR  23505 means another company owns that slug
//
// Supabase stand-in follows app/employee/clients/[id]/workflow/actions.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Imported by the address/contact actions in the same file; the slug path does
// not use it, and a real call would reach next/headers.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => null) }));
vi.mock("@/lib/proposals/access", () => ({ getProposalAccess: vi.fn() }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, recordAuditEvent: vi.fn(async () => {}) };
});

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { getProposalAccess } from "@/lib/proposals/access";
import { portalAdminRoles, portalUserRoles } from "@/lib/user-management";
import { assignCompanySlug } from "./actions";

// Roles come from the catalog, never from literals (CLAUDE.md: no magic role
// strings) — adding a role to portalUserRoles puts it in this matrix by itself.
const adminRoles: readonly string[] = portalAdminRoles;
const anAdmin = adminRoles[0];

const accessMock = vi.mocked(getProposalAccess);
const auditMock = vi.mocked(recordAuditEvent);
const revalidateMock = vi.mocked(revalidatePath);

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const SLUG = "WONDFOUSA";

/* -------------------------------------------------------------------------- */
/* Chainable Supabase stand-in                                                */
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
  count?: number;
}

type Route = QueryResult | ((query: QueryRecord) => QueryResult);

function createSupabaseMock(routes: Record<string, Route>, rpcResult: QueryResult = { data: 0 }) {
  const calls: QueryRecord[] = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];

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
      // Recorded distinctly from eq: `.is(col, null)` is the compare-and-set
      // that makes a first assignment refuse to overwrite.
      is(column: string, value: unknown) {
        record.filters.push([`is:${column}`, value]);
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
    rpcCalls,
    from(table: string) {
      const record: QueryRecord = { table, op: "select", filters: [] };
      calls.push(record);
      return builder(record);
    },
    rpc(fn: string, args: unknown) {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: rpcResult.data ?? null, error: rpcResult.error ?? null });
    },
  };
}

type SupabaseMock = ReturnType<typeof createSupabaseMock>;

function findCall(supabase: SupabaseMock, table: string, op: QueryRecord["op"]) {
  return supabase.calls.find((call) => call.table === table && call.op === op);
}

/** Signs a user in holding `role`. */
function signIn(role: string | null, supabase: unknown) {
  accessMock.mockResolvedValue({
    supabase,
    userId: "user-1",
    role,
    canRead: role !== null,
    canManage: role !== null,
    isAdmin: false,
    canApprove: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function signOut() {
  accessMock.mockResolvedValue({
    supabase: null,
    userId: null,
    role: null,
    canRead: false,
    canManage: false,
    isAdmin: false,
    canApprove: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/** A company row as the pre-write read returns it. */
function companyRow(over: Record<string, unknown> = {}) {
  return { id: CLIENT_ID, name: "Wondfo USA, Inc.", company_slug: null, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Permission matrix (CLAUDE.md: required for an auth-touching change)        */
/* -------------------------------------------------------------------------- */

describe("assignCompanySlug — permission matrix", () => {
  // EMPLOYEE-level, not admin — the same gate assignClientCode() has, and the
  // reason is the workflow rather than a judgement about trust. The slug is
  // assigned from the new-proposal form, before the insert, because a BEFORE
  // INSERT trigger reads it to allocate the number. An admin-only gate would
  // mean a seller cannot number a company's first proposal at all, and the
  // decision of record is that whoever writes that proposal assigns the
  // identifier. It would not protect anything either: company_clients UPDATE is
  // is_company_portal_employee(), so an employee can already PATCH this column
  // directly. lock_company_slug() in the database is the gate that binds.
  it.each(portalUserRoles)("allows %s to assign a slug", async (role) => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: companyRow() },
      "company_clients:update": { data: { id: CLIENT_ID } },
    });
    signIn(role, supabase);

    const result = await assignCompanySlug(CLIENT_ID, SLUG);

    expect(result.ok).toBe(true);
    expect(result.assignedSlug).toBe(SLUG);
  });

  it("refuses when signed out", async () => {
    signOut();

    const result = await assignCompanySlug(CLIENT_ID, SLUG);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/signed in/i);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Assigning                                                                  */
/* -------------------------------------------------------------------------- */

describe("assignCompanySlug — first assignment", () => {
  it("writes the slug, renumbers drafts, audits and revalidates", async () => {
    const supabase = createSupabaseMock(
      {
        "company_clients:select": { data: companyRow() },
        "company_clients:update": { data: { id: CLIENT_ID } },
      },
      { data: 3 },
    );
    signIn(anAdmin, supabase);

    const result = await assignCompanySlug(CLIENT_ID, " wondfousa ");

    expect(result).toMatchObject({ ok: true, assignedSlug: SLUG, renumbered: 3 });

    const write = findCall(supabase, "company_clients", "update");
    expect(write?.payload).toEqual({ company_slug: SLUG });
    expect(write?.filters).toContainEqual(["id", CLIENT_ID]);
    // The compare-and-set: an existing slug is never silently overwritten.
    expect(write?.filters).toContainEqual(["is:company_slug", null]);

    expect(supabase.rpcCalls).toEqual([
      { fn: "renumber_client_draft_proposals", args: { p_client: CLIENT_ID } },
    ]);

    expect(auditMock).toHaveBeenCalledTimes(1);
    const event = auditMock.mock.calls[0][0];
    expect(event.resource_type).toBe("company_clients");
    expect(event.resource_id).toBe(CLIENT_ID);
    expect(event.before_state).toEqual({ company_slug: null });
    expect(event.after_state).toEqual({ company_slug: SLUG });

    expect(revalidateMock).toHaveBeenCalledWith(`/employee/clients/${CLIENT_ID}`);
    expect(revalidateMock).toHaveBeenCalledWith("/employee/proposals");
  });

  it("is idempotent when the company already has exactly that slug", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: companyRow({ company_slug: SLUG }) },
    });
    signIn(anAdmin, supabase);

    const result = await assignCompanySlug(CLIENT_ID, SLUG);

    expect(result).toMatchObject({ ok: true, assignedSlug: SLUG, renumbered: 0 });
    expect(findCall(supabase, "company_clients", "update")).toBeUndefined();
  });

  it("reports a lost race rather than a phantom success", async () => {
    // Zero rows matched: someone assigned a slug between the read and the write.
    // PostgREST reports no error for that, which is exactly the trap.
    const supabase = createSupabaseMock({
      "company_clients:select": { data: companyRow() },
      "company_clients:update": { data: null },
    });
    signIn(anAdmin, supabase);

    const result = await assignCompanySlug(CLIENT_ID, SLUG);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/reload/i);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("refuses a company id that is not a uuid before doing anything", async () => {
    signIn(anAdmin, createSupabaseMock({}));

    const result = await assignCompanySlug("not-a-uuid", SLUG);

    expect(result.ok).toBe(false);
    expect(accessMock).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Rejections                                                                 */
/* -------------------------------------------------------------------------- */

describe("assignCompanySlug — rejections", () => {
  it.each([
    ["empty", ""],
    ["one usable character", "W"],
    ["nothing but punctuation", "!!"],
    ["a legal form that normalizes to one character", "A."],
    ["over 40 characters", "W".repeat(41)],
    ["a non-string", null],
  ])("rejects %s without writing", async (_label, slug) => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: companyRow() },
      "company_clients:update": { data: { id: CLIENT_ID } },
    });
    signIn(anAdmin, supabase);

    const result = await assignCompanySlug(CLIENT_ID, slug as string);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("company slug");
    // Refused before the company is even read.
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("stores the NORMALIZED slug when the input carries spaces or punctuation", async () => {
    // normalizeCompanySlug deletes rather than trims, so "Wondfo USA, Inc." is a
    // valid way to express WONDFOUSAINC — but the value that reaches the column
    // must be the cleaned one. Storing the raw string would hit the CHECK
    // constraint, which is the trap isValidCompanySlug's doc comment names.
    const supabase = createSupabaseMock({
      "company_clients:select": { data: companyRow() },
      "company_clients:update": { data: { id: CLIENT_ID } },
    });
    signIn(anAdmin, supabase);

    const result = await assignCompanySlug(CLIENT_ID, "Wondfo USA, Inc.");

    expect(result).toMatchObject({ ok: true, assignedSlug: "WONDFOUSAINC" });
    expect(findCall(supabase, "company_clients", "update")?.payload).toEqual({
      company_slug: "WONDFOUSAINC",
    });
  });

  it("translates 23505 into whose slug it is", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: companyRow() },
      "company_clients:update": {
        error: { code: "23505", message: 'duplicate key value violates unique constraint "company_clients_company_slug_key"' },
      },
    });
    signIn(anAdmin, supabase);

    const result = await assignCompanySlug(CLIENT_ID, SLUG);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/someone else owns/i);
    expect(result.error).toContain(SLUG);
    // No raw constraint names in front of a salesperson.
    expect(result.error).not.toMatch(/duplicate key|constraint/i);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("refuses to overwrite an existing slug when the caller did not name it", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: companyRow({ company_slug: SLUG }) },
      "company_clients:update": { data: { id: CLIENT_ID } },
    });
    signIn(anAdmin, supabase);

    // No third argument — the create-form path, which may only ever assign.
    const result = await assignCompanySlug(CLIENT_ID, "WONDFOUSAINC");

    expect(result.ok).toBe(false);
    expect(result.error).toContain(SLUG);
    expect(findCall(supabase, "company_clients", "update")).toBeUndefined();
  });

  it("refuses when the stored slug moved under the caller's feet", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: companyRow({ company_slug: "WONDFOUSAINC" }) },
      "company_clients:update": { data: { id: CLIENT_ID } },
    });
    signIn(anAdmin, supabase);

    const result = await assignCompanySlug(CLIENT_ID, "WONDFO", SLUG);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/changed to WONDFOUSAINC/i);
    expect(findCall(supabase, "company_clients", "update")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Immutability — enforced by the database, explained by the action           */
/* -------------------------------------------------------------------------- */

describe("assignCompanySlug — locked slugs", () => {
  it("changes a slug that is set but not yet used, naming the value it replaces", async () => {
    const supabase = createSupabaseMock(
      {
        "company_clients:select": { data: companyRow({ company_slug: "WONDFO" }) },
        "company_clients:update": { data: { id: CLIENT_ID } },
      },
      { data: 1 },
    );
    signIn(anAdmin, supabase);

    const result = await assignCompanySlug(CLIENT_ID, SLUG, "WONDFO");

    expect(result).toMatchObject({ ok: true, assignedSlug: SLUG });
    const write = findCall(supabase, "company_clients", "update");
    // Compare-and-set on the value the caller was shown, NOT `.is(null)` —
    // and never an unconditional update.
    expect(write?.filters).toContainEqual(["company_slug", "WONDFO"]);
    expect(write?.filters).not.toContainEqual(["is:company_slug", null]);
    expect(auditMock.mock.calls[0][0].before_state).toEqual({ company_slug: "WONDFO" });
  });

  it("explains the lock_company_slug trigger instead of leaking the raise", async () => {
    // Verbatim shape of what migration 20260815140000 raises: errcode
    // check_violation — the SAME code as the format CHECK, which is why the
    // action reads the message and not the code alone.
    const supabase = createSupabaseMock({
      "company_clients:select": { data: companyRow({ company_slug: SLUG }) },
      "company_clients:update": {
        error: {
          code: "23514",
          message: `company_slug is locked once the client has been issued a proposal number (${SLUG} is in use)`,
        },
      },
    });
    signIn(anAdmin, supabase);

    const result = await assignCompanySlug(CLIENT_ID, "WONDFOUSAINC", SLUG);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no longer be changed/i);
    expect(result.error).toMatch(/already been numbered/i);
    expect(result.error).not.toMatch(/errcode|raise|23514/i);
    expect(auditMock).not.toHaveBeenCalled();
    // Nothing was renumbered off the back of a failed change.
    expect(supabase.rpcCalls).toHaveLength(0);
  });

  it("still reports success when the slug saved but drafts could not be renumbered", async () => {
    const supabase = createSupabaseMock(
      {
        "company_clients:select": { data: companyRow() },
        "company_clients:update": { data: { id: CLIENT_ID } },
      },
      { error: { message: "permission denied for table client_proposals" } },
    );
    signIn(anAdmin, supabase);

    const result = await assignCompanySlug(CLIENT_ID, SLUG);

    // The slug IS saved — reporting failure would invite a retry that then
    // trips the compare-and-set and reads as a bug.
    expect(result.ok).toBe(true);
    expect(result.assignedSlug).toBe(SLUG);
    expect(result.error).toMatch(/could not be renumbered/i);
  });
});
