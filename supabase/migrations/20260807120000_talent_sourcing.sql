-- EHS Talent Engine — web sourcing (the Sourcing Agent sweep)
-- MODULE_ID: ehs_talent_engine
--
-- On a schedule an AI agent web-searches for (1) EHS professionals who match our
-- open job orders and (2) public job openings our talent pool could fill. Every
-- result lands here as a LEAD in a human review queue.
--
-- A lead NEVER promotes itself. Nothing in this module may write a
-- talent_candidates or talent_job_orders row off the back of a search result:
-- a human accepts or dismisses each lead, and only the accept path creates the
-- real record and stamps its id back onto created_record_id. That is the Human
-- Authority Rule from CLAUDE.md applied to the one surface where the AI reaches
-- outside the building.
--
-- Column names and types in this file are bound to the "Web sourcing" section of
-- lib/talent-engine/types.ts (SourcingRunRow / SourcingLeadRow), which is the
-- frozen shared contract for the module. Do not drift one without the other.
--
-- TENANT MODEL: unchanged from 20260806140000_ehs_talent_engine.sql — internal
--   portal, no per-tenant column, every row belongs to the agency and access is
--   decided by portal role.
--
-- PRIVACY / EEO CONTRACT (mirrors the comment on SourcingLeadRow): a lead
--   carries only public professional information — the published name or role
--   title, employer/affiliation, location, vertical, claimed certifications, a
--   published rate signal, the public source URL and a short summary. Protected
--   attributes are never requested, extracted or stored. There is deliberately
--   NO contact-details column: outreach happens after a human has accepted the
--   lead and created a real talent_candidates row, which is where email/phone
--   already live.
--
-- RLS MODEL (one line per table, this is the whole story):
--   talent_sourcing_runs   read + insert + update: any active portal employee
--                          (`public.is_company_portal_employee()`); delete:
--                          admin. The UPDATE policy is load-bearing — see the
--                          note on the table itself.
--   talent_sourcing_leads  same as runs. A lead is REVIEWABLE STATE, not an
--                          audit record: reviewing one flips status /
--                          reviewed_by / reviewed_at / created_record_id, and a
--                          human may resurrect a dismissed lead. The immutable
--                          record of who reviewed what stays in
--                          talent_activity_log, which keeps its append-only
--                          triggers.
--
-- NOT APPEND-ONLY, ON PURPOSE: 20260807110000_talent_activity_detach_fix.sql is
--   the cautionary tale. An append-only trigger on talent_activity_log blocked
--   every UPDATE, including the ON DELETE SET NULL referential action (Postgres
--   executes that as an UPDATE), which quietly made every logged job order,
--   candidate and match undeletable. Neither table here gets such a trigger:
--   both are working state, and talent_sourcing_leads.run_id is itself ON DELETE
--   SET NULL — precisely the shape that bug bit.
--
-- DEDUP: the unique constraint on talent_sourcing_leads (lead_type, source_url)
--   is the guarantee that a twice-weekly sweep over the same public pages does
--   not refill the review queue with rows a human already dismissed. The app
--   normalises the URL before it ever reaches this table (lowercased host, no
--   fragment, no utm_* params) — see normalizeSourceUrl() / leadDedupKey() in
--   lib/talent-engine/sourcing-policy.ts. Storing a raw URL here would make the
--   constraint decorative, because the same page arrives with a different
--   tracking tail on every sweep.
--
-- INDEXES: every foreign key is indexed. `reviewed_by` references auth.users
--   purely as an audit stamp and is never joined on, so it is left unindexed,
--   matching the parent talent migration. `lead_type` is covered implicitly by
--   the (lead_type, source_url) unique constraint, whose leading column it is.
--
-- ROLLBACK (children, then parent — this migration creates no functions or
-- triggers, so there is nothing else to unwind):
--   drop table if exists public.talent_sourcing_leads cascade;
--   drop table if exists public.talent_sourcing_runs cascade;

