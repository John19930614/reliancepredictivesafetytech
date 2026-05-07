"use client";

import { useMemo, useState } from "react";
import { Download, Plus, ReceiptText, Trash2, UploadCloud, UserPlus } from "lucide-react";
import {
  financeBudgetPeriods,
  financeBudgetTypes,
  financeCategories,
  financeExpenseStatuses,
  financeIncomeStatuses,
  financeRecurringCadences,
  financeRecurringStatuses,
  financeReviewStatuses,
  type CompanyClient,
  type CompanyDocument,
  type CompanyFinanceAuthorizedUser,
  type CompanyFinanceBudget,
  type CompanyFinanceReceipt,
  type CompanyFinanceRecurringItem,
  type CompanyFinanceTransaction,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";
import {
  addAuthorizedFinanceUser,
  createFinanceBudget,
  createFinanceRecurringItem,
  createFinanceTransaction,
  deleteFinanceReceipt,
  registerFinanceReceipt,
  removeAuthorizedFinanceUser,
  updateFinanceBudget,
  updateFinanceRecurringItem,
  updateFinanceTransaction,
} from "@/app/employee/finance/actions";

type PortalUserOption = {
  user_id: string;
  display_name?: string | null;
  email?: string | null;
};

type FinanceCenterManagerProps = {
  authorizedUsers: CompanyFinanceAuthorizedUser[];
  budgets: CompanyFinanceBudget[];
  canManageAuthorization: boolean;
  canManageRecords: boolean;
  clients: CompanyClient[];
  currentUserId: string;
  documents: CompanyDocument[];
  receipts: CompanyFinanceReceipt[];
  recurringItems: CompanyFinanceRecurringItem[];
  transactions: CompanyFinanceTransaction[];
  userOptions: PortalUserOption[];
};

type MessageTone = "success" | "error";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(value);
}

function dateLabel(value: string | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function cleanOptional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || "";
}

function receiptCountForTransaction(receipts: CompanyFinanceReceipt[], transactionId: string) {
  return receipts.filter((receipt) => receipt.transaction_id === transactionId).length;
}

