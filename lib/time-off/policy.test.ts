import { describe, expect, it } from "vitest";
import {
  businessDaysBetween,
  canCancelTimeOff,
  canReviewTimeOff,
  canTransitionTimeOff,
  carryoverForNextYear,
  defaultHoursForRange,
  parseDateOnly,
  remainingHours,
  summarizeBalances,
  validateTimeOffRequest,
} from "./policy";
import type { TimeOffBalance, TimeOffPolicy } from "./types";
import { canAccessEmployeePath, defaultEmployeePortalModuleKeys } from "@/lib/user-management";

const vacationPolicy: TimeOffPolicy = {
  id: "p1",
  leave_type: "vacation",
  label: "Vacation",
  annual_hours: 80,
  carryover_cap_hours: 40,
  requires_approval: true,
  is_paid: true,
  active: true,
};

const unpaidPolicy: TimeOffPolicy = {
  ...vacationPolicy,
  id: "p2",
  leave_type: "unpaid",
  label: "Unpaid Leave",
  annual_hours: 0,
  carryover_cap_hours: 0,
  is_paid: false,
};

const balance = (over: Partial<TimeOffBalance> = {}): TimeOffBalance => ({
  id: "b1",
  user_id: "user-1",
  leave_type: "vacation",
  policy_year: 2026,
  accrued_hours: 80,
  carryover_hours: 0,
  used_hours: 0,
  ...over,
});

describe("parseDateOnly", () => {
  it("parses a valid date in UTC", () => {
    const parsed = parseDateOnly("2026-08-01");
    expect(parsed?.getUTCFullYear()).toBe(2026);
    expect(parsed?.getUTCMonth()).toBe(7);
    expect(parsed?.getUTCDate()).toBe(1);
  });

  it("rejects malformed and overflow dates", () => {
    expect(parseDateOnly("not-a-date")).toBeNull();
    expect(parseDateOnly("2026-13-01")).toBeNull();
    // Date.UTC would silently roll this into March.
    expect(parseDateOnly("2026-02-30")).toBeNull();
  });
});

describe("businessDaysBetween", () => {
  it("counts inclusive weekdays", () => {
    // Mon 2026-08-03 → Fri 2026-08-07
    expect(businessDaysBetween("2026-08-03", "2026-08-07")).toBe(5);
  });

  it("counts a single weekday as one day", () => {
    expect(businessDaysBetween("2026-08-03", "2026-08-03")).toBe(1);
  });

  it("skips weekends entirely", () => {
    // Sat 2026-08-01 → Sun 2026-08-02
    expect(businessDaysBetween("2026-08-01", "2026-08-02")).toBe(0);
  });

  it("spans a weekend without counting it", () => {
    // Fri 2026-08-07 → Mon 2026-08-10 is 2 working days.
    expect(businessDaysBetween("2026-08-07", "2026-08-10")).toBe(2);
  });

  it("returns zero when the range is reversed or invalid", () => {
    expect(businessDaysBetween("2026-08-07", "2026-08-03")).toBe(0);
    expect(businessDaysBetween("bad", "2026-08-03")).toBe(0);
  });
});

describe("defaultHoursForRange", () => {
  it("uses an 8-hour working day", () => {
    expect(defaultHoursForRange("2026-08-03", "2026-08-07")).toBe(40);
  });

  it("honours a custom day length", () => {
    expect(defaultHoursForRange("2026-08-03", "2026-08-07", 6)).toBe(30);
  });
});

describe("remainingHours and carryover", () => {
  it("nets accrued plus carryover minus used", () => {
    expect(remainingHours(balance({ accrued_hours: 80, carryover_hours: 8, used_hours: 20 }))).toBe(68);
  });

  it("clamps carryover to the policy cap", () => {
    expect(carryoverForNextYear(balance({ accrued_hours: 80, used_hours: 0 }), vacationPolicy)).toBe(40);
  });

  it("carries nothing when the balance is spent", () => {
    expect(carryoverForNextYear(balance({ accrued_hours: 80, used_hours: 80 }), vacationPolicy)).toBe(0);
  });
});

