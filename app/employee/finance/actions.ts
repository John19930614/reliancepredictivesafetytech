"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { isPortalOwnerRole } from "@/lib/user-management";

type FinanceTransaction = Database["public"]["Tables"]["company_finance_transactions"]["Row"];
type FinanceBudget = Database["public"]["Tables"]["company_finance_budgets"]["Row"];
type FinanceRecurringItem = Database["public"]["Tables"]["company_finance_recurring_items"]["Row"];
type FinanceReceipt = Database["public"]["Tables"]["company_finance_receipts"]["Row"];
type FinanceAuthorizedUser = Database["public"]["Tables"]["company_finance_authorized_users"]["Row"];

type ActionResult<T> = {
  data: T | null;
  error: string | null;
};

const incomeStatuses = ["expected", "invoiced", "received", "cancelled"];
const expenseStatuses = ["planned", "due", "paid", "cancelled"];
const reviewStatuses = ["unreviewed", "reviewed", "needs_follow_up"];
const budgetPeriods = ["monthly", "yearly"];
const recurringCadences = ["weekly", "monthly", "quarterly", "yearly"];
const recurringStatuses = ["active", "paused", "ended"];

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function cleanOptional(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function cleanAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : NaN;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getCurrentUser() {
  const supabase = await createClient();

  if (!supabase) {
    return { supabase: null, user: null, error: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, error: "You must be signed in." };
  }

  return { supabase, user, error: null };
}

async function getCurrentRole(userId: string) {
  const supabase = await createClient();
  if (!supabase) return { role: null, error: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", userId)
    .eq("account_status", "active")
    .maybeSingle();

  if (error) return { role: null, error: error.message };
  return { role: data, error: null };
}

async function requireOwner() {
  const { user, error } = await getCurrentUser();
  if (!user) return { user: null, error };

  const { role, error: roleError } = await getCurrentRole(user.id);
  if (roleError) return { user: null, error: roleError };
  if (!isPortalOwnerRole(role?.role)) {
    return { user: null, error: "Owner access is required for finance authorization." };
  }

  return { user, error: null };
}

async function requireFinanceUser() {
  const { user, error } = await getCurrentUser();
  if (!user) return { user: null, error };

  const admin = createAdminClient();
  if (!admin) {
    return { user: null, error: "Supabase server admin key is required for finance actions." };
  }

  const { data, error: financeError } = await admin
    .from("company_finance_authorized_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (financeError) {
    return { user: null, error: financeError.message };
  }

  if (!data) {
    return { user: null, error: "Finance authorization is required for finance records." };
  }

  return { user, error: null };
}

function getAdminClientOrError() {
  const admin = createAdminClient();
  if (!admin) {
    return { admin: null, error: "Supabase server admin key is required for finance actions." };
  }

  return { admin, error: null };
}

function revalidateFinance() {
  revalidatePath("/employee/finance");
  revalidatePath("/employee");
}

function validTransactionStatus(transactionType: string, status: string) {
  return transactionType === "income" ? incomeStatuses.includes(status) : expenseStatuses.includes(status);
}

export async function createFinanceTransaction(input: {
  transactionType: string;
  title: string;
  amount: number;
  transactionDate: string;
  category: string;
  status: string;
  vendorCustomer: string;
  paymentMethod: string;
  owner: string;
  notes: string;
  relatedClientId: string;
  relatedDocumentId: string;
}): Promise<ActionResult<FinanceTransaction>> {
  const { user, error: authError } = await requireFinanceUser();
  if (!user) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const transactionType = cleanText(input.transactionType);
  const title = cleanText(input.title);
  const amount = cleanAmount(input.amount);
  const transactionDate = cleanText(input.transactionDate);
  const category = cleanText(input.category);
  const status = cleanText(input.status);

  if (!["income", "expense"].includes(transactionType) || !title || !category || !Number.isFinite(amount) || amount <= 0) {
    return { data: null, error: "Enter a valid finance transaction." };
  }

  if (!isIsoDate(transactionDate) || !validTransactionStatus(transactionType, status)) {
    return { data: null, error: "Choose a valid transaction date and status." };
  }

  const { data, error } = await admin
    .from("company_finance_transactions")
    .insert({
      transaction_type: transactionType,
      title,
      amount,
      transaction_date: transactionDate,
      category,
      status,
      vendor_customer: cleanOptional(input.vendorCustomer),
      payment_method: cleanOptional(input.paymentMethod),
      owner: cleanOptional(input.owner),
      notes: cleanOptional(input.notes),
      related_client_id: cleanOptional(input.relatedClientId),
      related_document_id: cleanOptional(input.relatedDocumentId),
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateFinance();
  return { data, error: null };
}

export async function updateFinanceTransaction(input: {
  id: string;
  patch: Partial<Pick<FinanceTransaction, "status" | "review_status" | "owner" | "notes" | "transaction_date" | "category" | "amount">>;
}): Promise<ActionResult<FinanceTransaction>> {
  const { user, error: authError } = await requireFinanceUser();
  if (!user) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const id = cleanText(input.id);
  const patch = input.patch ?? {};
  const cleanPatch: Database["public"]["Tables"]["company_finance_transactions"]["Update"] = {};

  if (patch.status) cleanPatch.status = cleanText(patch.status);
  if (patch.review_status) {
    const reviewStatus = cleanText(patch.review_status);
    if (!reviewStatuses.includes(reviewStatus)) return { data: null, error: "Choose a valid review status." };
    cleanPatch.review_status = reviewStatus;
    cleanPatch.reviewed_by = reviewStatus === "unreviewed" ? null : user.id;
    cleanPatch.reviewed_at = reviewStatus === "unreviewed" ? null : new Date().toISOString();
  }
  if ("owner" in patch) cleanPatch.owner = cleanOptional(patch.owner);
  if ("notes" in patch) cleanPatch.notes = cleanOptional(patch.notes);
  if (patch.transaction_date) {
    const date = cleanText(patch.transaction_date);
    if (!isIsoDate(date)) return { data: null, error: "Choose a valid transaction date." };
    cleanPatch.transaction_date = date;
  }
  if (patch.category) cleanPatch.category = cleanText(patch.category);
  if (patch.amount !== undefined) {
    const amount = cleanAmount(patch.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { data: null, error: "Enter a valid amount." };
    cleanPatch.amount = amount;
  }

  const { data, error } = await admin
    .from("company_finance_transactions")
    .update(cleanPatch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateFinance();
  return { data, error: null };
}

export async function createFinanceBudget(input: {
  name: string;
  budgetType: string;
  category: string;
  period: string;
  periodStart: string;
  amount: number;
  owner: string;
  notes: string;
}): Promise<ActionResult<FinanceBudget>> {
  const { user, error: authError } = await requireFinanceUser();
  if (!user) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const name = cleanText(input.name);
  const budgetType = cleanText(input.budgetType);
  const category = cleanText(input.category);
  const period = cleanText(input.period);
  const periodStart = cleanText(input.periodStart);
  const amount = cleanAmount(input.amount);

  if (!name || !["income", "expense"].includes(budgetType) || !category || !budgetPeriods.includes(period) || !isIsoDate(periodStart)) {
    return { data: null, error: "Enter a valid budget." };
  }

  if (!Number.isFinite(amount) || amount < 0) return { data: null, error: "Enter a valid budget amount." };

  const { data, error } = await admin
    .from("company_finance_budgets")
    .insert({
      name,
      budget_type: budgetType,
      category,
      period,
      period_start: periodStart,
      amount,
      owner: cleanOptional(input.owner),
      notes: cleanOptional(input.notes),
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateFinance();
  return { data, error: null };
}

export async function updateFinanceBudget(input: {
  id: string;
  patch: Partial<Pick<FinanceBudget, "amount" | "owner" | "notes" | "period_start">>;
}): Promise<ActionResult<FinanceBudget>> {
  const { error: authError } = await requireFinanceUser();
  if (authError) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const cleanPatch: Database["public"]["Tables"]["company_finance_budgets"]["Update"] = {};
  if (input.patch.amount !== undefined) {
    const amount = cleanAmount(input.patch.amount);
    if (!Number.isFinite(amount) || amount < 0) return { data: null, error: "Enter a valid budget amount." };
    cleanPatch.amount = amount;
  }
  if ("owner" in input.patch) cleanPatch.owner = cleanOptional(input.patch.owner);
  if ("notes" in input.patch) cleanPatch.notes = cleanOptional(input.patch.notes);
  if (input.patch.period_start) {
    const date = cleanText(input.patch.period_start);
    if (!isIsoDate(date)) return { data: null, error: "Choose a valid period start." };
    cleanPatch.period_start = date;
  }

  const { data, error } = await admin
    .from("company_finance_budgets")
    .update(cleanPatch)
    .eq("id", cleanText(input.id))
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateFinance();
  return { data, error: null };
}

export async function createFinanceRecurringItem(input: {
  itemType: string;
  title: string;
  amount: number;
  category: string;
  cadence: string;
  nextDueDate: string;
  status: string;
  vendorCustomer: string;
  paymentMethod: string;
  owner: string;
  notes: string;
}): Promise<ActionResult<FinanceRecurringItem>> {
  const { user, error: authError } = await requireFinanceUser();
  if (!user) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const itemType = cleanText(input.itemType);
  const title = cleanText(input.title);
  const amount = cleanAmount(input.amount);
  const category = cleanText(input.category);
  const cadence = cleanText(input.cadence);
  const status = cleanText(input.status);
  const nextDueDate = cleanOptional(input.nextDueDate);

  if (!["income", "expense"].includes(itemType) || !title || !category || !recurringCadences.includes(cadence) || !recurringStatuses.includes(status)) {
    return { data: null, error: "Enter a valid recurring item." };
  }

  if (!Number.isFinite(amount) || amount <= 0 || (nextDueDate && !isIsoDate(nextDueDate))) {
    return { data: null, error: "Enter a valid amount and due date." };
  }

  const { data, error } = await admin
    .from("company_finance_recurring_items")
    .insert({
      item_type: itemType,
      title,
      amount,
      category,
      cadence,
      next_due_date: nextDueDate,
      status,
      vendor_customer: cleanOptional(input.vendorCustomer),
      payment_method: cleanOptional(input.paymentMethod),
      owner: cleanOptional(input.owner),
      notes: cleanOptional(input.notes),
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateFinance();
  return { data, error: null };
}

export async function updateFinanceRecurringItem(input: {
  id: string;
  patch: Partial<Pick<FinanceRecurringItem, "status" | "next_due_date" | "owner" | "notes" | "amount">>;
}): Promise<ActionResult<FinanceRecurringItem>> {
  const { error: authError } = await requireFinanceUser();
  if (authError) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const cleanPatch: Database["public"]["Tables"]["company_finance_recurring_items"]["Update"] = {};
  if (input.patch.status) {
    const status = cleanText(input.patch.status);
    if (!recurringStatuses.includes(status)) return { data: null, error: "Choose a valid recurring status." };
    cleanPatch.status = status;
  }
  if ("next_due_date" in input.patch) {
    const date = cleanOptional(input.patch.next_due_date);
    if (date && !isIsoDate(date)) return { data: null, error: "Choose a valid next due date." };
    cleanPatch.next_due_date = date;
  }
  if ("owner" in input.patch) cleanPatch.owner = cleanOptional(input.patch.owner);
  if ("notes" in input.patch) cleanPatch.notes = cleanOptional(input.patch.notes);
  if (input.patch.amount !== undefined) {
    const amount = cleanAmount(input.patch.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { data: null, error: "Enter a valid amount." };
    cleanPatch.amount = amount;
  }

  const { data, error } = await admin
    .from("company_finance_recurring_items")
    .update(cleanPatch)
    .eq("id", cleanText(input.id))
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateFinance();
  return { data, error: null };
}

export async function registerFinanceReceipt(input: {
  transactionId: string;
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}): Promise<ActionResult<FinanceReceipt>> {
  const { user, error: authError } = await requireFinanceUser();
  if (!user) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const transactionId = cleanText(input.transactionId);
  const filePath = cleanText(input.filePath);
  const fileName = cleanText(input.fileName);
  const fileSize = Number(input.fileSize);

  if (!transactionId || !filePath || !fileName || !Number.isFinite(fileSize)) {
    return { data: null, error: "Receipt upload could not be registered." };
  }

  const { data, error } = await admin
    .from("company_finance_receipts")
    .insert({
      transaction_id: transactionId,
      file_path: filePath,
      file_name: fileName,
      file_type: cleanOptional(input.fileType),
      file_size: fileSize,
      uploaded_by: user.id,
    })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateFinance();
  return { data, error: null };
}

export async function deleteFinanceReceipt(input: { receiptId: string; filePath: string }): Promise<ActionResult<{ id: string }>> {
  const { error: authError } = await requireFinanceUser();
  if (authError) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const receiptId = cleanText(input.receiptId);
  const filePath = cleanText(input.filePath);

  if (!receiptId || !filePath) return { data: null, error: "Receipt was not found." };

  const { error: storageError } = await admin.storage.from("finance-receipts").remove([filePath]);
  if (storageError) return { data: null, error: storageError.message };

  const { error } = await admin.from("company_finance_receipts").delete().eq("id", receiptId);
  if (error) return { data: null, error: error.message };

  revalidateFinance();
  return { data: { id: receiptId }, error: null };
}

export async function addAuthorizedFinanceUser(input: {
  userId: string;
  accessLabel: string;
}): Promise<ActionResult<FinanceAuthorizedUser>> {
  const { user, error: authError } = await requireOwner();
  if (!user) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const userId = cleanText(input.userId);
  if (!userId) return { data: null, error: "Choose a portal user to authorize." };

  const { data, error } = await admin
    .from("company_finance_authorized_users")
    .upsert({
      user_id: userId,
      access_label: cleanOptional(input.accessLabel),
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateFinance();
  return { data, error: null };
}

export async function removeAuthorizedFinanceUser(input: { userId: string }): Promise<ActionResult<{ userId: string }>> {
  const { error: authError } = await requireOwner();
  if (authError) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const userId = cleanText(input.userId);
  if (!userId) return { data: null, error: "Choose a finance user to remove." };

  const { error } = await admin.from("company_finance_authorized_users").delete().eq("user_id", userId);
  if (error) return { data: null, error: error.message };

  revalidateFinance();
  return { data: { userId }, error: null };
}
