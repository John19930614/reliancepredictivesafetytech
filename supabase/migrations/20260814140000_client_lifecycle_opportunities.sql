-- Client Lifecycle — the opportunity record and its step history.
--
-- MODULE_ID: client_lifecycle
-- PURPOSE: One controlled record from lead to close, walked through 11 governed
--   steps with AI scoring and exit paths.
-- GROUP: Commercial
-- PATH_PREFIX: /employee/lifecycle
-- DATA_OBJECTS: opportunities, opportunity_stage_events
-- WORKFLOW_STATES: 11 steps + 3 exit states
--
-- WHY A NEW RECORD. The platform models a COMPANY (company_clients) and a
-- DOCUMENT (client_proposals), but never a DEAL. Every screen in the lifecycle
-- concept is built on deal facts — value, expected close date, probability, AI
-- score, days in step, risk flags — and none of those columns exist anywhere
-- today. Bolting them onto company_clients would also cap each company at one
-- deal for all time, which is exactly what renewal and expansion cannot live
-- with. So: an opportunity belongs to a company, and a company can have many.
--
-- STRICTLY ADDITIVE AND PARALLEL. company_clients.lifecycle_stage is not read,
-- written, constrained or migrated here. The existing twelve-column sales board
-- keeps working untouched while the lifecycle runs beside it on its own field.
-- Cutting the two together is a later, deliberate decision — not a side effect
-- of shipping this.
--
-- ROLLBACK:
--   drop table if exists public.opportunity_stage_events;
--   drop table if exists public.opportunities;
--   drop function if exists public.set_opportunity_step_changed_at();

/* -------------------------------------------------------------------------- */
/* 1. The opportunity                                                         */
/* -------------------------------------------------------------------------- */

create table if not exists public.opportunities (
  id                   uuid primary key default gen_random_uuid(),

  -- The company this deal is for. NULLABLE on purpose: steps 1–3 happen before
  -- anyone has decided this lead is worth creating a company record for, which
  -- is the whole point of triaging first.
  client_id            uuid references public.company_clients(id) on delete set null,
  -- The inbound lead it came from, when it came from one.
  demo_request_id      uuid references public.demo_requests(id) on delete set null,

  name                 text not null check (char_length(btrim(name)) between 1 and 200),

  /* --- Where it is ------------------------------------------------------- */

  -- Step keys are snake_case and STABLE. The display labels live in
  -- lib/lifecycle/steps.ts; renaming a label must never strand a stored row.
  step                 text not null default 'lead_captured'
                         check (step in (
                           'lead_captured', 'ai_triage', 'sales_review', 'assign_owner',
                           'discovery', 'opportunity_qualified', 'solution_proposal',
                           'proposal_review', 'negotiation_approval', 'commit_contract',
                           'closed_won_onboarded'
                         )),

  -- Open, or one of the three exits available at ANY step. Held separately from
  -- `step` so an exited deal still remembers how far it got — "lost at
  -- Negotiation" and "lost at Discovery" are different businesses problems.
  status               text not null default 'open'
                         check (status in ('open', 'won', 'closed_lost', 'on_hold', 'disqualified')),

  step_changed_at      timestamptz not null default now(),

  /* --- Who owns it ------------------------------------------------------- */

  -- The accountable person, as a real user rather than the free-text name
  -- company_clients.owner uses. Step 4 exists to set this, and the SLA clock
  -- and capacity views need a user to hang off.
  owner_user_id        uuid references auth.users(id) on delete set null,
  assigned_at          timestamptz,

  /* --- What it is worth -------------------------------------------------- */

  value                numeric(14, 2) not null default 0 check (value >= 0),
  currency             text not null default 'USD' check (char_length(currency) = 3),
  probability          integer not null default 0 check (probability between 0 and 100),
  expected_close_date  date,

  /* --- What the AI thinks ------------------------------------------------ */

  -- Mirrors lead_triage_results' scale so an inbound lead's triage score can be
  -- carried onto the opportunity without rescaling.
  ai_score             integer check (ai_score is null or ai_score between 0 and 100),
  ai_confidence        text check (ai_confidence is null or ai_confidence in ('low', 'medium', 'high')),
  ai_scored_at         timestamptz,
  -- Advisory only. Nothing in this table is written by a model without a human
  -- acting first — the Human Authority Rule, same posture as lead triage.
  ai_recommendation    text check (ai_recommendation is null or char_length(ai_recommendation) <= 2000),

  /* --- Context ----------------------------------------------------------- */

  source               text,
  industry             text,
  region               text,
  product_interest     text,

  next_action          text check (next_action is null or char_length(next_action) <= 500),
  next_action_due      date,
  last_contact_at      timestamptz,

  notes                text check (notes is null or char_length(notes) <= 8000),

  /* --- How it ended ------------------------------------------------------ */

  exit_reason          text check (exit_reason is null or char_length(exit_reason) <= 1000),
  -- Who we lost to. The concept captures this on the Closed Lost path, and it
  -- is the one field that makes lost-deal reporting worth reading.
  exit_competitor      text check (exit_competitor is null or char_length(exit_competitor) <= 200),
  exited_at            timestamptz,
  exited_by            uuid references auth.users(id) on delete set null,
  -- On Hold / Nurture is a pause with a date, not a graveyard.
  hold_until           date,

  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- An exited deal has to say why. Without this the three exit paths collapse
  -- into "it stopped", which is what the pipeline already does today.
  constraint opportunities_exit_has_reason
    check (status in ('open', 'won') or exit_reason is not null),
  -- ...and has to record when it ended.
  constraint opportunities_exit_has_moment
    check (status in ('open', 'won') or exited_at is not null)
);

