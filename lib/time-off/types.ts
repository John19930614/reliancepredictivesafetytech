export const leaveTypes = [
  "vacation",
  "sick",
  "personal",
  "bereavement",
  "jury_duty",
  "unpaid",
] as const;

export type LeaveType = (typeof leaveTypes)[number];

export const timeOffStatuses = ["pending", "approved", "denied", "cancelled"] as const;

export type TimeOffStatus = (typeof timeOffStatuses)[number];

/** Standard working day used to convert a date range into hours. */
export const HOURS_PER_WORK_DAY = 8;

export interface TimeOffPolicy {
  id: string;
  leave_type: LeaveType;
  label: string;
  annual_hours: number;
  carryover_cap_hours: number;
  requires_approval: boolean;
  is_paid: boolean;
  active: boolean;
}

export interface TimeOffBalance {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  policy_year: number;
  accrued_hours: number;
  carryover_hours: number;
  used_hours: number;
}

export interface TimeOffRequest {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  hours_requested: number;
  reason: string | null;
  status: TimeOffStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export function isLeaveType(value: string | null | undefined): value is LeaveType {
  return leaveTypes.includes(value as LeaveType);
}

export function formatLeaveType(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
