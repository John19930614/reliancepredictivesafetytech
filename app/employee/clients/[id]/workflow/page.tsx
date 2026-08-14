/**
 * The client workflow — one company's journey from lead to active account,
 * drawn as a numbered rail with a single current step.
 *
 * MODULE_ID: active_companies (this route sits under /employee/clients, which
 *   the active_companies catalog entry already covers by prefix — no separate
 *   entry, exactly as /employee/clients/[id] has none.)
 *
 * An async SERVER component. Every read happens here; the only client code is
 * the step card, the billing panel, and their actions (CLAUDE.md: no
 * client-side data mutation, no client-side Supabase reads).
 *
 * WHY THIS PAGE EXISTS. The sales board shows twelve columns of cards and lets
 * any card be dropped in any column. That answers "where is everything" but
 * never "what happens next to this company", and it enforced nothing — a client
 * could reach Active Company with no signed contract and no invoice. This page
 * is the per-client view of the same data: what has been cleared, what step is
 * live, what is outstanding on it, and the one action that moves it on.
 *
 * Error boundary: inherited from app/employee/error.tsx.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Building2, History } from "lucide-react";
import { lifecycleStages } from "@/lib/company-data";
import { getPipelineAccess } from "@/lib/pipeline/access";
import { loadClientWorkflowFacts } from "@/lib/pipeline/facts";
import { evaluateStageGate } from "@/lib/pipeline/gates";
import { stageCount, stageDetail, stageNumber, stagePosition } from "@/lib/pipeline/stages";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import { isGeneratorState } from "@/lib/proposals/generator-state";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { StageRail } from "@/components/pipeline/StageRail";
import { CurrentStepCard } from "@/components/pipeline/CurrentStepCard";
import { InvoicePanel, type InvoiceableProposal } from "@/components/pipeline/InvoicePanel";

export const metadata: Metadata = {
  title: "Client Workflow",
  description:
    "One client's journey from lead to active account: what has been cleared, what step is live, and what has to be true before it moves on.",
};

/** Bounded so a long-running account cannot turn the history into a wall. */
const historyLimit = 12;