create index if not exists opportunities_step_idx
  on public.opportunities (step, step_changed_at desc)
  where status = 'open';

create index if not exists opportunities_owner_idx
  on public.opportunities (owner_user_id, step)
  where status = 'open';

create index if not exists opportunities_client_idx
  on public.opportunities (client_id, created_at desc)
  where client_id is not null;

create index if not exists opportunities_demo_request_idx
  on public.opportunities (demo_request_id)
  where demo_request_id is not null;

create index if not exists opportunities_close_date_idx
  on public.opportunities (expected_close_date)
  where status = 'open';

drop trigger if exists set_opportunities_updated_at on public.opportunities;
create trigger set_opportunities_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

/* --- step_changed_at is kept by a trigger, not by callers ----------------- */

-- Learned from stage_changed_at on company_clients, which four separate code
-- paths write and therefore three of them forgot. `days in step` is on every
-- screen in this module, so the database keeps it rather than trusting callers.
create or replace function public.set_opportunity_step_changed_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.step is distinct from old.step then
    new.step_changed_at := now();
  end if;
  return new;
end $$;

drop trigger if exists set_opportunity_step_changed_at on public.opportunities;
create trigger set_opportunity_step_changed_at
before update on public.opportunities
for each row execute function public.set_opportunity_step_changed_at();

/* -------------------------------------------------------------------------- */
/* 2. Step history                                                            */
/* -------------------------------------------------------------------------- */

