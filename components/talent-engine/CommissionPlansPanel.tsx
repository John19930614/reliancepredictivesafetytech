"use client";

/**
 * Admin editor for talent_commission_plans — who is compensated, on what base,
 * at what share of their placements' weekly margin (default 5%).
 *
 * Rendered only for isAdmin, and saveCommissionPlan() re-checks that on the
 * server; RLS on the table is the final word. Compensation is sensitive, so
 * this panel lives beside the Money floor on the desk rather than on the
 * public console.
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeDollarSign, Loader2, Save } from "lucide-react";
import { saveCommissionPlan } from "@/app/employee/talent-engine/actions";
import { defaultCommissionPct, maxCommissionPct } from "@/lib/talent-engine/commission";
import type { CommissionPlanRow } from "@/lib/talent-engine/types";
import { formatCurrency } from "./format";

export interface CommissionPlanOption {
  userId: string;
  name: string;
}

interface ActionResult {
  ok: boolean;
  error?: string;
}

export function CommissionPlansPanel({
  plans,
  people,
  namesById,
}: {
  /** Existing plans, admin-visible via RLS. */
  plans: CommissionPlanRow[];
  /** Portal people selectable for a new plan (employee_profiles). */
  people: CommissionPlanOption[];
  /** user_id → display name, for labelling existing plans. */
  namesById: Record<string, string>;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [userId, setUserId] = useState("");
  const [base, setBase] = useState("70000");
  const [pct, setPct] = useState(String(defaultCommissionPct));

  function submit(input: { userId: string; baseSalary: number; commissionPct: number; active?: boolean }, doneMessage: string) {
    setError("");
    setSaved("");
    startTransition(async () => {
      const result: ActionResult = await saveCommissionPlan(input);
      if (!result?.ok) {
        setError(result?.error || "The plan could not be saved.");
        return;
      }
      setSaved(doneMessage);
      router.refresh();
    });
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const baseSalary = Number(base.trim());
    const commissionPct = Number(pct.trim());
    if (!userId) {
      setError("Pick who the plan is for.");
      return;
    }
    if (!Number.isFinite(baseSalary) || baseSalary < 0) {
      setError("Base salary must be a number.");
      return;
    }
    if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > maxCommissionPct) {
      setError(`Commission must be between 0 and ${maxCommissionPct}%.`);
      return;
    }
    submit({ userId, baseSalary, commissionPct }, "Plan saved.");
  }

  const unplanned = people.filter((person) => !plans.some((plan) => plan.user_id === person.userId));

  return (
    <div className="talent-desk-settings">
      <p className="talent-desk-settings-note">
        <BadgeDollarSign aria-hidden="true" size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Compensation plans: base salary plus a share of each placement&apos;s weekly margin (meeting default{" "}
        {defaultCommissionPct}% — the owner retains the rest). The recruiter sees their own plan and earnings only.
      </p>

      {plans.length > 0 ? (
        <ul className="talent-list">
          {plans.map((plan) => (
            <li className="talent-row" key={plan.id}>
              <span className="talent-row-main">
                <span className="talent-row-title">
                  {namesById[plan.user_id] ?? "Portal user"}
                  {plan.active ? "" : " (inactive)"}
                </span>
                <span className="talent-row-sub">
                  {formatCurrency(plan.base_salary)}/yr base · {plan.commission_pct}% of weekly margin
                </span>
              </span>
              <button
                className="talent-btn"
                disabled={isPending}
                onClick={() =>
                  submit(
                    {
                      userId: plan.user_id,
                      baseSalary: plan.base_salary,
                      commissionPct: plan.commission_pct,
                      active: !plan.active,
                    },
                    plan.active ? "Plan deactivated." : "Plan reactivated.",
                  )
                }
                type="button"
              >
                {plan.active ? "Deactivate" : "Reactivate"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form className="talent-intake-form talent-desk-form" onSubmit={handleCreate}>
        <label className="talent-field" htmlFor={`${fieldId}-person`}>
          <span>Person</span>
          <select
            disabled={isPending}
            id={`${fieldId}-person`}
            onChange={(event) => setUserId(event.target.value)}
            value={userId}
          >
            <option value="">Pick a teammate…</option>
            {unplanned.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label className="talent-field" htmlFor={`${fieldId}-base`}>
          <span>Base salary $/yr</span>
          <input
            disabled={isPending}
            id={`${fieldId}-base`}
            inputMode="decimal"
            onChange={(event) => setBase(event.target.value)}
            value={base}
          />
        </label>
        <label className="talent-field" htmlFor={`${fieldId}-pct`}>
          <span>Commission %</span>
          <input
            disabled={isPending}
            id={`${fieldId}-pct`}
            inputMode="decimal"
            onChange={(event) => setPct(event.target.value)}
            value={pct}
          />
        </label>
        <button
          className="talent-btn talent-btn-approve talent-intake-submit talent-desk-btn"
          disabled={isPending}
          type="submit"
        >
          {isPending ? <Loader2 aria-hidden="true" className="spin" size={14} /> : <Save aria-hidden="true" size={14} />}
          {isPending ? "Saving…" : "Save plan"}
        </button>

        {error ? (
          <p className="talent-intake-error" role="alert">
            {error}
          </p>
        ) : null}
        {saved && !error ? (
          <p className="talent-desk-saved" role="status">
            {saved}
          </p>
        ) : null}
      </form>
    </div>
  );
}
