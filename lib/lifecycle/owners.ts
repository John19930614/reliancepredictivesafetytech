import "server-only";

// Who a deal can be assigned to, and how loaded they already are.
//
// A DELIBERATE, NARROW WIDENING — read this before changing it.
//
// employee_profiles and user_roles are both self-or-admin by RLS
// (20260506040000_employee_time_cards.sql:711, 20260505000000_company_portal.sql:166),
// so a rep signed in with the normal client cannot see a colleague's name at
// all. Step 4 of the lifecycle is "assign one accountable owner", and the
// concept screen shows every eligible owner with their workload — which is
// impossible under those policies.
//
// Rather than loosen an existing RLS policy (a STOP CONDITION in CLAUDE.md, and
// one that would widen far more than this needs), the roster is read here
// through the service-role client, server-side, with a hard-coded column list:
// user id, display name, email, role. Nothing else. No phone, no emergency
// contacts, no onboarding status, no HR fields — this is a directory of who can
// own a deal, not a view of the people table.
//
// It is gated on canManage by the only caller, so the same people who can edit
// an opportunity can see who to give it to, and no one else.

import { createAdminClient } from "@/lib/supabase/admin";
import { portalUserRoles } from "@/lib/user-management";

/**
 * `opportunities` postdates the last Supabase types regen, so the workload read
 * goes through an untyped handle — the same convention acceptance-income.ts and
 * the File Center use for tables newer than lib/supabase/types.ts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

export interface OwnerOption {
  userId: string;
  name: string;
  email: string | null;
  role: string | null;
  /** Open opportunities already assigned to them. */
  openDeals: number;
  /** Sum of the value on those deals. */
  openValue: number;
}

/** Bounds, so a large org cannot turn the assign screen into an unbounded read. */
const rosterLimit = 300;
const workloadLimit = 2000;

function displayName(
  profile: { display_name: string | null; legal_name: string | null; email: string | null } | undefined,
  fallbackId: string,
): string {
  const name = profile?.display_name?.trim() || profile?.legal_name?.trim();
  if (name) return name;
  // An email is a worse name than a name but a far better one than a UUID.
  return profile?.email?.trim() || `User ${fallbackId.slice(0, 8)}`;
}

/**
 * Every active portal user who can own a deal, with their current load.
 *
 * Returns an empty list rather than throwing when service-role credentials are
 * absent: the assign panel then says it cannot offer a roster, which is a far
 * better failure than a 500 on a page that otherwise works.
 */
export async function loadOwnerOptions(): Promise<OwnerOption[]> {
  const admin: LooseClient | null = createAdminClient();
  if (!admin) return [];

  try {
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("user_id, role, account_status")
      .eq("account_status", "active")
      .limit(rosterLimit);

    const roles: Array<{ user_id: string; role: string | null }> = Array.isArray(roleRows) ? roleRows : [];

    // Only real portal roles, and only one row per user — a person with two
    // active role rows must not appear in the picker twice.
    const byUser = new Map<string, string | null>();
    for (const row of roles) {
      if (!row.user_id) continue;
      if (!(portalUserRoles as readonly string[]).includes(row.role ?? "")) continue;
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, row.role);
    }

    const userIds = [...byUser.keys()];
    if (userIds.length === 0) return [];

    const [{ data: profileRows }, { data: dealRows }] = await Promise.all([
      admin.from("employee_profiles").select("user_id, display_name, legal_name, email").in("user_id", userIds),
      admin
        .from("opportunities")
        .select("owner_user_id, value")
        .eq("status", "open")
        .not("owner_user_id", "is", null)
        .limit(workloadLimit),
    ]);

    const profiles = new Map<string, { display_name: string | null; legal_name: string | null; email: string | null }>();
    for (const row of Array.isArray(profileRows) ? profileRows : []) {
      profiles.set(row.user_id, row);
    }

    const load = new Map<string, { count: number; value: number }>();
    for (const row of Array.isArray(dealRows) ? dealRows : []) {
      const key = row.owner_user_id as string | null;
      if (!key) continue;
      const current = load.get(key) ?? { count: 0, value: 0 };
      current.count += 1;
      current.value += Number(row.value ?? 0);
      load.set(key, current);
    }

    return userIds
      .map((userId) => {
        const profile = profiles.get(userId);
        const workload = load.get(userId) ?? { count: 0, value: 0 };
        return {
          userId,
          name: displayName(profile, userId),
          email: profile?.email ?? null,
          role: byUser.get(userId) ?? null,
          openDeals: workload.count,
          openValue: workload.value,
        };
      })
      // Lightest load first: the picker's default ordering IS the routing
      // suggestion, and putting the busiest person at the top would work
      // against the thing step 4 exists to do.
      .sort((a, b) => a.openDeals - b.openDeals || a.name.localeCompare(b.name));
  } catch (caught) {
    console.error("Could not load the lifecycle owner roster.", caught);
    return [];
  }
}

/** The chosen owner's row, for rendering the current assignment. */
export function findOwner(owners: OwnerOption[], userId: string | null): OwnerOption | null {
  if (!userId) return null;
  return owners.find((owner) => owner.userId === userId) ?? null;
}
