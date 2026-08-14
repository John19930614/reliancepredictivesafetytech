// The bespoke panels for steps 1–3: Lead Captured, AI Triage & Score, and
// Sales Review.
//
// Server-safe and presentational — the page loads the data, these render it.
// All three run on machinery that already exists in the platform:
// demo_requests is the public intake, and lead_triage_runs/lead_triage_results
// is the nightly scoring job that goes through validateAIOutput(). Nothing here
// is a second copy of that; it is the same records, shown as lifecycle steps.
//
// Steps 4–11 fall back to the generic step content until their own panels are
// built, so the lifecycle is walkable end to end rather than eight blank pages.

import { AlertTriangle, Inbox, ScanSearch, UserCheck } from "lucide-react";
import type { LeadContext } from "@/lib/lifecycle/lead-context";
import { scoreBand } from "@/lib/lifecycle/lead-context";
import type { OpportunityRow } from "@/lib/lifecycle/types";
import {
  discoveryItems,
  discoveryProgress,
  qualificationState,
  suggestedProbability,
  type QualificationRow,
} from "@/lib/lifecycle/qualification";
import { TriageDecision } from "@/components/lifecycle/TriageDecision";
import { OwnerAssignment, type OwnerChoice } from "@/components/lifecycle/OwnerAssignment";
import { QualificationForm, type QualificationDraft } from "@/components/lifecycle/QualificationForm";
import { LifecycleFacts, LifecyclePanel } from "@/components/lifecycle/LifecycleFurniture";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const bandTone: Record<string, string> = { high: "good", medium: "warn", low: "bad" };

