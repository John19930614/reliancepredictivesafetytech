"use server";

import { revalidatePath } from "next/cache";
import { employeeExpenseCategories, employeeExpenseStatuses } from "@/lib/company-data";
import { getAdminClientOrError, requireExpenseReviewer, requireExpenseUser } from "@/lib/expenses/access";
import type { Database } from "@/lib/supabase/types";

type EmployeeExpenseReport = Database["public"]["Tables"]["employee_expense_reports"]["Row"];
type EmployeeExpenseReceipt = Database["public"]["Tables"]["employee_expense_receipts"]["Row"];

type ActionResult<T> = {
  data: T | null;
  error: string | null;
};

const editableEmployeeStatuses = ["submitted", "needs_info"];
const financeReviewStatuses = ["needs_info", "approved", "rejected", "reimbursed"];

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

function revalidateExpenses() {
  revalidatePath("/employee/expenses");
  revalidatePath("/employee");
}

export async function createEmployeeExpenseReport(input: {
  title: string;
  category: string;
  amount: number;
  expenseDate: string;
  merchant: string;
  paymentMethod: string;
  businessPurpose: string;
  notes: string;
}): Promise<ActionResult<EmployeeExpenseReport>> {
  const { user, error: authError } = await requireExpenseUser();
  if (!user) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const title = cleanText(input.title);
  const category = cleanText(input.category);
  const amount = cleanAmount(input.amount);
  const expenseDate = cleanText(input.expenseDate);
  const businessPurpose = cleanText(input.businessPurpose);

  if (!title || !businessPurpose || !employeeExpenseCategories.includes(category as (typeof employeeExpenseCategories)[number])) {
    return { data: null, error: "Enter a title, category, and business purpose." };
  }

  if (!Number.isFinite(amount) || amount <= 0 || !isIsoDate(expenseDate)) {
    return { data: null, error: "Enter a valid expense amount and date." };
  }

  const { data, error } = await admin
    .from("employee_expense_reports")
    .insert({
      employee_user_id: user.id,
      title,
      category,
      amount,
      expense_date: expenseDate,
      merchant: cleanOptional(input.merchant),
      payment_method: cleanOptional(input.paymentMethod),
      business_purpose: businessPurpose,
      notes: cleanOptional(input.notes),
      status: "submitted",
    })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateExpenses();
  return { data, error: null };
}

