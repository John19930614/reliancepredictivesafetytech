"use client";

/**
 * Manage one client job order after intake: move its status, and edit the
 * requisition.
 *
 * WHY THIS EXISTS. `setJobOrderStatus` and `updateJobOrder` shipped with no
 * caller anywhere in the console, so an order could be opened and then never
 * corrected, re-priced, put on hold, filled or closed. The order book only ever
 * grew.
 *
 * Like every other interactive surface in this module it is a client island
 * that imports Server Actions and pure helpers only — no Supabase client and no
 * write path reaches the browser bundle (CLAUDE.md: no client-side mutation).
 *
 * TWO GATES, NOT ONE. Editing the requisition needs `canPropose`; the bill rate
 * and the spread floor are the client PRICE and additionally need `canSetRate`,
 * exactly as on the intake form. A propose-only operator gets the rate inputs
 * disabled with the reason in the title, and the patch this component sends
 * never carries a rate key at all — the server re-checks anyway, but a request
 * that would be refused should not be made.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal } from "lucide-react";
import {
  setJobOrderStatus,
  updateJobOrder,
  type ActionResult,
  type JobOrderPatch,
} from "@/app/employee/talent-engine/actions";
import {
  jobOrderPriorities,
  jobOrderPriorityLabels,
  jobOrderStatusLabels,
  jobOrderStatuses,
  type JobOrderPriority,
  type JobOrderStatus,
  type JobOrderWithClient,
} from "@/lib/talent-engine/types";
import { splitList, parseOptionalNumber } from "./intake";
import { VerticalDropdown, readVerticalFromForm } from "./VerticalSelect";

const noProposeReason = "Editing a job order requires proposing permission.";
const noStatusReason = "Moving a job order's status requires proposing permission.";
// Same wording as JobOrderCreateForm — the rate rule is one rule, so it reads
// identically wherever an operator meets it.
const noRateReason =
  "Setting the client bill rate requires rate-setting permission — leave it blank and an approver will price it.";

interface ClientOption {
  id: string;
  name: string;
}

function messageFor(result: ActionResult | null | undefined, fallback: string): string {
  const values = Object.values(result?.fieldErrors ?? {});
  return result?.error || values[0] || fallback;
}

/** `<input type="date">` only accepts YYYY-MM-DD; slice so a timestamp cannot blank the field. */
function dateValue(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

export function JobOrderManagePanel({
  order,
  clients,
  canPropose,
  canSetRate,
  verticalOptions,
}: {
  order: JobOrderWithClient;
  clients: ClientOption[];
  /** Gates the status buttons and the edit fields — both actions re-check it. */
  canPropose: boolean;
  /** Gates the bill rate and spread floor only. */
  canSetRate: boolean;
  /** Configured trade list from talent_settings, for the vertical picker. */
  verticalOptions?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Status and edit are separate controls with separate outcomes, so each
  // reports next to the control the operator actually pressed.
  const [statusError, setStatusError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [editError, setEditError] = useState("");
  const [editNotice, setEditNotice] = useState("");
  /** Which status is mid-flight, so the spinner lands on the button that was pressed. */
  const [pendingStatus, setPendingStatus] = useState<JobOrderStatus | null>(null);

  // An order whose client is not in the picker list would silently be reassigned
  // to "Unassigned" on save, so keep its current client as an option.
  const clientOptions =
    order.client_id && !clients.some((client) => client.id === order.client_id)
      ? [...clients, { id: order.client_id, name: order.client?.name ?? "Current client" }]
      : clients;

  function handleStatus(status: JobOrderStatus) {
    setStatusError("");
    setStatusNotice("");
    setPendingStatus(status);
    startTransition(async () => {
      const result = await setJobOrderStatus(order.id, status);
      setPendingStatus(null);
      if (!result?.ok) {
        setStatusError(messageFor(result, "That status change could not be recorded."));
        return;
      }
      setStatusNotice(`Moved to ${jobOrderStatusLabels[status]}.`);
      router.refresh();
    });
  }

  /**
   * Builds a patch of CHANGED fields only, and omits the rate keys entirely
   * without `canSetRate` — naming `billRate` at all, even with its current
   * value, trips the server's rate gate and refuses the whole edit.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    const billRate = parseOptionalNumber(data.get("bill_rate"));
    const minSpread = parseOptionalNumber(data.get("min_spread"));
    const openingsRaw = parseOptionalNumber(data.get("openings"));
    if (billRate === undefined || minSpread === undefined || openingsRaw === undefined) {
      setEditNotice("");
      setEditError("Rates and openings must be numbers.");
      return;
    }

    const patch: JobOrderPatch = {};

    const title = String(data.get("title") ?? "").trim();
    if (title !== order.title.trim()) patch.title = title;

    const clientId = String(data.get("client_id") ?? "");
    if (clientId !== (order.client_id ?? "")) patch.clientId = clientId || null;

    const vertical = readVerticalFromForm(data) ?? "";
    if (vertical !== (order.vertical ?? "")) patch.vertical = vertical || null;

    const location = String(data.get("location") ?? "").trim();
    if (location !== (order.location ?? "")) patch.location = location || null;

    const certRequirements = splitList(data.get("cert_requirements"));
    if (!sameList(certRequirements, order.cert_requirements)) patch.certRequirements = certRequirements;

    if (canSetRate) {
      if (billRate !== order.bill_rate) patch.billRate = billRate;
      if (minSpread !== order.min_spread) patch.minSpread = minSpread;
    }

    const openings = openingsRaw === null ? order.openings : Math.trunc(openingsRaw);
    if (openings !== order.openings) patch.openings = openings;

    const priorityRaw = String(data.get("priority") ?? order.priority);
    const priority = (jobOrderPriorities as readonly string[]).includes(priorityRaw)
      ? (priorityRaw as JobOrderPriority)
      : order.priority;
    if (priority !== order.priority) patch.priority = priority;

    const startDate = String(data.get("start_date") ?? "");
    if (startDate !== dateValue(order.start_date)) patch.startDate = startDate || null;

    if (Object.keys(patch).length === 0) {
      setEditError("");
      setEditNotice("Nothing changed, so nothing was saved.");
      return;
    }

    setEditError("");
    setEditNotice("");
    startTransition(async () => {
      const result = await updateJobOrder(order.id, patch);
      if (!result?.ok) {
        setEditError(messageFor(result, "The job order could not be updated."));
        return;
      }
      setEditNotice("Changes saved.");
      router.refresh();
    });
  }

  const editTitle = canPropose ? undefined : noProposeReason;
  const rateTitle = !canPropose ? noProposeReason : canSetRate ? undefined : noRateReason;
  const fieldsDisabled = isPending || !canPropose;

  return (
    <div className="talent-intake">
      <button
        aria-expanded={open}
        className="talent-intake-toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" size={14} />
        {open ? "Close" : `Manage ${order.title}`}
      </button>

      {open ? (
        <>
          <div className="talent-intake-form">
            <p className="talent-review-heading talent-field-wide">Status</p>
            <p className="talent-action-hint talent-field-wide">
              Currently {jobOrderStatusLabels[order.status]}. Only an open order can take new submittals.
            </p>

            {statusError ? (
              <p className="talent-intake-error" role="alert">
                {statusError}
              </p>
            ) : null}
            {statusNotice ? (
              <p className="talent-action-hint talent-field-wide" role="status">
                {statusNotice}
              </p>
            ) : null}

            <div className="talent-actions talent-field-wide">
              {jobOrderStatuses.map((status) => {
                const isCurrent = status === order.status;
                return (
                  <button
                    aria-current={isCurrent ? "true" : undefined}
                    aria-label={`Move ${order.title} to ${jobOrderStatusLabels[status]}`}
                    className={`talent-btn${status === "closed" ? " talent-btn-reject" : ""}`}
                    disabled={isPending || !canPropose || isCurrent}
                    key={status}
                    onClick={() => handleStatus(status)}
                    title={
                      !canPropose
                        ? noStatusReason
                        : isCurrent
                          ? `This order is already ${jobOrderStatusLabels[status]}.`
                          : undefined
                    }
                    type="button"
                  >
                    {pendingStatus === status ? <Loader2 aria-hidden="true" className="spin" size={14} /> : null}
                    {isCurrent ? `${jobOrderStatusLabels[status]} (current)` : jobOrderStatusLabels[status]}
                  </button>
                );
              })}
            </div>

            {canPropose ? null : <p className="talent-action-hint talent-field-wide">{noStatusReason}</p>}
          </div>

          <form className="talent-intake-form" onSubmit={handleSubmit}>
            <p className="talent-review-heading talent-field-wide">Edit job order</p>
            {editError ? (
              <p className="talent-intake-error" role="alert">
                {editError}
              </p>
            ) : null}
            {editNotice ? (
              <p className="talent-action-hint talent-field-wide" role="status">
                {editNotice}
              </p>
            ) : null}

            <label className="talent-field talent-field-wide" title={editTitle}>
              <span>Title</span>
              <input defaultValue={order.title} disabled={fieldsDisabled} maxLength={200} name="title" required />
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Client</span>
              <select defaultValue={order.client_id ?? ""} disabled={fieldsDisabled} name="client_id">
                <option value="">Unassigned</option>
                {clientOptions.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Location</span>
              <input
                defaultValue={order.location ?? ""}
                disabled={fieldsDisabled}
                maxLength={120}
                name="location"
                placeholder="e.g. Austin, TX"
              />
            </label>
            <VerticalDropdown disabled={fieldsDisabled} options={verticalOptions} value={order.vertical} />
            <label className="talent-field" title={editTitle}>
              <span>Required certs</span>
              <input
                defaultValue={order.cert_requirements.join(", ")}
                disabled={fieldsDisabled}
                maxLength={300}
                name="cert_requirements"
                placeholder="CSP, CHST (comma-separated)"
              />
            </label>
            <label className="talent-field" title={rateTitle}>
              <span>Bill rate $/hr</span>
              <input
                defaultValue={order.bill_rate === null ? "" : String(order.bill_rate)}
                disabled={fieldsDisabled || !canSetRate}
                inputMode="decimal"
                name="bill_rate"
                placeholder="e.g. 95"
              />
            </label>
            <label className="talent-field" title={rateTitle}>
              <span>Spread floor $/hr</span>
              <input
                defaultValue={order.min_spread === null ? "" : String(order.min_spread)}
                disabled={fieldsDisabled || !canSetRate}
                inputMode="decimal"
                name="min_spread"
                placeholder="agency default"
              />
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Openings</span>
              <input
                defaultValue={String(order.openings)}
                disabled={fieldsDisabled}
                inputMode="numeric"
                name="openings"
              />
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Priority</span>
              <select defaultValue={order.priority} disabled={fieldsDisabled} name="priority">
                {jobOrderPriorities.map((value) => (
                  <option key={value} value={value}>
                    {jobOrderPriorityLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Start date</span>
              <input
                defaultValue={dateValue(order.start_date)}
                disabled={fieldsDisabled}
                name="start_date"
                type="date"
              />
            </label>

            <button
              className="talent-btn talent-btn-approve talent-intake-submit"
              disabled={fieldsDisabled}
              title={editTitle}
              type="submit"
            >
              {isPending ? <Loader2 aria-hidden="true" className="spin" size={14} /> : null}
              {isPending ? "Saving…" : "Save changes"}
            </button>

            {canPropose && !canSetRate ? <p className="talent-action-hint talent-field-wide">{noRateReason}</p> : null}
            {canPropose ? null : <p className="talent-action-hint talent-field-wide">{noProposeReason}</p>}
          </form>
        </>
      ) : null}
    </div>
  );
}
