import { describe, expect, it } from "vitest";
import { getExpenseAccess } from "./access";

type Row = { role: string | null; account_status: string | null };

/**
 * Minimal stand-in for the Supabase PostgREST client covering only the two
 * queries getExpenseAccess makes: a single-row lookup on user_roles (via
 * .maybeSingle()) and a plain array lookup on portal_user_module_access
 * (awaited directly, no .maybeSingle()).
 */
function fakeSupabase(role: Row | null, moduleKeys: string[]) {
  return {
    from(table: string) {
      const select = () => ({
        eq() {
          if (table === "user_roles") {
            return { maybeSingle: async () => ({ data: role, error: null }) };
          }
          if (table === "portal_user_module_access") {
            const result = { data: moduleKeys.map((module_key) => ({ module_key })), error: null };
            return Object.assign(Promise.resolve(result), { maybeSingle: async () => result });
          }
          throw new Error(`Unexpected table in test double: ${table}`);
        },
      });
      return { select };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    },
  } as any;
}

describe("getExpenseAccess", () => {
  it("grants access to an employee explicitly granted the employee_expenses module", async () => {
    const supabase = fakeSupabase({ role: "employee", account_status: "active" }, ["employee_expenses"]);
    const access = await getExpenseAccess(supabase, "user-1");

    expect(access.active).toBe(true);
    expect(access.canUseExpenses).toBe(true);
    expect(access.isOwner).toBe(false);
  });

  it("denies an employee who was not granted the employee_expenses module", async () => {
    const supabase = fakeSupabase({ role: "employee", account_status: "active" }, ["training"]);
    const access = await getExpenseAccess(supabase, "user-2");

    expect(access.canUseExpenses).toBe(false);
  });

  it("denies an archived account even with the module granted", async () => {
    const supabase = fakeSupabase({ role: "employee", account_status: "archived" }, ["employee_expenses"]);
    const access = await getExpenseAccess(supabase, "user-3");

    expect(access.active).toBe(false);
    expect(access.canUseExpenses).toBe(false);
  });

  it("grants full access to a platform_admin without an explicit module grant", async () => {
    const supabase = fakeSupabase({ role: "platform_admin", account_status: "active" }, []);
    const access = await getExpenseAccess(supabase, "user-4");

    expect(access.canUseExpenses).toBe(true);
    expect(access.isOwner).toBe(true);
  });

  it("denies access when no user_roles row exists for the account", async () => {
    const supabase = fakeSupabase(null, []);
    const access = await getExpenseAccess(supabase, "user-5");

    expect(access.active).toBe(false);
    expect(access.canUseExpenses).toBe(false);
  });
});