export async function updateEmployeeExpenseReport(input: {
  id: string;
  patch: Partial<Pick<EmployeeExpenseReport, "title" | "category" | "amount" | "expense_date" | "merchant" | "payment_method" | "business_purpose" | "notes">>;
}): Promise<ActionResult<EmployeeExpenseReport>> {
  const { user, error: authError } = await requireExpenseUser();
  if (!user) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const id = cleanText(input.id);
  const { data: current, error: currentError } = await admin
    .from("employee_expense_reports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (currentError || !current) {
    return { data: null, error: currentError?.message ?? "Expense report was not found." };
  }

  if (current.employee_user_id !== user.id || !editableEmployeeStatuses.includes(current.status)) {
    return { data: null, error: "This expense report is not editable." };
  }

  const cleanPatch: Database["public"]["Tables"]["employee_expense_reports"]["Update"] = {};
  if ("title" in input.patch) cleanPatch.title = cleanText(input.patch.title);
  if ("category" in input.patch) {
    const category = cleanText(input.patch.category);
    if (!employeeExpenseCategories.includes(category as (typeof employeeExpenseCategories)[number])) {
      return { data: null, error: "Choose a valid expense category." };
    }
    cleanPatch.category = category;
  }
  if ("amount" in input.patch && input.patch.amount !== undefined) {
    const amount = cleanAmount(input.patch.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { data: null, error: "Enter a valid expense amount." };
    cleanPatch.amount = amount;
  }
  if ("expense_date" in input.patch && input.patch.expense_date) {
    const date = cleanText(input.patch.expense_date);
    if (!isIsoDate(date)) return { data: null, error: "Choose a valid expense date." };
    cleanPatch.expense_date = date;
  }
  if ("merchant" in input.patch) cleanPatch.merchant = cleanOptional(input.patch.merchant);
  if ("payment_method" in input.patch) cleanPatch.payment_method = cleanOptional(input.patch.payment_method);
  if ("business_purpose" in input.patch) {
    const purpose = cleanText(input.patch.business_purpose);
    if (!purpose) return { data: null, error: "Business purpose is required." };
    cleanPatch.business_purpose = purpose;
  }
  if ("notes" in input.patch) cleanPatch.notes = cleanOptional(input.patch.notes);

  if (Object.keys(cleanPatch).length === 0) {
    return { data: current, error: null };
  }

  const { data, error } = await admin
    .from("employee_expense_reports")
    .update(cleanPatch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateExpenses();
  return { data, error: null };
}

export async function cancelEmployeeExpenseReport(input: { id: string }): Promise<ActionResult<EmployeeExpenseReport>> {
  const { user, error: authError } = await requireExpenseUser();
  if (!user) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const id = cleanText(input.id);
  const { data: current, error: currentError } = await admin
    .from("employee_expense_reports")
    .select("employee_user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (currentError || !current || current.employee_user_id !== user.id || !editableEmployeeStatuses.includes(current.status)) {
    return { data: null, error: currentError?.message ?? "This expense report cannot be cancelled." };
  }

  const { data, error } = await admin
    .from("employee_expense_reports")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateExpenses();
  return { data, error: null };
}

export async function reviewEmployeeExpenseReport(input: {
  id: string;
  status: string;
  financeNotes: string;
}): Promise<ActionResult<EmployeeExpenseReport>> {
  const { user, error: authError } = await requireExpenseReviewer();
  if (!user) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const status = cleanText(input.status);
  if (!financeReviewStatuses.includes(status)) {
    return { data: null, error: "Choose a valid finance review status." };
  }

  const patch: Database["public"]["Tables"]["employee_expense_reports"]["Update"] = {
    status,
    finance_notes: cleanOptional(input.financeNotes),
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  };

  if (status === "reimbursed") {
    patch.reimbursed_by = user.id;
    patch.reimbursed_at = new Date().toISOString();
  } else {
    patch.reimbursed_by = null;
    patch.reimbursed_at = null;
  }

  const { data, error } = await admin
    .from("employee_expense_reports")
    .update(patch)
    .eq("id", cleanText(input.id))
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateExpenses();
  return { data, error: null };
}

export async function registerEmployeeExpenseReceipt(input: {
  expenseReportId: string;
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}): Promise<ActionResult<EmployeeExpenseReceipt>> {
  const { user, error: authError } = await requireExpenseUser();
  if (!user) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const expenseReportId = cleanText(input.expenseReportId);
  const filePath = cleanText(input.filePath);
  const fileName = cleanText(input.fileName);
  const fileSize = Number(input.fileSize);

  if (!expenseReportId || !filePath || !fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
    return { data: null, error: "Receipt upload could not be registered." };
  }

  const { data: report, error: reportError } = await admin
    .from("employee_expense_reports")
    .select("employee_user_id, status")
    .eq("id", expenseReportId)
    .maybeSingle();

  if (reportError || !report || report.employee_user_id !== user.id || !editableEmployeeStatuses.includes(report.status)) {
    return { data: null, error: reportError?.message ?? "This expense report cannot receive receipts." };
  }

  const { data, error } = await admin
    .from("employee_expense_receipts")
    .insert({
      expense_report_id: expenseReportId,
      file_path: filePath,
      file_name: fileName,
      file_type: cleanOptional(input.fileType),
      file_size: fileSize,
      uploaded_by: user.id,
    })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };

  revalidateExpenses();
  return { data, error: null };
}

export async function deleteEmployeeExpenseReceipt(input: {
  receiptId: string;
  filePath: string;
}): Promise<ActionResult<{ id: string }>> {
  const { user, error: authError } = await requireExpenseUser();
  if (!user) return { data: null, error: authError };

  const { admin, error: adminError } = getAdminClientOrError();
  if (!admin) return { data: null, error: adminError };

  const receiptId = cleanText(input.receiptId);
  const filePath = cleanText(input.filePath);

  const { data: receipt, error: receiptError } = await admin
    .from("employee_expense_receipts")
    .select("id, expense_report_id")
    .eq("id", receiptId)
    .maybeSingle();

  if (receiptError || !receipt) {
    return { data: null, error: receiptError?.message ?? "Receipt was not found." };
  }

  const { data: report, error: reportError } = await admin
    .from("employee_expense_reports")
    .select("employee_user_id, status")
    .eq("id", receipt.expense_report_id)
    .maybeSingle();

  if (reportError || !report || report.employee_user_id !== user.id || !editableEmployeeStatuses.includes(report.status)) {
    return { data: null, error: reportError?.message ?? "This receipt cannot be removed." };
  }

  const { error: storageError } = await admin.storage.from("employee-expense-receipts").remove([filePath]);
  if (storageError) return { data: null, error: storageError.message };

  const { error } = await admin.from("employee_expense_receipts").delete().eq("id", receiptId);
  if (error) return { data: null, error: error.message };

  revalidateExpenses();
  return { data: { id: receiptId }, error: null };
}
