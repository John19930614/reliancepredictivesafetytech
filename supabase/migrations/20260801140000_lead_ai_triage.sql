-- Daily AI lead triage: one run per day that reads inbound leads
-- (public.demo_requests), organizes them, and proposes a next step per lead.
--
-- MODULE_ID: lead_ai_triage
-- AI output is advisory only. Every row lands as 'suggested' and a human
-- accepts or dismisses it — nothing here mutates the lead record itself.
--
-- Rollback:
--   drop table if exists public.lead_triage_results;
--   drop table if exists public.lead_triage_runs;

create table lead_triage_runs (
  id              uuid primary key default gen_random_uuid(),
  run_date        date not null unique,
  status          text not null default 'running'
                    check (status in ('running', 'completed', 'error')),
  leads_analyzed  integer not null default 0,
  model           text,
  gateway_status  text,
  error_message   text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  updated_at      timestamptz not null default now()
);

create index lead_triage_runs_run_date_idx on lead_triage_runs (run_date desc);

alter table lead_triage_runs enable row level security;

create policy "Employees can view lead triage runs"
  on lead_triage_runs for select
  using (public.is_company_portal_employee());

create policy "Admins can manage lead triage runs"
  on lead_triage_runs for all
  using (public.is_company_portal_admin())
  with check (public.is_company_portal_admin());

drop trigger if exists set_lead_triage_runs_updated_at on public.lead_triage_runs;
create trigger set_lead_triage_runs_updated_at
before update on public.lead_triage_runs
for each row execute function public.set_updated_at();

create table lead_triage_results (
  id                    uuid primary key default gen_random_uuid(),
  run_id                uuid not null references lead_triage_runs(id) on delete cascade,
  lead_id               uuid not null references demo_requests(id) on delete cascade,
  priority_rank         integer not null,
  priority_score        numeric(5, 2) not null default 0
                          check (priority_score >= 0 and priority_score <= 100),
  segment               text,
  next_step             text not null,
  rationale             text,
  confidence            text not null default 'medium'
                          check (confidence in ('low', 'medium', 'high')),
  human_review_required boolean not null default true,
  status                text not null default 'suggested'
                          check (status in ('suggested', 'accepted', 'dismissed')),
  acted_by              uuid references auth.users(id),
  acted_at              timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (run_id, lead_id)
);

create index lead_triage_results_run_id_idx  on lead_triage_results (run_id);
create index lead_triage_results_lead_id_idx on lead_triage_results (lead_id);
create index lead_triage_results_status_idx  on lead_triage_results (status);
create index lead_triage_results_rank_idx    on lead_triage_results (priority_rank);

alter table lead_triage_results enable row level security;

create policy "Employees can view lead triage results"
  on lead_triage_results for select
  using (public.is_company_portal_employee());

-- Employees accept/dismiss a suggestion; only admins may delete or backfill.
create policy "Employees can act on lead triage results"
  on lead_triage_results for update
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());

create policy "Admins can manage lead triage results"
  on lead_triage_results for all
  using (public.is_company_portal_admin())
  with check (public.is_company_portal_admin());

drop trigger if exists set_lead_triage_results_updated_at on public.lead_triage_results;
create trigger set_lead_triage_results_updated_at
before update on public.lead_triage_results
for each row execute function public.set_updated_at();
