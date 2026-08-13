import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectError(url);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, recordAuditEvent: vi.fn(async () => {}) };
});
vi.mock("@/lib/hr-automation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hr-automation")>();
  return { ...actual, ensurePayrollSetupTask: vi.fn(async () => null) };
});
vi.mock("@/lib/hr-onboarding", () => ({ assignActiveRequiredHrDocuments: vi.fn(async () => null) }));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit/events";
import {
  archivePortalUser,
  createPortalUser,
  deletePortalUser,
  generateEmployeeAccessLink,
  inviteEmployee,
  updatePortalUserRole,
} from "./actions";

/** Stands in for the throw that next/navigation's redirect performs. */
class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const createClientMock = vi.mocked(createClient);
const createAdminClientMock = vi.mocked(createAdminClient);
const auditMock = vi.mocked(recordAuditEvent);

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";

const OWNER_EMAIL = "owner@safety360docs.com";
const TARGET_EMAIL = "worker@safety360docs.com";

// ---------------------------------------------------------------------------
// Minimal chainable stand-in for the Supabase PostgREST client, following the
// harness in app/employee/proposals/actions.test.ts. Routes are keyed
// `${table}:${op}`; a route may be a function so one table can answer
// differently depending on the filters applied.
// ---------------------------------------------------------------------------
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
      upsert(payload: unknown) {
        record.op = "upsert";
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
      in(column: string, values: unknown) {
        record.filters.push([`in:${column}`, values]);
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

type SupabaseMock = ReturnType<typeof createSupabaseMock>;

function hasWrite(supabase: SupabaseMock, table: string, ops: QueryRecord["op"][]) {
  return supabase.calls.some((call) => call.table === table && ops.includes(call.op));
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
const authAdmin = {
  generateLink: vi.fn(async () => ({
    data: { user: { id: TARGET_ID }, properties: { hashed_token: "token-abc" } },
    error: null,
  })),
  createUser: vi.fn(async () => ({ data: { user: { id: TARGET_ID } }, error: null })),
  deleteUser: vi.fn(async () => ({ data: null, error: null })),
  getUserById: vi.fn(async (id: string) => ({
    data: { user: { id, email: id === OWNER_ID ? OWNER_EMAIL : TARGET_EMAIL } },
    error: null,
  })),
};

/**
 * Signs the actor in with `actorRole` and points the admin client at a table
 * whose `user_roles` rows answer both the target lookup and the owner sweep.
 */
function signIn(actorRole: string | null, targetRole: string | null = "employee", accountStatus = "active") {
  const server = createSupabaseMock({
    "user_roles:select": { data: actorRole ? { role: actorRole, account_status: accountStatus } : null },
  });

  createClientMock.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: ACTOR_ID } } }) },
    from: server.from,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const admin = createSupabaseMock({
    "user_roles:select": (query) =>
      query.filters.some(([column]) => column === "in:role")
        ? { data: [{ user_id: OWNER_ID }] }
        : { data: targetRole ? { role: targetRole, team: "Ops", account_status: "active" } : null },
    "user_roles:upsert": {},
    "user_roles:update": {},
    "user_roles:delete": {},
    "employee_profiles:upsert": {},
    "employee_profiles:update": {},
    "employee_chat_profiles:select": { data: { display_name: "Worker", email: TARGET_EMAIL } },
    "employee_chat_profiles:upsert": {},
    "employee_chat_profiles:update": {},
    "employee_chat_profiles:delete": {},
    "portal_user_module_access:upsert": {},
  });

  createAdminClientMock.mockReturnValue({
    from: admin.from,
    auth: { admin: authAdmin },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  return admin;
}

/**
 * Runs an action and returns the redirect target with its query decoded, so
 * assertions can match the human-readable message rather than `+`-escaped text.
 */
async function runAction(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    if (error instanceof RedirectError) {
      const [path, query = ""] = error.url.split("?");
      const params = [...new URLSearchParams(query).entries()].map(([key, value]) => `${key}=${value}`);
      return [path, ...params].join(" ");
    }
    throw error;
  }

  throw new Error("Expected the action to redirect.");
}

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function auditEventTypes() {
  return auditMock.mock.calls.map(([payload]) => payload.event_type);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// updatePortalUserRole
// ---------------------------------------------------------------------------
describe("updatePortalUserRole", () => {
  it("denies a non-owner admin trying to grant super_admin", async () => {
    const admin = signIn("admin");

    const result = await runAction(() => updatePortalUserRole(form({ user_id: TARGET_ID, role: "super_admin" })));

    expect(result).toContain("Only platform owners can grant owner roles.");
    expect(hasWrite(admin, "user_roles", ["upsert"])).toBe(false);
    expect(auditEventTypes()).toContain("security.privilege_violation");
  });

  it("denies a company_admin trying to grant platform_admin", async () => {
    const admin = signIn("company_admin");

    const result = await runAction(() => updatePortalUserRole(form({ user_id: TARGET_ID, role: "platform_admin" })));

    expect(result).toContain("Only platform owners can grant owner roles.");
    expect(hasWrite(admin, "user_roles", ["upsert"])).toBe(false);
  });

  it("denies an admin trying to grant a role above its own rank", async () => {
    const admin = signIn("admin");

    const result = await runAction(() => updatePortalUserRole(form({ user_id: TARGET_ID, role: "company_admin" })));

    expect(result).toContain("You cannot assign a role above your own.");
    expect(hasWrite(admin, "user_roles", ["upsert"])).toBe(false);
  });

  it("denies an admin trying to change a super_admin account", async () => {
    const admin = signIn("admin", "super_admin");

    const result = await runAction(() => updatePortalUserRole(form({ user_id: TARGET_ID, role: "employee" })));

    expect(result).toContain("You cannot modify an account that outranks your own role.");
    expect(hasWrite(admin, "user_roles", ["upsert"])).toBe(false);
    expect(auditEventTypes()).toContain("security.privilege_violation");
  });

  it("lets an owner change a role and records before/after state", async () => {
    const admin = signIn("super_admin", "employee");

    const result = await runAction(() =>
      updatePortalUserRole(form({ user_id: TARGET_ID, role: "admin", team: "Ops" })),
    );

    expect(result).toContain("User updated.");
    expect(hasWrite(admin, "user_roles", ["upsert"])).toBe(true);

    const [payload] = auditMock.mock.calls.at(-1)!;
    expect(payload.event_type).toBe("data.update");
    expect(payload.actor_id).toBe(ACTOR_ID);
    expect(payload.actor_role).toBe("super_admin");
    expect(payload.resource_id).toBe(TARGET_ID);
    expect(payload.before_state).toMatchObject({ role: "employee" });
    expect(payload.after_state).toMatchObject({ role: "admin" });
  });

  it("lets an admin set a peer-or-lower role", async () => {
    const admin = signIn("admin", "employee");

    const result = await runAction(() => updatePortalUserRole(form({ user_id: TARGET_ID, role: "admin" })));

    expect(result).toContain("User updated.");
    expect(hasWrite(admin, "user_roles", ["upsert"])).toBe(true);
  });

  it("refuses a non-admin role outright", async () => {
    const admin = signIn("employee");

    const result = await runAction(() => updatePortalUserRole(form({ user_id: TARGET_ID, role: "employee" })));

    expect(result).toContain("Only portal admins can manage users.");
    expect(hasWrite(admin, "user_roles", ["upsert"])).toBe(false);
  });

  it("refuses an archived admin account", async () => {
    const admin = signIn("super_admin", "employee", "archived");

    const result = await runAction(() => updatePortalUserRole(form({ user_id: TARGET_ID, role: "employee" })));

    expect(result).toContain("Only portal admins can manage users.");
    expect(hasWrite(admin, "user_roles", ["upsert"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createPortalUser / inviteEmployee
// ---------------------------------------------------------------------------
describe("createPortalUser", () => {
  it("denies a non-owner admin creating an owner account", async () => {
    signIn("admin");

    const result = await runAction(() =>
      createPortalUser(form({ email: TARGET_EMAIL, password: "temp-pass-1", role: "super_admin" })),
    );

    expect(result).toContain("Only platform owners can grant owner roles.");
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(auditEventTypes()).toContain("security.privilege_violation");
  });

  it("lets an owner create an admin account and records it", async () => {
    signIn("platform_admin");

    const result = await runAction(() =>
      createPortalUser(form({ email: TARGET_EMAIL, password: "temp-pass-1", role: "admin" })),
    );

    expect(result).toContain("User created with HR onboarding assigned.");
    expect(authAdmin.createUser).toHaveBeenCalled();

    const [payload] = auditMock.mock.calls.at(-1)!;
    expect(payload.event_type).toBe("data.create");
    expect(payload.actor_id).toBe(ACTOR_ID);
    expect(payload.after_state).toMatchObject({ email: TARGET_EMAIL, role: "admin" });
  });
});

describe("inviteEmployee", () => {
  it("denies a non-owner admin inviting straight into an owner role", async () => {
    signIn("admin");

    const result = await runAction(() => inviteEmployee(form({ email: TARGET_EMAIL, role: "platform_admin" })));

    expect(result).toContain("Only platform owners can grant owner roles.");
    expect(authAdmin.generateLink).not.toHaveBeenCalled();
  });

  it("lets an admin invite an employee and records it", async () => {
    signIn("admin");

    const result = await runAction(() => inviteEmployee(form({ email: TARGET_EMAIL, role: "employee" })));

    expect(result).toContain("Employee invite link generated");
    expect(authAdmin.generateLink).toHaveBeenCalled();

    const [payload] = auditMock.mock.calls.at(-1)!;
    expect(payload.event_type).toBe("data.create");
    expect(payload.after_state).toMatchObject({ role: "employee" });
  });
});

// ---------------------------------------------------------------------------
// generateEmployeeAccessLink
// ---------------------------------------------------------------------------
describe("generateEmployeeAccessLink", () => {
  it("denies a non-owner admin", async () => {
    signIn("admin");

    const result = await runAction(() => generateEmployeeAccessLink(form({ email: TARGET_EMAIL })));

    expect(result).toContain("Only platform owners can generate account access links.");
    expect(authAdmin.generateLink).not.toHaveBeenCalled();
    expect(auditEventTypes()).toContain("security.privilege_violation");
  });

  it("denies a company_admin", async () => {
    signIn("company_admin");

    const result = await runAction(() => generateEmployeeAccessLink(form({ email: TARGET_EMAIL })));

    expect(result).toContain("Only platform owners can generate account access links.");
    expect(authAdmin.generateLink).not.toHaveBeenCalled();
  });

  it("refuses to target an owner's email even for an owner caller", async () => {
    signIn("super_admin");

    const result = await runAction(() => generateEmployeeAccessLink(form({ email: OWNER_EMAIL })));

    expect(result).toContain("Access links cannot be generated for platform owner accounts.");
    expect(authAdmin.generateLink).not.toHaveBeenCalled();
    expect(auditEventTypes()).toContain("security.privilege_violation");
  });

  it("matches an owner's email case-insensitively", async () => {
    signIn("super_admin");

    const result = await runAction(() => generateEmployeeAccessLink(form({ email: OWNER_EMAIL.toUpperCase() })));

    expect(result).toContain("Access links cannot be generated for platform owner accounts.");
    expect(authAdmin.generateLink).not.toHaveBeenCalled();
  });

  it("fails closed when an owner's account cannot be resolved", async () => {
    signIn("super_admin");
    authAdmin.getUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "auth unavailable" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await runAction(() => generateEmployeeAccessLink(form({ email: TARGET_EMAIL })));

    expect(result).toContain("Could not verify the target account against the owner list.");
    expect(authAdmin.generateLink).not.toHaveBeenCalled();
  });

  it("lets an owner generate a link for a non-owner and records it as a security event", async () => {
    signIn("super_admin");

    const result = await runAction(() => generateEmployeeAccessLink(form({ email: TARGET_EMAIL })));

    expect(result).toContain("Access link generated for");
    expect(authAdmin.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ type: "recovery", email: TARGET_EMAIL }),
    );

    const [payload] = auditMock.mock.calls.at(-1)!;
    expect(payload.event_category).toBe("security");
    expect(payload.severity).toBe("warn");
    expect(payload.actor_id).toBe(ACTOR_ID);
  });
});

// ---------------------------------------------------------------------------
// archivePortalUser / deletePortalUser
// ---------------------------------------------------------------------------
describe("archivePortalUser", () => {
  it("denies an admin archiving a higher-ranked account", async () => {
    const admin = signIn("admin", "company_admin");

    const result = await runAction(() => archivePortalUser(form({ user_id: TARGET_ID })));

    expect(result).toContain("You cannot modify an account that outranks your own role.");
    expect(hasWrite(admin, "user_roles", ["update"])).toBe(false);
    expect(auditEventTypes()).toContain("security.privilege_violation");
  });

  it("lets an admin archive an employee and records it", async () => {
    const admin = signIn("admin", "employee");

    const result = await runAction(() => archivePortalUser(form({ user_id: TARGET_ID })));

    expect(result).toContain("User archived.");
    expect(hasWrite(admin, "user_roles", ["update"])).toBe(true);

    const [payload] = auditMock.mock.calls.at(-1)!;
    expect(payload.event_type).toBe("data.update");
    expect(payload.after_state).toMatchObject({ account_status: "archived" });
  });

  it("still refuses self-archival", async () => {
    signIn("super_admin");

    const result = await runAction(() => archivePortalUser(form({ user_id: ACTOR_ID })));

    expect(result).toContain("You cannot archive your own account.");
  });
});

describe("deletePortalUser", () => {
  it("denies an admin deleting a super_admin", async () => {
    signIn("admin", "super_admin");

    const result = await runAction(() => deletePortalUser(form({ user_id: TARGET_ID })));

    expect(result).toContain("You cannot modify an account that outranks your own role.");
    expect(authAdmin.deleteUser).not.toHaveBeenCalled();
    expect(auditEventTypes()).toContain("security.privilege_violation");
  });

  it("lets an owner delete an employee and records the prior state", async () => {
    signIn("super_admin", "employee");

    const result = await runAction(() => deletePortalUser(form({ user_id: TARGET_ID })));

    expect(result).toContain("User deleted.");
    expect(authAdmin.deleteUser).toHaveBeenCalledWith(TARGET_ID, false);

    const [payload] = auditMock.mock.calls.at(-1)!;
    expect(payload.event_type).toBe("data.delete");
    expect(payload.before_state).toMatchObject({ role: "employee" });
    expect(payload.after_state).toBeNull();
  });

  it("still refuses self-deletion", async () => {
    signIn("super_admin");

    const result = await runAction(() => deletePortalUser(form({ user_id: ACTOR_ID })));

    expect(result).toContain("You cannot delete your own account.");
    expect(authAdmin.deleteUser).not.toHaveBeenCalled();
  });
});
