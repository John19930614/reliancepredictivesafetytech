import { Archive, Save, Send, Trash2, Users } from "lucide-react";
import Link from "next/link";
import {
  archivePortalUser,
  deletePortalUser,
  generateEmployeeAccessLink,
  inviteEmployee,
  updatePortalUserRole,
} from "@/app/employee/users/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { TimeCardRole } from "@/lib/company-data";
import { formatPortalRole, getPortalRoleCommandRank, isPortalAdminRole, portalUserRoles } from "@/lib/user-management";

type UsersPageProps = {
  searchParams: Promise<{ message?: string; error?: string; invite_link?: string }>;
};

type UserRoleRow = {
  user_id: string;
  role: string;
  team: string | null;
  account_status: string;
  created_at: string;
  updated_at: string;
};

type EmployeeProfileRow = {
  user_id: string;
  legal_name: string | null;
  display_name: string | null;
  email: string | null;
  profile_status: string;
  time_card_role_id: string | null;
  onboarding_status: string;
  onboarding_completed_at: string | null;
};

function getDisplayName(metadata: Record<string, unknown> | null | undefined) {
  const displayName = metadata?.display_name;

  return typeof displayName === "string" && displayName.trim() ? displayName : "No display name";
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  const { data: currentRole } =
    supabase && user
      ? await supabase
          .from("user_roles")
          .select("role, account_status")
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null };

  const canManageUsers =
    currentRole?.account_status === "active" && isPortalAdminRole(currentRole.role);
  const admin = canManageUsers ? createAdminClient() : null;
  const [{ data: authData, error: usersError }, { data: roleRows }, { data: employeeProfiles }, { data: timeCardRoles }] = admin
    ? await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
        admin.from("user_roles").select("*").order("updated_at", { ascending: false }),
        admin.from("employee_profiles").select("*"),
        admin.from("time_card_roles").select("*").order("sort_order"),
      ])
    : [{ data: null, error: null }, { data: null }, { data: null }, { data: null }];

  const rolesByUserId = new Map((roleRows ?? []).map((role) => [role.user_id, role as UserRoleRow]));
  const profilesByUserId = new Map((employeeProfiles ?? []).map((item) => [item.user_id, item as EmployeeProfileRow]));
  const users = (authData?.users ?? [])
    .map((authUser) => {
      const role = rolesByUserId.get(authUser.id);
      const employeeProfile = profilesByUserId.get(authUser.id);

      return {
        id: authUser.id,
        email: authUser.email ?? "No email",
        displayName: getDisplayName(authUser.user_metadata as Record<string, unknown> | null),
        legalName: employeeProfile?.legal_name ?? "",
        onboardingStatus: employeeProfile?.onboarding_status ?? "not_started",
        role: role?.role ?? "employee",
        team: role?.team ?? "",
        profileStatus: employeeProfile?.profile_status ?? role?.account_status ?? "no profile",
        timeCardRoleId: employeeProfile?.time_card_role_id ?? "",
        accountStatus: role?.account_status ?? "no role",
        createdAt: authUser.created_at,
        lastSignInAt: authUser.last_sign_in_at,
      };
    })
    .sort(
      (a, b) =>
        getPortalRoleCommandRank(a.role) - getPortalRoleCommandRank(b.role) ||
        a.email.localeCompare(b.email),
    );

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">User Administration</div>
          <h1>Portal users</h1>
          <p>Add employees, assign roles, archive access, or delete accounts.</p>
        </div>
        <span className="badge">{canManageUsers ? `${users.length} users` : "Admin role required"}</span>
      </div>

      {params.message ? <div className="success-box portal-alert">{params.message}</div> : null}
      {params.invite_link ? (
        <div className="success-box portal-alert">
          <strong>Employee access link</strong>
          <p>Send this link directly to the employee so they can set their password and enter the portal.</p>
          <input readOnly value={params.invite_link} />
        </div>
      ) : null}
      {params.error ? <div className="success-box portal-alert portal-alert-error">{params.error}</div> : null}
      {usersError ? <div className="success-box portal-alert portal-alert-error">{usersError.message}</div> : null}

      {!canManageUsers ? (
        <section className="portal-card">
          <Users color="#c9932b" size={28} />
          <h3>Admin access required</h3>
          <p>Your account needs an active admin, company admin, super admin, or platform admin role before it can manage users.</p>
        </section>
      ) : !admin ? (
        <section className="portal-card">
          <Users color="#c9932b" size={28} />
          <h3>Server admin key required</h3>
          <p>Add `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` to the server environment so this page can create and delete Supabase Auth users securely.</p>
        </section>
      ) : (
        <div className="user-admin-layout">
          <form action={inviteEmployee} className="form-panel">
            <h2>Invite employee</h2>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
              <div className="field">
                <label htmlFor="display_name">Display name</label>
                <input id="display_name" name="display_name" />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" required type="email" />
              </div>
              <div className="field">
                <label htmlFor="role">Role</label>
                <select id="role" name="role" defaultValue="employee">
                  {portalUserRoles.map((role) => (
                    <option key={role} value={role}>
                      {formatPortalRole(role)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="team">Team</label>
                <input id="team" name="team" />
              </div>
              <div className="field">
                <label htmlFor="time_card_role_id">Time-card role</label>
                <select id="time_card_role_id" name="time_card_role_id" defaultValue="">
                  <option value="">Unassigned</option>
                  {((timeCardRoles ?? []) as TimeCardRole[]).map((timeCardRole) => (
                    <option key={timeCardRole.id} value={timeCardRole.id}>
                      {timeCardRole.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="button button-primary" type="submit">
                <Send size={18} />
                Send Invite
              </button>
            </div>
          </form>

          <section className="table-card">
            <div className="user-list-header">
              <div>
                <h2>Current users</h2>
                <p>{users.length} Supabase Auth account{users.length === 1 ? "" : "s"}</p>
              </div>
            </div>
            <div className="user-list">
              {users.length === 0 ? (
                <div className="empty-state">No users found.</div>
              ) : (
                users.map((portalUser) => (
                  <article className="user-row" key={portalUser.id}>
                    <div>
                      <h3>{portalUser.email}</h3>
                      <p>{portalUser.displayName}</p>
                      <div className="user-meta">
                        <span className="badge">{portalUser.accountStatus}</span>
                        <span className="badge">{portalUser.onboardingStatus.replace("_", " ")}</span>
                        <span>{formatPortalRole(portalUser.role)}</span>
                        <span>{portalUser.legalName || "No legal name"}</span>
                        <span>{portalUser.timeCardRoleId ? ((timeCardRoles ?? []) as TimeCardRole[]).find((role) => role.id === portalUser.timeCardRoleId)?.name ?? "Time-card role" : "Time-card role unassigned"}</span>
                        <span>{portalUser.lastSignInAt ? `Last sign-in ${new Date(portalUser.lastSignInAt).toLocaleDateString()}` : "No sign-in yet"}</span>
                      </div>
                    </div>

                    <form action={updatePortalUserRole} className="user-row-form">
                      <input name="user_id" type="hidden" value={portalUser.id} />
                      <div className="field">
                        <label htmlFor={`role-${portalUser.id}`}>Role</label>
                        <select id={`role-${portalUser.id}`} name="role" defaultValue={portalUser.role}>
                          {portalUserRoles.map((role) => (
                            <option key={role} value={role}>
                              {formatPortalRole(role)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={`team-${portalUser.id}`}>Team</label>
                        <input id={`team-${portalUser.id}`} name="team" defaultValue={portalUser.team} />
                      </div>
                      <div className="field">
                        <label htmlFor={`time-card-role-${portalUser.id}`}>Time-card role</label>
                        <select id={`time-card-role-${portalUser.id}`} name="time_card_role_id" defaultValue={portalUser.timeCardRoleId}>
                          <option value="">Unassigned</option>
                          {((timeCardRoles ?? []) as TimeCardRole[]).map((timeCardRole) => (
                            <option key={timeCardRole.id} value={timeCardRole.id}>
                              {timeCardRole.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button className="button button-light" type="submit">
                        <Save size={16} />
                        Save
                      </button>
                    </form>

                    <div className="user-row-actions">
                      <Link className="button button-light" href={`/employee/users/${portalUser.id}`}>
                        Profile
                      </Link>
                      <form action={generateEmployeeAccessLink}>
                        <input name="email" type="hidden" value={portalUser.email} />
                        <button className="button button-light" type="submit">
                          <Send size={16} />
                          Access Link
                        </button>
                      </form>
                      <form action={archivePortalUser}>
                        <input name="user_id" type="hidden" value={portalUser.id} />
                        <button className="button button-secondary" disabled={portalUser.accountStatus === "archived"} type="submit">
                          <Archive size={16} />
                          Archive
                        </button>
                      </form>
                      <form action={deletePortalUser}>
                        <input name="user_id" type="hidden" value={portalUser.id} />
                        <button className="button button-danger" type="submit">
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </form>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
