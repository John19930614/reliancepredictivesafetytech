"use client";

/**
 * The ONLY interactive part of the sourcing review queue.
 *
 * /employee/talent-engine/leads is otherwise entirely server-rendered; this
 * island exists so the accept / dismiss / restore buttons can hold pending
 * state and surface an inline error. It imports Server Actions only — no
 * Supabase client and no write path ever reaches the browser bundle
 * (CLAUDE.md: no client-side data mutation).
 *
 * THE GATE IS THE POINT. A web-sourced lead is an AI guess about a stranger on
 * the public internet; nothing it found joins the talent pool or the order book
 * until a human presses Accept here. A viewer without `canPropose` still SEES
 * every lead — hiding the queue would make the review impossible — but the
 * buttons are disabled and say why.
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageSquare, RotateCcw, X } from "lucide-react";
import {
  acceptSourcingLead,
  dismissSourcingLead,
  restoreSourcingLead,
  runSourcingNow,
} from "@/app/employee/talent-engine/actions";
import type { SourcingLeadStatus, SourcingRunType } from "@/lib/talent-engine/types";

const noProposeReason =
  "Accepting or dismissing a sourced lead is the human gate — your role can review the queue but not admit a lead into the pool.";
const noSweepReason = "Starting a sourcing sweep requires approval permission.";
const droppedRateReason =
  "You can accept this lead, but the published rate will NOT be carried onto the job order — setting a bill rate requires rate-setting permission. Add it afterwards from the console.";

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function firstFieldError(result: ActionResult | null | undefined): string {
  const values = Object.values(result?.fieldErrors ?? {});
  return values.length > 0 ? values[0] : "";
}

function messageFor(result: ActionResult | null | undefined, fallback: string): string {
  return result?.error || firstFieldError(result) || fallback;
}

/* -------------------------------------------------------------------------- */
/* Per-lead decision buttons                                                  */
/* -------------------------------------------------------------------------- */