-- Append-only. Every move, skip and exit lands here, so the Timeline and Audit
-- Trail tabs have a source and "who skipped Discovery on this deal?" has an
-- answer. Same posture as client_proposal_approvals: appended to, never edited.
create table if not exists public.opportunity_stage_events (
  id               uuid primary key default gen_random_uuid(),
  opportunity_id   uuid not null references public.opportunities(id) on delete cascade,

  from_step        text,
  to_step          text not null,
  from_status      text,
  to_status        text not null,

  -- 'advance'  — the ordinary Next Step
  -- 'skip'     — Skip to Step jumped over one or more steps
  -- 'back'     — moved backwards to correct a mistake
  -- 'exit'     — Closed Lost / On Hold / Disqualified
  -- 'reopen'   — brought back from an exit
  kind             text not null
                     check (kind in ('advance', 'skip', 'back', 'exit', 'reopen')),

  -- Required by the application for skip, back, exit and reopen.
  reason           text check (reason is null or char_length(btrim(reason)) between 1 and 1000),
  -- How many steps were jumped, so a skip of six reads differently from a skip
  -- of one without anyone recomputing it from the step keys.
  steps_skipped    integer not null default 0 check (steps_skipped >= 0),

  changed_by       uuid references auth.users(id) on delete set null,
  changed_at       timestamptz not null default now(),

  -- A jump, an exit or a reversal has to carry a reason. An ordinary advance
  -- does not — the step itself is the record.
  constraint opportunity_stage_events_reason_required
    check (kind = 'advance' or reason is not null)
);

create index if not exists opportunity_stage_events_opportunity_idx
  on public.opportunity_stage_events (opportunity_id, changed_at desc);

create index if not exists opportunity_stage_events_exception_idx
  on public.opportunity_stage_events (changed_at desc)
  where kind in ('skip', 'back', 'exit');

/* -------------------------------------------------------------------------- */
/* 3. RLS                                                                     */
/* -------------------------------------------------------------------------- */

-- The app-side gates in lib/lifecycle/policy.ts are the enforcement path; these
-- policies are the backstop that keeps a hand-crafted PostgREST call from
-- writing something it could not obtain through the UI. That distinction was
-- learned the expensive way on client_invoices in the previous change, where
-- every admin-only rule lived in Node and nowhere else.

alter table public.opportunities enable row level security;
alter table public.opportunity_stage_events enable row level security;

drop policy if exists "Employees can read opportunities" on public.opportunities;
create policy "Employees can read opportunities"
  on public.opportunities for select to authenticated
  using (public.is_company_portal_employee());

-- A new opportunity always starts at step 1, open, in the creator's name. It
-- cannot be conjured directly into a later step or a won status.
drop policy if exists "Employees can create opportunities" on public.opportunities;
create policy "Employees can create opportunities"
  on public.opportunities for insert to authenticated
  with check (
    public.is_company_portal_employee()
    and step = 'lead_captured'
    and status = 'open'
    and exited_at is null
    and created_by = (select auth.uid())
  );

drop policy if exists "Employees can update open opportunities" on public.opportunities;
create policy "Employees can update open opportunities"
  on public.opportunities for update to authenticated
  using (public.is_company_portal_employee() and status = 'open')
  with check (public.is_company_portal_employee());

-- Reopening an exited deal, or editing one after it closed, is an admin act:
-- the exit is a reported outcome, and quietly un-losing a deal changes numbers
-- somebody has already acted on.
drop policy if exists "Admins can update any opportunity" on public.opportunities;
create policy "Admins can update any opportunity"
  on public.opportunities for update to authenticated
  using (public.is_company_portal_admin())
  with check (public.is_company_portal_admin());

drop policy if exists "Admins can delete opportunities" on public.opportunities;
create policy "Admins can delete opportunities"
  on public.opportunities for delete to authenticated
  using (public.is_company_portal_admin());

drop policy if exists "Employees can read stage events" on public.opportunity_stage_events;
create policy "Employees can read stage events"
  on public.opportunity_stage_events for select to authenticated
  using (public.is_company_portal_employee());

-- changed_by is pinned to the caller, so a move cannot be attributed to someone
-- else. Same rule as client_proposal_approvals.decided_by.
drop policy if exists "Employees can record stage events" on public.opportunity_stage_events;
create policy "Employees can record stage events"
  on public.opportunity_stage_events for insert to authenticated
  with check (
    public.is_company_portal_employee()
    and changed_by = (select auth.uid())
  );

-- No UPDATE, no DELETE: the history is appended to, never edited.
