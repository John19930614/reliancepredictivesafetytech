import {
  HOURS_PER_WORK_DAY,
  isLeaveType,
  type LeaveType,
  type TimeOffBalance,
  type TimeOffPolicy,
  type TimeOffRequest,
} from "./types";

/**
 * Parses a YYYY-MM-DD date string into a UTC timestamp.
 *
 * Deliberately avoids `new Date("2026-08-01")` arithmetic in local time: the
 * portal runs in US timezones where a naive parse shifts the day backwards and
 * silently miscounts the first day of a leave request.
 */
export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return null;

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects overflow dates like 2026-02-30, which Date.UTC would roll forward.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  return date;
}

/** Inclusive count of Mon–Fri days between two YYYY-MM-DD dates. */
export function businessDaysBetween(startDate: string, endDate: string): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return count;
}

/** Default hours for a range, at a standard 8-hour working day. */
export function defaultHoursForRange(
  startDate: string,
  endDate: string,
  hoursPerDay: number = HOURS_PER_WORK_DAY,
): number {
  return businessDaysBetween(startDate, endDate) * hoursPerDay;
}

/** Hours still available to spend: accrued + carried over − already used. */
export function remainingHours(balance: Pick<TimeOffBalance, "accrued_hours" | "carryover_hours" | "used_hours">) {
  return Number(balance.accrued_hours) + Number(balance.carryover_hours) - Number(balance.used_hours);
}

/** Carryover into the next policy year, clamped by the policy's cap. */
export function carryoverForNextYear(
  balance: Pick<TimeOffBalance, "accrued_hours" | "carryover_hours" | "used_hours">,
  policy: Pick<TimeOffPolicy, "carryover_cap_hours">,
) {
  const left = remainingHours(balance);
  if (left <= 0) return 0;
  return Math.min(left, Number(policy.carryover_cap_hours));
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface TimeOffRequestInput {
  leaveType: string;
  startDate: string;
  endDate: string;
  hours?: number | null;
  reason?: string | null;
}

/**
 * Validates a request against its policy and the employee's balance.
 *
 * `balance` may be null when the employee has no row for that leave type yet —
 * that is only an error for policies that actually meter hours (annual_hours > 0).
 */
export function validateTimeOffRequest(
  input: TimeOffRequestInput,
  policy: Pick<TimeOffPolicy, "leave_type" | "annual_hours" | "active"> | null,
  balance: Pick<TimeOffBalance, "accrued_hours" | "carryover_hours" | "used_hours"> | null,
): ValidationResult {
  if (!isLeaveType(input.leaveType)) {
    return { ok: false, error: "Choose a valid leave type." };
  }
  if (!policy) {
    return { ok: false, error: "No policy is configured for that leave type." };
  }
  if (!policy.active) {
    return { ok: false, error: `${input.leaveType} leave is not currently available.` };
  }

  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  if (!start) return { ok: false, error: "Enter a valid start date." };
  if (!end) return { ok: false, error: "Enter a valid end date." };
  if (end < start) return { ok: false, error: "The end date cannot be before the start date." };

  const hours = input.hours ?? defaultHoursForRange(input.startDate, input.endDate);
  if (!Number.isFinite(hours) || hours <= 0) {
    return { ok: false, error: "That range contains no working days. Pick a weekday range." };
  }

  // Metered policies must not be overdrawn. Unpaid/jury-duty style policies
  // carry annual_hours = 0 and are intentionally not balance-checked.
  if (Number(policy.annual_hours) > 0) {
    const left = balance ? remainingHours(balance) : 0;
    if (hours > left) {
      return {
        ok: false,
        error: `Not enough ${input.leaveType} hours: requested ${hours}, ${left} remaining.`,
      };
    }
  }

  return { ok: true };
}

/** Only admins/owners review requests. */
export function canReviewTimeOff(isAdmin: boolean) {
  return isAdmin;
}

/** A request may be cancelled by its owner, or by an admin, while still pending or approved. */
export function canCancelTimeOff(
  request: Pick<TimeOffRequest, "user_id" | "status">,
  userId: string,
  isAdmin: boolean,
) {
  if (request.status !== "pending" && request.status !== "approved") return false;
  return request.user_id === userId || isAdmin;
}

/** Requests only move out of `pending`; anything else is already final. */
export function canTransitionTimeOff(from: string, to: string) {
  if (from !== "pending") return false;
  return to === "approved" || to === "denied" || to === "cancelled";
}

export interface BalanceSummary {
  leaveType: LeaveType;
  label: string;
  accrued: number;
  carryover: number;
  used: number;
  remaining: number;
  pending: number;
}

/** Joins policies, balances, and in-flight requests into one per-type view. */
export function summarizeBalances(
  policies: readonly TimeOffPolicy[],
  balances: readonly TimeOffBalance[],
  requests: readonly Pick<TimeOffRequest, "leave_type" | "hours_requested" | "status">[],
): BalanceSummary[] {
  return policies
    .filter((policy) => policy.active)
    .map((policy) => {
      const balance = balances.find((b) => b.leave_type === policy.leave_type);
      const pending = requests
        .filter((r) => r.leave_type === policy.leave_type && r.status === "pending")
        .reduce((sum, r) => sum + Number(r.hours_requested), 0);

      const accrued = Number(balance?.accrued_hours ?? 0);
      const carryover = Number(balance?.carryover_hours ?? 0);
      const used = Number(balance?.used_hours ?? 0);

      return {
        leaveType: policy.leave_type,
        label: policy.label,
        accrued,
        carryover,
        used,
        remaining: accrued + carryover - used,
        pending,
      };
    });
}
