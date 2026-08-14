/**
 * Timeline — every move this deal has made, in full.
 *
 * MODULE_ID: client_lifecycle
 *
 * The overview shows the last twelve moves inside a panel. This is the whole
 * history with nothing elided, which is what "who skipped Discovery on this
 * deal, and why" actually needs. Read-only: opportunity_stage_events is
 * append-only in RLS, and nothing here offers to edit it.
 *
 * Error boundary: inherited from app/employee/error.tsx.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, History } from "lucide-react";
import { getLifecycleAccess } from "@/lib/lifecycle/access";
import { lifecycleExit } from "@/lib/lifecycle/exits";
import { lifecycleStep } from "@/lib/lifecycle/steps";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { LifecycleRecordTabs } from "@/components/lifecycle/LifecycleFurniture";
import type { OpportunityStageEventRow } from "@/lib/lifecycle/types";

export const metadata: Metadata = { title: "Timeline" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const historyLimit = 200;

function formatMoment(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** What a row actually says, given `won` and `reopen` keep the same step. */
function describe(event: OpportunityStageEventRow): string {
  const to = lifecycleStep(event.to_step)?.label ?? event.to_step;
  if (event.kind === "exit") {
    return `${lifecycleExit(event.to_status)?.label ?? event.to_status} at ${to}`;
  }
  if (event.kind === "won") return `Closed won at ${to}`;
  if (event.kind === "reopen") return `Reopened at ${to}`;
  const from = event.from_step ? (lifecycleStep(event.from_step)?.label ?? event.from_step) : null;
  // A move to the same step is not a move; saying "X → X" reads as a bug.
  return from && from !== to ? `${from} → ${to}` : to;
}

export default async function LifecycleTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase, canRead } = await getLifecycleAccess();
  if (!supabase) return <section className="portal-card empty-state">Supabase is not configured yet.</section>;
  if (!canRead) {
    return <section className="portal-card empty-state">The Client Lifecycle is not visible for this account.</section>;
  }

  const { data: row, error: readError } = await supabase
    .from("opportunities")
    .select("id, name, client_id")
    .eq("id", id)
    .maybeSingle();

  if (readError && isMissingSchemaRelationError(readError)) {
    return (
      <section className="portal-card empty-state">
        The Client Lifecycle is not set up in Supabase yet. Apply the latest database migrations and try again.
      </section>
    );
  }
  // A read that failed for any OTHER reason is not a missing record, and
  // rendering a 404 would tell the operator their deal is gone.
  if (readError) throw new Error(readError.message ?? "Could not read this opportunity.");
  if (!row) notFound();

  const opportunity = row as { id: string; name: string; client_id: string | null };

  const { data: events, error: historyError } = await supabase
    .from("opportunity_stage_events")
    .select("id, from_step, to_step, from_status, to_status, kind, reason, steps_skipped, changed_by, changed_at")
    .eq("opportunity_id", id)
    .order("changed_at", { ascending: false })
    .limit(historyLimit);

  if (historyError) throw new Error(historyError.message ?? "Could not read the step history.");
  const history = (events ?? []) as OpportunityStageEventRow[];

  return (
    <div className="lc-shell">
      <header className="lc-head">
        <div className="lc-head-id">
          <p className="lc-kicker">Client Lifecycle — Timeline</p>
          <h1>{opportunity.name}</h1>
          <p className="lc-sub">Every move this deal has made, newest first.</p>
        </div>
      </header>

      <LifecycleRecordTabs active="timeline" clientId={opportunity.client_id} opportunityId={opportunity.id} />

      <section className="portal-card">
        {history.length === 0 ? (
          <p className="lc-empty">
            <History aria-hidden="true" size={14} /> Nothing recorded yet. The first move writes the first entry.
          </p>
        ) : (
          <ol className="lc-history">
            {history.map((event) => (
              <li className={`lc-history-row lc-history-${event.kind}`} key={event.id}>
                <strong>{describe(event)}</strong>
                <span className="lc-history-meta">
                  {formatMoment(event.changed_at)}
                  {event.kind !== "advance" ? ` · ${event.kind}` : ""}
                  {event.steps_skipped > 0
                    ? ` · ${event.steps_skipped} step${event.steps_skipped === 1 ? "" : "s"} jumped`
                    : ""}
                </span>
                {event.reason ? <p className="lc-history-reason">{event.reason}</p> : null}
              </li>
            ))}
          </ol>
        )}
        {history.length === historyLimit ? (
          <p className="lc-meta">Showing the most recent {historyLimit} moves.</p>
        ) : null}
      </section>

      <p className="lc-backlink">
        <Link href={`/employee/lifecycle/${opportunity.id}`}>
          <ArrowLeft size={14} /> Back to the record
        </Link>
      </p>
    </div>
  );
}
