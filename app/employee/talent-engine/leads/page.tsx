/**
 * EHS Talent Engine — Sourcing Leads (the human review gate for web sourcing).
 *
 * MODULE_ID: ehs_talent_engine
 * PATH_PREFIX: /employee/talent-engine  (this route is covered by the module's
 *   prefix grant, exactly as /framework is — no separate catalog entry.)
 *
 * An async SERVER component. Every read happens here, on the server, against
 * Supabase; the only client code on the page is the decision island at the foot
 * of each lead card and the sweep buttons in the header (CLAUDE.md: no
 * client-side data mutation, no client-side Supabase reads). Every list query is
 * bounded with .limit() and ordered deterministically.
 *
 * WHY THIS PAGE EXISTS. The Sourcing Agent reads the open web unattended — that
 * is Tier 1 work, and it is allowed to be wrong. What it is never allowed to do
 * is write into talent_candidates or talent_job_orders. Its output lands in
 * talent_sourcing_leads, and this page is the only door out of that table: a
 * human accepts, or a human dismisses. That is the Human Authority Rule applied
 * to sourcing, and the copy at the top of the page states it so an operator
 * never assumes the pool below is self-filling.
 *
 * Error boundary: inherited from app/employee/talent-engine/error.tsx, which
 * already scrubs thrown messages (they can carry rates and row ids).
 */

import Link from "next/link";
import type { Metadata } from "next";
import { Archive, ArrowLeft, Briefcase, HardHat, Radar } from "lucide-react";
import { getTalentAccess } from "@/lib/talent-engine/access";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { sourcingLeadStaleDays, type SourcingLeadRow, type SourcingRunRow } from "@/lib/talent-engine/types";
import { SourcingSweepActions } from "@/components/talent-engine/SourcingLeadActions";
import { SourcingLeadCard } from "@/components/talent-engine/SourcingLeadCard";
import { SourcingRunsStrip } from "@/components/talent-engine/SourcingRunsStrip";
import { TalentCard, TalentEmpty, TalentGateTag } from "@/components/talent-engine/TalentCard";

export const metadata: Metadata = {
  title: "Talent Engine — Sourcing Leads",
  description:
    "Human review queue for web-sourced EHS candidate and job-order leads. Nothing the Sourcing Agent finds joins the talent pool or the order book until a person accepts it here.",
};

/* -------------------------------------------------------------------------- */
/* Query bounds                                                               */
/* -------------------------------------------------------------------------- */

/** Per section, so a runaway sweep cannot turn this page into a 500-card scroll. */
const leadLimit = 50;
const runLimit = 6;

/* -------------------------------------------------------------------------- */
/* Read helpers (same contract as the console page)                           */
/* -------------------------------------------------------------------------- */

type QueryError = { code?: string; message?: string } | null;

interface ListResult<T> {
  rows: T[];
  count: number;
  error: QueryError;
}

