"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarDays, Check, Clock3, Plus, X } from "lucide-react";
import {
  cancelTimeOffRequest,
  createTimeOffRequest,
  reviewTimeOffRequest,
  setTimeOffBalance,
} from "@/app/employee/time-off/actions";
import type { EmployeeProfile } from "@/lib/company-data";
import { defaultHoursForRange, type BalanceSummary } from "@/lib/time-off/policy";
import { formatLeaveType, type LeaveType, type TimeOffPolicy, type TimeOffRequest } from "@/lib/time-off/types";

interface TimeOffManagerProps {
  currentUserId: string;
  isAdmin: boolean;
  policies: TimeOffPolicy[];
  policyYear: number;
  profiles: Pick<EmployeeProfile, "user_id" | "display_name" | "email">[];
  requests: TimeOffRequest[];
  summary: BalanceSummary[];
}

const statusTone: Record<string, string> = {
  pending: "record-badge-neutral",
  approved: "record-badge-gold",
  denied: "record-badge-neutral",
  cancelled: "record-badge-neutral",
};

export function TimeOffManager({
  currentUserId,
  isAdmin,
  policies,
  policyYear,
  profiles,
  requests,
  summary,
}: TimeOffManagerProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [leaveType, setLeaveType] = useState<LeaveType>((policies[0]?.leave_type as LeaveType) ?? "vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const nameFor = useMemo(() => {
    const map = new Map(profiles.map((p) => [p.user_id, p.display_name || p.email]));
    return (userId: string) => map.get(userId) ?? "Unknown employee";
  }, [profiles]);

  // Mirrors the server-side calculation so the employee sees the cost before filing.
  const estimatedHours = useMemo(
    () => (startDate && endDate ? defaultHoursForRange(startDate, endDate) : 0),
    [startDate, endDate],
  );

  const myRequests = requests.filter((r) => r.user_id === currentUserId);
  const reviewQueue = requests.filter((r) => r.status === "pending");

  function run(action: () => Promise<{ ok: boolean; error?: string }>, successMessage: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setNotice(successMessage);
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  function submitRequest() {
    if (!startDate || !endDate) {
      setError("Pick a start and end date.");
      return;
    }
    run(
      () => createTimeOffRequest({ leaveType, startDate, endDate, reason }),
      "Request filed.",
    );
    setShowForm(false);
    setReason("");
  }

  return (
    <div className="time-off-center">
      {error && <div className="empty-state">{error}</div>}
      {notice && <div className="success-box">{notice}</div>}

      <section className="kpi-strip">
        {summary.map((row) => (
          <article className="kpi-card" key={row.leaveType}>
            <div className="kpi-icon">
              <CalendarDays size={16} />
            </div>
            <div className="kpi-label">{row.label}</div>
            <div className="kpi-value">{row.remaining}h</div>
            <div className="kpi-detail">
              {row.used}h used{row.pending > 0 ? ` · ${row.pending}h pending` : ""}
            </div>
          </article>
        ))}
        {summary.length === 0 && <div className="empty-state">No leave policies are configured yet.</div>}
      </section>

      <section className="portal-card">
        <div className="portal-topline">
          <div>
            <h2>My requests</h2>
            <p>Balances shown are for the {policyYear} policy year.</p>
          </div>
          <button className="button button-primary" onClick={() => setShowForm((v) => !v)} type="button">
            {showForm ? <X size={15} /> : <Plus size={15} />}
            {showForm ? "Close" : "Request time off"}
          </button>
        </div>

        {showForm && (
          <div className="form-panel">
            <div className="form-grid">
              <label className="field">
                <span>Leave type</span>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
                  {policies
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.leave_type} value={p.leave_type}>
                        {p.label}
                        {p.requires_approval ? "" : " (auto-approved)"}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>Start date</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="field">
                <span>End date</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
              <label className="field field-full">
                <span>Reason (optional)</span>
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
            </div>
            <p className="kpi-detail">
              {estimatedHours > 0
                ? `${estimatedHours} hours across ${estimatedHours / 8} working day(s). Weekends are not counted.`
                : "Pick a weekday range to see the hours this will use."}
            </p>
            <button className="button button-primary" disabled={pending} onClick={submitRequest} type="button">
              <Check size={15} />
              {pending ? "Filing…" : "Submit request"}
            </button>
          </div>
        )}

        <div className="doc-list">
          {myRequests.map((request) => (
            <article className="doc-card" key={request.id}>
              <div className="record-badge-row">
                <span className={`record-badge ${statusTone[request.status] ?? "record-badge-neutral"}`}>
                  {request.status}
                </span>
                <strong>{formatLeaveType(request.leave_type)}</strong>
              </div>
              <p>
                {request.start_date} → {request.end_date} · {request.hours_requested}h
              </p>
              {request.reason && <p>{request.reason}</p>}
              {request.review_note && <p>Reviewer note: {request.review_note}</p>}
              {(request.status === "pending" || request.status === "approved") && (
                <button
                  className="button button-secondary button-neutral"
                  disabled={pending}
                  onClick={() => run(() => cancelTimeOffRequest(request.id), "Request cancelled.")}
                  type="button"
                >
                  <X size={14} />
                  Cancel
                </button>
              )}
            </article>
          ))}
          {myRequests.length === 0 && <div className="empty-state">You have not requested any time off yet.</div>}
        </div>
      </section>

      {isAdmin && (
        <>
          <section className="portal-card">
            <div className="portal-topline">
              <div>
                <h2>Review queue</h2>
                <p>{reviewQueue.length} request(s) waiting on a decision.</p>
              </div>
              <span className="badge">
                <Clock3 size={14} />
                Approver
              </span>
            </div>

            <div className="doc-list">
              {reviewQueue.map((request) => (
                <ReviewRow
                  key={request.id}
                  employeeName={nameFor(request.user_id)}
                  pending={pending}
                  request={request}
                  onDecide={(decision, note) =>
                    run(() => reviewTimeOffRequest(request.id, decision, note), `Request ${decision}.`)
                  }
                />
              ))}
              {reviewQueue.length === 0 && <div className="empty-state">Nothing waiting for review.</div>}
            </div>
          </section>

          <BalanceEditor
            pending={pending}
            policies={policies}
            policyYear={policyYear}
            profiles={profiles}
            onSave={(userId, type, accrued, carryover) =>
              run(
                () => setTimeOffBalance(userId, type, policyYear, accrued, carryover),
                "Balance updated.",
              )
            }
          />
        </>
      )}
    </div>
  );
}