export function FinanceCenterManager({
  authorizedUsers,
  budgets,
  canManageAuthorization,
  canManageRecords,
  clients,
  currentUserId,
  documents,
  receipts,
  recurringItems,
  transactions,
  userOptions,
}: FinanceCenterManagerProps) {
  const [financeUsers, setFinanceUsers] = useState(authorizedUsers);
  const [transactionRows, setTransactionRows] = useState(transactions);
  const [budgetRows, setBudgetRows] = useState(budgets);
  const [recurringRows, setRecurringRows] = useState(recurringItems);
  const [receiptRows, setReceiptRows] = useState(receipts);
  const [activeView, setActiveView] = useState<"transactions" | "budgets" | "recurring" | "access">("transactions");
  const [transactionType, setTransactionType] = useState<"income" | "expense">("expense");
  const [filters, setFilters] = useState({ type: "", status: "", review: "", search: "" });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("success");
  const [pendingAction, setPendingAction] = useState("");

  const filteredTransactions = useMemo(() => {
    const search = filters.search.toLowerCase();
    return transactionRows.filter((transaction) => {
      const text = `${transaction.title} ${transaction.vendor_customer ?? ""} ${transaction.category} ${transaction.notes ?? ""}`.toLowerCase();
      return (
        (!filters.type || transaction.transaction_type === filters.type) &&
        (!filters.status || transaction.status === filters.status) &&
        (!filters.review || transaction.review_status === filters.review) &&
        (!search || text.includes(search))
      );
    });
  }, [filters, transactionRows]);

  const kpis = useMemo(() => {
    const monthStart = currentMonthStart();
    const receivedIncome = transactionRows
      .filter((row) => row.transaction_type === "income" && row.status === "received")
      .reduce((total, row) => total + Number(row.amount), 0);
    const expectedIncome = transactionRows
      .filter((row) => row.transaction_type === "income" && ["expected", "invoiced"].includes(row.status))
      .reduce((total, row) => total + Number(row.amount), 0);
    const paidExpenses = transactionRows
      .filter((row) => row.transaction_type === "expense" && row.status === "paid")
      .reduce((total, row) => total + Number(row.amount), 0);
    const dueExpenses = transactionRows
      .filter((row) => row.transaction_type === "expense" && ["planned", "due"].includes(row.status))
      .reduce((total, row) => total + Number(row.amount), 0);
    const monthlyExpenseBudget = budgetRows
      .filter((row) => row.budget_type === "expense" && row.period === "monthly" && row.period_start <= monthStart)
      .reduce((total, row) => total + Number(row.amount), 0);
    const upcomingRecurring = recurringRows.filter(
      (row) => row.status === "active" && row.next_due_date && row.next_due_date <= new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10),
    ).length;

    return [
      { label: "Received income", value: money(receivedIncome), detail: `${money(expectedIncome)} expected or invoiced` },
      { label: "Paid expenses", value: money(paidExpenses), detail: `${money(dueExpenses)} planned or due` },
      { label: "Net movement", value: money(receivedIncome - paidExpenses), detail: "Received minus paid" },
      { label: "Budget variance", value: money(monthlyExpenseBudget - paidExpenses), detail: `${money(monthlyExpenseBudget)} monthly expense budget` },
      { label: "Upcoming recurring", value: String(upcomingRecurring), detail: "Active items due within 30 days" },
    ];
  }, [budgetRows, recurringRows, transactionRows]);

  function setStatusMessage(text: string, tone: MessageTone = "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function handleCreateTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageRecords) return setStatusMessage("Finance authorization is required to create transactions.", "error");

    const formData = new FormData(event.currentTarget);
    setPendingAction("create-transaction");
    const result = await createFinanceTransaction({
      transactionType,
      title: cleanOptional(formData.get("title")),
      amount: Number(formData.get("amount") ?? 0),
      transactionDate: cleanOptional(formData.get("transaction_date")),
      category: cleanOptional(formData.get("category")),
      status: cleanOptional(formData.get("status")),
      vendorCustomer: cleanOptional(formData.get("vendor_customer")),
      paymentMethod: cleanOptional(formData.get("payment_method")),
      owner: cleanOptional(formData.get("owner")),
      notes: cleanOptional(formData.get("notes")),
      relatedClientId: cleanOptional(formData.get("related_client_id")),
      relatedDocumentId: cleanOptional(formData.get("related_document_id")),
    });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Transaction could not be saved.", "error");

    setTransactionRows((current) => [result.data! as CompanyFinanceTransaction, ...current]);
    setStatusMessage("Finance transaction added.");
    event.currentTarget.reset();
  }

  async function saveTransactionPatch(id: string, patch: Parameters<typeof updateFinanceTransaction>[0]["patch"]) {
    setPendingAction(`transaction-${id}`);
    const result = await updateFinanceTransaction({ id, patch });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Transaction could not be saved.", "error");

    setTransactionRows((current) => current.map((row) => (row.id === id ? (result.data! as CompanyFinanceTransaction) : row)));
    setStatusMessage("Finance transaction saved.");
  }

  async function handleReceiptUpload(event: React.FormEvent<HTMLFormElement>, transactionId: string) {
    event.preventDefault();
    if (!canManageRecords) return setStatusMessage("Finance authorization is required to upload receipts.", "error");

    const formData = new FormData(event.currentTarget);
    const file = formData.get("receipt");
    if (!(file instanceof File) || !file.name) return setStatusMessage("Choose a receipt file.", "error");

    const supabase = createClient();
    if (!supabase) return setStatusMessage("Supabase is required for receipt uploads.", "error");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `${currentUserId}/${transactionId}/${Date.now()}-${safeName}`;
    setPendingAction(`receipt-${transactionId}`);
    const { error: uploadError } = await supabase.storage.from("finance-receipts").upload(filePath, file);
    if (uploadError) {
      setPendingAction("");
      return setStatusMessage(uploadError.message, "error");
    }

    const result = await registerFinanceReceipt({
      transactionId,
      filePath,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Receipt could not be registered.", "error");

    setReceiptRows((current) => [result.data!, ...current]);
    setStatusMessage("Receipt uploaded.");
    event.currentTarget.reset();
  }

  async function viewReceipt(receipt: CompanyFinanceReceipt) {
    const supabase = createClient();
    if (!supabase) return setStatusMessage("Supabase is required to view receipts.", "error");

    const { data, error } = await supabase.storage.from("finance-receipts").createSignedUrl(receipt.file_path, 60);
    if (error || !data?.signedUrl) return setStatusMessage(error?.message ?? "Receipt link could not be created.", "error");

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function removeReceipt(receipt: CompanyFinanceReceipt) {
    setPendingAction(`delete-receipt-${receipt.id}`);
    const result = await deleteFinanceReceipt({ receiptId: receipt.id, filePath: receipt.file_path });
    setPendingAction("");

    if (result.error) return setStatusMessage(result.error, "error");

    setReceiptRows((current) => current.filter((row) => row.id !== receipt.id));
    setStatusMessage("Receipt removed.");
  }

  async function handleCreateBudget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPendingAction("create-budget");
    const result = await createFinanceBudget({
      name: cleanOptional(formData.get("name")),
      budgetType: cleanOptional(formData.get("budget_type")),
      category: cleanOptional(formData.get("category")),
      period: cleanOptional(formData.get("period")),
      periodStart: cleanOptional(formData.get("period_start")),
      amount: Number(formData.get("amount") ?? 0),
      owner: cleanOptional(formData.get("owner")),
      notes: cleanOptional(formData.get("notes")),
    });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Budget could not be saved.", "error");

    setBudgetRows((current) => [result.data! as CompanyFinanceBudget, ...current]);
    setStatusMessage("Budget added.");
    event.currentTarget.reset();
  }

  async function handleCreateRecurring(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPendingAction("create-recurring");
    const result = await createFinanceRecurringItem({
      itemType: cleanOptional(formData.get("item_type")),
      title: cleanOptional(formData.get("title")),
      amount: Number(formData.get("amount") ?? 0),
      category: cleanOptional(formData.get("category")),
      cadence: cleanOptional(formData.get("cadence")),
      nextDueDate: cleanOptional(formData.get("next_due_date")),
      status: cleanOptional(formData.get("status")),
      vendorCustomer: cleanOptional(formData.get("vendor_customer")),
      paymentMethod: cleanOptional(formData.get("payment_method")),
      owner: cleanOptional(formData.get("owner")),
      notes: cleanOptional(formData.get("notes")),
    });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Recurring item could not be saved.", "error");

    setRecurringRows((current) => [result.data! as CompanyFinanceRecurringItem, ...current]);
    setStatusMessage("Recurring item added.");
    event.currentTarget.reset();
  }

  async function handleAuthorizeUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPendingAction("authorize-user");
    const result = await addAuthorizedFinanceUser({
      userId: cleanOptional(formData.get("user_id")),
      accessLabel: cleanOptional(formData.get("access_label")),
    });
    setPendingAction("");

    if (result.error || !result.data) return setStatusMessage(result.error ?? "Finance user could not be authorized.", "error");

    setFinanceUsers((current) => [result.data!, ...current.filter((user) => user.user_id !== result.data!.user_id)]);
    setStatusMessage("Finance access updated.");
    event.currentTarget.reset();
  }

  async function handleRemoveFinanceUser(userId: string) {
    setPendingAction(`remove-user-${userId}`);
    const result = await removeAuthorizedFinanceUser({ userId });
    setPendingAction("");

    if (result.error) return setStatusMessage(result.error, "error");

    setFinanceUsers((current) => current.filter((user) => user.user_id !== userId));
    setStatusMessage("Finance access removed.");
  }

  const userNameById = useMemo(
    () => new Map(userOptions.map((user) => [user.user_id, user.display_name || user.email || user.user_id.slice(0, 8)])),
    [userOptions],
  );

  if (!canManageRecords && !canManageAuthorization) {
    return <section className="portal-card empty-state">Finance access is limited to owners and authorized finance users.</section>;
  }

  return (
    <div className="finance-center">
      {message ? <div className={`success-box portal-alert ${messageTone === "error" ? "portal-alert-error" : ""}`}>{message}</div> : null}

      <section className="kpi-strip finance-kpi-strip" aria-label="Finance KPIs">
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

      <div className="finance-tabs" role="tablist" aria-label="Finance views">
        {[
          ["transactions", "Transactions"],
          ["budgets", "Budgets"],
          ["recurring", "Recurring"],
          ["access", "Access"],
        ].map(([id, label]) =>
          id === "access" && !canManageAuthorization ? null : (
            <button className={activeView === id ? "active" : undefined} key={id} onClick={() => setActiveView(id as typeof activeView)} type="button">
              {label}
            </button>
          ),
        )}
      </div>

      {canManageAuthorization && !canManageRecords ? (
        <section className="portal-card">
          <h3>Finance record access</h3>
          <p>Owner access can manage finance authorization. Add your user to the finance list before creating or editing finance records.</p>
        </section>
      ) : null}

      {activeView === "transactions" && (
        <div className="operations-layout finance-layout">
          <form className="form-panel" onSubmit={handleCreateTransaction}>
            <h2>Add transaction</h2>
            <div className="finance-segmented">
              <button className={transactionType === "expense" ? "active" : undefined} onClick={() => setTransactionType("expense")} type="button">
                Expense
              </button>
              <button className={transactionType === "income" ? "active" : undefined} onClick={() => setTransactionType("income")} type="button">
                Income
              </button>
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
              <div className="field">
                <label htmlFor="finance-title">Title</label>
                <input id="finance-title" name="title" required />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="finance-amount">Amount</label>
                  <input id="finance-amount" min="0.01" name="amount" required step="0.01" type="number" />
                </div>
                <div className="field">
                  <label htmlFor="finance-date">Date</label>
                  <input id="finance-date" name="transaction_date" required type="date" defaultValue={todayIsoDate()} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="finance-category">Category</label>
                <select id="finance-category" name="category" required>
                  {financeCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="finance-status">Status</label>
                <select id="finance-status" name="status" defaultValue={transactionType === "income" ? "expected" : "planned"}>
                  {(transactionType === "income" ? financeIncomeStatuses : financeExpenseStatuses).map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="finance-vendor">Vendor / customer</label>
                <input id="finance-vendor" name="vendor_customer" />
              </div>
              <div className="field">
                <label htmlFor="finance-payment">Payment method</label>
                <input id="finance-payment" name="payment_method" />
              </div>
              <div className="field">
                <label htmlFor="finance-owner">Owner</label>
                <input id="finance-owner" name="owner" />
              </div>
              <div className="field">
                <label htmlFor="finance-client">Related client</label>
                <select id="finance-client" name="related_client_id" defaultValue="">
                  <option value="">None</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="finance-document">Related document</label>
                <select id="finance-document" name="related_document_id" defaultValue="">
                  <option value="">None</option>
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="finance-notes">Notes</label>
                <textarea id="finance-notes" name="notes" />
              </div>
              <button className="button button-primary" disabled={!canManageRecords || pendingAction === "create-transaction"} type="submit">
                <Plus size={18} />
                {pendingAction === "create-transaction" ? "Adding..." : "Add Transaction"}
              </button>
            </div>
          </form>

          <section>
            <div className="filters operations-filters">
              <select value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}>
                <option value="">All types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="">All statuses</option>
                {[...financeIncomeStatuses, ...financeExpenseStatuses].filter((status, index, list) => list.indexOf(status) === index).map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <select value={filters.review} onChange={(event) => setFilters((current) => ({ ...current, review: event.target.value }))}>
                <option value="">All review states</option>
                {financeReviewStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <input placeholder="Search finance records" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            </div>

            <div className="doc-list">
              {filteredTransactions.length === 0 ? (
                <div className="empty-state">No finance transactions match the current view.</div>
              ) : (
                filteredTransactions.map((transaction) => (
                  <article className="doc-card finance-record-card" key={transaction.id}>
                    <div className="portal-topline" style={{ marginBottom: 12 }}>
                      <div>
                        <h3>{transaction.title}</h3>
                        <p>
                          {transaction.transaction_type} - {transaction.category} - {dateLabel(transaction.transaction_date)}
                        </p>
                        <div className="record-badge-row">
                          <span className={`record-badge ${transaction.transaction_type === "expense" ? "record-badge-danger" : "record-badge-gold"}`}>
                            {money(Number(transaction.amount))}
                          </span>
                          <span className="record-badge">{transaction.status.replaceAll("_", " ")}</span>
                          <span className="record-badge record-badge-neutral">{transaction.review_status.replaceAll("_", " ")}</span>
                          <span className="record-badge record-badge-neutral">{receiptCountForTransaction(receiptRows, transaction.id)} receipt(s)</span>
                        </div>
                      </div>
                    </div>
                    <div className="form-grid">
                      <div className="field">
                        <label>Status</label>
                        <select
                          value={transaction.status}
                          onChange={(event) => saveTransactionPatch(transaction.id, { status: event.target.value })}
                        >
                          {(transaction.transaction_type === "income" ? financeIncomeStatuses : financeExpenseStatuses).map((status) => (
                            <option key={status} value={status}>
                              {status.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Review</label>
                        <select
                          value={transaction.review_status}
                          onChange={(event) => saveTransactionPatch(transaction.id, { review_status: event.target.value })}
                        >
                          {financeReviewStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Owner</label>
                        <input
                          defaultValue={transaction.owner ?? ""}
                          onBlur={(event) => saveTransactionPatch(transaction.id, { owner: event.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Notes</label>
                        <input
                          defaultValue={transaction.notes ?? ""}
                          onBlur={(event) => saveTransactionPatch(transaction.id, { notes: event.target.value })}
                        />
                      </div>
                    </div>
                    <div className="finance-receipt-list">
                      {receiptRows
                        .filter((receipt) => receipt.transaction_id === transaction.id)
                        .map((receipt) => (
                          <div className="finance-receipt-row" key={receipt.id}>
                            <span>{receipt.file_name}</span>
                            <button className="button button-light" onClick={() => viewReceipt(receipt)} type="button">
                              <Download size={15} />
                              View
                            </button>
                            <button
                              className="button button-secondary button-neutral"
                              disabled={pendingAction === `delete-receipt-${receipt.id}`}
                              onClick={() => removeReceipt(receipt)}
                              type="button"
                            >
                              <Trash2 size={15} />
                              Remove
                            </button>
                          </div>
                        ))}
                    </div>
                    <form className="finance-receipt-upload" onSubmit={(event) => handleReceiptUpload(event, transaction.id)}>
                      <input aria-label={`Upload receipt for ${transaction.title}`} name="receipt" type="file" />
                      <button className="button button-secondary" disabled={pendingAction === `receipt-${transaction.id}`} type="submit">
                        <UploadCloud size={16} />
                        {pendingAction === `receipt-${transaction.id}` ? "Uploading..." : "Upload Receipt"}
                      </button>
                    </form>
                    {pendingAction === `transaction-${transaction.id}` ? <small>Saving...</small> : null}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {activeView === "budgets" && (
        <div className="operations-layout finance-layout">
          <form className="form-panel" onSubmit={handleCreateBudget}>
            <h2>Add budget</h2>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
              <div className="field">
                <label htmlFor="budget-name">Name</label>
                <input id="budget-name" name="name" required />
              </div>
              <div className="field">
                <label htmlFor="budget-type">Type</label>
                <select id="budget-type" name="budget_type">
                  {financeBudgetTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="budget-category">Category</label>
                <select id="budget-category" name="category">
                  {financeCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="budget-period">Period</label>
                <select id="budget-period" name="period">
                  {financeBudgetPeriods.map((period) => (
                    <option key={period} value={period}>
                      {period}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="budget-period-start">Period start</label>
                <input id="budget-period-start" name="period_start" type="date" defaultValue={currentMonthStart()} />
              </div>
              <div className="field">
                <label htmlFor="budget-amount">Amount</label>
                <input id="budget-amount" min="0" name="amount" required step="0.01" type="number" />
              </div>
              <div className="field">
                <label htmlFor="budget-owner">Owner</label>
                <input id="budget-owner" name="owner" />
              </div>
              <div className="field">
                <label htmlFor="budget-notes">Notes</label>
                <textarea id="budget-notes" name="notes" />
              </div>
              <button className="button button-primary" disabled={!canManageRecords || pendingAction === "create-budget"} type="submit">
                <Plus size={18} />
                Add Budget
              </button>
            </div>
          </form>

          <section className="doc-list">
            {budgetRows.map((budget) => (
              <article className="doc-card finance-record-card" key={budget.id}>
                <h3>{budget.name}</h3>
                <p>
                  {budget.budget_type} - {budget.category} - {budget.period} from {dateLabel(budget.period_start)}
                </p>
                <div className="form-grid">
                  <div className="field">
                    <label>Amount</label>
                    <input
                      defaultValue={Number(budget.amount)}
                      min="0"
                      onBlur={async (event) => {
                        const result = await updateFinanceBudget({ id: budget.id, patch: { amount: Number(event.target.value) } });
                        if (result.error || !result.data) return setStatusMessage(result.error ?? "Budget could not be saved.", "error");
                        setBudgetRows((current) => current.map((row) => (row.id === budget.id ? (result.data! as CompanyFinanceBudget) : row)));
                        setStatusMessage("Budget saved.");
                      }}
                      step="0.01"
                      type="number"
                    />
                  </div>
                  <div className="field">
                    <label>Owner</label>
                    <input
                      defaultValue={budget.owner ?? ""}
                      onBlur={async (event) => {
                        const result = await updateFinanceBudget({ id: budget.id, patch: { owner: event.target.value } });
                        if (result.error || !result.data) return setStatusMessage(result.error ?? "Budget could not be saved.", "error");
                        setBudgetRows((current) => current.map((row) => (row.id === budget.id ? (result.data! as CompanyFinanceBudget) : row)));
                        setStatusMessage("Budget saved.");
                      }}
                    />
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
      )}

      {activeView === "recurring" && (
        <div className="operations-layout finance-layout">
          <form className="form-panel" onSubmit={handleCreateRecurring}>
            <h2>Add recurring item</h2>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
              <div className="field">
                <label htmlFor="recurring-title">Title</label>
                <input id="recurring-title" name="title" required />
              </div>
              <div className="field">
                <label htmlFor="recurring-type">Type</label>
                <select id="recurring-type" name="item_type">
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="recurring-amount">Amount</label>
                <input id="recurring-amount" min="0.01" name="amount" required step="0.01" type="number" />
              </div>
              <div className="field">
                <label htmlFor="recurring-category">Category</label>
                <select id="recurring-category" name="category">
                  {financeCategories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="recurring-cadence">Cadence</label>
                <select id="recurring-cadence" name="cadence">
                  {financeRecurringCadences.map((cadence) => (
                    <option key={cadence} value={cadence}>
                      {cadence}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="recurring-status">Status</label>
                <select id="recurring-status" name="status">
                  {financeRecurringStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="recurring-next">Next due</label>
                <input id="recurring-next" name="next_due_date" type="date" />
              </div>
              <div className="field">
                <label htmlFor="recurring-vendor">Vendor / customer</label>
                <input id="recurring-vendor" name="vendor_customer" />
              </div>
              <div className="field">
                <label htmlFor="recurring-payment">Payment method</label>
                <input id="recurring-payment" name="payment_method" />
              </div>
              <div className="field">
                <label htmlFor="recurring-owner">Owner</label>
                <input id="recurring-owner" name="owner" />
              </div>
              <div className="field">
                <label htmlFor="recurring-notes">Notes</label>
                <textarea id="recurring-notes" name="notes" />
              </div>
              <button className="button button-primary" disabled={!canManageRecords || pendingAction === "create-recurring"} type="submit">
                <Plus size={18} />
                Add Recurring Item
              </button>
            </div>
          </form>

          <section className="doc-list">
            {recurringRows.map((item) => (
              <article className="doc-card finance-record-card" key={item.id}>
                <h3>{item.title}</h3>
                <p>
                  {item.item_type} - {item.category} - {money(Number(item.amount))}
                </p>
                <div className="form-grid">
                  <div className="field">
                    <label>Status</label>
                    <select
                      value={item.status}
                      onChange={async (event) => {
                        const result = await updateFinanceRecurringItem({ id: item.id, patch: { status: event.target.value } });
                        if (result.error || !result.data) return setStatusMessage(result.error ?? "Recurring item could not be saved.", "error");
                        setRecurringRows((current) => current.map((row) => (row.id === item.id ? (result.data! as CompanyFinanceRecurringItem) : row)));
                        setStatusMessage("Recurring item saved.");
                      }}
                    >
                      {financeRecurringStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Next due</label>
                    <input
                      type="date"
                      value={item.next_due_date ?? ""}
                      onChange={async (event) => {
                        const result = await updateFinanceRecurringItem({ id: item.id, patch: { next_due_date: event.target.value } });
                        if (result.error || !result.data) return setStatusMessage(result.error ?? "Recurring item could not be saved.", "error");
                        setRecurringRows((current) => current.map((row) => (row.id === item.id ? (result.data! as CompanyFinanceRecurringItem) : row)));
                        setStatusMessage("Recurring item saved.");
                      }}
                    />
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
      )}

      {activeView === "access" && canManageAuthorization && (
        <div className="operations-layout finance-layout">
          <form className="form-panel" onSubmit={handleAuthorizeUser}>
            <h2>Authorize finance user</h2>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
              <div className="field">
                <label htmlFor="finance-user">Portal user</label>
                <select id="finance-user" name="user_id" required>
                  <option value="">Choose user</option>
                  {userOptions.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.display_name || user.email || user.user_id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="finance-access-label">Access label</label>
                <input id="finance-access-label" name="access_label" placeholder="Owner, accounting, reviewer" />
              </div>
              <button className="button button-primary" disabled={pendingAction === "authorize-user"} type="submit">
                <UserPlus size={18} />
                Authorize User
              </button>
            </div>
          </form>

          <section className="doc-list">
            {financeUsers.length === 0 ? (
              <div className="empty-state">No finance users have been authorized yet.</div>
            ) : (
              financeUsers.map((financeUser) => (
                <article className="doc-card finance-record-card" key={financeUser.user_id}>
                  <div className="portal-topline">
                    <div>
                      <h3>{userNameById.get(financeUser.user_id) ?? financeUser.user_id}</h3>
                      <p>{financeUser.access_label ?? "Finance access"}</p>
                    </div>
                    <button
                      className="button button-secondary button-neutral"
                      disabled={pendingAction === `remove-user-${financeUser.user_id}`}
                      onClick={() => handleRemoveFinanceUser(financeUser.user_id)}
                      type="button"
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}
