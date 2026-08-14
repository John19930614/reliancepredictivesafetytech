/**
 * Competitors — who else is in this deal, and who we lost to.
 *
 * MODULE_ID: client_lifecycle
 *
 * There is no competitors TABLE, and this page deliberately does not add one.
 * The platform already records competitive position in two places that are
 * filled in as a matter of course: the competition note captured at Discovery
 * (opportunity_qualification.competition) and the competitor named on a Closed
 * Lost exit (opportunities.exit_competitor). "Who did we lose to" is the single
 * most useful thing a lost deal has left to give, and it is already answerable.
 *
 * Error boundary: inherited from app/employee/error.tsx.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Swords } from "lucide-react";
import { getLifecycleAccess } from "@/lib/lifecycle/access";
import { lifecycleExit } from "@/lib/lifecycle/exits";
import { lifecycleStep } from "@/lib/lifecycle/steps";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { LifecycleFacts, LifecyclePanel, LifecycleRecordTabs } from "@/components/lifecycle/LifecycleFurniture";
import { opportunitySelect, type OpportunityRow } from "@/lib/lifecycle/types";

export const metadata: Metadata = { title: "Competitors" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LifecycleCompetitorsPage({ params }: { params: Promise<{ id: string }> }) {
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

  const { data: qualification, error: qualError } = await supabase
    .from("opportunity_qualification")
    .select("competition, decision_makers, updated_at")
    .eq("opportunity_id", id)
    .maybeSingle();

  // A failed read must not render as "no competitors noted" — that is a claim
  // about the deal, not about the query.
  if (qualError && !isMissingSchemaRelationError(qualError)) {
    throw new Error(qualError.message ?? "Could not read the qualification record.");
  }

  const competition = (qualification?.competition ?? null) as string | null;
  const lost = opportunity.status === "closed_lost";
  const exit = lifecycleExit(opportunity.status);

  return (
    <div className="lc-shell">
      <header className="lc-head">
        <div className="lc-head-id">
          <p className="lc-kicker">Client Lifecycle — Competitors</p>
          <h1>{opportunity.name}</h1>
          <p className="lc-sub">Who else is in this deal, and who it went to.</p>
        </div>
      </header>

      <LifecycleRecordTabs active="competitors" clientId={opportunity.client_id} opportunityId={opportunity.id} />

      <div className="lc-grid">
        <LifecyclePanel
          aside={competition ? <span className="lc-pill lc-pill-warn">Contested</span> : null}
          title="Competitive position"
        >
          {competition ? (
            <p className="lc-body">{competition}</p>
          ) : (
            <p className="lc-empty">
              <Swords aria-hidden="true" size={14} /> Nothing recorded. This is captured at Discovery — the
              &ldquo;Competition&rdquo; field on the qualification form.
            </p>
          )}
          <p className="lc-meta">
            <Link href={`/employee/lifecycle/${opportunity.id}`}>Edit it on the Discovery step</Link>
          </p>
        </LifecyclePanel>

        {lost ? (
          <LifecyclePanel aside={<span className="lc-pill lc-pill-bad">{exit?.label ?? "Closed Lost"}</span>} title="Lost to">
            <LifecycleFacts
              rows={[
                { label: "Competitor", value: opportunity.exit_competitor || "Not named" },
                { label: "Lost at", value: lifecycleStep(opportunity.step)?.label ?? opportunity.step },
                { label: "Reason", value: opportunity.exit_reason || "—" },
              ]}
            />
          </LifecyclePanel>
        ) : (
          <LifecyclePanel title="Outcome">
            <p className="lc-body">
              This deal is still live. If it is ever lost, the Closed Lost exit asks who it went to — which is what makes
              lost-deal reporting worth reading.
            </p>
          </LifecyclePanel>
        )}

        {qualification?.decision_makers ? (
          <LifecyclePanel title="Who decides" wide>
            <p className="lc-body">{qualification.decision_makers as string}</p>
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