/** Shown on every step 1–3 screen when the opportunity has no lead behind it. */
function NoLead({ what }: { what: string }) {
  return (
    <LifecyclePanel title={what}>
      <p className="lc-empty">
        <Inbox aria-hidden="true" size={14} /> This opportunity was opened by hand, so there is no inbound lead behind
        it. {what} applies to leads that arrived through the website, a referral, an event or email.
      </p>
    </LifecyclePanel>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 1 — Lead Captured                                                     */
/* -------------------------------------------------------------------------- */

export function LeadCapturedPanels({ context }: { context: LeadContext }) {
  const { lead, triage } = context;

  if (!lead) return <NoLead what="Lead details" />;

  const products = Array.isArray(lead.interested_products) ? lead.interested_products.filter(Boolean) : [];

  return (
    <>
      <LifecyclePanel
        aside={<span className="lc-pill lc-pill-neutral">{lead.status}</span>}
        title="Lead Details"
      >
        <LifecycleFacts
          rows={[
            { label: "Company", value: lead.company || "—" },
            { label: "Contact", value: lead.name },
            { label: "Title", value: lead.role || "—" },
            { label: "Email", value: lead.email },
            { label: "Phone", value: lead.phone || "—" },
            { label: "Industry", value: lead.company_type || "—" },
            { label: "Captured", value: formatDate(lead.created_at) },
          ]}
        />
      </LifecyclePanel>

      <LifecyclePanel
        aside={
          triage ? (
            <span className="lc-pill lc-pill-good">Scored</span>
          ) : (
            <span className="lc-pill lc-pill-warn">Scoring pending</span>
          )
        }
        title="AI Pre-Screen / Intake Status"
      >
        {triage ? (
          <p className="lc-body">
            The nightly triage job has scored this lead. Its opinion is on the AI Triage &amp; Score step, and reaches
            this opportunity only once a person accepts it at Sales Review.
          </p>
        ) : (
          <p className="lc-body">
            This lead is waiting on AI scoring and enrichment. The triage job runs daily and writes to its own record —
            it never edits a lead or an opportunity directly.
          </p>
        )}
        {products.length > 0 ? (
          <p className="lc-meta">Interested in: {products.join(", ")}</p>
        ) : null}
      </LifecyclePanel>

      {lead.message ? (
        <LifecyclePanel title="What they asked for">
          <p className="lc-body">{lead.message}</p>
        </LifecyclePanel>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 2 — AI Triage & Score                                                 */
/* -------------------------------------------------------------------------- */

export function AiTriagePanels({ context }: { context: LeadContext }) {
  const { lead, triage, triageUnavailable } = context;

  if (triageUnavailable) {
    return (
      <LifecyclePanel title="AI Triage &amp; Score">
        <p className="lc-empty">
          <AlertTriangle aria-hidden="true" size={14} /> Lead triage is not set up in Supabase yet. Apply the latest
          database migrations and try again.
        </p>
      </LifecyclePanel>
    );
  }

  if (!lead) return <NoLead what="AI triage" />;

  if (!triage) {
    return (
      <LifecyclePanel aside={<span className="lc-pill lc-pill-warn">Not scored</span>} title="AI Triage &amp; Score">
        <p className="lc-empty">
          <ScanSearch aria-hidden="true" size={14} /> The triage job has not scored this lead yet. It runs daily and
          picks up leads from the last 60 days.
        </p>
      </LifecyclePanel>
    );
  }

  const band = scoreBand(triage.priority_score);

  return (
    <>
      <LifecyclePanel
        aside={<span className={`lc-pill lc-pill-${band ? bandTone[band] : "neutral"}`}>{band ?? "unscored"} fit</span>}
        title="AI Score"
      >
        <LifecycleFacts
          rows={[
            { label: "Score", value: `${triage.priority_score} / 100` },
            { label: "Confidence", value: triage.confidence },
            { label: "Priority rank", value: `#${triage.priority_rank}` },
            { label: "Segment", value: triage.segment || "—" },
            { label: "Scored", value: formatDate(triage.created_at) },
          ]}
        />
      </LifecyclePanel>

      <LifecyclePanel title="Recommended Next Action">
        <p className="lc-body">{triage.next_step}</p>
        {triage.rationale ? <p className="lc-meta">{triage.rationale}</p> : null}
      </LifecyclePanel>

      <LifecyclePanel
        aside={
          triage.human_review_required ? (
            <span className="lc-pill lc-pill-warn">Review required</span>
          ) : (
            <span className="lc-pill lc-pill-neutral">Routine</span>
          )
        }
        title="Human Authority"
      >
        <p className="lc-body">
          {/* Stating this on the screen, not just in the code, because it is the
              rule an operator has to be able to rely on. */}
          Nothing on this step has been written to the opportunity. The model&apos;s output is advisory until a person
          accepts it at Sales Review — that is where the score reaches the deal record.
        </p>
        <p className="lc-meta">
          Current decision: {triage.status}
          {triage.acted_at ? ` on ${formatDate(triage.acted_at)}` : ""}
        </p>
      </LifecyclePanel>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 3 — Sales Review                                                      */
/* -------------------------------------------------------------------------- */

export function SalesReviewPanels({
  context,
  opportunity,
  canManage,
}: {
  context: LeadContext;
  opportunity: OpportunityRow;
  canManage: boolean;
}) {
  const { lead, triage } = context;

  if (!lead || !triage) {
    return (
      <LifecyclePanel title="Sales Review">
        <p className="lc-empty">
          <UserCheck aria-hidden="true" size={14} />{" "}
          {lead
            ? "This lead has not been triaged, so there is no AI opinion to review. Decide on it from the lead details and move on."
            : "This opportunity was opened by hand, so there is no AI triage to review."}
        </p>
      </LifecyclePanel>
    );
  }

  const band = scoreBand(triage.priority_score);
  const applied = opportunity.ai_score !== null;

  return (
    <>
      <LifecyclePanel
        aside={<span className={`lc-pill lc-pill-${band ? bandTone[band] : "neutral"}`}>{triage.priority_score}</span>}
        title="AI Recommendation Summary"
      >
        <LifecycleFacts
          rows={[
            { label: "Segment", value: triage.segment || "—" },
            { label: "Confidence", value: triage.confidence },
            { label: "Recommended", value: triage.next_step },
          ]}
        />
        {triage.rationale ? <p className="lc-meta">{triage.rationale}</p> : null}
      </LifecyclePanel>

      <LifecyclePanel
        aside={
          applied ? (
            <span className="lc-pill lc-pill-good">Applied</span>
          ) : (
            <span className="lc-pill lc-pill-warn">Not applied</span>
          )
        }
        title="Score on the Opportunity"
      >
        {applied ? (
          <LifecycleFacts
            rows={[
              { label: "AI score", value: `${opportunity.ai_score} / 100` },
              { label: "Confidence", value: opportunity.ai_confidence || "—" },
              { label: "Applied", value: formatDate(opportunity.ai_scored_at) },
            ]}
          />
        ) : (
          <p className="lc-body">
            The opportunity is unscored. Accepting the suggestion below carries the model&apos;s score onto it;
            dismissing leaves it unscored, which is the honest state when nobody has agreed with the model.
          </p>
        )}
      </LifecyclePanel>

      <LifecyclePanel title="Review Decision">
        <TriageDecision
          canManage={canManage}
          humanReviewRequired={triage.human_review_required}
          opportunityId={opportunity.id}
          triageStatus={triage.status}
        />
      </LifecyclePanel>

      <LifecyclePanel title="Lead Summary">
        <LifecycleFacts
          rows={[
            { label: "Company", value: lead.company || "—" },
            { label: "Contact", value: lead.name },
            { label: "Title", value: lead.role || "—" },
            { label: "Industry", value: lead.company_type || "—" },
            { label: "Lead age", value: `${Math.max(0, Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86_400_000))} days` },
          ]}
        />
      </LifecyclePanel>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 4 — Assign Owner                                                      */
/* -------------------------------------------------------------------------- */

export function AssignOwnerPanels({
  opportunity,
  owners,
  currentOwner,
  rosterUnavailable,
  canManage,
}: {
  opportunity: OpportunityRow;
  owners: OwnerChoice[];
  currentOwner: OwnerChoice | null;
  rosterUnavailable: boolean;
  canManage: boolean;
}) {
  return (
    <>
      <LifecyclePanel
        aside={
          currentOwner ? (
            <span className="lc-pill lc-pill-good">Assigned</span>
          ) : (
            <span className="lc-pill lc-pill-warn">Unassigned</span>
          )
        }
        title="Accountable Owner"
      >
        {currentOwner ? (
          <LifecycleFacts
            rows={[
              { label: "Owner", value: currentOwner.name },
              { label: "Email", value: currentOwner.email || "—" },
              { label: "Open deals", value: String(currentOwner.openDeals) },
              { label: "Assigned", value: formatDate(opportunity.assigned_at) },
            ]}
          />
        ) : (
          <p className="lc-body">
            Nobody answers for this deal yet. One name, not a team — ownership is what turns a step into an outcome, and
            the SLA clock does not start until it is set.
          </p>
        )}

        <OwnerAssignment
          canManage={canManage}
          currentOwnerId={opportunity.owner_user_id}
          opportunityId={opportunity.id}
          owners={owners}
          rosterUnavailable={rosterUnavailable}
        />
      </LifecyclePanel>

      {owners.length > 0 ? (
        <LifecyclePanel
          aside={<span className="lc-pill lc-pill-neutral">{owners.length} eligible</span>}
          title="Owner Capacity"
        >
          {/* Lightest load first — the order is the routing suggestion. */}
          <ul className="lc-capacity">
            {owners.slice(0, 8).map((owner) => (
              <li className="lc-capacity-row" key={owner.userId}>
                <span className="lc-capacity-name">
                  {owner.name}
                  {owner.userId === opportunity.owner_user_id ? " · owner" : ""}
                </span>
                <span className="lc-capacity-meta">
                  {owner.openDeals} open
                  {owner.openValue > 0
                    ? ` · ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(owner.openValue)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </LifecyclePanel>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Steps 5 & 6 — Discovery and Qualification                                  */
/* -------------------------------------------------------------------------- */

export function DiscoveryPanels({
  opportunity,
  qualification,
  canManage,
}: {
  opportunity: OpportunityRow;
  qualification: QualificationRow | null;
  canManage: boolean;
}) {
  const items = discoveryItems(qualification);
  const progress = discoveryProgress(qualification);

  return (
    <>
      <LifecyclePanel
        aside={
          <span className={`lc-pill lc-pill-${progress.captured === progress.total ? "good" : "warn"}`}>
            {progress.captured} of {progress.total}
          </span>
        }
        title="Discovery Checklist"
      >
        <ul className="lc-list">
          {items.map((item) => (
            <li key={item.label} style={item.captured ? undefined : { opacity: 0.62 }}>
              {item.captured ? "✓" : "○"} {item.label}
            </li>
          ))}
        </ul>
      </LifecyclePanel>

      <LifecyclePanel title="Discovery Notes" wide>
        <QualificationForm
          alreadyQualified={Boolean(qualification?.qualified_at)}
          canManage={canManage}
          initial={toDraft(qualification)}
          mode="discovery"
          opportunityId={opportunity.id}
          suggested={suggestedProbability(qualificationState(qualification).met)}
        />
      </LifecyclePanel>
    </>
  );
}

export function QualifiedPanels({
  opportunity,
  qualification,
  canManage,
}: {
  opportunity: OpportunityRow;
  qualification: QualificationRow | null;
  canManage: boolean;
}) {
  const state = qualificationState(qualification);

  return (
    <>
      <LifecyclePanel
        aside={
          <span className={`lc-pill lc-pill-${state.complete ? "good" : "warn"}`}>
            {state.met} of {state.total}
          </span>
        }
        title="Qualification (BANT)"
        wide
      >
        <QualificationForm
          alreadyQualified={state.qualified}
          canManage={canManage}
          initial={toDraft(qualification)}
          mode="qualify"
          opportunityId={opportunity.id}
          suggested={suggestedProbability(state.met)}
        />
      </LifecyclePanel>

      <LifecyclePanel title="What Discovery found">
        {qualification ? (
          <LifecycleFacts
            rows={[
              { label: "Primary need", value: qualification.primary_need || "—" },
              { label: "Decision makers", value: qualification.decision_makers || "—" },
              { label: "Budget", value: qualification.budget_range || "—" },
              { label: "Timeline", value: qualification.timeline || "—" },
            ]}
          />
        ) : (
          <p className="lc-empty">Nothing was recorded at Discovery. Go back a step before judging this one.</p>
        )}
      </LifecyclePanel>

      <LifecyclePanel title="Probability">
        <LifecycleFacts
          rows={[
            { label: "Current", value: `${opportunity.probability}%` },
            { label: "Suggested", value: `${suggestedProbability(state.met)}%` },
          ]}
        />
        <p className="lc-meta">
          The suggestion is advisory. Probability drives the weighted pipeline number, so it only moves when someone
          decides it should.
        </p>
      </LifecyclePanel>
    </>
  );
}

/** Maps a stored row onto the form's draft shape. */
function toDraft(row: QualificationRow | null): QualificationDraft {
  return {
    discoveryCallAt: row?.discovery_call_at ? row.discovery_call_at.slice(0, 10) : "",
    primaryNeed: row?.primary_need ?? "",
    painPoints: row?.pain_points ?? "",
    decisionMakers: row?.decision_makers ?? "",
    budgetRange: row?.budget_range ?? "",
    timeline: row?.timeline ?? "",
    competition: row?.competition ?? "",
    hasBudget: row?.has_budget ?? false,
    hasAuthority: row?.has_authority ?? false,
    hasNeed: row?.has_need ?? false,
    hasTimeline: row?.has_timeline ?? false,
  };
}