-- ============================================================================
-- 1. talent_sourcing_runs — one row per sweep, opened then finalised
-- ============================================================================
--
-- The orchestrator INSERTs the row as 'running', then UPDATEs status,
-- leads_found, leads_inserted, error and finished_at exactly once when the
-- sweep ends. That is why this table has an employee UPDATE policy and is NOT
-- append-only: the cron path writes with the service-role client and bypasses
-- RLS, but the console's manual "run sourcing now" path runs as the signed-in
-- user, and without the UPDATE policy that run would be stuck at 'running'
-- forever.
--
-- There is deliberately no updated_at column (and therefore no updated_at
-- trigger): started_at and finished_at already bracket the row's entire life,
-- and a third timestamp would only be a slower copy of finished_at.
create table if not exists public.talent_sourcing_runs (
  id uuid default gen_random_uuid() primary key,
  run_type text not null check (
    run_type in ('candidates', 'job_orders')
  ),
  status text not null default 'running' check (
    status in ('running', 'completed', 'failed')
  ),
  -- Human-readable description of what was actually searched, so a reviewer can
  -- judge the leads against the query that produced them.
  query_summary text,
  -- Leads the agent returned vs. leads that survived validation and dedup. A
  -- large gap between the two is the signal that the query needs rewriting.
  leads_found integer not null default 0 check (leads_found >= 0),
  leads_inserted integer not null default 0 check (leads_inserted >= 0),
  -- Populated when status = 'failed'.
  error text,
  -- 'cron' for the scheduled sweep, or the triggering user's id. Text rather
  -- than a uuid FK because those two namespaces share the column.
  triggered_by text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_talent_sourcing_runs_started_at
  on public.talent_sourcing_runs(started_at desc);

-- ============================================================================
-- 2. talent_sourcing_leads — the human review queue
-- ============================================================================
create table if not exists public.talent_sourcing_leads (
  id uuid default gen_random_uuid() primary key,
  -- Detach rather than cascade: purging old run records must not delete leads a
  -- human has not reviewed yet.
  run_id uuid references public.talent_sourcing_runs(id) on delete set null,
  lead_type text not null check (
    lead_type in ('candidates', 'job_orders')
  ),
  -- Candidate lead: the person's published name. Job-order lead: the role title.
  title text not null,
  -- Candidate lead: current employer/affiliation if published. Job-order lead:
  -- the hiring company.
  organization text,
  location text,
  vertical text,
  -- Certifications as CLAIMED by the source. Nothing here is verified — that
  -- happens on talent_candidates.verified_certifications after a human accepts.
  certifications text[] not null default '{}',
  -- Candidate lead: published pay ask $/hr. Job-order lead: published bill or
  -- contract rate $/hr. Bounded by minHourlyRate/maxHourlyRate from
  -- lib/talent-engine/types.ts; the app-side gate is validateLeadCandidate().
  rate_signal numeric(10, 2) check (
    rate_signal is null or (rate_signal > 0 and rate_signal <= 500)
  ),
  -- Normalised by lib/talent-engine/sourcing-policy.ts before insert. Half of
  -- the dedup key below.
  source_url text not null,
  -- Short gateway-validated note on why the agent surfaced this lead.
  summary text,
  status text not null default 'new' check (
    status in ('new', 'accepted', 'dismissed')
  ),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  -- The talent_candidates or talent_job_orders row an accepted lead created.
  -- Intentionally NOT a foreign key: which table it points at depends on
  -- lead_type, and deleting that row should leave the lead's history readable
  -- rather than null it out or cascade the lead away.
  created_record_id uuid,
  created_at timestamptz default now(),
  -- THE DEDUP GUARANTEE. One lead per source page per lead type, forever — a
  -- re-run of the same search finds the row already present and skips it, so a
  -- dismissed lead stays dismissed instead of reappearing every sweep. The same
  -- URL may legitimately yield both a candidate and a job-order lead, hence the
  -- lead_type in the key.
  unique (lead_type, source_url)
);

create index if not exists idx_talent_sourcing_leads_status_created_at
  on public.talent_sourcing_leads(status, created_at desc);
create index if not exists idx_talent_sourcing_leads_run
  on public.talent_sourcing_leads(run_id);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.talent_sourcing_runs enable row level security;
alter table public.talent_sourcing_leads enable row level security;

-- ---------------------------------------------------------------------------
-- talent_sourcing_runs: employees read/create/update; delete admin-only.
-- Triggering a sweep and reading its outcome is a whole-team activity, and the
-- UPDATE is how a run is finalised (see the note on the table).
-- ---------------------------------------------------------------------------
create policy "talent_sourcing_runs_read_employee" on public.talent_sourcing_runs
  for select to authenticated using (public.is_company_portal_employee());
create policy "talent_sourcing_runs_insert_employee" on public.talent_sourcing_runs
  for insert to authenticated with check (public.is_company_portal_employee());
create policy "talent_sourcing_runs_update_employee" on public.talent_sourcing_runs
  for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());
create policy "talent_sourcing_runs_delete_admin" on public.talent_sourcing_runs
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- talent_sourcing_leads: employees read/create/update; delete admin-only.
-- UPDATE is the review action itself — accepting or dismissing a lead — so it
-- is open to the same team that works the match queue. What a reviewer CANNOT
-- do is turn a lead into a candidate or a job order by editing it: that record
-- is created through the server action, which enforces the transition graph in
-- lib/talent-engine/sourcing-policy.ts and writes talent_activity_log.
-- ---------------------------------------------------------------------------
create policy "talent_sourcing_leads_read_employee" on public.talent_sourcing_leads
  for select to authenticated using (public.is_company_portal_employee());
create policy "talent_sourcing_leads_insert_employee" on public.talent_sourcing_leads
  for insert to authenticated with check (public.is_company_portal_employee());
create policy "talent_sourcing_leads_update_employee" on public.talent_sourcing_leads
  for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());
create policy "talent_sourcing_leads_delete_admin" on public.talent_sourcing_leads
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );
