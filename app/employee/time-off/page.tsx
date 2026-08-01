import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { TimeOffManager } from "@/components/TimeOffManager";
import type { EmployeeProfile } from "@/lib/company-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { summarizeBalances } from "@/lib/time-off/policy";
import type { TimeOffBalance, TimeOffPolicy, TimeOffRequest } from "@/lib/time-off/types";
import { canAccessEmployeePath, hasFullPortalVisibility, isPortalAdminRole } from "@/lib/user-management";

export default async function TimeOffPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <div className="portal-topline">
        <div>
          <div className="eyebrow">People</div>
          <h1>Time Off</h1>
          <p>Supabase is required before time off can be requested or reviewed.</p>
        </div>
        <span className="badge">
          <CalendarDays size={14} />
          Setup required
        </span>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employee-login");
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: moduleAccess } = hasFullPortalVisibility(role?.role, role?.account_status)
    ? { data: [] }
    : await supabase.from("portal_user_module_access").select("module_key").eq("user_id", user.id);

  const moduleKeys = (moduleAccess ?? []).map((access) => access.module_key);
  const canViewTimeOff = canAccessEmployeePath(role?.role, role?.account_status, "/employee/time-off", moduleKeys);

  if (!canViewTimeOff) {
    return <section className="portal-card empty-state">Time Off is not visible for this account.</section>;
  }

  const isAdmin = role?.account_status === "active" && isPortalAdminRole(role.role);
  const policyYear = new Date().getUTCFullYear();

  // Admins review everyone's requests; employees only ever see their own.
  const [{ data: policies, error: policiesError }, { data: balances }, { data: requests, error: requestsError }] =
    await Promise.all([
      supabase.from("employee_time_off_policies").select("*").order("label"),
      isAdmin
        ? supabase.from("employee_time_off_balances").select("*").eq("policy_year", policyYear)
        : supabase
            .from("employee_time_off_balances")
            .select("*")
            .eq("user_id", user.id)
            .eq("policy_year", policyYear),
      isAdmin
        ? supabase.from("employee_time_off_requests").select("*").order("start_date", { ascending: false })
        : supabase
            .from("employee_time_off_requests")
            .select("*")
            .eq("user_id", user.id)
            .order("start_date", { ascending: false }),
    ]);

  // The module degrades to a setup notice until the migration has been applied.
  if (
    (policiesError && isMissingSchemaRelationError(policiesError)) ||
    (requestsError && isMissingSchemaRelationError(requestsError))
  ) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <div className="eyebrow">People</div>
            <h1>Time Off</h1>
            <p>The time off tables have not been created yet.</p>
          </div>
        </div>
        <section className="portal-card empty-state">
          Apply migration <code>20260801130000_employee_time_off.sql</code> to enable this module.
        </section>
      </>
    );
  }

  const admin = createAdminClient();
  const { data: profiles } =
    admin && isAdmin
      ? await admin.from("employee_profiles").select("user_id, display_name, email").order("display_name")
      : await supabase.from("employee_profiles").select("user_id, display_name, email").eq("user_id", user.id);

  const allPolicies = (policies ?? []) as TimeOffPolicy[];
  const allBalances = (balances ?? []) as TimeOffBalance[];
  const allRequests = (requests ?? []) as TimeOffRequest[];

  const myBalances = allBalances.filter((balance) => balance.user_id === user.id);
  const myRequests = allRequests.filter((request) => request.user_id === user.id);
  const summary = summarizeBalances(allPolicies, myBalances, myRequests);

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">People</div>
          <h1>Time Off</h1>
          <p>Request leave, track your remaining balance, and see where each request stands.</p>
        </div>
        <span className="badge">
          <CalendarDays size={14} />
          {isAdmin ? "Approver" : "Employee"}
        </span>
      </div>

      <TimeOffManager
        currentUserId={user.id}
        isAdmin={isAdmin}
        policies={allPolicies}
        policyYear={policyYear}
        profiles={(profiles ?? []) as Pick<EmployeeProfile, "user_id" | "display_name" | "email">[]}
        requests={allRequests}
        summary={summary}
      />
    </>
  );
}
