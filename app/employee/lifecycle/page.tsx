/**
 * Client Lifecycle — every opportunity, by step.
 *
 * MODULE_ID: client_lifecycle
 * PATH_PREFIX: /employee/lifecycle
 *
 * An async SERVER component; the only client code is the intake form. This is
 * the way in to the command center, the same way the sales board is the way in
 * to a client's workflow view.
 *
 * The existing twelve-column sales board is untouched and still runs on
 * company_clients.lifecycle_stage. This module runs beside it on its own
 * record, which is what makes it safe to build the eleven steps out gradually
 * instead of cutting the whole pipeline over in one change.
 *
 * Error boundary: inherited from app/employee/error.tsx.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, CircleDollarSign, Layers, UserPlus } from "lucide-react";
import { getLifecycleAccess } from "@/lib/lifecycle/access";
import { isClosed, lifecycleExit } from "@/lib/lifecycle/exits";
import { lifecycleSteps, lifecycleStep } from "@/lib/lifecycle/steps";
import { opportunitySelect, type OpportunityRow } from "@/lib/lifecycle/types";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { LifecycleKpis, type KpiTile } from "@/components/lifecycle/LifecycleFurniture";
import { NewOpportunityForm } from "@/components/lifecycle/NewOpportunityForm";

export const metadata: Metadata = {
  title: "Client Lifecycle",
  description: "One controlled record from lead to close — every opportunity, by step.",
};

/** Bounded so a large pipeline cannot turn this into an unbounded read. */
const opportunityLimit = 300;
const clientLimit = 200;

function money(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86_400_000));
}

export default async function LifecycleIndexPage() {
  const { supabase, canRead, canManage } = await getLifecycleAccess();

  if (!supabase) {
    return <section className="portal-card empty-state">Supabase is not configured yet.</section>;
  }
  if (!canRead) {
    return <section className="portal-card empty-state">The Client Lifecycle is not visible for this account.</section>;
  }

  const [opportunityResult, clientResult] = await Promise.all([
    supabase
      .from("opportunities")
      .select(opportunitySelect)
      .order("step_changed_at", { ascending: true })
      .limit(opportunityLimit),
    supabase.from("company_clients").select("id, name").order("name", { ascending: true }).limit(clientLimit),
  ]);

  if (opportunityResult?.error && isMissingSchemaRelationError(opportunityResult.error)) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <div className="eyebrow">Client Lifecycle</div>
            <h1>One controlled record from lead to close</h1>
          </div>
        </div>
        <section className="portal-card empty-state">
          The Client Lifecycle is not set up in Supabase yet. Apply the latest database migrations and try again.
        </section>
      </>
    );
  }

  const opportunities: OpportunityRow[] = Array.isArray(opportunityResult?.data)
    ? (opportunityResult.data as OpportunityRow[])
    : [];
  const clients: Array<{ id: string; name: string }> = Array.isArray(clientResult?.data)
    ? (clientResult.data as Array<{ id: string; name: string }>)
    : [];

  const open = opportunities.filter((row) => !isClosed(row.status));
  const pipelineValue = open.reduce((sum, row) => sum + Number(row.value ?? 0), 0);
  const weighted = open.reduce((sum, row) => sum + (Number(row.value ?? 0) * Number(row.probability ?? 0)) / 100, 0);
  const unassigned = open.filter((row) => !row.owner_user_id).length;
  // Sat on the same step for a fortnight — the thing a pipeline review exists
  // to find, surfaced rather than left to be noticed.
  const stalled = open.filter((row) => (daysSince(row.step_changed_at) ?? 0) >= 14).length;

  const tiles: KpiTile[] = [
    {
      label: "Open Opportunities",
      value: String(open.length),
      detail: `${opportunities.length - open.length} closed`,
      icon: <Layers size={18} />,
    },
    {
      label: "Pipeline Value",
      value: money(pipelineValue),
      detail: `${money(weighted)} weighted`,
      icon: <CircleDollarSign size={18} />,
    },
    {
      label: "Unassigned",
      value: String(unassigned),
      detail: "needs an accountable owner",
      tone: unassigned > 0 ? "warn" : "good",
      icon: <UserPlus size={18} />,
    },
    {
      label: "Stalled 14+ Days",
      value: String(stalled),
      detail: "no step movement",
      tone: stalled > 0 ? "warn" : "good",
      icon: <AlertTriangle size={18} />,
    },
  ];

  const byStep = new Map<string, OpportunityRow[]>();
  for (const row of open) {
    const list = byStep.get(row.step) ?? [];
    list.push(row);
    byStep.set(row.step, list);
  }

  const closedRows = opportunities.filter((row) => isClosed(row.status));

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Client Lifecycle</div>
          <h1>One controlled record from lead to close</h1>
          <p>Eleven steps, one owner, one outcome — with exit paths at any stage.</p>
        </div>
        <Link className="lc-btn" href="/employee/sales">
          Sales board
        </Link>
      </div>

      <LifecycleKpis tiles={tiles} />

      <div className="lc-index">
        <div className="lc-index-main">
          {open.length === 0 ? (
            <section className="portal-card empty-state">
              No open opportunities yet. Open one to start the lifecycle.
            </section>
          ) : (
            lifecycleSteps.map((step) => {
              const rows = byStep.get(step.key) ?? [];
              if (rows.length === 0) return null;
              return (
                <section className="lc-step-group" key={step.key}>
                  <div className="lc-step-group-head">
                    <span className="lc-step-num" aria-hidden="true">
                      {step.number}
                    </span>
                    <h2>{step.label}</h2>
                    <span className="lc-pill lc-pill-neutral">{rows.length}</span>
                  </div>
                  <ul className="lc-cards">
                    {rows.map((row) => {
                      const held = daysSince(row.step_changed_at);
                      return (
                        <li key={row.id}>
                          <Link className="lc-card" href={`/employee/lifecycle/${row.id}`}>
                            <strong>{row.name}</strong>
                            <span className="lc-card-meta">
                              {money(Number(row.value ?? 0))} · {row.probability}%
                              {row.ai_score !== null ? ` · AI ${row.ai_score}` : ""}
                            </span>
                            <span className="lc-card-meta">
                              {row.owner_user_id ? "Owned" : "Unassigned"}
                              {held !== null ? ` · ${held}d in step` : ""}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}

          {closedRows.length > 0 ? (
            <section className="lc-step-group">
              <div className="lc-step-group-head">
                <h2>Left the lifecycle</h2>
                <span className="lc-pill lc-pill-neutral">{closedRows.length}</span>
              </div>
              <ul className="lc-cards">
                {closedRows.map((row) => (
                  <li key={row.id}>
                    <Link className="lc-card lc-card-closed" href={`/employee/lifecycle/${row.id}`}>
                      <strong>{row.name}</strong>
                      <span className="lc-card-meta">
                        {lifecycleExit(row.status)?.label ?? row.status} at{" "}
                        {lifecycleStep(row.step)?.label ?? row.step}
                      </span>
                      {row.exit_competitor ? (
                        <span className="lc-card-meta">Lost to {row.exit_competitor}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="lc-index-side">
          <NewOpportunityForm canManage={canManage} clients={clients} />
        </aside>
      </div>
    </>
  );
}
