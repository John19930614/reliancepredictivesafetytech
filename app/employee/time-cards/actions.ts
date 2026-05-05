"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { isPortalAdminRole, isPortalOwnerRole, isPortalSuperAdminRole } from "@/lib/user-management";

type EmployeeTimeCard = Database["public"]["Tables"]["employee_time_cards"]["Row"];
type EmployeeTimeEntry = Database["public"]["Tables"]["employee_time_entries"]["Row"];
type EmployeeTimeCardPayroll = Database["public"]["Tables"]["employee_time_card_payroll"]["Row"];

type ActionResult<T> = {
  data: T | null;
  error: string | null;
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getSignedInUser() {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/employee-login?message=supabase-required");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employee-login?next=/employee/time-cards");
  }

  return { supabase, user };
}

function getAdminClientOrError() {
  const admin = createAdminClient();

  if (!admin) {
    return { admin: null, error: "Supabase server admin key is required for time cards." };
  }

  return { admin, error: null };
}

async function getPortalRole(userId: string) {
  const { supabase } = await getSignedInUser();
  const { data } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", userId)
    .maybeSingle();

  return data;
}

async function requireAdmin(userId: string) {
  const role = await getPortalRole(userId);
  return role?.account_status === "active" && isPortalAdminRole(role.role);
}

async function requireOwner(userId: string) {
  const role = await getPortalRole(userId);
  return role?.account_status === "active" && isPortalOwnerRole(role.role);
}

async function requireSuperAdmin(userId: string) {
  const role = await getPortalRole(userId);
  return role?.account_status === "active" && isPortalSuperAdminRole(role.role);
}

