-- AI Usage Metering (Platform group)
-- One ledger row per AI call (platform_ai_usage_events), a singleton row
-- holding the platform-wide daily cap and enforcement mode
-- (platform_ai_budget_settings), and a per-feature budget table
-- (platform_ai_feature_budgets). lib/ai/metering.ts reads and writes all three
-- through the service-role client, which bypasses RLS — the policies below
-- exist only to open the tables to platform admins for dashboards and budget
-- editing. Enforcement ships as 'log_only' so turning metering on cannot block
-- a single call until an admin flips the mode deliberately.
--
-- ROLLBACK:
--   drop table if exists public.platform_ai_usage_events cascade;
--   drop index if exists public.platform_ai_budget_settings_singleton;
--   drop table if exists public.platform_ai_budget_settings cascade;
--   drop table if exists public.platform_ai_feature_budgets cascade;

-- ============================================================================
-- 1. platform_ai_usage_events — append-only ledger, one row per AI call
-- ============================================================================
create table if not exists public.platform_ai_usage_events (
  id uuid default gen_random_uuid() primary key,
  feature_key text not null check (
    feature_key in (
      'legal_research',
      'document_builder',
      'lead_triage',
      'talent_sourcing',
      'ai_command',
      'website_command',
      'sales_meeting_notes'
    )
  ),
  -- Finer-grained label within a feature (e.g. the research call vs the
  -- structuring call of the legal register's two-call pattern).
  call_kind text,
  run_source text not null default 'user' check (run_source in ('user', 'cron')),
  user_id uuid references auth.users(id) on delete set null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  web_search_calls int not null default 0,
  est_cost_cents numeric(10, 4) not null default 0,
  -- Budget day boundary: UTC, matching the "resets at midnight UTC" wording
  -- in the denial message users see.
  usage_date date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now()
);

comment on table public.platform_ai_usage_events is
  'Daily AI spend ledger; one row per model call, cost estimated by lib/ai/pricing.ts.';

-- The budget check reads exactly one day, then splits by feature.
create index if not exists idx_platform_ai_usage_events_date_feature
  on public.platform_ai_usage_events (usage_date, feature_key);

-- ============================================================================
-- 2. platform_ai_budget_settings — singleton: platform cap + enforcement mode
-- ============================================================================
create table if not exists public.platform_ai_budget_settings (
  id uuid default gen_random_uuid() primary key,
  daily_cap_cents int not null default 500,
  enforcement text not null default 'log_only' check (
    enforcement in ('log_only', 'enforce', 'kill_switch')
  ),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.platform_ai_budget_settings is
  'Single row: platform-wide daily AI budget and how hard lib/ai/metering.ts enforces it.';

-- Singleton: the index key is the constant `true`, so a second row collides
-- (idiom from talent_settings in 20260806140000_ehs_talent_engine.sql).
create unique index if not exists platform_ai_budget_settings_singleton
  on public.platform_ai_budget_settings ((true));

insert into public.platform_ai_budget_settings (daily_cap_cents, enforcement)
select 500, 'log_only'
where not exists (select 1 from public.platform_ai_budget_settings);

-- ============================================================================
-- 3. platform_ai_feature_budgets — per-feature cap, model override, on/off
-- ============================================================================
create table if not exists public.platform_ai_feature_budgets (
  feature_key text primary key,
  daily_cap_cents int not null default 100,
  -- Cheaper model to substitute while the budget is tight; null = the
  -- feature's own default.
  model_override text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.platform_ai_feature_budgets is
  'Per-feature daily AI caps consumed by lib/ai/metering.ts; rows match AiFeatureKey.';

-- Caps sized to observed usage: the web-search-heavy features (talent
-- sourcing, legal research) get the most headroom, the cron summarizers the
-- least.
insert into public.platform_ai_feature_budgets (feature_key, daily_cap_cents)
values
  ('talent_sourcing', 150),
  ('legal_research', 150),
  ('ai_command', 100),
  ('document_builder', 100),
  ('website_command', 50),
  ('lead_triage', 25),
  ('sales_meeting_notes', 25)
on conflict (feature_key) do nothing;

-- ============================================================================
-- updated_at triggers (shared helper from 20260505000000_company_portal.sql)
-- ============================================================================
drop trigger if exists set_platform_ai_budget_settings_updated_at on public.platform_ai_budget_settings;
create trigger set_platform_ai_budget_settings_updated_at
before update on public.platform_ai_budget_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_platform_ai_feature_budgets_updated_at on public.platform_ai_feature_budgets;
create trigger set_platform_ai_feature_budgets_updated_at
before update on public.platform_ai_feature_budgets
for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS — platform admins only, policy shape from ai_gateway_log in
-- 20260622020000_ai_intelligence_services.sql. No delete policies on purpose:
-- the ledger is append-only history and budget rows are edited, not removed.
-- ============================================================================
alter table public.platform_ai_usage_events enable row level security;
alter table public.platform_ai_budget_settings enable row level security;
alter table public.platform_ai_feature_budgets enable row level security;

grant select, insert, update on public.platform_ai_usage_events to authenticated;
grant select, insert, update on public.platform_ai_budget_settings to authenticated;
grant select, insert, update on public.platform_ai_feature_budgets to authenticated;

create policy "platform_ai_usage_events_select_platform" on public.platform_ai_usage_events
  for select to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin')
        and account_status = 'active'
    )
  );
create policy "platform_ai_usage_events_insert_platform" on public.platform_ai_usage_events
  for insert to authenticated with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin')
        and account_status = 'active'
    )
  );
create policy "platform_ai_usage_events_update_platform" on public.platform_ai_usage_events
  for update to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin')
        and account_status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin')
        and account_status = 'active'
    )
  );

create policy "platform_ai_budget_settings_select_platform" on public.platform_ai_budget_settings
  for select to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin')
        and account_status = 'active'
    )
  );
create policy "platform_ai_budget_settings_insert_platform" on public.platform_ai_budget_settings
  for insert to authenticated with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin')
        and account_status = 'active'
    )
  );
create policy "platform_ai_budget_settings_update_platform" on public.platform_ai_budget_settings
  for update to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin')
        and account_status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin')
        and account_status = 'active'
    )
  );

create policy "platform_ai_feature_budgets_select_platform" on public.platform_ai_feature_budgets
  for select to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin')
        and account_status = 'active'
    )
  );
create policy "platform_ai_feature_budgets_insert_platform" on public.platform_ai_feature_budgets
  for insert to authenticated with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin')
        and account_status = 'active'
    )
  );
create policy "platform_ai_feature_budgets_update_platform" on public.platform_ai_feature_budgets
  for update to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin')
        and account_status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin')
        and account_status = 'active'
    )
  );