function ReviewRow({
  employeeName,
  onDecide,
  pending,
  request,
}: {
  employeeName: string;
  onDecide: (decision: "approved" | "denied", note: string) => void;
  pending: boolean;
  request: TimeOffRequest;
}) {
  const [note, setNote] = useState("");

  return (
    <article className="doc-card">
      <div className="record-badge-row">
        <span className="record-badge record-badge-neutral">{formatLeaveType(request.leave_type)}</span>
        <strong>{employeeName}</strong>
      </div>
      <p>
        {request.start_date} → {request.end_date} · {request.hours_requested}h
      </p>
      {request.reason && <p>{request.reason}</p>}
      <label className="field">
        <span>Decision note (optional)</span>
        <input onChange={(e) => setNote(e.target.value)} type="text" value={note} />
      </label>
      <div className="record-badge-row">
        <button
          className="button button-primary"
          disabled={pending}
          onClick={() => onDecide("approved", note)}
          type="button"
        >
          <Check size={14} />
          Approve
        </button>
        <button
          className="button button-secondary button-neutral"
          disabled={pending}
          onClick={() => onDecide("denied", note)}
          type="button"
        >
          <X size={14} />
          Deny
        </button>
      </div>
    </article>
  );
}

function BalanceEditor({
  onSave,
  pending,
  policies,
  policyYear,
  profiles,
}: {
  onSave: (userId: string, leaveType: LeaveType, accrued: number, carryover: number) => void;
  pending: boolean;
  policies: TimeOffPolicy[];
  policyYear: number;
  profiles: Pick<EmployeeProfile, "user_id" | "display_name" | "email">[];
}) {
  const [userId, setUserId] = useState(profiles[0]?.user_id ?? "");
  const [leaveType, setLeaveType] = useState<LeaveType>((policies[0]?.leave_type as LeaveType) ?? "vacation");
  const [accrued, setAccrued] = useState("0");
  const [carryover, setCarryover] = useState("0");

  return (
    <section className="portal-card">
      <div className="portal-topline">
        <div>
          <h2>Adjust balances</h2>
          <p>Set accrued and carried-over hours for the {policyYear} policy year.</p>
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Employee</span>
          <select onChange={(e) => setUserId(e.target.value)} value={userId}>
            {profiles.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.display_name || p.email}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Leave type</span>
          <select onChange={(e) => setLeaveType(e.target.value as LeaveType)} value={leaveType}>
            {policies.map((p) => (
              <option key={p.leave_type} value={p.leave_type}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Accrued hours</span>
          <input min="0" onChange={(e) => setAccrued(e.target.value)} type="number" value={accrued} />
        </label>
        <label className="field">
          <span>Carryover hours</span>
          <input min="0" onChange={(e) => setCarryover(e.target.value)} type="number" value={carryover} />
        </label>
      </div>

      <button
        className="button button-primary"
        disabled={pending || !userId}
        onClick={() => onSave(userId, leaveType, Number(accrued) || 0, Number(carryover) || 0)}
        type="button"
      >
        <Check size={15} />
        Save balance
      </button>
    </section>
  );
}
