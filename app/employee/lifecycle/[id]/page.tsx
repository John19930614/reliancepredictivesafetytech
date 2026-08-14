/**
 * Client Lifecycle Command Center — one opportunity, one step at a time.
 *
 * MODULE_ID: client_lifecycle
 * PATH_PREFIX: /employee/lifecycle
 *
 * An async SERVER component. Every read happens here; the only client code is
 * the header's Exit Path / Skip to Step / Next Step island (CLAUDE.md: no
 * client-side data mutation, no client-side Supabase reads).
 *
 * The screen is the same shape on all eleven steps — header, rail, KPI tiles,
 * panel grid, indicator strip, record tabs — and the step decides what fills the
 * grid. Steps whose bespoke panels are not built yet still render their purpose
 * and the deal facts, so the lifecycle is walkable end to end from day one
 * rather than showing eight blank screens.
 *
 * Error boundary: inherited from app/employee/error.tsx.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Brain,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Gauge,
  Target,
} from "lucide-react";
import { getLifecycleAccess } from "@/lib/lifecycle/access";
import { isClosed, lifecycleExit } from "@/lib/lifecycle/exits";
import {
  lifecycleStep,
  lifecycleStepCount,
  nextStepKey,
  stepNumber,
} from "@/lib/lifecycle/steps";
import { opportunitySelect, type OpportunityRow, type OpportunityStageEventRow } from "@/lib/lifecycle/types";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { LifecycleRail } from "@/components/lifecycle/LifecycleRail";
import { LifecycleStepActions } from "@/components/lifecycle/LifecycleStepActions";
import {
  LifecycleFacts,
  LifecycleIndicators,
  LifecycleKpis,
  LifecyclePanel,
  LifecycleRecordTabs,
  StepActivities,
  type Indicator,
  type KpiTile,
} from "@/components/lifecycle/LifecycleFurniture";

export const metadata: Metadata = {
  title: "Client Lifecycle",
  description: "One controlled record from lead to close.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const historyLimit = 12;

interface PageProps {
  params: Promise<{ id: string }>;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86_400_000));
}

/** Whole days until a date; negative once it has passed. */
function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.ceil((parsed.getTime() - Date.now()) / 86_400_000);
}

