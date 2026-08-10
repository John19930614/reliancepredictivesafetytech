"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Clock3, DollarSign, PauseCircle, Plus, ReceiptText } from "lucide-react";
import {
  createPayrollRun,
  markPayrollRunPaid,
  updatePayrollRun,
  updatePayrollRunItem,
} from "@/app/employee/payroll/actions";
import {
  payrollRunItemStatuses,
  payrollRunStatuses,
  type EmployeePayrollRun,
  type EmployeePayrollRunItem,
  type EmployeeProfile,
  type EmployeeTimeCard,
  type EmployeeTimeCardPayroll,
} from "@/lib/company-data";

type PayrollProfile = Pick<EmployeeProfile, "user_id" | "display_name" | "email">;

type PayrollTrackerManagerProps = {
  approvedCards: EmployeeTimeCard[];
  payrollRows: EmployeeTimeCardPayroll[];
  profiles: PayrollProfile[];
  runItems: EmployeePayrollRunItem[];
  runs: EmployeePayrollRun[];
};

type MessageTone = "success" | "error";
type ActiveView = "runs" | "approved" | "employees";

function currentMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function currentWeekStart() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  return start.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(value);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function displayStatus(value: string) {
  return value.replaceAll("_", " ");
}

export function PayrollTrackerManager({
  approvedCards,
  payrollRows,
  profiles,
  runItems,
  runs,
}: PayrollTrackerManagerProps) {
  const [runRows, setRunRows] = useState(runs);
  const [itemRows, setItemRows] = useState(runItems);
  const [activeView, setActiveView] = useState<ActiveView>("runs");
  const [selectedRunId, setSelectedRunId] = useState(runs[0]?.id ?? "");
  const [filters, setFilters] = useState({ status: "", search: "" });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("success");
  const [pendingAction, setPendingAction] = useState("");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const profileByUserId = useMemo(() => new Map(profiles.map((profile) => [profile.user_id, profile])), [profiles]);
  const payrollByCardId = useMemo(() => new Map(payrollRows.map((row) => [row.time_card_id, row])), [payrollRows]);
  const itemByCardId = useMemo(() => new Map(itemRows.map((item) => [item.time_card_id, item])), [itemRows]);
  const itemsByRunId = useMemo(() => {
    return itemRows.reduce<Record<string, EmployeePayrollRunItem[]>>((groups, item) => {
      groups[item.payroll_run_id] = groups[item.payroll_run_id] ?? [];
      groups[item.payroll_run_id].push(item);
      return groups;
    }, {});
  }, [itemRows]);

  const availableCards = useMemo(
    () => approvedCards.filter((card) => !itemByCardId.has(card.id) && payrollByCardId.has(card.id)),
    [approvedCards, itemByCardId, payrollByCardId],
  );
  const selectedRun = runRows.find((run) => run.id === selectedRunId) ?? runRows[0] ?? null;
  const selectedItems = selectedRun ? itemsByRunId[selectedRun.id] ?? [] : [];

  const filteredRuns = useMemo(() => {
    const search = filters.search.toLowerCase();
    return runRows.filter((run) => {
      const runItems = itemsByRunId[run.id] ?? [];
      const employeeNames = runItems.map((item) => employeeName(item.employee_user_id)).join(" ").toLowerCase();
      const text = `${run.period_start} ${run.period_end} ${run.status} ${run.notes ?? ""} ${employeeNames}`.toLowerCase();
      return (!filters.status || run.status === filters.status) && (!search || text.includes(search));
    });
  }, [filters, itemsByRunId, runRows]);

  const kpis = useMemo(() => {
    const monthStart = currentMonthStart();
    const readyRuns = runRows.filter((run) => ["draft", "ready"].includes(run.status)).length;
    const heldItems = itemRows.filter((item) => item.item_status === "held").length;
    const approvedHours = availableCards.reduce((total, card) => total + Number(payrollByCardId.get(card.id)?.total_hours ?? 0), 0);
    const unpaidItems = itemRows.filter((item) => item.item_status !== "paid");
    const grossOpen = unpaidItems.reduce((total, item) => total + Number(item.gross_pay), 0);
    const netOpen = unpaidItems.reduce((total, item) => total + Number(item.net_pay), 0);
    const paidRuns = runRows.filter((run) => run.status === "paid" && run.paid_at && run.paid_at.slice(0, 10) >= monthStart);
    const paidThisMonth = paidRuns.reduce((total, run) => total + (itemsByRunId[run.id] ?? []).reduce((sum, item) => sum + Number(item.gross_pay), 0), 0);
    const netPaidThisMonth = paidRuns.reduce((total, run) => total + (itemsByRunId[run.id] ?? []).reduce((sum, item) => sum + Number(item.net_pay), 0), 0);

    return [
      { label: "Ready to run", value: String(readyRuns), detail: `${availableCards.length} approved card(s) unassigned`, icon: ReceiptText },
      { label: "Held cards", value: String(heldItems), detail: "Manual payroll holds", icon: PauseCircle },
      { label: "Approved hours", value: approvedHours.toFixed(2), detail: "Available for new runs", icon: Clock3 },
      { label: "Gross payroll", value: money(grossOpen), detail: `Net: ${money(netOpen)}`, icon: DollarSign },
      { label: "Paid this month", value: money(paidThisMonth), detail: `Net: ${money(netPaidThisMonth)}`, icon: CheckCircle2 },
    ];
  }, [availableCards, itemRows, itemsByRunId, payrollByCardId, runRows]);

  const employeeTotals = useMemo(() => {
    const totals = new Map<string, { employeeUserId: string | null; hours: number; gross: number; net: number; paid: number; held: number; runs: number }>();

    itemRows.forEach((item) => {
      const key = item.employee_user_id ?? "unassigned";
      const current = totals.get(key) ?? { employeeUserId: item.employee_user_id, hours: 0, gross: 0, net: 0, paid: 0, held: 0, runs: 0 };
      current.hours += Number(item.total_hours);
      current.gross += Number(item.gross_pay);
      current.net += Number(item.net_pay);
      current.runs += 1;
      if (item.item_status === "paid") current.paid += Number(item.gross_pay);
      if (item.item_status === "held") current.held += Number(item.gross_pay);
      totals.set(key, current);
    });

    return [...totals.values()].sort((a, b) => employeeName(a.employeeUserId).localeCompare(employeeName(b.employeeUserId)));
  }, [itemRows]);

  function employeeName(userId: string | null) {
    if (!userId) return "Unassigned";
    const profile = profileByUserId.get(userId);
    return profile?.display_name || profile?.email || userId.slice(0, 8);
  }

  function setStatusMessage(text: string, tone: MessageTone = "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function handleCreateRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPendingAction("create-run");
    const result = await createPayrollRun({
      periodStart: String(formData.get("period_start") ?? ""),
      periodEnd: String(formData.get("period_end") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Payroll run could not be created.", "error");

    setRunRows((current) => [result.data!.run, ...current]);
    setItemRows((current) => [...result.data!.items, ...current]);
    setSelectedRunId(result.data.run.id);
    setActiveView("runs");
    setStatusMessage("Payroll run created from approved time cards.");
    form.reset();
  }

  async function saveRunStatus(run: EmployeePayrollRun, status: string) {
    setPendingAction(`run-${run.id}`);
    const result = await updatePayrollRun({ runId: run.id, status });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Payroll run could not be saved.", "error");

    setRunRows((current) => current.map((row) => (row.id === run.id ? result.data! : row)));
    setStatusMessage("Payroll run status saved.");
  }

  async function saveRunNotes(run: EmployeePayrollRun, notes: string) {
    setPendingAction(`notes-${run.id}`);
    const result = await updatePayrollRun({ runId: run.id, notes });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Payroll run notes could not be saved.", "error");

    setRunRows((current) => current.map((row) => (row.id === run.id ? result.data! : row)));
    setStatusMessage("Payroll run notes saved.");
  }

  async function markRunPaid(run: EmployeePayrollRun) {
    setPendingAction(`paid-${run.id}`);
    const result = await markPayrollRunPaid({ runId: run.id });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Payroll run could not be marked paid.", "error");

    setRunRows((current) => current.map((row) => (row.id === run.id ? result.data!.run : row)));
    setItemRows((current) => {
      const updatedById = new Map(result.data!.items.map((item) => [item.id, item]));
      return current.map((item) => updatedById.get(item.id) ?? item);
    });
    setStatusMessage("Payroll run marked paid.");
  }

  async function saveItemPatch(item: EmployeePayrollRunItem, patch: { itemStatus?: string; notes?: string }) {
    setPendingAction(`item-${item.id}`);
    const result = await updatePayrollRunItem({ itemId: item.id, ...patch });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Payroll item could not be saved.", "error");

    setItemRows((current) => current.map((row) => (row.id === item.id ? result.data! : row)));
    setStatusMessage("Payroll item saved.");
  }

  async function saveItemTaxes(item: EmployeePayrollRunItem, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setPendingAction(`taxes-${item.id}`);
    const result = await updatePayrollRunItem({
      itemId: item.id,
      federalTax: Number(fd.get("federal_tax") ?? 0),
      stateTax: Number(fd.get("state_tax") ?? 0),
      socialSecurity: Number(fd.get("social_security") ?? 0),
      medicare: Number(fd.get("medicare") ?? 0),
      otherDeductions: Number(fd.get("other_deductions") ?? 0),
    });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Tax information could not be saved.", "error");

    setItemRows((current) => current.map((row) => (row.id === item.id ? result.data! : row)));
    setStatusMessage("Tax information saved.");
  }

  function runTotal(runId: string) {
    return (itemsByRunId[runId] ?? []).reduce((total, item) => total + Number(item.gross_pay), 0);
  }

  function runNet(runId: string) {
    return (itemsByRunId[runId] ?? []).reduce((total, item) => total + Number(item.net_pay), 0);
  }

  function runHours(runId: string) {
    return (itemsByRunId[runId] ?? []).reduce((total, item) => total + Number(item.total_hours), 0);
  }

  return (
    <div className="finance-center payroll-center">
      {message ? <div className={`success-box portal-alert ${messageTone === "error" ? "portal-alert-error" : ""}`}>{message}</div> : null}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <Link className="btn-secondary" href="/employee/time-cards" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Clock3 size={15} /> View Time Cards
        </Link>
      </div>

      <section className="kpi-strip finance-kpi-strip" aria-label="Payroll KPIs">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div className="kpi-card finance-kpi-card" key={kpi.label}>
              <span className="kpi-icon">
                <Icon size={18} />
              </span>
              <span className="kpi-value">{kpi.value}</span>
              <span className="kpi-label">{kpi.label}</span>
              <span className="kpi-detail">{kpi.detail}</span>
            </div>
          );
        })}
      </section>

      <div className="finance-tabs" role="tablist" aria-label="Payroll views">
        {[
          ["runs", "Runs"],
          ["approved", "Approved time cards"],
          ["employees", "Employees"],
        ].map(([id, label]) => (
          <button className={activeView === id ? "active" : undefined} key={id} onClick={() => setActiveView(id as ActiveView)} type="button">
            {label}
          </button>
        ))}
      </div>

      {activeView === "runs" ? (
        <div className="operations-layout finance-layout payroll-layout">
          <form className="form-panel payroll-create-panel" onSubmit={handleCreateRun}>
            <h2>Create payroll run</h2>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
              <div className="field">
                <label htmlFor="payroll-period-start">Period start</label>
                <input id="payroll-period-start" name="period_start" required type="date" defaultValue={currentWeekStart()} />
              </div>
              <div className="field">
                <label htmlFor="payroll-period-end">Period end</label>
                <input id="payroll-period-end" name="period_end" required type="date" defaultValue={addDays(currentWeekStart(), 6)} />
              </div>
              <div className="field">
                <label htmlFor="payroll-notes">Notes</label>
                <textarea id="payroll-notes" name="notes" placeholder="Manual payroll review notes" />
              </div>
              <button className="button button-primary" disabled={pendingAction === "create-run"} type="submit">
                <Plus size={18} />
                {pendingAction === "create-run" ? "Creating…" : "Create Run"}
              </button>
              <div className="empty-state payroll-create-note">
                {availableCards.length} approved time card(s) are available for payroll assignment.
              </div>
            </div>
          </form>

          <section className="table-card payroll-run-panel">
            <div className="portal-topline">
              <div>
                <h2>Payroll runs</h2>
                <p>Manual lifecycle for approved time-card payroll.</p>
              </div>
            </div>
            <div className="finance-filters payroll-filters">
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="">All statuses</option>
                {payrollRunStatuses.map((status) => (
                  <option key={status} value={status}>
                    {displayStatus(status)}
                  </option>
                ))}
              </select>
              <input placeholder="Search runs or employees" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            </div>

            <div className="payroll-run-list">
              {filteredRuns.length === 0 ? (
                <div className="empty-state">No payroll runs match the current view.</div>
              ) : (
                filteredRuns.map((run) => (
                  <article className={`payroll-run-row ${selectedRun?.id === run.id ? "active" : ""}`} key={run.id}>
                    <button className="payroll-run-select" onClick={() => setSelectedRunId(run.id)} type="button">
                      <span>
                        <strong>
                          {dateLabel(run.period_start)} to {dateLabel(run.period_end)}
                        </strong>
                        <small>
                          {(itemsByRunId[run.id] ?? []).length} employee card(s) &mdash; {runHours(run.id).toFixed(2)} hours
                        </small>
                      </span>
                      <span className={`record-badge payroll-status payroll-status-${run.status}`}>{displayStatus(run.status)}</span>
                      <span>
                        <strong>{money(runTotal(run.id))}</strong>
                        <small>Net: {money(runNet(run.id))}</small>
                      </span>
                    </button>
                    <div className="payroll-row-actions">
                      <select value={run.status} disabled={pendingAction === `run-${run.id}` || run.status === "paid"} onChange={(event) => saveRunStatus(run, event.target.value)}>
                        {payrollRunStatuses
                          .filter((status) => status !== "paid")
                          .map((status) => (
                            <option key={status} value={status}>
                              {displayStatus(status)}
                            </option>
                          ))}
                        {run.status === "paid" ? <option value="paid">paid</option> : null}
                      </select>
                      <button className="button button-light" disabled={pendingAction === `paid-${run.id}` || run.status === "paid"} onClick={() => markRunPaid(run)} type="button">
                        <CheckCircle2 size={16} />
                        Mark paid
                      </button>
                      <button className="button button-secondary button-neutral" disabled={run.status === "paid"} onClick={() => saveRunStatus(run, "held")} type="button">
                        <PauseCircle size={16} />
                        Hold
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      {activeView === "runs" && selectedRun ? (
        <section className="table-card payroll-detail-panel">
          <div className="portal-topline">
            <div>
              <h2>Selected run detail</h2>
              <p>
                {dateLabel(selectedRun.period_start)} to {dateLabel(selectedRun.period_end)} &mdash; Gross: {money(runTotal(selectedRun.id))} / Net: {money(runNet(selectedRun.id))}
              </p>
            </div>
            <span className={`record-badge payroll-status payroll-status-${selectedRun.status}`}>{displayStatus(selectedRun.status)}</span>
          </div>
          <div className="field payroll-notes-field">
            <label htmlFor={`run-notes-${selectedRun.id}`}>Run notes</label>
            <input
              id={`run-notes-${selectedRun.id}`}
              defaultValue={selectedRun.notes ?? ""}
              onBlur={(event) => saveRunNotes(selectedRun, event.target.value)}
            />
          </div>
          <div className="payroll-item-table">
            {selectedItems.length === 0 ? (
              <div className="empty-state">This payroll run does not have any time cards.</div>
            ) : (
              selectedItems.map((item) => (
                <div key={item.id}>
                  <div className="payroll-item-row">
                    <span>
                      <strong>{employeeName(item.employee_user_id)}</strong>
                      <small>{item.time_card_id.slice(0, 8)}</small>
                    </span>
                    <span>{Number(item.total_hours).toFixed(2)} hrs @ {money(Number(item.hourly_rate))}</span>
                    <span>
                      <small>Gross</small>
                      <strong>{money(Number(item.gross_pay))}</strong>
                    </span>
                    <span>
                      <small>Net</small>
                      <strong>{money(Number(item.net_pay))}</strong>
                    </span>
                    <select value={item.item_status} disabled={pendingAction === `item-${item.id}`} onChange={(event) => saveItemPatch(item, { itemStatus: event.target.value })}>
                      {payrollRunItemStatuses.map((status) => (
                        <option key={status} value={status}>
                          {displayStatus(status)}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`Notes for ${employeeName(item.employee_user_id)}`}
                      defaultValue={item.notes ?? ""}
                      onBlur={(event) => saveItemPatch(item, { notes: event.target.value })}
                      placeholder="Item notes"
                    />
                    <button
                      className="button button-secondary"
                      onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                      type="button"
                    >
                      {expandedItemId === item.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      Taxes
                    </button>
                  </div>
                  {expandedItemId === item.id && (
                    <form className="payroll-tax-panel" onSubmit={(e) => saveItemTaxes(item, e)}>
                      <div className="payroll-tax-grid">
                        <div className="field">
                          <label>Federal income tax</label>
                          <input defaultValue={Number(item.federal_tax).toFixed(2)} min="0" name="federal_tax" step="0.01" type="number" />
                        </div>
                        <div className="field">
                          <label>State income tax</label>
                          <input defaultValue={Number(item.state_tax).toFixed(2)} min="0" name="state_tax" step="0.01" type="number" />
                        </div>
                        <div className="field">
                          <label>Social Security (6.2%)</label>
                          <input defaultValue={Number(item.social_security).toFixed(2)} min="0" name="social_security" step="0.01" type="number" />
                        </div>
                        <div className="field">
                          <label>Medicare (1.45%)</label>
                          <input defaultValue={Number(item.medicare).toFixed(2)} min="0" name="medicare" step="0.01" type="number" />
                        </div>
                        <div className="field">
                          <label>Other deductions</label>
                          <input defaultValue={Number(item.other_deductions).toFixed(2)} min="0" name="other_deductions" step="0.01" type="number" />
                        </div>
                      </div>
                      <div className="payroll-tax-footer">
                        <span>
                          Total withheld:{" "}
                          <strong>
                            {money(
                              Number(item.federal_tax) +
                              Number(item.state_tax) +
                              Number(item.social_security) +
                              Number(item.medicare) +
                              Number(item.other_deductions),
                            )}
                          </strong>
                        </span>
                        <span>
                          Net pay: <strong>{money(Number(item.net_pay))}</strong>
                        </span>
                        <button className="button button-primary" disabled={pendingAction === `taxes-${item.id}`} type="submit">
                          {pendingAction === `taxes-${item.id}` ? "Saving…" : "Save taxes"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activeView === "approved" ? (
        <section className="table-card payroll-detail-panel">
          <div className="portal-topline">
            <div>
              <h2>Approved time cards</h2>
              <p>Approved cards that have not been assigned to a payroll run.</p>
            </div>
            <span className="badge">{availableCards.length} available</span>
          </div>
          <div className="payroll-item-table">
            {availableCards.length === 0 ? (
              <div className="empty-state">No approved time cards are waiting for payroll.</div>
            ) : (
              availableCards.map((card) => {
                const payroll = payrollByCardId.get(card.id);
                return (
                  <div className="payroll-approved-row" key={card.id}>
                    <span>
                      <strong>{employeeName(card.employee_user_id)}</strong>
                      <small>
                        {dateLabel(card.week_start)} to {dateLabel(card.week_end)}
                      </small>
                    </span>
                    <span>{Number(payroll?.total_hours ?? 0).toFixed(2)} hours</span>
                    <span>{money(Number(payroll?.hourly_rate ?? 0))}/hr</span>
                    <strong>{money(Number(payroll?.paid_value ?? 0))}</strong>
                  </div>
                );
              })
            )}
          </div>
        </section>
      ) : null}

      {activeView === "employees" ? (
        <section className="table-card payroll-detail-panel">
          <div className="portal-topline">
            <div>
              <h2>Employee payroll totals</h2>
              <p>Gross and net payroll totals from created payroll runs.</p>
            </div>
            <span className="badge">{employeeTotals.length} employee(s)</span>
          </div>
          <div className="payroll-item-table">
            {employeeTotals.length === 0 ? (
              <div className="empty-state">No employee payroll run items have been created yet.</div>
            ) : (
              employeeTotals.map((total) => (
                <div className="payroll-approved-row" key={total.employeeUserId ?? "unassigned"}>
                  <span>
                    <strong>{employeeName(total.employeeUserId)}</strong>
                    <small>{total.runs} payroll card(s) &mdash; {total.hours.toFixed(2)} hours</small>
                  </span>
                  <span>{money(total.paid)} paid</span>
                  <span>{money(total.held)} held</span>
                  <span>
                    <small>Gross</small>
                    <strong>{money(total.gross)}</strong>
                  </span>
                  <span>
                    <small>Net</small>
                    <strong>{money(total.net)}</strong>
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
