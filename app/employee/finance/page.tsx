import { DollarSign } from "lucide-react";
import { FinanceCenterManager } from "@/components/FinanceCenterManager";
import type {
  CompanyClient,
  CompanyDocument,
  CompanyFinanceAuthorizedUser,
  CompanyFinanceBudget,
  CompanyFinanceReceipt,
  CompanyFinanceRecurringItem,
  CompanyFinanceTransaction,
  EmployeeProfile,
} from "@/lib/company-data";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { isPortalOwnerRole } from "@/lib/user-management";

export default async function FinanceCenterPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <div className="eyebrow">Finance Center</div>
            <h1>Company finance control</h1>
            <p>Supabase is required before finance records can be managed.</p>
          </div>
          <span className="badge">
            <DollarSign size={14} />
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

  const [{ data: role }, { data: financeAuthorization, error: financeAuthorizationError }] = await Promise.all([
    supabase.from("user_roles").select("role, account_status").eq("user_id", user.id).maybeSingle(),
    supabase.from("company_finance_authorized_users").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const canManageAuthorization = role?.account_status === "active" && isPortalOwnerRole(role.role);
  const canManageRecords = Boolean(financeAuthorization);

  if (financeAuthorizationError && !isMissingSchemaRelationError(financeAuthorizationError)) {
    console.error("Could not load finance authorization.", financeAuthorizationError);
  }

  const [
    { data: transactions },
    { data: budgets },
    { data: recurringItems },
    { data: receipts },
    { data: authorizedUsers },
    { data: profiles },
    { data: clients },
    { data: documents },
  ] =
    canManageRecords || canManageAuthorization
      ? await Promise.all([
          canManageRecords
            ? supabase.from("company_finance_transactions").select("*").order("transaction_date", { ascending: false }).order("created_at", { ascending: false })
            : Promise.resolve({ data: [] }),
          canManageRecords
            ? supabase.from("company_finance_budgets").select("*").order("period_start", { ascending: false })
            : Promise.resolve({ data: [] }),
          canManageRecords
            ? supabase.from("company_finance_recurring_items").select("*").order("next_due_date", { ascending: true })
            : Promise.resolve({ data: [] }),
          canManageRecords
            ? supabase.from("company_finance_receipts").select("*").order("created_at", { ascending: false })
            : Promise.resolve({ data: [] }),
          canManageAuthorization
            ? supabase.from("company_finance_authorized_users").select("*").order("updated_at", { ascending: false })
            : Promise.resolve({ data: financeAuthorization ? [financeAuthorization] : [] }),
          canManageAuthorization
            ? supabase.from("employee_profiles").select("user_id, display_name, email").order("display_name")
            : Promise.resolve({ data: [] }),
          canManageRecords ? supabase.from("company_clients").select("*").order("name") : Promise.resolve({ data: [] }),
          canManageRecords ? supabase.from("company_documents").select("*").order("title") : Promise.resolve({ data: [] }),
        ])
      : [
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
        ];

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Finance Center</div>
          <h1>Company finance control</h1>
          <p>Track cash movement, budgets, recurring obligations, receipt evidence, and review status.</p>
        </div>
        <span className="badge">
          <DollarSign size={14} />
          {canManageRecords ? "Finance authorized" : canManageAuthorization ? "Owner access" : "Restricted"}
        </span>
      </div>

      <FinanceCenterManager
        authorizedUsers={(authorizedUsers ?? []) as CompanyFinanceAuthorizedUser[]}
        budgets={(budgets ?? []) as CompanyFinanceBudget[]}
        canManageAuthorization={canManageAuthorization}
        canManageRecords={canManageRecords}
        clients={(clients ?? []) as CompanyClient[]}
        currentUserId={user.id}
        documents={(documents ?? []) as CompanyDocument[]}
        receipts={(receipts ?? []) as CompanyFinanceReceipt[]}
        recurringItems={(recurringItems ?? []) as CompanyFinanceRecurringItem[]}
        transactions={(transactions ?? []) as CompanyFinanceTransaction[]}
        userOptions={(profiles ?? []) as Pick<EmployeeProfile, "user_id" | "display_name" | "email">[]}
      />
    </>
  );
}
