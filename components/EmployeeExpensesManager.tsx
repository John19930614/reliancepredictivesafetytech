"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Download, FileUp, Plus, ReceiptText, Trash2, UploadCloud } from "lucide-react";
import {
  employeeExpenseCategories,
  employeeExpenseStatuses,
  type EmployeeExpenseReceipt,
  type EmployeeExpenseReport,
  type EmployeeProfile,
} from "@/lib/company-data";
import { friendlyError } from "@/lib/friendly-error";
import { createClient } from "@/lib/supabase/client";
import {
  cancelEmployeeExpenseReport,
  createEmployeeExpenseReport,
  deleteEmployeeExpenseReceipt,
  registerEmployeeExpenseReceipt,
  reviewEmployeeExpenseReport,
  updateEmployeeExpenseReport,
} from "@/app/employee/expenses/actions";

type EmployeeExpensesManagerProps = {
  canReviewExpenses: boolean;
  currentUserId: string;
  profiles: Pick<EmployeeProfile, "user_id" | "display_name" | "email">[];
  reports: EmployeeExpenseReport[];
  receipts: EmployeeExpenseReceipt[];
};

type MessageTone = "success" | "error";

const editableEmployeeStatuses = ["submitted", "needs_info"];
const reviewStatuses = employeeExpenseStatuses.filter((status) => !["submitted", "cancelled"].includes(status));

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(value);
}