interface PageProps {
  params: Promise<{ id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TransitionRow {
  id: string;
  from_stage: string | null;
  to_stage: string;
  was_override: boolean;
  override_reason: string | null;
  changed_at: string;
}

function formatMoment(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Whole days since a timestamp, or null when it is missing or unparseable. */
function daysSince(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86_400_000));
}

export default async function ClientWorkflowPage({ params }: PageProps) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase, canRead, canAdvance, canOverride, canDraftInvoice, canSettleInvoice } =
    await getPipelineAccess();

  if (!supabase) {
    return <section className="portal-card empty-state">Supabase is not configured yet.</section>;
  }
  if (!canRead) {
    return <section className="portal-card empty-state">The client workflow is not visible for this account.</section>;
  }

  // stage_changed_at is new in the same migration as client_invoices. Selecting
  // a column that does not exist makes PostgREST return 42703 with data: null,
  // which would render as notFound() — reporting the client as nonexistent and
  // taking the whole page down, rather than the graceful degradation the rest of
  // this route is built for. Fall back to the pre-migration column set instead.
  const baseColumns = "id, name, lifecycle_stage, status, owner, company_type, updated_at";
  const full = await supabase
    .from("company_clients")
    .select(`${baseColumns}, stage_changed_at`)
    .eq("id", id)
    .maybeSingle();

  const { data: client } = full.error
    ? await supabase.from("company_clients").select(baseColumns).eq("id", id).maybeSingle()
    : full;

  if (!client) notFound();

  const [{ facts, invoices, invoicesUnavailable }, proposalResult, historyResult] = await Promise.all([
    loadClientWorkflowFacts(supabase, client),
    supabase
      .from("client_proposals")
      .select("id, title, proposal_number, status, form_data, accepted_revision_id")
      .eq("client_id", id)
      .eq("status", "accepted")
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("client_stage_transitions")
      .select("id, from_stage, to_stage, was_override, override_reason, changed_at")
      .eq("client_id", id)
      .order("changed_at", { ascending: false })
      .limit(historyLimit),
  ]);

  const gate = evaluateStageGate(facts);
  const detail = stageDetail(client.lifecycle_stage);
  const number = stageNumber(client.lifecycle_stage);

  const rail = lifecycleStages.map((stage, index) => ({
    name: stage,
    number: index + 1,
    position: stagePosition(stage, client.lifecycle_stage),
  }));

  // Accepted proposals, priced, so the billing panel can tell the operator up
  // front whether a deposit invoice is even available on this contract.
  const acceptedProposals: InvoiceableProposal[] = (
    Array.isArray(proposalResult?.data) ? proposalResult.data : []
  ).map((proposal: Record<string, unknown>) => {
    const state = proposal.form_data;
    const totals = isGeneratorState(state) ? computeProposalTotals(state) : null;
    const reference = [proposal.proposal_number, proposal.title].filter(Boolean).join(" — ");
    return {
      id: String(proposal.id),
      label: reference || "Accepted proposal",
      hasDeposit: Boolean(totals && totals.deposit > 0),
    };
  });

  // A missing table here is tolerated the same way the invoice read is: the
  // migration may legitimately not have reached this environment yet.
  const history: TransitionRow[] =
    historyResult?.error && isMissingSchemaRelationError(historyResult.error)
      ? []
      : Array.isArray(historyResult?.data)
        ? (historyResult.data as TransitionRow[])
        : [];

  // Null on rows that predate the column, and on the pre-migration fallback
  // above — updated_at is the closest honest answer in both cases.
  const held = daysSince(
    (client as { stage_changed_at?: string | null }).stage_changed_at ?? client.updated_at,
  );

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Client Workflow</div>
          <h1>{client.name}</h1>
          <p>
            {client.company_type || "Company account"} · {client.owner || "Unassigned"}
            {held !== null ? ` · ${held} day${held === 1 ? "" : "s"} on this step` : ""}
          </p>
        </div>
        <div className="wf-topline-actions">
          <Link className="button button-neutral button-sm" href={`/employee/clients/${id}`}>
            <Building2 size={14} /> Full record
          </Link>
          <Link className="button button-neutral button-sm" href="/employee/sales">
            <ArrowLeft size={14} /> Pipeline board
          </Link>
        </div>
      </div>

      <StageRail stages={rail} />

      <div className="wf-layout">
        <CurrentStepCard
          advanceLabel={detail?.advanceLabel ?? ""}
          canAdvance={canAdvance}
          canOverride={canOverride}
          clientId={id}
          clientName={client.name}
          gateOpen={gate.canAdvance}
          headline={detail?.headline ?? `On ${client.lifecycle_stage}`}
          body={
            detail?.body ??
            "This client is on a stage that is not part of the journey. Set a valid stage on the client record to put them back on the rail."
          }
          lane={detail?.lane ?? "Off-journey"}
          nextStage={gate.nextStage}
          requirements={gate.requirements}
          stage={client.lifecycle_stage}
          stageCount={stageCount}
          stageNumber={number}
          terminalReason={gate.terminalReason}
        />

        <div className="wf-side">
          <InvoicePanel
            canDraftInvoice={canDraftInvoice}
            canSettleInvoice={canSettleInvoice}
            clientId={id}
            invoices={invoices}
            proposals={acceptedProposals}
            unavailable={invoicesUnavailable}
          />

          <section className="wf-panel">
            <h3 className="wf-panel-title">
              <History aria-hidden="true" size={16} /> Stage history
            </h3>
            {history.length === 0 ? (
              <p className="platform-empty">No stage moves recorded yet.</p>
            ) : (
              <ol className="wf-history">
                {history.map((row) => (
                  <li className={`wf-history-row${row.was_override ? " wf-history-row-override" : ""}`} key={row.id}>
                    <strong>
                      {row.from_stage ? `${row.from_stage} → ` : ""}
                      {row.to_stage}
                    </strong>
                    <span className="wf-history-meta">
                      {formatMoment(row.changed_at)}
                      {row.was_override ? " · moved past unfinished steps" : ""}
                    </span>
                    {row.override_reason ? <p className="wf-history-reason">{row.override_reason}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