export default async function LifecycleRecordPage({ params }: PageProps) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase, canRead, canAdvance, canSkip, canExit, canReopen } = await getLifecycleAccess();

  if (!supabase) {
    return <section className="portal-card empty-state">Supabase is not configured yet.</section>;
  }
  if (!canRead) {
    return <section className="portal-card empty-state">The Client Lifecycle is not visible for this account.</section>;
  }

  const { data: row, error: readError } = await supabase
    .from("opportunities")
    .select(opportunitySelect)
    .eq("id", id)
    .maybeSingle();

  // The lifecycle ships behind a migration that has to be rehearsed on staging
  // first, so a deploy can legitimately land ahead of it.
  if (readError && isMissingSchemaRelationError(readError)) {
    return (
      <section className="portal-card empty-state">
        The Client Lifecycle is not set up in Supabase yet. Apply the latest database migrations and try again.
      </section>
    );
  }
  if (!row) notFound();

  const opportunity = row as OpportunityRow;
  const step = lifecycleStep(opportunity.step);
  const number = stepNumber(opportunity.step);
  const next = nextStepKey(opportunity.step);
  const closed = isClosed(opportunity.status);
  const exit = lifecycleExit(opportunity.status);

  const [clientResult, historyResult] = await Promise.all([
    opportunity.client_id
      ? supabase.from("company_clients").select("id, name").eq("id", opportunity.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("opportunity_stage_events")
      .select("id, from_step, to_step, from_status, to_status, kind, reason, steps_skipped, changed_by, changed_at")
      .eq("opportunity_id", id)
      .order("changed_at", { ascending: false })
      .limit(historyLimit),
  ]);

  const client = (clientResult?.data ?? null) as { id: string; name: string } | null;
  const history: OpportunityStageEventRow[] = Array.isArray(historyResult?.data)
    ? (historyResult.data as OpportunityStageEventRow[])
    : [];

  const inStep = daysSince(opportunity.step_changed_at);
  const toClose = daysUntil(opportunity.expected_close_date);
  const weighted = (opportunity.value * opportunity.probability) / 100;

  const tiles: KpiTile[] = [
    {
      label: "Deal Value",
      value: money(opportunity.value, opportunity.currency),
      detail: `${money(weighted, opportunity.currency)} weighted at ${opportunity.probability}%`,
      icon: <CircleDollarSign size={18} />,
    },
    {
      label: "AI Score",
      value: opportunity.ai_score === null ? "Not scored" : String(opportunity.ai_score),
      detail:
        opportunity.ai_score === null
          ? "Awaiting triage"
          : `${opportunity.ai_confidence ?? "unknown"} confidence · ${formatDate(opportunity.ai_scored_at)}`,
      tone: opportunity.ai_score === null ? "warn" : "default",
      icon: <Brain size={18} />,
    },
    {
      label: "Days in Step",
      value: inStep === null ? "—" : String(inStep),
      detail: step ? `on ${step.label}` : "off-lifecycle",
      // A deal parked on one step for a fortnight is the thing a pipeline
      // review is looking for, so the tile says so rather than waiting to be
      // noticed.
      tone: inStep !== null && inStep >= 14 ? "warn" : "default",
      icon: <Clock3 size={18} />,
    },
    {
      label: "Expected Close",
      value: opportunity.expected_close_date ? formatDate(opportunity.expected_close_date) : "Not set",
      detail:
        toClose === null
          ? "No date set"
          : toClose < 0
            ? `${Math.abs(toClose)} days past`
            : `${toClose} days out`,
      tone: toClose !== null && toClose < 0 ? "warn" : "default",
      icon: <CalendarClock size={18} />,
    },
  ];

  const indicators: Indicator[] = [
    { label: "Status", value: exit ? exit.label : opportunity.status === "won" ? "Won" : "Open", tone: exit ? "bad" : "good" },
    { label: "Stage", value: step?.label ?? opportunity.step, tone: "neutral" },
    { label: "Record status", value: step?.status ?? "—", tone: "neutral" },
    { label: "Owner", value: opportunity.owner_user_id ? "Assigned" : "Unassigned", tone: opportunity.owner_user_id ? "good" : "warn" },
    { label: "Source", value: opportunity.source || "—", tone: "neutral" },
    { label: "Region", value: opportunity.region || "—", tone: "neutral" },
    { label: "Industry", value: opportunity.industry || "—", tone: "neutral" },
  ];

  return (
    <div className="lc-shell">
      <header className="lc-head">
        <div className="lc-head-id">
          <p className="lc-kicker">
            Client Lifecycle — Step {number ?? "?"} of {lifecycleStepCount}
          </p>
          <h1>{step?.label ?? opportunity.step}</h1>
          <p className="lc-sub">
            {step?.summary ?? "This opportunity is on a step that is not part of the lifecycle."}
          </p>
        </div>

        <LifecycleStepActions
          advanceLabel={step?.advanceLabel ?? ""}
          canAdvance={canAdvance}
          canExit={canExit}
          canReopen={canReopen}
          canSkip={canSkip}
          clientHref={client ? `/employee/clients/${client.id}` : null}
          currentStepKey={opportunity.step}
          nextStepLabel={next ? (lifecycleStep(next)?.label ?? next) : null}
          opportunityId={opportunity.id}
          status={opportunity.status}
        />
      </header>

      {closed && exit ? (
        <div className="lc-exit-banner" role="status">
          <strong>{exit.label}</strong>
          <span>
            {opportunity.exit_reason}
            {opportunity.exit_competitor ? ` · lost to ${opportunity.exit_competitor}` : ""}
            {opportunity.hold_until ? ` · picking back up ${formatDate(opportunity.hold_until)}` : ""}
          </span>
        </div>
      ) : null}

      <LifecycleRail currentKey={opportunity.step} status={opportunity.status} />

      <LifecycleKpis tiles={tiles} />

      <div className="lc-grid">
        <LifecyclePanel
          aside={<Link href="/employee/lifecycle">All opportunities</Link>}
          title="Opportunity Summary"
        >
          <LifecycleFacts
            rows={[
              { label: "Opportunity", value: opportunity.name },
              {
                label: "Company",
                value: client ? <Link href={`/employee/clients/${client.id}`}>{client.name}</Link> : "Not linked yet",
              },
              { label: "Value", value: money(opportunity.value, opportunity.currency) },
              { label: "Probability", value: `${opportunity.probability}%` },
              { label: "Close date", value: formatDate(opportunity.expected_close_date) },
              { label: "Product interest", value: opportunity.product_interest || "—" },
              { label: "Opened", value: formatDate(opportunity.created_at) },
            ]}
          />
        </LifecyclePanel>

        <StepActivities activities={step?.activities ?? []} />

        <LifecyclePanel
          aside={
            opportunity.next_action_due ? (
              <span className={`lc-pill lc-pill-${(daysUntil(opportunity.next_action_due) ?? 0) < 0 ? "bad" : "neutral"}`}>
                due {formatDate(opportunity.next_action_due)}
              </span>
            ) : null
          }
          title="Next Action"
        >
          {opportunity.next_action ? (
            <p className="lc-body">{opportunity.next_action}</p>
          ) : (
            <p className="lc-empty">
              <Target aria-hidden="true" size={14} /> No next action set. A deal with no next action has no next event.
            </p>
          )}
          {opportunity.last_contact_at ? (
            <p className="lc-meta">Last contact {formatDate(opportunity.last_contact_at)}</p>
          ) : null}
        </LifecyclePanel>

        {opportunity.ai_recommendation ? (
          <LifecyclePanel
            aside={<span className="lc-pill lc-pill-neutral">{opportunity.ai_confidence ?? "unknown"} confidence</span>}
            title="AI Recommendation"
          >
            <p className="lc-body">{opportunity.ai_recommendation}</p>
            <p className="lc-meta">
              Advisory only — nothing here is applied to the record until a person acts on it.
            </p>
          </LifecyclePanel>
        ) : (
          <LifecyclePanel
            aside={<span className="lc-pill lc-pill-warn">Awaiting triage</span>}
            title="AI Recommendation"
          >
            <p className="lc-empty">
              <Gauge aria-hidden="true" size={14} /> This opportunity has not been scored yet.
            </p>
          </LifecyclePanel>
        )}

        <LifecyclePanel title="Step History" wide>
          {history.length === 0 ? (
            <p className="lc-empty">No moves recorded yet.</p>
          ) : (
            <ol className="lc-history">
              {history.map((event) => (
                <li className={`lc-history-row lc-history-${event.kind}`} key={event.id}>
                  <strong>
                    {event.kind === "exit"
                      ? `${lifecycleExit(event.to_status)?.label ?? event.to_status} at ${lifecycleStep(event.to_step)?.label ?? event.to_step}`
                      : `${event.from_step ? `${lifecycleStep(event.from_step)?.label ?? event.from_step} → ` : ""}${lifecycleStep(event.to_step)?.label ?? event.to_step}`}
                  </strong>
                  <span className="lc-history-meta">
                    {formatDate(event.changed_at)}
                    {event.kind !== "advance" ? ` · ${event.kind}` : ""}
                    {event.steps_skipped > 0 ? ` · ${event.steps_skipped} step${event.steps_skipped === 1 ? "" : "s"} jumped` : ""}
                  </span>
                  {event.reason ? <p className="lc-history-reason">{event.reason}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </LifecyclePanel>
      </div>

      <LifecycleIndicators
        items={indicators}
        title={step?.number === 1 ? "Lead Quality Indicators" : "Deal Indicators"}
      />

      <LifecycleRecordTabs active="overview" clientId={client?.id ?? null} opportunityId={opportunity.id} />

      <p className="lc-backlink">
        <Link href="/employee/lifecycle">
          <ArrowLeft size={14} /> All opportunities
        </Link>
      </p>
    </div>
  );
}
