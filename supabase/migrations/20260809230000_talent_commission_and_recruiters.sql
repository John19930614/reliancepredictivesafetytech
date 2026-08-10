-- Commission plans, and a recruiter on every placement.
--
-- MODULE_ID: ehs_talent_engine
--
-- WHY
-- Build-review decisions (2026-08-07): the recruiter/doer-seller (Tyler) is
-- credited a configurable percentage — default 5% — of each placement's weekly
-- margin, with a configurable base salary per person; and the module grows two
-- role-based dashboards, where the recruiter sees his own placements, hours
-- and commission but NOT company revenue. This migration is the data side:
--
--   talent_commission_plans        one row per compensated person: base salary,
--                                  commission %, active flag.
--   talent_placements.recruiter_id who earns the commission on this placement.
--                                  Backfilled from the match's proposer, which
--                                  is who "made" the placement in the
--                                  commercial sense.
--
-- SENSITIVITY / RLS
-- A commission plan row is compensation data. Unlike the rest of the module
-- (whole-team read), SELECT here is the person's OWN row or an admin —
-- an employee must not browse a colleague's salary. All writes are admin-only:
-- comp is set by the owner, not self-served.
--
-- Rollback:
--   alter table public.talent_placements drop column if exists recruiter_id;
--   drop table if exists public.talent_commission_plans;

create table if not exists public.talent_commission_plans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references auth.users(id) on delete cascade,
  -- Annual base, dollars. The weekly cost the economics card shows is /52.
  base_salary    numeric(12, 2) not null default 0
                   check (base_salary >= 0 and base_salary <= 1000000),
  -- Share of each placement's weekly margin credited to the recruiter.
  -- Meeting default: 5 (owner retains 95%). Capped well under half so a typo
  -- cannot sign away the margin.
  commission_pct numeric(5, 2) not null default 5
                   check (commission_pct >= 0 and commission_pct <= 50),
  active         boolean not null default true,
  updated_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.talent_commission_plans is
  'Per-person compensation for the Talent Engine: base salary + % of each placement''s weekly margin. Own-row or admin read; admin-only write.';

drop trigger if exists talent_commission_plans_updated_at on public.talent_commission_plans;
create trigger talent_commission_plans_updated_at
  before update on public.talent_commission_plans
  for each row execute function public.set_talent_engine_updated_at();

alter table public.talent_commission_plans enable row level security;

drop policy if exists "talent_commission_plans_read_own_or_admin" on public.talent_commission_plans;
create policy "talent_commission_plans_read_own_or_admin" on public.talent_commission_plans
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

drop policy if exists "talent_commission_plans_insert_admin" on public.talent_commission_plans;
create policy "talent_commission_plans_insert_admin" on public.talent_commission_plans
  for insert to authenticated with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

drop policy if exists "talent_commission_plans_update_admin" on public.talent_commission_plans;
create policy "talent_commission_plans_update_admin" on public.talent_commission_plans
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

drop policy if exists "talent_commission_plans_delete_admin" on public.talent_commission_plans;
create policy "talent_commission_plans_delete_admin" on public.talent_commission_plans
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- Who earns the commission on a placement
-- ---------------------------------------------------------------------------

alter table public.talent_placements
  add column if not exists recruiter_id uuid references auth.users(id) on delete set null;

comment on column public.talent_placements.recruiter_id is
  'The recruiter credited with this placement''s commission. Defaults to the match''s proposer; reassignable by an admin.';

create index if not exists idx_talent_placements_recruiter
  on public.talent_placements (recruiter_id)
  where recruiter_id is not null;

-- Existing placements: the person who proposed the match made the placement.
update public.talent_placements p
   set recruiter_id = m.created_by
  from public.talent_matches m
 where m.id = p.match_id
   and p.recruiter_id is null
   and m.created_by is not null;
