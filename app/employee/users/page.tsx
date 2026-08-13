import { Archive, CheckCircle2, Save, Send, Trash2, Users } from "lucide-react";
import Link from "next/link";
import {
  approveCandidateForInvite,
  archivePortalUser,
  convertCandidateToInvite,
  createCandidateIntake,
  deletePortalUser,
  generateEmployeeAccessLink,
  inviteEmployee,
  updatePortalUserRole,
} from "@/app/employee/users/actions";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { SubmitButton } from "@/components/SubmitButton";
import { friendlyError } from "@/lib/friendly-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { EmployeePayrollSetupTask, HrCandidateIntake, TimeCardRole } from "@/lib/company-data";
import {
  canManagePortalUserAccount,
  formatPortalRole,
  getAssignablePortalRoles,
  getPortalRoleCommandRank,
  isPortalAdminRole,
  isPortalOwnerRole,
} from "@/lib/user-management";

type UsersPageProps = {
  searchParams: Promise<{ message?: string; error?: string; invite_link?: string; q?: string }>;
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
  work_state: string | null;
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
  // Mirrors the server-side gates in ./actions.ts so the page never offers a
  // control the action will reject.
  const actorRole = canManageUsers ? currentRole.role : null;
  const assignableRoles = getAssignablePortalRoles(actorRole);
  const canGenerateAccessLinks = isPortalOwnerRole(actorRole);
  const admin = canManageUsers ? createAdminClient() : null;
  const [
    { data: authData, error: usersError },
    { data: roleRows },
    { data: employeeProfiles },
    { data: timeCardRoles },
    { data: candidateIntakes },
    { data: payrollSetupTasks },
  ] = admin
    ? await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
        admin.from("user_roles").select("*").order("updated_at", { ascending: false }),
        admin.from("employee_profiles").select("*"),
        admin.from("time_card_roles").select("*").order("sort_order"),
        admin.from("hr_candidate_intakes").select("*").order("updated_at", { ascending: false }).limit(20),
        admin.from("employee_payroll_setup_tasks").select("*"),
      ])
    : [{ data: null, error: null }, { data: null }, { data: null }, { data: null }, { data: null }, { data: null }];

  const rolesByUserId = new Map((roleRows ?? []).map((role) => [role.user_id, role as UserRoleRow]));
  const profilesByUserId = new Map((employeeProfiles ?? []).map((item) => [item.user_id, item as EmployeeProfileRow]));
  const payrollByUserId = new Map(((payrollSetupTasks ?? []) as EmployeePayrollSetupTask[]).map((task) => [task.user_id, task]));
  const typedCandidateIntakes = (candidateIntakes ?? []) as HrCandidateIntake[];
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
        workState: employeeProfile?.work_state ?? "",
        payrollStatus: payrollByUserId.get(authUser.id)?.status ?? "not_started",
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

  const query = (params.q ?? "").trim().toLowerCase();
  const filteredUsers = query
    ? users.filter(
        (portalUser) =>
          portalUser.email.toLowerCase().includes(query) ||
          portalUser.displayName.toLowerCase().includes(query) ||
          portalUser.legalName.toLowerCase().includes(query),
      )
    : users;

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
      {usersError ? <div className="success-box portal-alert portal-alert-error">{friendlyError(usersError, "The user list could not be loaded. Refresh to try again.")}</div> : null}

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
            <p className="muted-copy">Generates a secure invite link you can send directly, without Supabase email limits.</p>
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
                  {assignableRoles.map((role) => (
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
              <div className="field">
                <label htmlFor="jurisdiction_state">Work state</label>
                <input id="jurisdiction_state" name="jurisdiction_state" maxLength={2} placeholder="TX" />
              </div>
              <SubmitButton className="button button-primary" pendingLabel="Generating…">
                <Send size={18} />
                Generate Invite Link
              </SubmitButton>
            </div>
          </form>

          <section className="form-panel">
            <h2>Candidate intake</h2>
            <p className="muted-copy">Pre-hire records stay human-reviewed before an employee invite is generated.</p>
            <form action={createCandidateIntake} className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
              <div className="field">
                <label htmlFor="candidate_name">Candidate name</label>
                <input id="candidate_name" name="candidate_name" required />
              </div>
              <div className="field">
                <label htmlFor="candidate_email">Email</label>
                <input id="candidate_email" name="email" required type="email" />
              </div>
              <div className="field">
                <label htmlFor="target_role">Target role</label>
                <input id="target_role" name="target_role" defaultValue="Employee" />
              </div>
              <div className="field">
                <label htmlFor="candidate_state">Work state</label>
                <input id="candidate_state" name="jurisdiction_state" maxLength={2} placeholder="TX" />
              </div>
              <div className="field">
                <label htmlFor="candidate_source">Source</label>
                <input id="candidate_source" name="source" placeholder="Referral, job board, direct outreach" />
              </div>
              <div className="field">
                <label htmlFor="candidate_notes">Notes</label>
                <textarea id="candidate_notes" name="notes" />
              </div>
              <SubmitButton className="button button-primary" pendingLabel="Adding…">
                <Send size={18} />
                Add Candidate
              </SubmitButton>
            </form>
          </section>

          <section className="table-card">
            <div className="user-list-header">
              <div>
                <h2>Current users</h2>
                <p>
                  {users.length === 200
                    ? "Showing the first 200 accounts."
                    : `${users.length} Supabase Auth account${users.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <form method="get">
                <input aria-label="Search users" defaultValue={params.q ?? ""} name="q" placeholder="Search users" />
              </form>
            </div>
            <div className="user-list">
              {filteredUsers.length === 0 ? (
                <div className="empty-state">{query ? "No accounts match." : "No users found."}</div>
              ) : (
                filteredUsers.map((portalUser) => {
                  const canManageThisAccount = canManagePortalUserAccount(actorRole, portalUser.role);
                  // A role the actor may not grant still has to appear as the
                  // selected option, otherwise the select would silently
                  // default to a different role than the one on screen.
                  const roleOptions = assignableRoles.includes(portalUser.role as (typeof assignableRoles)[number])
                    ? assignableRoles
                    : [portalUser.role, ...assignableRoles];

                  return (
                  <article className="user-row" key={portalUser.id}>
                    <div>
                      <h3>{portalUser.email}</h3>
                      <p>{portalUser.displayName}</p>
                      <div className="user-meta">
                        <span className="badge">{portalUser.accountStatus}</span>
                        <span className="badge">{portalUser.onboardingStatus.replace("_", " ")}</span>
                        <span>{formatPortalRole(portalUser.role)}</span>
                        <span>{portalUser.legalName || "No legal name"}</span>
                        <span>{portalUser.workState || "State not set"}</span>
                        <span>Payroll {portalUser.payrollStatus.replace("_", " ")}</span>
                        <span>{portalUser.timeCardRoleId ? ((timeCardRoles ?? []) as TimeCardRole[]).find((role) => role.id === portalUser.timeCardRoleId)?.name ?? "Time-card role" : "Time-card role unassigned"}</span>
                        <span>{portalUser.lastSignInAt ? `Last sign-in ${new Date(portalUser.lastSignInAt).toLocaleDateString()}` : "No sign-in yet"}</span>
                      </div>
                    </div>

                    {!canManageThisAccount ? (
                      <p className="muted-copy">
                        {formatPortalRole(portalUser.role)} outranks your role, so this account is read-only for you.
                      </p>
                    ) : (
                    <form action={updatePortalUserRole} className="user-row-form">
                      <input name="user_id" type="hidden" value={portalUser.id} />
                      <div className="field">
                        <label htmlFor={`role-${portalUser.id}`}>Role</label>
                        <select id={`role-${portalUser.id}`} name="role" defaultValue={portalUser.role}>
                          {roleOptions.map((role) => (
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
                      <div className="field">
                        <label htmlFor={`jurisdiction-state-${portalUser.id}`}>Work state</label>
                        <input id={`jurisdiction-state-${portalUser.id}`} name="jurisdiction_state" maxLength={2} defaultValue={portalUser.workState} />
                      </div>
                      <SubmitButton className="button button-light" pendingLabel="Saving…">
                        <Save size={16} />
                        Save
                      </SubmitButton>
                    </form>
                    )}

                    <div className="user-row-actions">
                      <Link className="button button-light" href={`/employee/users/${portalUser.id}`}>
                        Profile
                      </Link>
                      {canGenerateAccessLinks && !isPortalOwnerRole(portalUser.role) ? (
                        <form action={generateEmployeeAccessLink}>
                          <input name="email" type="hidden" value={portalUser.email} />
                          <SubmitButton className="button button-light" pendingLabel="Generating…">
                            <Send size={16} />
                            Access Link
                          </SubmitButton>
                        </form>
                      ) : null}
                      {canManageThisAccount ? (
                      <>
                      <form action={archivePortalUser}>
                        <input name="user_id" type="hidden" value={portalUser.id} />
                        {portalUser.accountStatus === "archived" ? (
                          <button className="button button-secondary" disabled type="submit">
                            <Archive size={16} />
                            Archive
                          </button>
                        ) : (
                          <ConfirmSubmit className="button button-secondary" message={`Archive ${portalUser.email}? They lose portal access until restored.`}>
                            <Archive size={16} />
                            Archive
                          </ConfirmSubmit>
                        )}
                      </form>
                      <form action={deletePortalUser}>
                        <input name="user_id" type="hidden" value={portalUser.id} />
                        <ConfirmSubmit className="button button-danger" message={`Permanently delete ${portalUser.email}? This removes their account, role, and chat profile. There is no undo.`}>
                          <Trash2 size={16} />
                          Delete
                        </ConfirmSubmit>
                      </form>
                      </>
                      ) : null}
                    </div>
                  </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="table-card">
            <div className="user-list-header">
              <div>
                <h2>Candidate pipeline</h2>
                <p>{typedCandidateIntakes.length} candidate intake{typedCandidateIntakes.length === 1 ? "" : "s"}</p>
              </div>
            </div>
            <div className="user-list">
              {typedCandidateIntakes.length === 0 ? (
                <div className="empty-state">No candidate intakes yet.</div>
              ) : (
                typedCandidateIntakes.map((candidate) => {
                  const isApproved = candidate.status === "approved_for_invite" && candidate.human_decision === "approved_to_invite";
                  const isInvited = candidate.status === "invited";
                  const isClosed = isInvited || candidate.status === "rejected" || candidate.status === "archived";
                  const approveLabel = isInvited ? "Invited" : isApproved ? "Approved" : "Approve";
                  const inviteLabel = isInvited ? "Invited" : "Invite";

                  return (
                    <article className="user-row" id={`candidate-${candidate.id}`} key={candidate.id}>
                      <div>
                        <h3>{candidate.candidate_name}</h3>
                        <p>{candidate.email}</p>
                        <div className="user-meta">
                          <span className="badge">{candidate.status.replace("_", " ")}</span>
                          <span className="badge">{candidate.human_decision.replace("_", " ")}</span>
                          <span>{candidate.target_role}</span>
                          <span>{candidate.jurisdiction_state || "State not set"}</span>
                          <span>{candidate.source || "No source"}</span>
                        </div>
                        {candidate.notes ? <p className="muted-copy">{candidate.notes}</p> : null}
                      </div>
                      <div className="user-row-actions">
                        <form action={approveCandidateForInvite} className="user-row-form">
                          <input name="candidate_id" type="hidden" value={candidate.id} />
                          <div className="field">
                            <label htmlFor={`decision-notes-${candidate.id}`}>Decision notes</label>
                            <input id={`decision-notes-${candidate.id}`} name="human_decision_notes" placeholder="Human approval notes" />
                          </div>
                          {isClosed || isApproved ? (
                            <button className="button button-light" disabled type="submit">
                              <CheckCircle2 size={16} />
                              {approveLabel}
                            </button>
                          ) : (
                            <SubmitButton className="button button-light" pendingLabel="Approving…">
                              <CheckCircle2 size={16} />
                              {approveLabel}
                            </SubmitButton>
                          )}
                        </form>
                        <form action={convertCandidateToInvite}>
                          <input name="candidate_id" type="hidden" value={candidate.id} />
                          {!isApproved || isInvited ? (
                            <button className="button button-primary" disabled type="submit">
                              <Send size={16} />
                              {inviteLabel}
                            </button>
                          ) : (
                            <SubmitButton className="button button-primary" pendingLabel="Inviting…">
                              <Send size={16} />
                              {inviteLabel}
                            </SubmitButton>
                          )}
                        </form>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