export function SourcingLeadActions({
  leadId,
  leadType,
  leadTitle,
  status,
  hasRateSignal,
  canPropose,
  canSetRate,
}: {
  leadId: string;
  leadType: SourcingRunType;
  /** Used to keep every button label distinct for screen readers. */
  leadTitle: string;
  /** `new` gets Accept/Dismiss; `dismissed` gets Restore. */
  status: SourcingLeadStatus;
  /** True when the lead published a rate — changes what accepting without canSetRate loses. */
  hasRateSignal: boolean;
  canPropose: boolean;
  canSetRate: boolean;
}) {
  const router = useRouter();
  const panelId = useId();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  // Which button the operator actually pressed, so the spinner lands on that
  // one rather than on whichever button happens to own the loader markup.
  const [activeAction, setActiveAction] = useState<"accept" | "dismiss" | "restore" | null>(null);

  function run(kind: "accept" | "dismiss" | "restore", action: () => Promise<ActionResult>, fallback: string) {
    setError("");
    setActiveAction(kind);
    startTransition(async () => {
      const result = await action();
      setActiveAction(null);
      if (!result?.ok) {
        setError(messageFor(result, fallback));
        return;
      }
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  const trimmedNote = () => (note.trim() ? note.trim() : undefined);

  // Accepting a job-order lead without rate-setting permission is ALLOWED — the
  // action drops the rate rather than refusing the whole lead. The reviewer has
  // to be told that before they press it, or they will believe the published
  // rate landed on the order.
  const dropsRate = leadType === "job_orders" && hasRateSignal && !canSetRate;
  const acceptTitle = !canPropose ? noProposeReason : dropsRate ? droppedRateReason : undefined;
  const decideTitle = canPropose ? undefined : noProposeReason;

  if (status === "dismissed") {
    return (
      <div className="talent-actions-shell">
        <div className="talent-actions">
          <button
            aria-label={`Restore the dismissed lead ${leadTitle} to the review queue`}
            className="talent-btn"
            disabled={isPending || !canPropose}
            onClick={() => run("restore", () => restoreSourcingLead(leadId), "That lead could not be restored.")}
            title={decideTitle}
            type="button"
          >
            {activeAction === "restore" ? (
              <Loader2 aria-hidden="true" className="spin" size={14} />
            ) : (
              <RotateCcw aria-hidden="true" size={14} />
            )}
            {activeAction === "restore" ? "Restoring…" : "Restore to queue"}
          </button>
        </div>

        {error ? (
          <p className="talent-action-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="talent-actions-shell">
      <div className="talent-actions">
        <button
          aria-label={
            leadType === "candidates"
              ? `Accept ${leadTitle} into the talent pool`
              : `Accept ${leadTitle} as a job order`
          }
          className="talent-btn talent-btn-approve"
          disabled={isPending || !canPropose}
          onClick={() => run("accept", () => acceptSourcingLead(leadId), "That lead could not be accepted.")}
          title={acceptTitle}
          type="button"
        >
          {activeAction === "accept" ? (
            <Loader2 aria-hidden="true" className="spin" size={14} />
          ) : (
            <Check aria-hidden="true" size={14} />
          )}
          {activeAction === "accept"
            ? "Accepting…"
            : leadType === "candidates"
              ? "Accept into pool"
              : "Accept as order"}
        </button>

        <button
          aria-controls={panelId}
          aria-expanded={open}
          aria-label={`Add a dismissal note for ${leadTitle}`}
          className="talent-btn"
          disabled={isPending || !canPropose}
          onClick={() => setOpen((value) => !value)}
          title={decideTitle}
          type="button"
        >
          <MessageSquare aria-hidden="true" size={14} />
          {open ? "Close note" : "Add note"}
        </button>

        <button
          aria-label={`Dismiss ${leadTitle}`}
          className="talent-btn talent-btn-reject"
          disabled={isPending || !canPropose}
          onClick={() =>
            run("dismiss", () => dismissSourcingLead(leadId, trimmedNote()), "That lead could not be dismissed.")
          }
          title={decideTitle}
          type="button"
        >
          {activeAction === "dismiss" ? (
            <Loader2 aria-hidden="true" className="spin" size={14} />
          ) : (
            <X aria-hidden="true" size={14} />
          )}
          {activeAction === "dismiss" ? "Dismissing…" : "Dismiss"}
        </button>
      </div>

      {open ? (
        <div className="talent-review-panel" id={panelId}>
          <div className="talent-review-field">
            <label htmlFor={`${panelId}-note`}>Why is this not a fit? (optional)</label>
            <textarea
              disabled={isPending}
              id={`${panelId}-note`}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Stored on the lead so the next sweep's review has the history."
              rows={2}
              value={note}
            />
          </div>
          <p className="talent-action-hint">The note is attached to a dismissal, not to an acceptance.</p>
        </div>
      ) : null}

      {dropsRate ? <p className="talent-action-hint">{droppedRateReason}</p> : null}

      {error ? (
        <p className="talent-action-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* "Run sweep now" — the manual trigger for the scheduled sweep               */
/* -------------------------------------------------------------------------- */

/**
 * The Sourcing Agent runs on its own schedule; this is the "don't wait until
 * Monday" button. It is rendered only for a viewer with `canApprove`, and the
 * action re-checks that on the server — this is a convenience, not the gate.
 *
 * The outcome line reports what the sweep INSERTED, not what it found: a sweep
 * that returns 20 results and inserts 0 because they were all already in the
 * queue is a success, and saying so stops an operator pressing it again.
 */
export function SourcingSweepActions({ canApprove }: { canApprove: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState("");
  const [activeType, setActiveType] = useState<SourcingRunType | null>(null);

  function sweep(runType: SourcingRunType) {
    setError("");
    setOutcome("");
    setActiveType(runType);
    startTransition(async () => {
      const result = await runSourcingNow(runType);
      setActiveType(null);
      if (!result?.ok) {
        setError(messageFor(result, "That sweep could not be started."));
        return;
      }
      const inserted = typeof result.inserted === "number" ? result.inserted : null;
      setOutcome(
        inserted === null
          ? "Sweep finished."
          : inserted === 0
            ? "Sweep finished — no new leads; everything it found is already in the queue."
            : `Sweep finished — ${inserted} new lead${inserted === 1 ? "" : "s"} added to the queue below.`,
      );
      router.refresh();
    });
  }

  const title = canApprove ? undefined : noSweepReason;

  return (
    <div className="talent-sweep">
      <div className="talent-sweep-buttons">
        <button
          aria-label="Run a sourcing sweep for candidate leads now"
          className="talent-btn"
          disabled={isPending || !canApprove}
          onClick={() => sweep("candidates")}
          title={title}
          type="button"
        >
          {isPending && activeType === "candidates" ? (
            <Loader2 aria-hidden="true" className="spin" size={14} />
          ) : null}
          {isPending && activeType === "candidates" ? "Sweeping…" : "Run sweep now · candidates"}
        </button>
        <button
          aria-label="Run a sourcing sweep for job-order leads now"
          className="talent-btn"
          disabled={isPending || !canApprove}
          onClick={() => sweep("job_orders")}
          title={title}
          type="button"
        >
          {isPending && activeType === "job_orders" ? (
            <Loader2 aria-hidden="true" className="spin" size={14} />
          ) : null}
          {isPending && activeType === "job_orders" ? "Sweeping…" : "Run sweep now · job orders"}
        </button>
      </div>

      {outcome ? (
        <p className="talent-action-hint" role="status">
          {outcome}
        </p>
      ) : null}

      {error ? (
        <p className="talent-action-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
