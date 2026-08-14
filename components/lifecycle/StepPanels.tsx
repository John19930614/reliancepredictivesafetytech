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

import Link from "next/link";
import {
  AlertTriangle,
  FileSearch,
  Handshake,
  Inbox,
  ListChecks,
  PenLine,
  Receipt,
  ScanSearch,
  Scale,
  UserCheck,
} from "lucide-react";
import {
  acceptedProposal,
  billedInvoices,
  leadProposal,
  openLegalIssues,
  signatureState,
  type DealContext,
  type DealProposal,
} from "@/lib/lifecycle/deal-context";
import {
  handoffState,
  issuedInvoices,
  onboardingProgress,
  outstandingItems,
  postWinItems,
  type OnboardingContext,
} from "@/lib/lifecycle/onboarding-context";
import { CloseWonAction } from "@/components/lifecycle/CloseWonAction";
import { ProposalLink } from "@/components/lifecycle/ProposalLink";
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

/* -------------------------------------------------------------------------- */
/* Steps 7-10 — the proposal, the review, the paperwork, the money            */
/* -------------------------------------------------------------------------- */

function money(amount: number | null, currency = "USD"): string {
  if (amount === null || !Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

const proposalTone: Record<string, string> = {
  draft: "neutral",
  in_review: "warn",
  sent: "warn",
  accepted: "good",
  declined: "bad",
  archived: "neutral",
};

function proposalLabel(proposal: DealProposal): string {
  return [proposal.proposal_number, proposal.title].filter(Boolean).join(" — ") || "Proposal";
}

/** Step 7 — Solution & Proposal. */
export function SolutionProposalPanels({
  opportunity,
  deal,
  clients,
  canManage,
}: {
  opportunity: OpportunityRow;
  deal: DealContext;
  clients: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  if (deal.linkUnavailable) {
    return (
      <LifecyclePanel title="Solution &amp; Proposal">
        <p className="lc-empty">
          <AlertTriangle aria-hidden="true" size={14} /> Proposal linking is not set up in Supabase yet. Apply the
          latest database migrations and try again.
        </p>
      </LifecyclePanel>
    );
  }

  const lead = leadProposal(deal.proposals);

  return (
    <>
      <LifecyclePanel
        aside={
          deal.proposals.length > 0 ? (
            <span className="lc-pill lc-pill-good">{deal.proposals.length} linked</span>
          ) : (
            <span className="lc-pill lc-pill-warn">None yet</span>
          )
        }
        title="Proposal for this deal"
      >
        <ProposalLink
          canManage={canManage}
          clientId={opportunity.client_id}
          clients={clients}
          linkable={deal.linkable.map((proposal) => ({ id: proposal.id, label: proposalLabel(proposal) }))}
          linked={deal.proposals.map((proposal) => ({ id: proposal.id, label: proposalLabel(proposal) }))}
          opportunityId={opportunity.id}
        />
      </LifecyclePanel>

      {lead ? (
        <LifecyclePanel
          aside={<span className={`lc-pill lc-pill-${proposalTone[lead.status] ?? "neutral"}`}>{lead.status}</span>}
          title="Pricing"
        >
          <LifecycleFacts
            rows={[
              { label: "Proposal", value: proposalLabel(lead) },
              { label: "Value", value: money(lead.proposal_value) },
              { label: "Revision", value: `v${lead.current_revision}` },
              { label: "Valid until", value: lead.valid_until ? formatDate(lead.valid_until) : "—" },
            ]}
          />
          {/* The deal record and the document can disagree; saying so beats
              silently showing two numbers on two screens. */}
          {lead.proposal_value !== null && Number(lead.proposal_value) !== Number(opportunity.value) ? (
            <p className="lc-meta">
              The opportunity is recorded at {money(opportunity.value, opportunity.currency)}, which does not match the
              proposal. Update whichever is stale.
            </p>
          ) : null}
        </LifecyclePanel>
      ) : null}
    </>
  );
}

/** Step 8 — Proposal Review. */
export function ProposalReviewPanels({ deal }: { deal: DealContext }) {
  const lead = leadProposal(deal.proposals);

  if (!lead) {
    return (
      <LifecyclePanel title="Proposal Review">
        <p className="lc-empty">
          <FileSearch aria-hidden="true" size={14} /> No proposal is linked to this deal, so there is nothing to review.
          Link one on the Solution &amp; Proposal step.
        </p>
      </LifecyclePanel>
    );
  }

  const decisions = deal.approvals.filter((approval) => approval.proposal_id === lead.id);
  const links = deal.shareLinks.filter((link) => link.proposal_id === lead.id);
  const views = links.reduce((sum, link) => sum + (link.view_count ?? 0), 0);
  const lastViewed = links
    .map((link) => link.last_viewed_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <>
      <LifecyclePanel
        aside={<span className={`lc-pill lc-pill-${proposalTone[lead.status] ?? "neutral"}`}>{lead.status}</span>}
        title="Proposal Status"
      >
        <LifecycleFacts
          rows={[
            { label: "Proposal", value: proposalLabel(lead) },
            { label: "Revision", value: `v${lead.current_revision}` },
            { label: "Value", value: money(lead.proposal_value) },
            { label: "Accepted", value: lead.accepted_at ? formatDate(lead.accepted_at) : "—" },
            { label: "Declined", value: lead.declined_at ? formatDate(lead.declined_at) : "—" },
          ]}
        />
        {lead.decline_reason ? <p className="lc-meta">Reason given: {lead.decline_reason}</p> : null}
      </LifecyclePanel>

      <LifecyclePanel
        aside={
          views > 0 ? (
            <span className="lc-pill lc-pill-good">{views} views</span>
          ) : (
            <span className="lc-pill lc-pill-warn">Unopened</span>
          )
        }
        title="Client Engagement"
      >
        {links.length === 0 ? (
          <p className="lc-empty">No share link has been issued, so the client has not seen this document yet.</p>
        ) : (
          <LifecycleFacts
            rows={[
              { label: "Share links", value: String(links.length) },
              { label: "Total views", value: String(views) },
              { label: "Last opened", value: lastViewed ? formatDate(lastViewed) : "Never opened" },
              {
                label: "Live links",
                value: String(links.filter((link) => !link.revoked_at && new Date(link.expires_at) > new Date()).length),
              },
            ]}
          />
        )}
      </LifecyclePanel>

      <LifecyclePanel
        aside={<span className="lc-pill lc-pill-neutral">{decisions.length}</span>}
        title="Internal Approvals"
        wide
      >
        {decisions.length === 0 ? (
          <p className="lc-empty">
            No approval decision recorded. A proposal reaches the client only after an approver has reviewed the exact
            revision being sent — that gate lives in the Proposals module.
          </p>
        ) : (
          <ol className="lc-history">
            {decisions.map((decision) => (
              <li
                className={`lc-history-row lc-history-${decision.decision === "approved" ? "advance" : "skip"}`}
                key={decision.id}
              >
                <strong>
                  {decision.decision === "approved" ? "Approved" : "Changes requested"} · v{decision.revision_number}
                </strong>
                <span className="lc-history-meta">{formatDate(decision.decided_at)}</span>
                {decision.note ? <p className="lc-history-reason">{decision.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
        {decisions.length > 0 && decisions[0].revision_number !== lead.current_revision ? (
          <p className="lc-meta">
            The newest decision covers v{decisions[0].revision_number}, but the proposal is now on v
            {lead.current_revision}. It needs re-approving before it can be sent again.
          </p>
        ) : null}
      </LifecyclePanel>
    </>
  );
}

/** Step 9 — Negotiation / Approval. */
export function NegotiationPanels({ deal }: { deal: DealContext }) {
  const open = openLegalIssues(deal.legalIssues);
  const lead = leadProposal(deal.proposals);

  return (
    <>
      <LifecyclePanel
        aside={
          open.length > 0 ? (
            <span className="lc-pill lc-pill-warn">{open.length} open</span>
          ) : (
            <span className="lc-pill lc-pill-good">Clear</span>
          )
        }
        title="Legal / Security / Insurance"
      >
        {deal.legalIssues.length === 0 ? (
          <p className="lc-empty">
            <Scale aria-hidden="true" size={14} /> No legal issues are logged against this company.
          </p>
        ) : (
          <ul className="lc-capacity">
            {deal.legalIssues.slice(0, 8).map((issue) => (
              <li className="lc-capacity-row" key={issue.id}>
                <span className="lc-capacity-name">{issue.title}</span>
                <span className="lc-capacity-meta">
                  {issue.severity} · {issue.status}
                  {issue.due_date ? ` · due ${issue.due_date}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="lc-meta">
          <Link href="/employee/legal-issues">Open the legal register</Link>
        </p>
      </LifecyclePanel>

      <LifecyclePanel title="Terms on the table">
        {lead ? (
          <LifecycleFacts
            rows={[
              { label: "Proposal", value: proposalLabel(lead) },
              { label: "Value", value: money(lead.proposal_value) },
              { label: "Revision", value: `v${lead.current_revision}` },
              { label: "Valid until", value: lead.valid_until ? formatDate(lead.valid_until) : "—" },
            ]}
          />
        ) : (
          <p className="lc-empty">No proposal is linked, so there are no terms to negotiate yet.</p>
        )}
      </LifecyclePanel>
    </>
  );
}

/** Step 10 — Commit / Contract. */
export function CommitContractPanels({ opportunity, deal }: { opportunity: OpportunityRow; deal: DealContext }) {
  const signature = signatureState(deal.envelopes);
  const accepted = acceptedProposal(deal.proposals);
  const billed = billedInvoices(deal.invoices);

  return (
    <>
      <LifecyclePanel
        aside={
          signature.completed ? (
            <span className="lc-pill lc-pill-good">Signed</span>
          ) : signature.stalled ? (
            <span className="lc-pill lc-pill-bad">{signature.latest?.status}</span>
          ) : signature.sent ? (
            <span className="lc-pill lc-pill-warn">Out for signature</span>
          ) : (
            <span className="lc-pill lc-pill-neutral">Not sent</span>
          )
        }
        title="Signature"
      >
        {signature.latest ? (
          <LifecycleFacts
            rows={[
              { label: "Recipient", value: signature.latest.recipient_name || signature.latest.recipient_email || "—" },
              { label: "Sent", value: signature.latest.sent_at ? formatDate(signature.latest.sent_at) : "—" },
              { label: "Completed", value: signature.latest.completed_at ? formatDate(signature.latest.completed_at) : "—" },
              { label: "Signed copy", value: signature.latest.completed_file_id ? "Filed in File Center" : "—" },
            ]}
          />
        ) : accepted ? (
          <p className="lc-body">
            The client accepted this proposal on {formatDate(accepted.accepted_at)} through its share link. No DocuSign
            envelope was used, so acceptance itself is the record of commitment.
          </p>
        ) : (
          <p className="lc-empty">
            <PenLine aria-hidden="true" size={14} /> Nothing has gone out for signature yet.
          </p>
        )}
      </LifecyclePanel>

      <LifecyclePanel
        aside={
          billed.length > 0 ? (
            <span className="lc-pill lc-pill-good">{billed.length} issued</span>
          ) : (
            <span className="lc-pill lc-pill-warn">Not billed</span>
          )
        }
        title="Deposit / PO"
      >
        {deal.invoices.length === 0 ? (
          <p className="lc-empty">
            <Receipt aria-hidden="true" size={14} /> No invoice has been raised against this deal&apos;s proposal.
          </p>
        ) : (
          <ul className="lc-capacity">
            {deal.invoices.slice(0, 6).map((invoice) => (
              <li className="lc-capacity-row" key={invoice.id}>
                <span className="lc-capacity-name">
                  {invoice.invoice_number} · {invoice.kind}
                </span>
                <span className="lc-capacity-meta">
                  {invoice.status} · {money(invoice.total, invoice.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {opportunity.client_id ? (
          <p className="lc-meta">
            <Link href={`/employee/clients/${opportunity.client_id}/workflow`}>Raise or issue an invoice</Link>
          </p>
        ) : null}
      </LifecyclePanel>

      <LifecyclePanel title="Commitment">
        <LifecycleFacts
          rows={[
            { label: "Accepted proposal", value: accepted ? proposalLabel(accepted) : "—" },
            { label: "Accepted on", value: accepted?.accepted_at ? formatDate(accepted.accepted_at) : "—" },
            { label: "Contract value", value: money(accepted?.proposal_value ?? null) },
            { label: "Deal value", value: money(opportunity.value, opportunity.currency) },
          ]}
        />
      </LifecyclePanel>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Step 11 — the handoff                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Step 11 — Closed Won & Onboarded.
 *
 * A report on the client's own records, plus a door into the screen that runs
 * onboarding. The checklist, the gates and the invoicing all live at
 * /employee/clients/[id]/workflow already; a second copy here would give
 * onboarding two front doors whose gates disagree within a week.
 */
export function ClosedWonPanels({
  opportunity,
  onboarding,
  canAdvance,
}: {
  opportunity: OpportunityRow;
  onboarding: OnboardingContext;
  canAdvance: boolean;
}) {
  const state = handoffState(onboarding);
  const relevant = postWinItems(onboarding.items);
  const progress = onboardingProgress(relevant);
  const outstanding = outstandingItems(relevant);
  const issued = issuedInvoices(onboarding.invoices);
  const won = opportunity.status === "won";

  return (
    <>
      <LifecyclePanel
        aside={
          won ? <span className="lc-pill lc-pill-good">Won</span> : <span className="lc-pill lc-pill-warn">Not yet</span>
        }
        title="Close the deal"
      >
        <CloseWonAction
          canAdvance={canAdvance}
          clientId={opportunity.client_id}
          opportunityId={opportunity.id}
          won={won}
        />
      </LifecyclePanel>

      <LifecyclePanel
        aside={
          onboarding.client ? (
            <Link href={`/employee/clients/${onboarding.client.id}/workflow`}>Open the case view</Link>
          ) : null
        }
        title="Client record"
      >
        {onboarding.client ? (
          <LifecycleFacts
            rows={[
              {
                label: "Company",
                value: <Link href={`/employee/clients/${onboarding.client.id}`}>{onboarding.client.name}</Link>,
              },
              { label: "Board stage", value: onboarding.client.lifecycle_stage },
              { label: "Account status", value: onboarding.client.status },
              { label: "Owner", value: onboarding.client.owner || "Unassigned" },
            ]}
          />
        ) : (
          <p className="lc-empty">
            <Handshake aria-hidden="true" size={14} /> No company is attached to this deal, so there is nothing to
            onboard yet.
          </p>
        )}
        {onboarding.client && !state.handedOver ? (
          <p className="lc-meta">
            The company is still on {onboarding.client.lifecycle_stage}. Onboarding starts once it reaches Invoicing on
            its own board — that move happens in the case view, not here.
          </p>
        ) : null}
      </LifecyclePanel>

      <LifecyclePanel
        aside={
          progress.total > 0 ? (
            <span className={`lc-pill lc-pill-${state.onboarded ? "good" : "warn"}`}>
              {progress.done}/{progress.total}
            </span>
          ) : null
        }
        title="Onboarding checklist"
      >
        {progress.total === 0 ? (
          <p className="lc-empty">
            <ListChecks aria-hidden="true" size={14} /> No onboarding items exist for this company yet.
          </p>
        ) : (
          <>
            <p className="lc-body">
              {progress.percent}% complete across Invoicing, Onboarding, Pilot / Setup and Active Company.
            </p>
            {outstanding.length > 0 ? (
              <ul className="lc-capacity">
                {outstanding.slice(0, 8).map((item) => (
                  <li className="lc-capacity-row" key={item.id}>
                    <span className="lc-capacity-name">{item.title}</span>
                    <span className="lc-capacity-meta">
                      {item.lifecycle_stage}
                      {item.due_date ? ` · due ${item.due_date}` : ""}
                      {item.owner ? ` · ${item.owner}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lc-meta">Every post-win item is complete.</p>
            )}
            {outstanding.length > 8 ? (
              <p className="lc-meta">{outstanding.length - 8} more outstanding in the case view.</p>
            ) : null}
          </>
        )}
      </LifecyclePanel>

      <LifecyclePanel
        aside={
          issued.length > 0 ? (
            <span className="lc-pill lc-pill-good">{issued.length} issued</span>
          ) : (
            <span className="lc-pill lc-pill-warn">Not billed</span>
          )
        }
        title="First invoice"
      >
        {onboarding.invoices.length === 0 ? (
          <p className="lc-empty">
            <Receipt aria-hidden="true" size={14} /> Nothing has been raised for this company yet. Invoices are raised
            from the accepted proposal in the case view.
          </p>
        ) : (
          <ul className="lc-capacity">
            {onboarding.invoices.slice(0, 6).map((invoice) => (
              <li className="lc-capacity-row" key={invoice.id}>
                <span className="lc-capacity-name">
                  {invoice.invoice_number} · {invoice.kind}
                </span>
                <span className="lc-capacity-meta">
                  {invoice.status} · {money(invoice.total, invoice.currency)}
                  {invoice.due_date ? ` · due ${invoice.due_date}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </LifecyclePanel>

      <LifecyclePanel title="Handoff" wide>
        <LifecycleFacts
          rows={[
            { label: "Deal closed won", value: won ? "Yes" : "Not yet" },
            { label: "Client record created", value: state.hasClient ? "Yes" : "No company attached" },
            { label: "Handed to onboarding", value: state.handedOver ? "Yes" : "Still pre-Invoicing on the board" },
            { label: "Billed", value: state.billed ? "Yes" : "No invoice issued" },
            { label: "Onboarding complete", value: state.onboarded ? "Yes" : "Outstanding items remain" },
          ]}
        />
        <p className="lc-meta">
          Every line is read from the company&apos;s own records. The lifecycle reports this state; the case view is
          where it changes.
        </p>
      </LifecyclePanel>
    </>
  );
}
