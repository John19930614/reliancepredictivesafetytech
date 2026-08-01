"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { getTimeOffAccess } from "@/lib/time-off/access";
import {
  canCancelTimeOff,
  canTransitionTimeOff,
  defaultHoursForRange,
  parseDateOnly,
  validateTimeOffRequest,
  type TimeOffRequestInput,
} from "@/lib/time-off/policy";
import { isLeaveType, type LeaveType, type TimeOffStatus } from "@/lib/time-off/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function revalidateTimeOff() {
  revalidatePath("/employee/time-off");
  revalidatePath("/employee/calendar");
}

/** Policy year is driven by the start date, so a December request books against that year. */
function policyYearFor(startDate: string) {
  return parseDateOnly(startDate)?.getUTCFullYear() ?? new Date().getUTCFullYear();
}

export async function createTimeOffRequest(input: TimeOffRequestInput): Promise<ActionResult & { requestId?: string }> {
  const { supabase, userId, isActive, isAdmin } = await getTimeOffAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isActive) return { ok: false, error: "Your account is not active." };

  const leaveType = input.leaveType;
  if (!isLeaveType(leaveType)) return { ok: false, error: "Choose a valid leave type." };

  const policyYear = policyYearFor(input.startDate);

  const [{ data: policy }, { data: balance }] = await Promise.all([
    supabase.from("employee_time_off_policies").select("*").eq("leave_type", leaveType).maybeSingle(),
    supabase
      .from("employee_time_off_balances")
      .select("*")
      .eq("user_id", userId)
      .eq("leave_type", leaveType)
      .eq("policy_year", policyYear)
      .maybeSingle(),
  ]);

  const hours = input.hours ?? defaultHoursForRange(input.startDate, input.endDate);
  const validation = validateTimeOffRequest({ ...input, hours }, policy, balance);
  if (!validation.ok) return { ok: false, error: validation.error };

  const { data: created, error } = await supabase
    .from("employee_time_off_requests")
    .insert({
      user_id: userId,
      leave_type: leaveType,
      start_date: input.startDate,
      end_date: input.endDate,
      hours_requested: hours,
      reason: input.reason?.trim() || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !created) return { ok: false, error: error?.message ?? "Could not file the request." };

  // A policy that needs no approval (e.g. sick leave) is auto-approved so the
  // employee is not blocked waiting on a review that will never come.
  if (policy && !policy.requires_approval) {
    await applyApproval(supabase, created.id, userId, "approved", "Auto-approved by policy", isAdmin);
  }

  await recordAuditEvent({
    event_type: "time_off.requested",
    event_category: "data",
    severity: "info",
    actor_id: userId,
    resource_type: "employee_time_off_request",
    resource_id: created.id,
    summary: `Requested ${hours}h ${leaveType} from ${input.startDate} to ${input.endDate}`,
    after_state: { leaveType, startDate: input.startDate, endDate: input.endDate, hours },
  });

  revalidateTimeOff();
  return { ok: true, requestId: created.id };
}

/**
 * Moves a request to its final state and keeps the balance in step.
 *
 * Approving debits `used_hours` and drops a matching calendar event so the
 * absence shows on the team calendar. Kept separate from the action wrapper so
 * the auto-approve path above can reuse it.
 */