/**
 * Runs one PostgREST query and normalises the result. A missing table is
 * tolerated on purpose — web sourcing ships behind a migration that has to be
 * rehearsed on staging first, so a deploy can legitimately land ahead of it. In
 * that window the page shows its setup notice instead of throwing. Any OTHER
 * error is re-thrown so error.tsx reports it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readList<T>(query: any): Promise<ListResult<T>> {
  const result = await query;
  const rows: T[] = Array.isArray(result?.data) ? (result.data as T[]) : [];
  const count = typeof result?.count === "number" ? result.count : rows.length;
  return { rows, count, error: (result?.error ?? null) as QueryError };
}

/** "12 awaiting review" / "1 awaiting review" — never a bare number in a chip. */
function reviewCount(count: number): string | null {
  if (count <= 0) return null;
  return `${count} awaiting review`;
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default async function SourcingLeadsPage() {
  const access = await getTalentAccess();
  const { supabase, canRead, canApprove, canPropose, canSetRate } = access;

  if (!canRead) {
    return (
      <div className="talent-console">
        <p className="talent-no-access">You do not have access to the Talent Engine.</p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const now = Date.now();

  const leadColumns =
    "id, run_id, lead_type, title, organization, location, vertical, certifications, rate_signal, source_url, summary, status, reviewed_by, reviewed_at, created_record_id, created_at";

  const [candidateLeadsResult, jobOrderLeadsResult, dismissedLeadsResult, runsResult] = await Promise.all([
    readList<SourcingLeadRow>(
      db
        .from("talent_sourcing_leads")
        .select(leadColumns, { count: "exact" })
        .eq("lead_type", "candidates")
        .eq("status", "new")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(leadLimit),
    ),

    readList<SourcingLeadRow>(
      db
        .from("talent_sourcing_leads")
        .select(leadColumns, { count: "exact" })
        .eq("lead_type", "job_orders")
        .eq("status", "new")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(leadLimit),
    ),

    readList<SourcingLeadRow>(
      db
        .from("talent_sourcing_leads")
        .select(leadColumns, { count: "exact" })
        .eq("status", "dismissed")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(leadLimit),
    ),

    readList<SourcingRunRow>(
      db
        .from("talent_sourcing_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(runLimit),
    ),
  ]);

  const results = [candidateLeadsResult, jobOrderLeadsResult, dismissedLeadsResult, runsResult];
  const schemaMissing = results.some((result) => isMissingSchemaRelationError(result.error));
  const hardError = results.find((result) => result.error && !isMissingSchemaRelationError(result.error));
  if (hardError) {
    throw new Error("The sourcing review queue could not read its data.");
  }

  const candidateLeads = candidateLeadsResult.rows;
  const jobOrderLeads = jobOrderLeadsResult.rows;
  const dismissedLeads = dismissedLeadsResult.rows;

  return (
    <div className="talent-console">
      <header className="talent-header">
        <div className="talent-header-id">
          <span className="talent-header-mark" aria-hidden="true">
            <Radar size={26} />
          </span>
          <div>
            <h1>Sourcing Leads</h1>
            <p className="talent-header-sub">Human review gate · EHS Talent Engine</p>
          </div>
        </div>

        <div className="talent-header-meta">
          <Link className="talent-backlink" href="/employee/talent-engine">
            <ArrowLeft aria-hidden="true" size={15} />
            Back to the live console
          </Link>
        </div>
      </header>

      <section className="talent-lead-intro">
        <p className="talent-lead-lede">
          The Sourcing Agent sweeps the public web on Monday and Thursday; nothing joins the pool or the order book
          until a human accepts it here. A lead left unreviewed for more than {sourcingLeadStaleDays} days is marked
          stale — the person may have been hired and the posting may have closed.
        </p>
        {canApprove ? <SourcingSweepActions canApprove={canApprove} /> : null}
      </section>

      {schemaMissing ? (
        <p className="success-box portal-alert">
          The web sourcing tables are not in this environment yet. Apply the latest database migrations and the review
          queue will fill in.
        </p>
      ) : null}

      <SourcingRunsStrip now={now} runs={runsResult.rows} />

      <div className="talent-lead-columns">
        <TalentCard
          count={reviewCount(candidateLeadsResult.count)}
          icon={<HardHat size={15} />}
          tag={<TalentGateTag label="Needs your decision" />}
          title="Candidate leads"
        >
          {candidateLeads.length === 0 ? (
            <TalentEmpty
              hint="EHS professionals the agent found published on the open web land here. Accepting one adds it to the talent pool as a sourced candidate."
              title="No candidate leads awaiting review"
            />
          ) : (
            <div className="talent-lead-list">
              {candidateLeads.map((lead) => (
                <SourcingLeadCard
                  canPropose={canPropose}
                  canSetRate={canSetRate}
                  key={lead.id}
                  lead={lead}
                  now={now}
                />
              ))}
            </div>
          )}
        </TalentCard>

        <TalentCard
          count={reviewCount(jobOrderLeadsResult.count)}
          icon={<Briefcase size={15} />}
          tag={<TalentGateTag label="Needs your decision" />}
          title="Job-order leads"
        >
          {jobOrderLeads.length === 0 ? (
            <TalentEmpty
              hint="Openings the agent found published on the open web land here. Accepting one opens a job order — the published rate carries over only if you can set rates."
              title="No job-order leads awaiting review"
            />
          ) : (
            <div className="talent-lead-list">
              {jobOrderLeads.map((lead) => (
                <SourcingLeadCard
                  canPropose={canPropose}
                  canSetRate={canSetRate}
                  key={lead.id}
                  lead={lead}
                  now={now}
                />
              ))}
            </div>
          )}
        </TalentCard>
      </div>

      {dismissedLeads.length > 0 ? (
        <details className="talent-dismissed">
          <summary className="talent-dismissed-summary">
            <Archive aria-hidden="true" size={15} />
            <span>
              Dismissed leads · {dismissedLeadsResult.count}{" "}
              {dismissedLeadsResult.count === 1 ? "lead" : "leads"}
            </span>
            <span className="talent-dismissed-hint">A dismissal is reversible — restore any of these to the queue.</span>
          </summary>
          <div className="talent-lead-list talent-dismissed-list">
            {dismissedLeads.map((lead) => (
              <SourcingLeadCard canPropose={canPropose} canSetRate={canSetRate} key={lead.id} lead={lead} now={now} />
            ))}
          </div>
        </details>
      ) : null}

      <p className="talent-foot">
        Web sourcing is a Tier 1 gather behind a Tier 2 gate. The agent may read anything public; only a person can
        admit it. Leads carry published professional detail only — no protected attribute is ever requested, extracted
        or stored.
      </p>
    </div>
  );
}
