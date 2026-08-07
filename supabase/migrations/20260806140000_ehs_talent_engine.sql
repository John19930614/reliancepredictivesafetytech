-- EHS Talent Engine (Commercial group)
-- MODULE_ID: ehs_talent_engine — AI-managed markup staffing. We bill the client
-- one hourly rate, pay the EHS professional a lower one, and keep the spread.
-- Job orders and candidates feed a match queue; every submittal, rate change and
-- placement passes a human approval gate, and every decision is written to an
-- append-only approval log plus an append-only agent activity log.
--
-- Column names and types in this file are bound to lib/talent-engine/types.ts,
-- which is the frozen shared contract for the module. Do not drift one without
-- the other.
--
-- TENANT MODEL: internal portal, mirroring company_clients / client_proposals.
--   There is no per-tenant column: every row belongs to the agency, and access is
--   decided by portal role.
--
-- RLS MODEL (one line per table, this is the whole story):
--   talent_job_orders    read + insert + update: any active portal employee
--                        (`public.is_company_portal_employee()`); delete: admin.
--                        Sourcing a role is a whole-team activity.
--   talent_candidates    same as job orders — screening is a whole-team activity.
--   talent_matches       same as job orders. The queue is where the AI proposes
--                        and a human disposes; anyone may draft a match, but the
--                        row carries `requires_human_review` default true and the
--                        approval log below records who actually signed it off.
--   talent_timesheets    same as job orders — hours are entered by the team.
--   talent_match_approvals  APPEND-ONLY. Employees read + insert; there is
--                        intentionally NO update policy, so an approval decision
--                        and the rates it was made against can never be rewritten.
--                        Delete: admin (normally only via cascade).
--   talent_activity_log  APPEND-ONLY, same shape as approvals. This is the
--                        defensible audit trail on the money.
--   talent_placements    read: any active portal employee.
--                        INSERT + UPDATE: ADMIN ROLES ONLY
--                        ('platform_admin','super_admin','company_admin','admin').
--                        A placement is the Tier-3 human-only commitment from the
--                        blueprint — it starts real billing against a real client
--                        — so it must not be creatable by a non-approver, even
--                        though that same non-approver may draft the match that
--                        leads to it. Delete: admin.
--   talent_settings      read: any active portal employee. UPDATE: ADMIN ONLY —
--                        this single row holds the minimum spread per hour, i.e.
--                        the money floor every match is checked against. Delete:
--                        admin. Insert has no policy: the singleton row is seeded
--                        by this migration and the unique index on ((true))
--                        prevents a second one.
--
-- INDEXES: every relational foreign key is indexed (some implicitly, via a
--   unique constraint whose leading column is that key — noted inline). The
--   `created_by` / `updated_by` columns reference auth.users purely as an audit
--   stamp and are never joined on, so they are left unindexed, matching
--   20260729120000_client_proposals.sql.
--
-- APPEND-ONLY ENFORCEMENT: talent_match_approvals and talent_activity_log get a
--   database-level guard as well as the omitted UPDATE policy, following
--   20260804102000_client_proposal_revision_immutability.sql. Omitting a policy
--   is a convention, not a constraint: `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS
--   entirely, a direct psql session is unaffected by it, and a future migration
--   could reopen it. These two tables are the evidentiary record of who approved
--   which spread, so they get the hard guard. See the trigger section below.
--
-- ROLLBACK (dependency order — triggers, then children, then parents, then the
-- functions):
--   drop trigger if exists talent_match_approvals_append_only on public.talent_match_approvals;
--   drop trigger if exists talent_match_approvals_no_truncate on public.talent_match_approvals;
--   drop trigger if exists talent_activity_log_append_only on public.talent_activity_log;
--   drop trigger if exists talent_activity_log_no_truncate on public.talent_activity_log;
--   drop table if exists public.talent_timesheets cascade;
--   drop table if exists public.talent_activity_log cascade;
--   drop table if exists public.talent_placements cascade;
--   drop table if exists public.talent_match_approvals cascade;
--   drop table if exists public.talent_matches cascade;
--   drop table if exists public.talent_candidates cascade;
--   drop table if exists public.talent_job_orders cascade;
--   drop index if exists public.talent_settings_singleton;
--   drop table if exists public.talent_settings cascade;
--   drop function if exists public.enforce_talent_append_only();
--   drop function if exists public.block_talent_append_only_truncate();
--   drop function if exists public.set_talent_engine_updated_at();

-- ============================================================================
-- updated_at trigger function (module-local, generic now() setter)
-- ============================================================================
create or replace function public.set_talent_engine_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. talent_job_orders — a client's open requisition
-- ============================================================================
create table if not exists public.talent_job_orders (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.company_clients(id) on delete set null,
  title text not null,
  vertical text,
  location text,
  -- Certifications the client requires. Free text is allowed; the module's
  -- tracked list lives in lib/talent-engine/types.ts.
  cert_requirements text[] not null default '{}',
  -- What the client pays us per hour.
  bill_rate numeric(10, 2),
  -- Per-order override of talent_settings.min_spread_per_hour.
  min_spread numeric(10, 2),
  openings integer not null default 1 check (openings > 0),
  priority text not null default 'normal' check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  status text not null default 'open' check (
    status in ('open', 'on_hold', 'filled', 'closed')
  ),
  start_date date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_talent_job_orders_client
  on public.talent_job_orders(client_id);
create index if not exists idx_talent_job_orders_status
  on public.talent_job_orders(status);
create index if not exists idx_talent_job_orders_created_at
  on public.talent_job_orders(created_at desc);

-- ============================================================================
-- 2. talent_candidates — the EHS professionals we can place
-- ============================================================================
create table if not exists public.talent_candidates (
  id uuid default gen_random_uuid() primary key,
  full_name text not null,
  email text,
  phone text,
  years_experience integer,
  certifications text[] not null default '{}',
  -- Subset of `certifications` confirmed by a human or the verification agent.
  -- A required cert that is held but NOT verified blocks submittal.
  verified_certifications text[] not null default '{}',
  cert_expiry_date date,
  verticals text[] not null default '{}',
  location text,
  willing_to_relocate boolean not null default false,
  -- What the professional wants per hour; the pay side of the spread.
  pay_expectation numeric(10, 2),
  availability_date date,
  status text not null default 'sourced' check (
    status in ('sourced', 'screening', 'available', 'placed', 'inactive')
  ),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_talent_candidates_status
  on public.talent_candidates(status);
create index if not exists idx_talent_candidates_created_at
  on public.talent_candidates(created_at desc);

-- ============================================================================
-- 3. talent_matches — the approval queue, and where the money is decided
-- ============================================================================
create table if not exists public.talent_matches (
  id uuid default gen_random_uuid() primary key,
  job_order_id uuid not null references public.talent_job_orders(id) on delete cascade,
  candidate_id uuid not null references public.talent_candidates(id) on delete cascade,
  fit_score integer not null default 0 check (fit_score >= 0 and fit_score <= 100),
  bill_rate numeric(10, 2) not null default 0,
  pay_rate numeric(10, 2) not null default 0,
  -- Denormalised bill_rate − pay_rate, written by the app (see
  -- lib/talent-engine/pricing.ts) so SQL can sort and filter on margin.
  spread numeric(10, 2) not null default 0,
  -- spread ÷ pay × 100. Wider than the money columns on purpose: a near-zero
  -- pay rate produces a very large percentage and must not overflow.
  markup_pct numeric(12, 2) not null default 0,
  floor_ok boolean not null default false,
  status text not null default 'draft' check (
    status in (
      'draft', 'pending_approval', 'counter_proposed', 'approved',
      'submitted', 'rejected', 'placed', 'withdrawn'
    )
  ),
  ai_recommendation text,
  ai_confidence numeric(5, 2),
  -- Counter-offer the AI drafted when the spread fell under the floor.
  proposed_pay_rate numeric(10, 2),
  -- Human Authority Rule (CLAUDE.md): defaults to true, and lib/talent-engine
  -- /policy.ts only ever widens it. Nothing in this module may apply an AI
  -- proposal to a record while this is set.
  requires_human_review boolean not null default true,
  created_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- One match row per candidate per requisition; re-proposing updates in place
  -- so the approval log stays the single history of what changed.
  unique (job_order_id, candidate_id)
);

-- job_order_id is already indexed by the (job_order_id, candidate_id) unique
-- constraint, which leads with it.
create index if not exists idx_talent_matches_candidate
  on public.talent_matches(candidate_id);
create index if not exists idx_talent_matches_status_created_at
  on public.talent_matches(status, created_at desc);

-- ============================================================================
-- 4. talent_match_approvals — APPEND-ONLY decision log on a match
-- ============================================================================
create table if not exists public.talent_match_approvals (
  id uuid default gen_random_uuid() primary key,
  match_id uuid not null references public.talent_matches(id) on delete cascade,
  reviewer_id uuid references auth.users(id),
  reviewer_role text,
  decision text not null check (
    decision in ('approve', 'reject', 'counter', 'hold')
  ),
  -- The rates as they stood on both sides of the decision. Recording both is
  -- what makes "a human signed off on THIS spread" provable after the fact.
  bill_rate_before numeric(10, 2),
  bill_rate_after numeric(10, 2),
  pay_rate_before numeric(10, 2),
  pay_rate_after numeric(10, 2),
  note text,
  decided_at timestamptz not null default now()
);

create index if not exists idx_talent_match_approvals_match
  on public.talent_match_approvals(match_id, decided_at desc);

-- ============================================================================
-- 5. talent_placements — the Tier-3, human-only commitment
-- ============================================================================
create table if not exists public.talent_placements (
  id uuid default gen_random_uuid() primary key,
  -- One placement per approved match, enforced by the unique constraint.
  match_id uuid not null unique references public.talent_matches(id) on delete cascade,
  job_order_id uuid not null references public.talent_job_orders(id) on delete cascade,
  candidate_id uuid not null references public.talent_candidates(id) on delete cascade,
  start_date date not null,
  end_date date,
  -- Frozen copies of the approved rates: the placement bills at what was signed
  -- off, not at whatever the match row says later.
  bill_rate numeric(10, 2) not null,
  pay_rate numeric(10, 2) not null,
  status text not null default 'active' check (
    status in ('active', 'completed', 'terminated')
  ),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- match_id is already indexed by its unique constraint.
create index if not exists idx_talent_placements_job_order
  on public.talent_placements(job_order_id);
create index if not exists idx_talent_placements_candidate
  on public.talent_placements(candidate_id);
create index if not exists idx_talent_placements_status
  on public.talent_placements(status);

-- ============================================================================
-- 6. talent_timesheets — where the margin is actually realised
-- ============================================================================
create table if not exists public.talent_timesheets (
  id uuid default gen_random_uuid() primary key,
  placement_id uuid not null references public.talent_placements(id) on delete cascade,
  week_starting date not null,
  hours numeric(6, 2) not null default 0 check (hours >= 0 and hours <= 168),
  bill_rate numeric(10, 2) not null default 0,
  pay_rate numeric(10, 2) not null default 0,
  -- hours × bill_rate and hours × pay_rate, written by the app so the ledger
  -- reads one row rather than recomputing across a join.
  amount_billed numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  status text not null default 'draft' check (
    status in ('draft', 'approved', 'invoiced')
  ),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- One timesheet per placement per week; a correction updates in place.
  unique (placement_id, week_starting)
);

-- placement_id is already indexed by the (placement_id, week_starting) unique
-- constraint, which leads with it.
create index if not exists idx_talent_timesheets_week_starting
  on public.talent_timesheets(week_starting desc);
create index if not exists idx_talent_timesheets_status
  on public.talent_timesheets(status);

-- ============================================================================
-- 7. talent_activity_log — APPEND-ONLY agent + human audit trail
-- ============================================================================
create table if not exists public.talent_activity_log (
  id uuid default gen_random_uuid() primary key,
  actor_type text not null check (
    actor_type in ('ai_agent', 'human', 'system')
  ),
  -- Set for actor_type = 'human'; null for agents and system jobs, whose
  -- identity is carried by agent_name.
  actor_id uuid references auth.users(id) on delete set null,
  agent_name text,
  action text not null,
  -- Autonomy tier the action was taken at: 1 fully automated, 2 AI acts /
  -- human approves, 3 human-only.
  tier smallint check (tier in (1, 2, 3)),
  summary text not null,
  -- All three subjects are nullable and detach rather than cascade: deleting a
  -- match must not erase the record that the match ever existed.
  match_id uuid references public.talent_matches(id) on delete set null,
  job_order_id uuid references public.talent_job_orders(id) on delete set null,
  candidate_id uuid references public.talent_candidates(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_talent_activity_log_created_at
  on public.talent_activity_log(created_at desc);
create index if not exists idx_talent_activity_log_match
  on public.talent_activity_log(match_id);
create index if not exists idx_talent_activity_log_job_order
  on public.talent_activity_log(job_order_id);
create index if not exists idx_talent_activity_log_candidate
  on public.talent_activity_log(candidate_id);

-- ============================================================================
-- 8. talent_settings — the agency-level money floor (single row)
-- ============================================================================
create table if not exists public.talent_settings (
  id uuid default gen_random_uuid() primary key,
  min_spread_per_hour numeric(10, 2) not null default 20,
  target_markup_pct numeric(6, 2) not null default 33,
  default_hours_per_week numeric(5, 2) not null default 40,
  -- Tier 2 = AI may propose a pay rate; tier 3 = pay rates are human-only.
  pay_rate_autonomy_tier smallint not null default 2 check (
    pay_rate_autonomy_tier in (1, 2, 3)
  ),
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Singleton: the index key is the constant `true`, so a second row collides.
create unique index if not exists talent_settings_singleton
  on public.talent_settings ((true));

-- Seed the one row with defaultTalentSettings from lib/talent-engine/types.ts.
insert into public.talent_settings (
  min_spread_per_hour, target_markup_pct, default_hours_per_week, pay_rate_autonomy_tier
)
select 20, 33, 40, 2
where not exists (select 1 from public.talent_settings);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.talent_job_orders enable row level security;
alter table public.talent_candidates enable row level security;
alter table public.talent_matches enable row level security;
alter table public.talent_match_approvals enable row level security;
alter table public.talent_placements enable row level security;
alter table public.talent_timesheets enable row level security;
alter table public.talent_activity_log enable row level security;
alter table public.talent_settings enable row level security;

-- ---------------------------------------------------------------------------
-- talent_job_orders: employees read/create/update; delete admin-only.
-- ---------------------------------------------------------------------------
create policy "talent_job_orders_read_employee" on public.talent_job_orders
  for select to authenticated using (public.is_company_portal_employee());
create policy "talent_job_orders_insert_employee" on public.talent_job_orders
  for insert to authenticated with check (public.is_company_portal_employee());
create policy "talent_job_orders_update_employee" on public.talent_job_orders
  for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());
create policy "talent_job_orders_delete_admin" on public.talent_job_orders
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- talent_candidates: employees read/create/update; delete admin-only.
-- ---------------------------------------------------------------------------
create policy "talent_candidates_read_employee" on public.talent_candidates
  for select to authenticated using (public.is_company_portal_employee());
create policy "talent_candidates_insert_employee" on public.talent_candidates
  for insert to authenticated with check (public.is_company_portal_employee());
create policy "talent_candidates_update_employee" on public.talent_candidates
  for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());
create policy "talent_candidates_delete_admin" on public.talent_candidates
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- talent_matches: employees read/create/update; delete admin-only. The approval
-- gate lives in the workflow (requires_human_review + talent_match_approvals),
-- not in a narrower write policy — a recruiter must be able to draft and
-- re-price a proposal before an approver ever sees it.
-- ---------------------------------------------------------------------------
create policy "talent_matches_read_employee" on public.talent_matches
  for select to authenticated using (public.is_company_portal_employee());
create policy "talent_matches_insert_employee" on public.talent_matches
  for insert to authenticated with check (public.is_company_portal_employee());
create policy "talent_matches_update_employee" on public.talent_matches
  for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());
create policy "talent_matches_delete_admin" on public.talent_matches
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- talent_match_approvals: append-only. Employees read + insert; NO update
-- policy (a recorded decision is immutable); delete admin-only.
-- ---------------------------------------------------------------------------
create policy "talent_match_approvals_read_employee" on public.talent_match_approvals
  for select to authenticated using (public.is_company_portal_employee());
create policy "talent_match_approvals_insert_employee" on public.talent_match_approvals
  for insert to authenticated with check (public.is_company_portal_employee());
create policy "talent_match_approvals_delete_admin" on public.talent_match_approvals
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- talent_placements: employees read. INSERT and UPDATE are admin-only — a
-- placement starts real billing, so it is the Tier-3 human-only commitment and
-- must not be creatable by a non-approver. Delete admin-only.
-- ---------------------------------------------------------------------------
create policy "talent_placements_read_employee" on public.talent_placements
  for select to authenticated using (public.is_company_portal_employee());
create policy "talent_placements_insert_admin" on public.talent_placements
  for insert to authenticated with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );
create policy "talent_placements_update_admin" on public.talent_placements
  for update to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );
create policy "talent_placements_delete_admin" on public.talent_placements
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- talent_timesheets: employees read/create/update; delete admin-only.
-- ---------------------------------------------------------------------------
create policy "talent_timesheets_read_employee" on public.talent_timesheets
  for select to authenticated using (public.is_company_portal_employee());
create policy "talent_timesheets_insert_employee" on public.talent_timesheets
  for insert to authenticated with check (public.is_company_portal_employee());
create policy "talent_timesheets_update_employee" on public.talent_timesheets
  for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());
create policy "talent_timesheets_delete_admin" on public.talent_timesheets
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- talent_activity_log: append-only. Employees read + insert; NO update policy
-- (the audit trail is immutable); delete admin-only.
-- ---------------------------------------------------------------------------
create policy "talent_activity_log_read_employee" on public.talent_activity_log
  for select to authenticated using (public.is_company_portal_employee());
create policy "talent_activity_log_insert_employee" on public.talent_activity_log
  for insert to authenticated with check (public.is_company_portal_employee());
create policy "talent_activity_log_delete_admin" on public.talent_activity_log
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- talent_settings: employees read; UPDATE admin-only (it holds the money
-- floor); delete admin-only. No insert policy — the singleton row is seeded by
-- this migration.
-- ---------------------------------------------------------------------------
create policy "talent_settings_read_employee" on public.talent_settings
  for select to authenticated using (public.is_company_portal_employee());
create policy "talent_settings_update_admin" on public.talent_settings
  for update to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );
create policy "talent_settings_delete_admin" on public.talent_settings
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ============================================================================
-- Append-only enforcement for the two audit tables
--
-- The omitted UPDATE policies above are convention. These triggers are the
-- constraint, and they hold against the service-role key and a direct psql
-- session too. Pattern and rationale: see
-- 20260804102000_client_proposal_revision_immutability.sql.
--
-- UPDATE: blocked unconditionally on both tables. Nothing in this module
--   updates an approval or an activity row — a changed decision is a NEW
--   approval row, which is the whole point of the log.
--
-- DELETE:
--   talent_match_approvals — permitted in exactly one case: when the parent
--     talent_matches row is already gone in this transaction. That is only true
--     inside the ON DELETE CASCADE fired by deleting the match (a row-level
--     BEFORE DELETE trigger does fire for cascade-deleted rows, and the cascade
--     runs after the parent is removed). A targeted
--     `delete from talent_match_approvals where id = '...'` leaves the match in
--     place and is refused — so one inconvenient approval cannot be quietly
--     removed, while an admin deleting the whole match still works.
--   talent_activity_log — blocked unconditionally. Every subject FK on that
--     table is ON DELETE SET NULL, so no cascade can reach these rows and there
--     is no lawful targeted delete either.
--
-- The `*_delete_admin` RLS policies above are deliberately left in place; with
-- these triggers they are simply no longer load-bearing.
--
-- SECURITY DEFINER is required: the parent-existence check must see the true
-- state of talent_matches. Running as the invoker would let RLS hide the parent
-- row and make "parent not found" wrongly open the hatch.
-- ============================================================================
create or replace function public.enforce_talent_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception
      'public.% is append-only and cannot be modified. Record a new row instead.', tg_table_name
      using errcode = '42501';
  end if;

  -- tg_op = 'DELETE'.
  if tg_table_name = 'talent_match_approvals' then
    if exists (select 1 from public.talent_matches where id = old.match_id) then
      raise exception
        'talent_match_approvals is append-only: an approval cannot be deleted while its match exists. Delete the match itself if the whole record must go.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  raise exception
    'talent_activity_log is append-only and cannot be deleted.'
    using errcode = '42501';
end;
$$;

comment on function public.enforce_talent_append_only() is
  'Append-only guard for talent_match_approvals and talent_activity_log. Blocks all UPDATEs; allows DELETE on approvals only when the parent talent_matches row is already gone (the FK cascade), and never on the activity log.';

-- TRUNCATE bypasses row-level triggers entirely, so it needs its own guard.
create or replace function public.block_talent_append_only_truncate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'public.% is append-only and cannot be truncated.', tg_table_name
    using errcode = '42501';
end;
$$;

drop trigger if exists talent_match_approvals_append_only on public.talent_match_approvals;
create trigger talent_match_approvals_append_only
  before update or delete on public.talent_match_approvals
  for each row execute function public.enforce_talent_append_only();

drop trigger if exists talent_match_approvals_no_truncate on public.talent_match_approvals;
create trigger talent_match_approvals_no_truncate
  before truncate on public.talent_match_approvals
  for each statement execute function public.block_talent_append_only_truncate();

drop trigger if exists talent_activity_log_append_only on public.talent_activity_log;
create trigger talent_activity_log_append_only
  before update or delete on public.talent_activity_log
  for each row execute function public.enforce_talent_append_only();

drop trigger if exists talent_activity_log_no_truncate on public.talent_activity_log;
create trigger talent_activity_log_no_truncate
  before truncate on public.talent_activity_log
  for each statement execute function public.block_talent_append_only_truncate();

-- PostgREST exposes every executable function in `public` as /rpc/<name>. A
-- trigger function called that way errors out rather than doing anything, but
-- there is no reason for it to be reachable — and the security linter rightly
-- flags a SECURITY DEFINER function that anon can invoke. Triggers are
-- unaffected: the trigger executor does not consult these grants.
revoke execute on function public.enforce_talent_append_only() from anon, authenticated;
revoke execute on function public.block_talent_append_only_truncate() from anon, authenticated;

-- ============================================================================
-- updated_at triggers (mutable tables only — the two append-only logs and the
-- approval record have no updated_at column by design)
-- ============================================================================
drop trigger if exists talent_job_orders_updated_at on public.talent_job_orders;
create trigger talent_job_orders_updated_at
  before update on public.talent_job_orders
  for each row execute function public.set_talent_engine_updated_at();

drop trigger if exists talent_candidates_updated_at on public.talent_candidates;
create trigger talent_candidates_updated_at
  before update on public.talent_candidates
  for each row execute function public.set_talent_engine_updated_at();

drop trigger if exists talent_matches_updated_at on public.talent_matches;
create trigger talent_matches_updated_at
  before update on public.talent_matches
  for each row execute function public.set_talent_engine_updated_at();

drop trigger if exists talent_placements_updated_at on public.talent_placements;
create trigger talent_placements_updated_at
  before update on public.talent_placements
  for each row execute function public.set_talent_engine_updated_at();

drop trigger if exists talent_timesheets_updated_at on public.talent_timesheets;
create trigger talent_timesheets_updated_at
  before update on public.talent_timesheets
  for each row execute function public.set_talent_engine_updated_at();

drop trigger if exists talent_settings_updated_at on public.talent_settings;
create trigger talent_settings_updated_at
  before update on public.talent_settings
  for each row execute function public.set_talent_engine_updated_at();
