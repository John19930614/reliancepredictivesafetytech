"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type PayrollPeriod = { label: string; gross: number; hours: number; status: string };
type ExpenseCategory = { category: string; total: number };

type ReportsManagerProps = {
  activeEmployees: number;
  totalEmployees: number;
  pendingExpenseTotal: number;
  totalPayrollLastRun: number;
  candidateCounts: Record<string, number>;
  payrollTrend: PayrollPeriod[];
  expenseCategoryData: ExpenseCategory[];
  timecardCounts: Record<string, number>;
  certCounts: Record<string, number>;
  docStatusCounts: Record<string, number>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="kpi-card reports-stat-card">
      <div className="eyebrow">{label}</div>
      <div className="metric">{value}</div>
      {sub ? <div className="reports-stat-sub">{sub}</div> : null}
    </div>
  );
}

const CHART_COLORS = ["#c9932b", "#e8b84b", "#f0c86a", "#f5d68a", "#f9e4a8", "#fdf0cc"];
const EXPENSE_COLOR = "#c9932b";

export function ReportsManager({
  activeEmployees,
  candidateCounts,
  certCounts,
  docStatusCounts,
  expenseCategoryData,
  payrollTrend,
  pendingExpenseTotal,
  timecardCounts,
  totalEmployees,
  totalPayrollLastRun,
}: ReportsManagerProps) {
  const openCandidates =
    (candidateCounts["new"] ?? 0) +
    (candidateCounts["screening"] ?? 0) +
    (candidateCounts["approved_for_invite"] ?? 0);

  const pipelineData = [
    { label: "New", count: candidateCounts["new"] ?? 0 },
    { label: "Screening", count: candidateCounts["screening"] ?? 0 },
    { label: "Approved", count: candidateCounts["approved_for_invite"] ?? 0 },
    { label: "Invited", count: candidateCounts["invited"] ?? 0 },
    { label: "Rejected", count: candidateCounts["rejected"] ?? 0 },
  ].filter((s) => s.count > 0);

  return (
    <div className="reports-layout">
      {/* KPI row */}
      <div className="reports-kpi-row">
        <StatCard label="Active Employees" value={activeEmployees} sub={`${totalEmployees} total`} />
        <StatCard label="Open Candidates" value={openCandidates} sub="in pipeline" />
        <StatCard label="Last Payroll Run" value={totalPayrollLastRun > 0 ? formatCurrency(totalPayrollLastRun) : "—"} sub="gross pay" />
        <StatCard label="Pending Expenses" value={pendingExpenseTotal > 0 ? formatCurrency(pendingExpenseTotal) : "—"} sub="awaiting approval" />
      </div>

      <div className="reports-charts-grid">
        {/* Payroll trend */}
        <section className="table-card reports-chart-card">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Payroll</div>
              <h2>Gross pay by period</h2>
            </div>
          </div>
          {payrollTrend.length === 0 ? (
            <div className="empty-state">No payroll runs recorded yet.</div>
          ) : (
            <ResponsiveContainer height={220} width="100%">
              <BarChart data={payrollTrend} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} />
                <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={48} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} labelStyle={{ color: "#111" }} />
                <Bar dataKey="gross" fill="#c9932b" radius={[4, 4, 0, 0]} name="Gross Pay">
                  {payrollTrend.map((entry, index) => (
                    <Cell key={index} fill={entry.status === "paid" ? "#c9932b" : "#e0e4e8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {payrollTrend.length > 0 && (
            <p className="reports-chart-note">Gold bars = paid runs. Grey = draft/ready/held.</p>
          )}
        </section>

        {/* Expenses by category */}
        <section className="table-card reports-chart-card">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Expenses</div>
              <h2>Spend by category</h2>
            </div>
          </div>
          {expenseCategoryData.length === 0 ? (
            <div className="empty-state">No approved expenses recorded yet.</div>
          ) : (
            <ResponsiveContainer height={220} width="100%">
              <BarChart data={expenseCategoryData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 12, fill: "#6b7280" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="category" type="category" tick={{ fontSize: 11, fill: "#6b7280" }} width={110} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} labelStyle={{ color: "#111" }} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} name="Total">
                  {expenseCategoryData.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      <div className="reports-status-grid">
        {/* Hiring pipeline */}
        <section className="table-card">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Recruiting</div>
              <h2>Hiring pipeline</h2>
            </div>
          </div>
          {pipelineData.length === 0 ? (
            <div className="empty-state">No candidates in the pipeline.</div>
          ) : (
            <div className="reports-pill-row">
              {pipelineData.map((stage) => (
                <div className="reports-pipeline-pill" key={stage.label}>
                  <span className="reports-pill-count">{stage.count}</span>
                  <span className="reports-pill-label">{stage.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Time cards */}
        <section className="table-card">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Time Cards</div>
              <h2>Submission status</h2>
            </div>
          </div>
          <div className="reports-status-list">
            {[
              { label: "Approved", key: "approved", color: "#15803d" },
              { label: "Submitted", key: "submitted", color: "#c9932b" },
              { label: "Draft", key: "draft", color: "#9ca3af" },
              { label: "Rejected", key: "rejected", color: "#dc2626" },
            ].map(({ label, key, color }) =>
              (timecardCounts[key] ?? 0) > 0 ? (
                <div className="reports-status-row" key={key}>
                  <span className="reports-status-dot" style={{ background: color }} />
                  <span>{label}</span>
                  <span className="reports-status-count">{timecardCounts[key]}</span>
                </div>
              ) : null,
            )}
            {Object.keys(timecardCounts).length === 0 && <div className="empty-state">No time cards yet.</div>}
          </div>
        </section>

        {/* Onboarding docs */}
        <section className="table-card">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">HR Onboarding</div>
              <h2>Document completion</h2>
            </div>
          </div>
          <div className="reports-status-list">
            {[
              { label: "Signed", key: "signed", color: "#15803d" },
              { label: "Pending", key: "pending", color: "#c9932b" },
              { label: "Waived", key: "waived", color: "#9ca3af" },
            ].map(({ label, key, color }) =>
              (docStatusCounts[key] ?? 0) > 0 ? (
                <div className="reports-status-row" key={key}>
                  <span className="reports-status-dot" style={{ background: color }} />
                  <span>{label}</span>
                  <span className="reports-status-count">{docStatusCounts[key]}</span>
                </div>
              ) : null,
            )}
            {Object.keys(docStatusCounts).length === 0 && <div className="empty-state">No document assignments yet.</div>}
          </div>
        </section>

        {/* Cert compliance */}
        <section className="table-card">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Training</div>
              <h2>Cert compliance</h2>
            </div>
          </div>
          <div className="reports-status-list">
            {[
              { label: "Active", key: "Active", color: "#15803d" },
              { label: "Expiring", key: "Expiring", color: "#c9932b" },
              { label: "Expired", key: "Expired", color: "#dc2626" },
            ].map(({ label, key, color }) =>
              (certCounts[key] ?? 0) > 0 ? (
                <div className="reports-status-row" key={key}>
                  <span className="reports-status-dot" style={{ background: color }} />
                  <span>{label}</span>
                  <span className="reports-status-count">{certCounts[key]}</span>
                </div>
              ) : null,
            )}
            {Object.keys(certCounts).length === 0 && <div className="empty-state">No certifications tracked yet.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
