import { ReportsManager } from "@/components/ReportsManager";
import { createClient } from "@/lib/supabase/server";

export default async function ReportsPage() {
  const supabase = await createClient();

  type ProfileRow = { user_id: string; profile_status: string | null };
  type CandidateRow = { status: string };
  type PayrollItemRow = { gross_pay: number | null; total_hours: number | null; payroll_run_id: string };
  type PayrollRunRow = { id: string; period_end: string | null; status: string };
  type ExpenseRow = { amount: number | null; category: string; status: string };
  type TimecardRow = { status: string };
  type CertRow = { status: string };
  type DocRow = { status: string };

  let profiles: ProfileRow[] = [];
  let candidates: CandidateRow[] = [];
  let payrollRunItems: PayrollItemRow[] = [];
  let payrollRuns: PayrollRunRow[] = [];
  let expenses: ExpenseRow[] = [];
  let timecards: TimecardRow[] = [];
  let certifications: CertRow[] = [];
  let docAssignments: DocRow[] = [];

  if (supabase) {
    const [p, c, pri, pr, e, tc, cert, da] = await Promise.all([
      supabase.from("employee_profiles").select("user_id, profile_status"),
      supabase.from("hr_candidate_intakes").select("status"),
      supabase.from("employee_payroll_run_items").select("gross_pay, total_hours, payroll_run_id"),
      supabase.from("employee_payroll_runs").select("id, period_end, status").order("period_end", { ascending: false }).limit(8),
      supabase.from("employee_expense_reports").select("amount, category, status"),
      supabase.from("employee_time_cards").select("status"),
      supabase.from("training_certifications").select("status"),
      supabase.from("employee_document_assignments").select("status"),
    ]);
    profiles = (p.data ?? []) as ProfileRow[];
    candidates = (c.data ?? []) as CandidateRow[];
    payrollRunItems = (pri.data ?? []) as PayrollItemRow[];
    payrollRuns = (pr.data ?? []) as PayrollRunRow[];
    expenses = (e.data ?? []) as ExpenseRow[];
    timecards = (tc.data ?? []) as TimecardRow[];
    certifications = (cert.data ?? []) as CertRow[];
    docAssignments = (da.data ?? []) as DocRow[];
  }

  // Headcount
  const activeEmployees = profiles.filter((p) => p.profile_status === "active").length;
  const totalEmployees = profiles.length;

  // Candidate pipeline counts by status
  const candidateCounts = candidates.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  // Payroll — last 6 runs with totals
  const last6Runs = payrollRuns.slice(0, 6).reverse();
  const itemsByRunId = payrollRunItems.reduce<Record<string, { gross: number; hours: number }>>((acc, item) => {
    if (!acc[item.payroll_run_id]) acc[item.payroll_run_id] = { gross: 0, hours: 0 };
    acc[item.payroll_run_id].gross += Number(item.gross_pay ?? 0);
    acc[item.payroll_run_id].hours += Number(item.total_hours ?? 0);
    return acc;
  }, {});
  const payrollTrend = last6Runs.map((run) => ({
    label: run.period_end ? run.period_end.slice(0, 7) : run.id.slice(0, 6),
    gross: Math.round(itemsByRunId[run.id]?.gross ?? 0),
    hours: Math.round(itemsByRunId[run.id]?.hours ?? 0),
    status: run.status,
  }));
  const totalPayrollLastRun = payrollTrend.at(-1)?.gross ?? 0;

  // Expenses by category
  const expenseByCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    if (e.status !== "cancelled" && e.status !== "rejected") {
      acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount ?? 0);
    }
    return acc;
  }, {});
  const expenseCategoryData = Object.entries(expenseByCategory)
    .map(([category, total]) => ({ category, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total);
  const pendingExpenses = expenses.filter((e) => e.status === "submitted" || e.status === "needs_info");
  const pendingExpenseTotal = Math.round(pendingExpenses.reduce((sum, e) => sum + Number(e.amount ?? 0), 0));

  // Time card status
  const timecardCounts = timecards.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  // Cert compliance
  const certCounts = certifications.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  // Onboarding doc completion
  const docStatusCounts = docAssignments.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Command</div>
          <h1>Reports</h1>
          <p>Headcount, payroll, expenses, hiring pipeline, and compliance at a glance.</p>
        </div>
      </div>

      <ReportsManager
        activeEmployees={activeEmployees}
        candidateCounts={candidateCounts}
        certCounts={certCounts}
        docStatusCounts={docStatusCounts}
        expenseCategoryData={expenseCategoryData}
        payrollTrend={payrollTrend}
        pendingExpenseTotal={pendingExpenseTotal}
        timecardCounts={timecardCounts}
        totalEmployees={totalEmployees}
        totalPayrollLastRun={totalPayrollLastRun}
      />
    </>
  );
}
