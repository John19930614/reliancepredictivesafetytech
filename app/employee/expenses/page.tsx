import { redirect } from "next/navigation";
import { ReceiptText } from "lucide-react";
import { EmployeeExpensesManager } from "@/components/EmployeeExpensesManager";
import type { EmployeeExpenseReceipt, EmployeeExpenseReport, EmployeeProfile } from "@/lib/company-data";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canAccessEmployeePath, hasFullPortalVisibility, isPortalOwnerRole } from "@/lib/user-management";

export default async function EmployeeExpensesPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <div className="eyebrow">Employee Expenses</div>
            <h1>Expense tracking</h1>
            <p>Supabase is required before employee expenses and receipts can be managed.</p>
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
    redirect("/employee-login");
  }

  const [{ data: role }, { data: financeAuthorization, error: financeAuthorizationError }] = await Promise.all([
    supabase.from("user_roles").select("role, account_status").eq("user_id", user.id).maybeSingle(),
    supabase.from("company_finance_authorized_users").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const { data: moduleAccess, error: moduleAccessError } = hasFullPortalVisibility(role?.role, role?.account_status)
    ? { data: [], error: null }
    : await supabase.from("portal_user_module_access").select("module_key").eq("user_id", user.id);

  if (
    (financeAuthorizationError && !isMissingSchemaRelationError(financeAuthorizationError)) ||
    (moduleAccessError && !isMissingSchemaRelationError(moduleAccessError))
  ) {
    console.error("Could not load expense access.", financeAuthorizationError ?? moduleAccessError);
  }

  const moduleKeys = (moduleAccess ?? []).map((access) => access.module_key);
  const canViewExpensesModule = canAccessEmployeePath(role?.role, role?.account_status, "/employee/expenses", moduleKeys);
  const canReviewExpenses = Boolean(
    role?.account_status === "active" && canViewExpensesModule && (isPortalOwnerRole(role.role) || financeAuthorization),
  );

  if (!canViewExpensesModule) {
    return <section className="portal-card empty-state">Employee Expenses is not visible for this account.</section>;
  }

  const [{ data: reports, error: reportsError }, { data: receipts, error: receiptsError }] = await Promise.all([
    canReviewExpenses
      ? supabase.from("employee_expense_reports").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false })
      : supabase
          .from("employee_expense_reports")
          .select("*")
          .eq("employee_user_id", user.id)
          .order("expense_date", { ascending: false })
          .order("created_at", { ascending: false }),
    supabase.from("employee_expense_receipts").select("*").order("created_at", { ascending: false }),
  ]);

  if (
    (reportsError && !isMissingSchemaRelationError(reportsError)) ||
    (receiptsError && !isMissingSchemaRelationError(receiptsError))
  ) {
    console.error("Could not load expenses.", reportsError ?? receiptsError);
  }

  const admin = createAdminClient();
  const { data: profiles } =
    admin && canReviewExpenses
      ? await admin.from("employee_profiles").select("user_id, display_name, email").order("display_name")
      : await supabase.from("employee_profiles").select("user_id, display_name, email").eq("user_id", user.id);

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Employee Expenses</div>
          <h1>Expense tracking</h1>
          <p>Submit travel and operating expenses with receipt evidence, then track finance review and reimbursement status.</p>
        </div>
        <span className="badge">
          <ReceiptText size={14} />
          {canReviewExpenses ? "Finance review" : "Employee submission"}
        </span>
      </div>

      <EmployeeExpensesManager
        canReviewExpenses={canReviewExpenses}
        currentUserId={user.id}
        profiles={(profiles ?? []) as Pick<EmployeeProfile, "user_id" | "display_name" | "email">[]}
        receipts={(receipts ?? []) as EmployeeExpenseReceipt[]}
        reports={(reports ?? []) as EmployeeExpenseReport[]}
      />
    </>
  );
}
