/**
 * AI Insights — what the model said about this deal, and whether anyone agreed.
 *
 * MODULE_ID: client_lifecycle
 *
 * Read-only by design. The Human Authority Rule means nothing on this screen
 * may apply itself to the record; accepting a triage score happens at Sales
 * Review, where a person presses the button.
 *
 * Error boundary: inherited from app/employee/error.tsx.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Brain, Gauge } from "lucide-react";
import { getLifecycleAccess } from "@/lib/lifecycle/access";
import { loadLeadContext, scoreBand } from "@/lib/lifecycle/lead-context";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { LifecycleFacts, LifecyclePanel, LifecycleRecordTabs } from "@/components/lifecycle/LifecycleFurniture";
import type { OpportunityRow } from "@/lib/lifecycle/types";
import { opportunitySelect } from "@/lib/lifecycle/types";

export const metadata: Metadata = { title: "AI Insights" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function LifecycleInsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const { supabase, canRead } = await getLifecycleAccess();
  if (!supabase) return <section className="portal-card empty-state">Supabase is not configured yet.</section>;
  if (!canRead) {
    return <section className="portal-card empty-state">The Client Lifecycle is not visible for this account.</section>;
  }

  const { data: row, error } = await supabase.from("opportunities").select(opportunitySelect).eq("id", id).maybeSingle();
  if (error && isMissingSchemaRelationError(error)) {
    return (
      <section className="portal-card empty-state">
        The Client Lifecycle is not set up in Supabase yet. Apply the latest database migrations and try again.
      </section>
    );
  }
  if (error) throw new Error(error.message ?? "Could not read this opportunity.");
  if (!row) notFound();

  const opportunity = row as OpportunityRow;
  const lead = await loadLeadContext(supabase, opportunity.demo_request_id);
  const triage = lead.triage;

  // The record is the authority on whether a score was APPLIED — the triage
  // row only says what a person decided about the suggestion.
  const applied = opportunity.ai_score !== null;
  const band = scoreBand(opportunity.ai_score);

  return (
    <div className="lc-shell">
      <header className="lc-head">
        <div className="lc-head-id">
          <p className="lc-kicker">Client Lifecycle — AI Insights</p>
          <h1>{opportunity.name}</h1>
          <p className="lc-sub">What the model said, and what a person did about it.</p>
        </div>
      </header>

      <LifecycleRecordTabs active="ai" clientId={opportunity.client_id} opportunityId={opportunity.id} />

      <div className="lc-grid">
        <LifecyclePanel
          aside={
            applied ? (
              <span className={`lc-pill lc-pill-${band === "high" ? "good" : band === "low" ? "warn" : "neutral"}`}>
                Applied
              </span>
            ) : (
              <span className="lc-pill lc-pill-warn">Not applied</span>
            )
          }
          title="Score on this deal"
        >
          {applied ? (
            <LifecycleFacts
              rows={[
                { label: "AI score", value: `${opportunity.ai_score} / 100` },
                { label: "Confidence", value: opportunity.ai_confidence ?? "unknown" },
                { label: "Applied on", value: formatDate(opportunity.ai_scored_at) },
              ]}
            />
          ) : (
            <p className="lc-empty">
              <Gauge aria-hidden="true" size={14} /> No score has been applied to this deal. A score reaches the record
              in exactly one place — when somebody accepts it at Sales Review.
            </p>
          )}
        </LifecyclePanel>

        <LifecyclePanel
          aside={triage ? <span className="lc-pill lc-pill-neutral">{triage.status}</span> : null}
          title="The model's suggestion"
        >
          {lead.triageUnavailable ? (
            <p className="lc-empty">
              AI triage is not set up in Supabase yet, so nothing could be read — this is not the same as the lead being
              unscored.
            </p>
          ) : triage ? (
            <LifecycleFacts
              rows={[
                { label: "Suggested score", value: `${triage.priority_score} / 100` },
                { label: "Confidence", value: triage.confidence },
                { label: "Rank", value: `#${triage.priority_rank}` },
                { label: "Segment", value: triage.segment || "—" },
                { label: "Decision", value: triage.status },
                { label: "Decided", value: formatDate(triage.acted_at) },
              ]}
            />
          ) : (
            <p className="lc-empty">
              <Brain aria-hidden="true" size={14} />{" "}
              {opportunity.demo_request_id
                ? "This lead has not been triaged yet."
                : "This opportunity was opened by hand, so there is no inbound lead to triage."}
            </p>
          )}
        </LifecyclePanel>

        {triage?.next_step || triage?.rationale ? (
          <LifecyclePanel title="Reasoning" wide>
            {triage.next_step ? (
              <>
                <h3 className="lc-subhead">Suggested next step</h3>
                <p className="lc-body">{triage.next_step}</p>
              </>
            ) : null}
            {triage.rationale ? (
              <>
                <h3 className="lc-subhead">Why</h3>
                <p className="lc-body">{triage.rationale}</p>
              </>
            ) : null}
            <p className="lc-meta">
              Advisory. Nothing here is applied to the record until a person acts on it.
            </p>
          </LifecyclePanel>
        ) : null}

        {opportunity.ai_recommendation ? (
          <LifecyclePanel title="Recommendation on the record" wide>
            <p className="lc-body">{opportunity.ai_recommendation}</p>
          </LifecyclePanel>
        ) : null}
      </div>

      <p className="lc-backlink">
        <Link href={`/employee/lifecycle/${opportunity.id}`}>
          <ArrowLeft size={14} /> Back to the record
        </Link>
      </p>
    </div>
  );
}