async function applyApproval(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  requestId: string,
  reviewerId: string,
  decision: "approved" | "denied",
  note: string | null,
  reviewerIsAdmin: boolean,
): Promise<ActionResult> {
  const { data: request } = await supabase
    .from("employee_time_off_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { ok: false, error: "Request not found." };
  if (!canTransitionTimeOff(request.status, decision)) {
    return { ok: false, error: `This request is already ${request.status}.` };
  }

  let calendarEventId: string | null = request.calendar_event_id;

  if (decision === "approved") {
    const policyYear = policyYearFor(request.start_date);
    const { data: balance } = await supabase
      .from("employee_time_off_balances")
      .select("*")
      .eq("user_id", request.user_id)
      .eq("leave_type", request.leave_type)
      .eq("policy_year", policyYear)
      .maybeSingle();

    if (balance) {
      await supabase
        .from("employee_time_off_balances")
        .update({ used_hours: Number(balance.used_hours) + Number(request.hours_requested) })
        .eq("id", balance.id);
    }

    // Surface the absence on the shared calendar. Best-effort: a calendar
    // failure must not block the approval itself.
    const { data: event } = await supabase
      .from("employee_calendar_events")
      .insert({
        created_by: request.user_id,
        title: `Time off — ${request.leave_type}`,
        description: request.reason,
        event_type: "time_off",
        start_at: `${request.start_date}T00:00:00Z`,
        end_at: `${request.end_date}T23:59:59Z`,
        all_day: true,
        visibility: "company",
        status: "approved",
        approved_by: reviewerIsAdmin ? reviewerId : null,
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    calendarEventId = event?.id ?? null;
  }

  const { error } = await supabase
    .from("employee_time_off_requests")
    .update({
      status: decision,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: note,
      calendar_event_id: calendarEventId,
    })
    .eq("id", requestId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function reviewTimeOffRequest(
  requestId: string,
  decision: "approved" | "denied",
  note?: string | null,
): Promise<ActionResult> {
  const { supabase, userId, isAdmin } = await getTimeOffAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isAdmin) return { ok: false, error: "Admin role required to review time off." };

  const result = await applyApproval(supabase, requestId, userId, decision, note?.trim() || null, true);
  if (!result.ok) return result;

  await recordAuditEvent({
    event_type: `time_off.${decision}`,
    event_category: "data",
    severity: "info",
    actor_id: userId,
    resource_type: "employee_time_off_request",
    resource_id: requestId,
    summary: `Time off request ${decision}`,
    after_state: { decision, note: note ?? null },
  });

  revalidateTimeOff();
  return { ok: true };
}

export async function cancelTimeOffRequest(requestId: string): Promise<ActionResult> {
  const { supabase, userId, isAdmin } = await getTimeOffAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };

  const { data: request } = await supabase
    .from("employee_time_off_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return { ok: false, error: "Request not found." };
  if (!canCancelTimeOff(request, userId, isAdmin)) {
    return { ok: false, error: "You cannot cancel this request." };
  }

  // Cancelling something already approved has to hand the hours back.
  if (request.status === "approved") {
    const policyYear = policyYearFor(request.start_date);
    const { data: balance } = await supabase
      .from("employee_time_off_balances")
      .select("*")
      .eq("user_id", request.user_id)
      .eq("leave_type", request.leave_type)
      .eq("policy_year", policyYear)
      .maybeSingle();

    if (balance) {
      const restored = Math.max(0, Number(balance.used_hours) - Number(request.hours_requested));
      await supabase.from("employee_time_off_balances").update({ used_hours: restored }).eq("id", balance.id);
    }

    if (request.calendar_event_id) {
      await supabase.from("employee_calendar_events").delete().eq("id", request.calendar_event_id);
    }
  }

  const { error } = await supabase
    .from("employee_time_off_requests")
    .update({ status: "cancelled", calendar_event_id: null })
    .eq("id", requestId);

  if (error) return { ok: false, error: error.message };

  await recordAuditEvent({
    event_type: "time_off.cancelled",
    event_category: "data",
    severity: "info",
    actor_id: userId,
    resource_type: "employee_time_off_request",
    resource_id: requestId,
    summary: `Time off request cancelled (was ${request.status})`,
    before_state: { status: request.status, hours: request.hours_requested },
  });

  revalidateTimeOff();
  return { ok: true };
}

export async function setTimeOffBalance(
  targetUserId: string,
  leaveType: LeaveType,
  policyYear: number,
  accruedHours: number,
  carryoverHours: number,
): Promise<ActionResult> {
  const { supabase, userId, isAdmin } = await getTimeOffAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isAdmin) return { ok: false, error: "Admin role required to adjust balances." };
  if (!isLeaveType(leaveType)) return { ok: false, error: "Choose a valid leave type." };
  if (accruedHours < 0 || carryoverHours < 0) return { ok: false, error: "Hours cannot be negative." };

  const { error } = await supabase.from("employee_time_off_balances").upsert(
    {
      user_id: targetUserId,
      leave_type: leaveType,
      policy_year: policyYear,
      accrued_hours: accruedHours,
      carryover_hours: carryoverHours,
    },
    { onConflict: "user_id,leave_type,policy_year" },
  );

  if (error) return { ok: false, error: error.message };

  await recordAuditEvent({
    event_type: "time_off.balance_adjusted",
    event_category: "data",
    severity: "warn",
    actor_id: userId,
    resource_type: "employee_time_off_balance",
    resource_id: targetUserId,
    summary: `Set ${leaveType} balance for ${policyYear}: ${accruedHours}h accrued, ${carryoverHours}h carryover`,
    after_state: { targetUserId, leaveType, policyYear, accruedHours, carryoverHours },
  });

  revalidateTimeOff();
  return { ok: true };
}

export type { TimeOffStatus };