function dateLabel(value: string | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function cleanOptional(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function fileSafeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function receiptCountForReport(receipts: EmployeeExpenseReceipt[], reportId: string) {
  return receipts.filter((receipt) => receipt.expense_report_id === reportId).length;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function statusBadgeClass(status: string) {
  if (["approved", "reimbursed"].includes(status)) return "record-badge-gold";
  if (["rejected", "cancelled"].includes(status)) return "record-badge-danger";
  return "record-badge-neutral";
}

function asExpenseReport(report: unknown) {
  return report as EmployeeExpenseReport;
}

export function EmployeeExpensesManager({
  canReviewExpenses,
  currentUserId,
  profiles,
  reports,
  receipts,
}: EmployeeExpensesManagerProps) {
  const [reportRows, setReportRows] = useState(reports);
  const [receiptRows, setReceiptRows] = useState(receipts);
  const [activeView, setActiveView] = useState<"mine" | "review">(canReviewExpenses ? "review" : "mine");
  const [filters, setFilters] = useState({ employee: "", status: "", category: "", search: "" });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("success");
  const [pendingAction, setPendingAction] = useState("");

  const profileNameById = useMemo(
    () => new Map(profiles.map((profile) => [profile.user_id, profile.display_name || profile.email || profile.user_id.slice(0, 8)])),
    [profiles],
  );

  const myReports = useMemo(() => reportRows.filter((report) => report.employee_user_id === currentUserId), [currentUserId, reportRows]);

  const reviewRows = useMemo(() => {
    const search = filters.search.toLowerCase();
    return reportRows.filter((report) => {
      const employeeName = profileNameById.get(report.employee_user_id) ?? report.employee_user_id;
      const text = `${report.title} ${report.merchant ?? ""} ${report.category} ${report.business_purpose} ${report.notes ?? ""} ${employeeName}`.toLowerCase();
      return (
        (!filters.employee || report.employee_user_id === filters.employee) &&
        (!filters.status || report.status === filters.status) &&
        (!filters.category || report.category === filters.category) &&
        (!search || text.includes(search))
      );
    });
  }, [filters, profileNameById, reportRows]);

  const kpis = useMemo(() => {
    const visible = canReviewExpenses ? reportRows : myReports;
    const pending = visible.filter((report) => ["submitted", "needs_info"].includes(report.status));
    const approved = visible.filter((report) => ["approved", "reimbursed"].includes(report.status));
    const reimbursed = visible.filter((report) => report.status === "reimbursed");
    const receiptless = visible.filter((report) => receiptCountForReport(receiptRows, report.id) === 0);

    return [
      { label: "Pending", value: String(pending.length), detail: `${money(pending.reduce((total, report) => total + Number(report.amount), 0))} awaiting action` },
      { label: "Approved", value: String(approved.length), detail: `${money(approved.reduce((total, report) => total + Number(report.amount), 0))} approved or paid` },
      { label: "Reimbursed", value: String(reimbursed.length), detail: `${money(reimbursed.reduce((total, report) => total + Number(report.amount), 0))} marked reimbursed` },
      { label: "Missing receipts", value: String(receiptless.length), detail: "Reports without receipt evidence" },
    ];
  }, [canReviewExpenses, myReports, receiptRows, reportRows]);

  function setStatusMessage(text: string, tone: MessageTone = "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function uploadReceiptFile(file: File, expenseReportId: string) {
    const supabase = createClient();
    if (!supabase) return { data: null, error: "Supabase is required for receipt uploads." };

    const filePath = `${currentUserId}/${expenseReportId}/${Date.now()}-${fileSafeName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("employee-expense-receipts").upload(filePath, file);
    if (uploadError) return { data: null, error: uploadError.message };

    return registerEmployeeExpenseReceipt({
      expenseReportId,
      filePath,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    });
  }

  async function handleCreateReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("receipt");

    if (!(file instanceof File) || !file.name) {
      return setStatusMessage("Choose a receipt file before submitting the expense.", "error");
    }

    setPendingAction("create-report");
    const result = await createEmployeeExpenseReport({
      title: cleanOptional(formData.get("title")),
      category: cleanOptional(formData.get("category")),
      amount: Number(formData.get("amount") ?? 0),
      expenseDate: cleanOptional(formData.get("expense_date")),
      merchant: cleanOptional(formData.get("merchant")),
      paymentMethod: cleanOptional(formData.get("payment_method")),
      businessPurpose: cleanOptional(formData.get("business_purpose")),
      notes: cleanOptional(formData.get("notes")),
    });

    if (result.error || !result.data) {
      setPendingAction("");
      return setStatusMessage(result.error ?? "Expense report could not be saved.", "error");
    }

    const uploadResult = await uploadReceiptFile(file, result.data.id);
    setPendingAction("");

    setReportRows((current) => [asExpenseReport(result.data!), ...current]);

    if (uploadResult.error || !uploadResult.data) {
      return setStatusMessage(uploadResult.error ?? "Expense saved, but the receipt could not be attached.", "error");
    }

    setReceiptRows((current) => [uploadResult.data!, ...current]);
    setStatusMessage("Expense submitted with receipt.");
    form.reset();
  }

  async function handleAdditionalReceipt(event: React.FormEvent<HTMLFormElement>, reportId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("receipt");

    if (!(file instanceof File) || !file.name) return setStatusMessage("Choose a receipt file.", "error");

    setPendingAction(`receipt-${reportId}`);
    const result = await uploadReceiptFile(file, reportId);
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Receipt could not be uploaded.", "error");

    setReceiptRows((current) => [result.data!, ...current]);
    setStatusMessage("Receipt uploaded.");
    form.reset();
  }

  async function saveReportPatch(id: string, patch: Parameters<typeof updateEmployeeExpenseReport>[0]["patch"]) {
    setPendingAction(`report-${id}`);
    const result = await updateEmployeeExpenseReport({ id, patch });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Expense report could not be saved.", "error");

    setReportRows((current) => current.map((row) => (row.id === id ? asExpenseReport(result.data!) : row)));
    setStatusMessage("Expense report saved.");
  }

  async function handleCancelReport(id: string) {
    setPendingAction(`cancel-${id}`);
    const result = await cancelEmployeeExpenseReport({ id });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Expense report could not be cancelled.", "error");

    setReportRows((current) => current.map((row) => (row.id === id ? asExpenseReport(result.data!) : row)));
    setStatusMessage("Expense report cancelled.");
  }

  async function handleReviewReport(id: string, status: string, financeNotes: string) {
    setPendingAction(`review-${id}`);
    const result = await reviewEmployeeExpenseReport({ id, status, financeNotes });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Expense report could not be reviewed.", "error");

    setReportRows((current) => current.map((row) => (row.id === id ? asExpenseReport(result.data!) : row)));
    setStatusMessage(status === "reimbursed" ? "Expense marked reimbursed." : "Expense review saved.");
  }

  async function viewReceipt(receipt: EmployeeExpenseReceipt) {
    const supabase = createClient();
    if (!supabase) return setStatusMessage("Supabase is required to view receipts.", "error");

    const { data, error } = await supabase.storage.from("employee-expense-receipts").createSignedUrl(receipt.file_path, 60);
    if (error || !data?.signedUrl) {
      console.error(error);
      return setStatusMessage(friendlyError(error, "Receipt link could not be created."), "error");
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function removeReceipt(receipt: EmployeeExpenseReceipt) {
    setPendingAction(`delete-receipt-${receipt.id}`);
    const result = await deleteEmployeeExpenseReceipt({ receiptId: receipt.id, filePath: receipt.file_path });
    setPendingAction("");

    if (result.error) return setStatusMessage(result.error, "error");

    setReceiptRows((current) => current.filter((row) => row.id !== receipt.id));
    setStatusMessage("Receipt removed.");
  }

  function renderReceiptList(report: EmployeeExpenseReport, editable: boolean) {
    const reportReceipts = receiptRows.filter((receipt) => receipt.expense_report_id === report.id);

    return (
      <div className="finance-receipt-list">
        {reportReceipts.length === 0 ? <div className="empty-state expense-empty-receipts">No receipts uploaded.</div> : null}
        {reportReceipts.map((receipt) => (
          <div className="finance-receipt-row" key={receipt.id}>
            <span>{receipt.file_name}</span>
            <button className="button button-light" onClick={() => viewReceipt(receipt)} type="button">
              <Download size={15} />
              View
            </button>
            {editable ? (
              <button
                className="button button-secondary button-neutral"
                disabled={pendingAction === `delete-receipt-${receipt.id}`}
                onClick={() => removeReceipt(receipt)}
                type="button"
              >
                <Trash2 size={15} />
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  function renderReportCard(report: EmployeeExpenseReport, mode: "mine" | "review") {
    const editable = mode === "mine" && report.employee_user_id === currentUserId && editableEmployeeStatuses.includes(report.status);
    const employeeName = profileNameById.get(report.employee_user_id) ?? report.employee_user_id.slice(0, 8);

    return (
      <article className="doc-card finance-record-card expense-record-card" key={report.id}>
        <div className="portal-topline" style={{ marginBottom: 12 }}>
          <div>
            <h3>{report.title}</h3>
            <p>
              {mode === "review" ? `${employeeName} - ` : ""}
              {report.category} - {dateLabel(report.expense_date)}
            </p>
            <div className="record-badge-row">
              <span className="record-badge record-badge-gold">{money(Number(report.amount))}</span>
              <span className={`record-badge ${statusBadgeClass(report.status)}`}>{statusLabel(report.status)}</span>
              <span className="record-badge record-badge-neutral">{receiptCountForReport(receiptRows, report.id)} receipt(s)</span>
            </div>
          </div>
          {editable ? (
            <button className="button button-secondary button-neutral" disabled={pendingAction === `cancel-${report.id}`} onClick={() => handleCancelReport(report.id)} type="button">
              Cancel
            </button>
          ) : null}
        </div>

        {mode === "mine" ? (
          <div className="form-grid">
            <div className="field">
              <label>Title</label>
              <input defaultValue={report.title} disabled={!editable} onBlur={(event) => saveReportPatch(report.id, { title: event.target.value })} />
            </div>
            <div className="field">
              <label>Amount</label>
              <input
                defaultValue={Number(report.amount)}
                disabled={!editable}
                min="0.01"
                onBlur={(event) => saveReportPatch(report.id, { amount: Number(event.target.value) })}
                step="0.01"
                type="number"
              />
            </div>
            <div className="field">
              <label>Date</label>
              <input
                defaultValue={report.expense_date}
                disabled={!editable}
                onBlur={(event) => saveReportPatch(report.id, { expense_date: event.target.value })}
                type="date"
              />
            </div>
            <div className="field">
              <label>Category</label>
              <select
                defaultValue={report.category}
                disabled={!editable}
                onBlur={(event) => saveReportPatch(report.id, { category: event.target.value })}
              >
                {employeeExpenseCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Merchant</label>
              <input defaultValue={report.merchant ?? ""} disabled={!editable} onBlur={(event) => saveReportPatch(report.id, { merchant: event.target.value })} />
            </div>
            <div className="field">
              <label>Payment method</label>
              <input
                defaultValue={report.payment_method ?? ""}
                disabled={!editable}
                onBlur={(event) => saveReportPatch(report.id, { payment_method: event.target.value })}
              />
            </div>
            <div className="field-full">
              <label>Business purpose</label>
              <textarea
                defaultValue={report.business_purpose}
                disabled={!editable}
                onBlur={(event) => saveReportPatch(report.id, { business_purpose: event.target.value })}
              />
            </div>
            <div className="field-full">
              <label>Notes</label>
              <textarea defaultValue={report.notes ?? ""} disabled={!editable} onBlur={(event) => saveReportPatch(report.id, { notes: event.target.value })} />
            </div>
          </div>
        ) : (
          <div className="expense-review-summary">
            <p>
              <strong>Merchant:</strong> {report.merchant ?? "Not listed"}
            </p>
            <p>
              <strong>Payment:</strong> {report.payment_method ?? "Not listed"}
            </p>
            <p>
              <strong>Purpose:</strong> {report.business_purpose}
            </p>
            {report.notes ? <p>{report.notes}</p> : null}
          </div>
        )}

        {report.finance_notes ? <div className="success-box expense-finance-notes">Finance notes: {report.finance_notes}</div> : null}

        {renderReceiptList(report, editable)}

        {editable ? (
          <form className="finance-receipt-upload" onSubmit={(event) => handleAdditionalReceipt(event, report.id)}>
            <input aria-label={`Upload receipt for ${report.title}`} name="receipt" type="file" />
            <button className="button button-secondary" disabled={pendingAction === `receipt-${report.id}`} type="submit">
              <UploadCloud size={16} />
              {pendingAction === `receipt-${report.id}` ? "Uploading…" : "Upload Receipt"}
            </button>
          </form>
        ) : null}

        {mode === "review" && canReviewExpenses ? (
          <form
            className="expense-review-form"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              handleReviewReport(report.id, cleanOptional(formData.get("status")), cleanOptional(formData.get("finance_notes")));
            }}
          >
            <div className="form-grid">
              <div className="field">
                <label>Status</label>
                <select name="status" defaultValue={report.status === "submitted" || report.status === "cancelled" ? "needs_info" : report.status}>
                  {reviewStatuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Finance notes</label>
                <input name="finance_notes" defaultValue={report.finance_notes ?? ""} />
              </div>
            </div>
            <button className="button button-primary" disabled={pendingAction === `review-${report.id}`} type="submit">
              <CheckCircle2 size={16} />
              {pendingAction === `review-${report.id}` ? "Saving…" : "Save Review"}
            </button>
          </form>
        ) : null}

        {pendingAction === `report-${report.id}` ? <small>Saving…</small> : null}
      </article>
    );
  }

  return (
    <div className="finance-center expense-center">
      {message ? <div className={`success-box portal-alert ${messageTone === "error" ? "portal-alert-error" : ""}`}>{message}</div> : null}

      <section className="kpi-strip finance-kpi-strip" aria-label="Expense KPIs">
        {kpis.map((kpi) => (
          <div className="kpi-card finance-kpi-card" key={kpi.label}>
            <span className="kpi-icon">
              <ReceiptText size={18} />
            </span>
            <span className="kpi-value">{kpi.value}</span>
            <span className="kpi-label">{kpi.label}</span>
            <span className="kpi-detail">{kpi.detail}</span>
          </div>
        ))}
      </section>

      <div className="finance-tabs" role="tablist" aria-label="Expense views">
        <button className={activeView === "mine" ? "active" : undefined} onClick={() => setActiveView("mine")} type="button">
          My Expenses
        </button>
        {canReviewExpenses ? (
          <button className={activeView === "review" ? "active" : undefined} onClick={() => setActiveView("review")} type="button">
            Finance Review
          </button>
        ) : null}
      </div>

      {activeView === "mine" ? (
        <div className="operations-layout finance-layout">
          <form className="form-panel" onSubmit={handleCreateReport}>
            <h2>Submit expense</h2>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
              <div className="field">
                <label htmlFor="expense-title">Title</label>
                <input id="expense-title" name="title" placeholder="Client site flight, hotel, fuel..." required />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="expense-amount">Amount</label>
                  <input id="expense-amount" min="0.01" name="amount" required step="0.01" type="number" />
                </div>
                <div className="field">
                  <label htmlFor="expense-date">Date</label>
                  <input id="expense-date" name="expense_date" required type="date" defaultValue={todayIsoDate()} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="expense-category">Category</label>
                <select id="expense-category" name="category" required>
                  {employeeExpenseCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="expense-merchant">Merchant</label>
                <input id="expense-merchant" name="merchant" />
              </div>
              <div className="field">
                <label htmlFor="expense-payment">Payment method</label>
                <input id="expense-payment" name="payment_method" placeholder="Personal card, company card, cash" />
              </div>
              <div className="field">
                <label htmlFor="expense-receipt">Receipt</label>
                <input id="expense-receipt" name="receipt" required type="file" />
              </div>
              <div className="field">
                <label htmlFor="expense-purpose">Business purpose</label>
                <textarea id="expense-purpose" name="business_purpose" required />
              </div>
              <div className="field">
                <label htmlFor="expense-notes">Notes</label>
                <textarea id="expense-notes" name="notes" />
              </div>
              <button className="button button-primary" disabled={pendingAction === "create-report"} type="submit">
                <Plus size={18} />
                {pendingAction === "create-report" ? "Submitting…" : "Submit Expense"}
              </button>
            </div>
          </form>

          <section className="doc-list">
            {myReports.length === 0 ? (
              <div className="empty-state">No expenses have been submitted by your account yet.</div>
            ) : (
              myReports.map((report) => renderReportCard(report, "mine"))
            )}
          </section>
        </div>
      ) : null}

      {activeView === "review" && canReviewExpenses ? (
        <section className="doc-list">
          <div className="finance-filters">
            <select value={filters.employee} onChange={(event) => setFilters((current) => ({ ...current, employee: event.target.value }))}>
              <option value="">All employees</option>
              {profiles.map((profile) => (
                <option key={profile.user_id} value={profile.user_id}>
                  {profile.display_name || profile.email || profile.user_id}
                </option>
              ))}
            </select>
            <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option>
              {employeeExpenseStatuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
            <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
              <option value="">All categories</option>
              {employeeExpenseCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            <input placeholder="Search expenses" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
          </div>

          {reviewRows.length === 0 ? (
            <div className="empty-state">No expenses match the current review filters.</div>
          ) : (
            reviewRows.map((report) => renderReportCard(report, "review"))
          )}
        </section>
      ) : null}
    </div>
  );
}