describe("validateTimeOffRequest", () => {
  const validInput = { leaveType: "vacation", startDate: "2026-08-03", endDate: "2026-08-07" };

  it("accepts a well-formed request inside the balance", () => {
    expect(validateTimeOffRequest(validInput, vacationPolicy, balance())).toEqual({ ok: true });
  });

  it("rejects an unknown leave type", () => {
    const result = validateTimeOffRequest({ ...validInput, leaveType: "sabbatical" }, vacationPolicy, balance());
    expect(result.ok).toBe(false);
  });

  it("rejects when no policy exists", () => {
    expect(validateTimeOffRequest(validInput, null, balance()).ok).toBe(false);
  });

  it("rejects an inactive policy", () => {
    expect(validateTimeOffRequest(validInput, { ...vacationPolicy, active: false }, balance()).ok).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const result = validateTimeOffRequest(
      { ...validInput, startDate: "2026-08-07", endDate: "2026-08-03" },
      vacationPolicy,
      balance(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("end date");
  });

  it("rejects a weekend-only range that costs zero hours", () => {
    const result = validateTimeOffRequest(
      { ...validInput, startDate: "2026-08-01", endDate: "2026-08-02" },
      vacationPolicy,
      balance(),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("working days");
  });

  it("rejects a request that overdraws the balance", () => {
    const result = validateTimeOffRequest(validInput, vacationPolicy, balance({ accrued_hours: 8 }));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Not enough");
  });

  it("rejects a metered request when the employee has no balance row", () => {
    expect(validateTimeOffRequest(validInput, vacationPolicy, null).ok).toBe(false);
  });

  it("skips the balance check for unmetered policies", () => {
    expect(validateTimeOffRequest({ ...validInput, leaveType: "unpaid" }, unpaidPolicy, null)).toEqual({ ok: true });
  });
});

describe("time off permissions", () => {
  it("only admins may review", () => {
    expect(canReviewTimeOff(true)).toBe(true);
    expect(canReviewTimeOff(false)).toBe(false);
  });

  it("lets an owner cancel their own pending request", () => {
    expect(canCancelTimeOff({ user_id: "user-1", status: "pending" }, "user-1", false)).toBe(true);
  });

  it("lets an admin cancel someone else's request", () => {
    expect(canCancelTimeOff({ user_id: "user-1", status: "approved" }, "user-2", true)).toBe(true);
  });

  it("blocks an unrelated employee from cancelling", () => {
    expect(canCancelTimeOff({ user_id: "user-1", status: "pending" }, "user-2", false)).toBe(false);
  });

  it("blocks cancelling an already-final request", () => {
    expect(canCancelTimeOff({ user_id: "user-1", status: "denied" }, "user-1", true)).toBe(false);
    expect(canCancelTimeOff({ user_id: "user-1", status: "cancelled" }, "user-1", true)).toBe(false);
  });

  it("only transitions out of pending", () => {
    expect(canTransitionTimeOff("pending", "approved")).toBe(true);
    expect(canTransitionTimeOff("pending", "denied")).toBe(true);
    expect(canTransitionTimeOff("approved", "denied")).toBe(false);
    expect(canTransitionTimeOff("pending", "pending")).toBe(false);
  });
});

describe("summarizeBalances", () => {
  it("joins policy, balance, and pending request hours", () => {
    const rows = summarizeBalances(
      [vacationPolicy],
      [balance({ accrued_hours: 80, carryover_hours: 8, used_hours: 16 })],
      [
        { leave_type: "vacation", hours_requested: 8, status: "pending" },
        { leave_type: "vacation", hours_requested: 40, status: "denied" },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].remaining).toBe(72);
    expect(rows[0].pending).toBe(8);
  });

  it("omits inactive policies", () => {
    expect(summarizeBalances([{ ...vacationPolicy, active: false }], [], [])).toHaveLength(0);
  });

  it("reports zeroes when the employee has no balance row yet", () => {
    const rows = summarizeBalances([vacationPolicy], [], []);
    expect(rows[0].remaining).toBe(0);
  });
});

describe("time off module RBAC", () => {
  const path = "/employee/time-off";

  it("is granted to every active employee by default", () => {
    expect(defaultEmployeePortalModuleKeys).toContain("employee_time_off");
    expect(canAccessEmployeePath("employee", "active", path, [...defaultEmployeePortalModuleKeys])).toBe(true);
  });

  it("denies an employee who was not granted the module", () => {
    expect(canAccessEmployeePath("employee", "active", path, ["dashboard"])).toBe(false);
  });

  it("denies an archived account even with the grant", () => {
    expect(canAccessEmployeePath("employee", "archived", path, ["employee_time_off"])).toBe(false);
  });

  it("allows portal owners without an explicit grant", () => {
    expect(canAccessEmployeePath("super_admin", "active", path, [])).toBe(true);
  });
});
