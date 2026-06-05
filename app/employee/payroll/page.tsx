import { ReceiptText } from "lucide-react";
import { PayrollTrackerManager } from "@/components/PayrollTrackerManager";
import type {
  EmployeePayrollRun,
  EmployeePayrollRunItem,
  EmployeeProfile,
  EmployeeTimeCard,
  EmployeeTimeCardPayroll,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";
import { isPortalOwnerRole } from "@/lib/user-management";

export default async function PayrollTrackerPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <div className="eyebrow">Payroll Tracker</div>
            <h1>Payroll run control</h1>
            <p>Supabase is required before payroll runs can be tracked.</p>
          </div>
          <span className="badge">
            <ReceiptText size={14} />
            Setup required
          </span>
        </div>
      </>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .maybeSingle();
  const canManagePayroll = role?.account_status === "active" && isPortalOwnerRole(role.role);

  if (!canManagePayroll) {
    return <section className="portal-card empty-state">Payroll Tracker is limited to owners.</section>;
  }

  const [{ data: runs }, { data: items }, { data: approvedCards }, { data: profiles }] = await Promise.all([
    supabase.from("employee_payroll_runs").select("*").order("period_start", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("employee_payroll_run_items").select("*").order("created_at", { ascending: false }),
    supabase.from("employee_time_cards").select("*").eq("status", "approved").order("week_start", { ascending: false }).limit(200),
    supabase.from("employee_profiles").select("user_id, display_name, email").order("display_name"),
  ]);

  const approvedCardIds = (approvedCards ?? []).map((card) => card.id);
  const { data: payrollRows } =
    approvedCardIds.length > 0
      ? await supabase.from("employee_time_card_payroll").select("*").in("time_card_id", approvedCardIds)
      : { data: [] };

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Payroll Tracker</div>
          <h1>Payroll run control</h1>
          <p>Review approved hours, lock pay periods, and mark payroll runs paid.</p>
        </div>
        <span className="badge">
          <ReceiptText size={14} />
          Owner only
        </span>
      </div>

      <PayrollTrackerManager
        approvedCards={(approvedCards ?? []) as EmployeeTimeCard[]}
        payrollRows={(payrollRows ?? []) as EmployeeTimeCardPayroll[]}
        profiles={(profiles ?? []) as Pick<EmployeeProfile, "user_id" | "display_name" | "email">[]}
        runItems={(items ?? []) as EmployeePayrollRunItem[]}
        runs={(runs ?? []) as EmployeePayrollRun[]}
      />
    </>
  );
}