export async function createWeeklyTimeCard(input: {
  weekStart: string;
  weekEnd: string;
}): Promise<ActionResult<EmployeeTimeCard>> {
  const { user } = await getSignedInUser();
  const { admin, error: adminError } = getAdminClientOrError();

  if (!admin) {
    return { data: null, error: adminError };
  }

  const weekStart = cleanText(input.weekStart);
  const weekEnd = cleanText(input.weekEnd);

  if (!isIsoDate(weekStart) || !isIsoDate(weekEnd)) {
    return { data: null, error: "Choose a valid time-card week." };
  }

  const { data: profile, error: profileError } = await admin
    .from("employee_profiles")
    .select("user_id, profile_status, time_card_role_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return { data: null, error: profileError.message };
  }

  if (!profile || profile.profile_status !== "active" || !profile.time_card_role_id) {
    return { data: null, error: "An admin must assign your active time-card role before you can submit time." };
  }

  const { data: existing, error: existingError } = await admin
    .from("employee_time_cards")
    .select("*")
    .eq("employee_user_id", user.id)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: existingError.message };
  }

  if (existing) {
    return { data: existing, error: null };
  }

  const { data, error } = await admin
    .from("employee_time_cards")
    .insert({
      employee_user_id: user.id,
      week_start: weekStart,
      week_end: weekEnd,
      status: "draft",
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath("/employee/time-cards");
  return { data, error: null };
}

export async function addEmployeeTimeEntry(input: {
  timeCardId: string;
  workDate: string;
  categoryId: string;
  taskId: string;
  hours: number;
  notes: string;
}): Promise<ActionResult<EmployeeTimeEntry>> {
  const { user } = await getSignedInUser();
  const { admin, error: adminError } = getAdminClientOrError();

  if (!admin) {
    return { data: null, error: adminError };
  }

  const timeCardId = cleanText(input.timeCardId);
  const workDate = cleanText(input.workDate);
  const categoryId = cleanText(input.categoryId);
  const taskId = cleanText(input.taskId);
  const hours = Number(input.hours);
  const notes = cleanText(input.notes);

  if (!timeCardId || !isIsoDate(workDate) || !categoryId || !taskId || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return { data: null, error: "Enter a valid date, task, and hours." };
  }

  const { data: card, error: cardError } = await admin
    .from("employee_time_cards")
    .select("*")
    .eq("id", timeCardId)
    .maybeSingle();

  if (cardError || !card) {
    return { data: null, error: cardError?.message ?? "Time card was not found." };
  }

  if (card.employee_user_id !== user.id || !["draft", "rejected"].includes(card.status)) {
    return { data: null, error: "This time card is not editable by your account." };
  }

  const { data: profile, error: profileError } = await admin
    .from("employee_profiles")
    .select("time_card_role_id, profile_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile?.time_card_role_id || profile.profile_status !== "active") {
    return { data: null, error: profileError?.message ?? "An active time-card role is required." };
  }

  const [{ data: task }, { data: roleCategory }, { data: roleTask }] = await Promise.all([
    admin.from("time_card_tasks").select("id, category_id").eq("id", taskId).eq("category_id", categoryId).maybeSingle(),
    admin
      .from("time_card_role_categories")
      .select("role_id")
      .eq("role_id", profile.time_card_role_id)
      .eq("category_id", categoryId)
      .maybeSingle(),
    admin
      .from("time_card_role_tasks")
      .select("role_id")
      .eq("role_id", profile.time_card_role_id)
      .eq("task_id", taskId)
      .maybeSingle(),
  ]);

  if (!task || !roleCategory || !roleTask) {
    return { data: null, error: "This task is not available for your assigned time-card role." };
  }

  const { data, error } = await admin
    .from("employee_time_entries")
    .insert({
      time_card_id: timeCardId,
      work_date: workDate,
      category_id: categoryId,
      task_id: taskId,
      hours,
      notes: notes || null,
    })
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath("/employee/time-cards");
  return { data, error: null };
}

export async function deleteEmployeeTimeEntry(input: {
  entryId: string;
}): Promise<ActionResult<{ id: string }>> {
  const { user } = await getSignedInUser();
  const { admin, error: adminError } = getAdminClientOrError();

  if (!admin) {
    return { data: null, error: adminError };
  }

  const entryId = cleanText(input.entryId);
  const { data: entry, error: entryError } = await admin
    .from("employee_time_entries")
    .select("id, time_card_id")
    .eq("id", entryId)
    .maybeSingle();

  if (entryError || !entry) {
    return { data: null, error: entryError?.message ?? "Time entry was not found." };
  }

  const { data: card, error: cardError } = await admin
    .from("employee_time_cards")
    .select("employee_user_id, status")
    .eq("id", entry.time_card_id)
    .maybeSingle();

  if (cardError || !card || card.employee_user_id !== user.id || !["draft", "rejected"].includes(card.status)) {
    return { data: null, error: cardError?.message ?? "This time entry is not editable by your account." };
  }

  const { error } = await admin.from("employee_time_entries").delete().eq("id", entryId);

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath("/employee/time-cards");
  return { data: { id: entryId }, error: null };
}

export async function submitEmployeeTimeCard(input: {
  timeCardId: string;
}): Promise<ActionResult<EmployeeTimeCard>> {
  const { user } = await getSignedInUser();
  const { admin, error: adminError } = getAdminClientOrError();

  if (!admin) {
    return { data: null, error: adminError };
  }

  const timeCardId = cleanText(input.timeCardId);
  const { data: card, error: cardError } = await admin
    .from("employee_time_cards")
    .select("*")
    .eq("id", timeCardId)
    .maybeSingle();

  if (cardError || !card || card.employee_user_id !== user.id || !["draft", "rejected"].includes(card.status)) {
    return { data: null, error: cardError?.message ?? "This time card is not editable by your account." };
  }

  const { count, error: countError } = await admin
    .from("employee_time_entries")
    .select("*", { count: "exact", head: true })
    .eq("time_card_id", timeCardId);

  if (countError) {
    return { data: null, error: countError.message };
  }

  if (!count) {
    return { data: null, error: "Add at least one time entry before submitting." };
  }

  const { data, error } = await admin
    .from("employee_time_cards")
    .update({ status: "submitted", review_notes: null })
    .eq("id", timeCardId)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath("/employee/time-cards");
  return { data, error: null };
}

export async function reviewEmployeeTimeCard(input: {
  timeCardId: string;
  status: "approved" | "rejected";
  reviewNotes: string;
}): Promise<ActionResult<EmployeeTimeCard>> {
  const { user } = await getSignedInUser();
  const { admin, error: adminError } = getAdminClientOrError();

  if (!admin) {
    return { data: null, error: adminError };
  }

  if (!(await requireSuperAdmin(user.id))) {
    return { data: null, error: "Only super admins can approve or reject time cards." };
  }

  const { data, error } = await admin
    .from("employee_time_cards")
    .update({ status: input.status, review_notes: cleanText(input.reviewNotes) || null, reviewed_by: user.id })
    .eq("id", cleanText(input.timeCardId))
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath("/employee/time-cards");
  return { data, error: null };
}

export async function assignEmployeeTimeCard(input: {
  timeCardId: string;
  employeeUserId: string;
}): Promise<ActionResult<EmployeeTimeCard>> {
  const { user } = await getSignedInUser();
  const { admin, error: adminError } = getAdminClientOrError();

  if (!admin) {
    return { data: null, error: adminError };
  }

  if (!(await requireAdmin(user.id))) {
    return { data: null, error: "Only admins can assign time cards." };
  }

  const { data, error } = await admin
    .from("employee_time_cards")
    .update({ employee_user_id: cleanText(input.employeeUserId) || null })
    .eq("id", cleanText(input.timeCardId))
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath("/employee/time-cards");
  return { data, error: null };
}

export async function updateTimeCardPayrollRate(input: {
  timeCardId: string;
  hourlyRate: number;
  totalHours: number;
}): Promise<ActionResult<EmployeeTimeCardPayroll>> {
  const { user } = await getSignedInUser();
  const { admin, error: adminError } = getAdminClientOrError();

  if (!admin) {
    return { data: null, error: adminError };
  }

  if (!(await requireOwner(user.id))) {
    return { data: null, error: "Only owners can update payroll rates." };
  }

  const hourlyRate = Number(input.hourlyRate);
  const totalHours = Number(input.totalHours);

  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
    return { data: null, error: "Enter a valid hourly rate." };
  }

  const paidValue = Number((hourlyRate * totalHours).toFixed(2));
  const { data, error } = await admin
    .from("employee_time_card_payroll")
    .update({ hourly_rate: hourlyRate, paid_value: paidValue })
    .eq("time_card_id", cleanText(input.timeCardId))
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  revalidatePath("/employee/time-cards");
  return { data, error: null };
}
