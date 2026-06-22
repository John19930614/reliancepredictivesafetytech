-- Core Platform Architecture: Audit Event Catalog, Subscription Tiers, Health Check Log

-- Audit Event Catalog — centralized, typed audit log for all platform actions
create table if not exists public.platform_audit_events (
  id uuid default gen_random_uuid() primary key,
  event_type text not null,
  event_category text not null default 'general' check (event_category in (
    'auth', 'data', 'ai', 'release', 'billing', 'admin', 'security', 'general'
  )),
  severity text not null default 'info' check (severity in ('info', 'warn', 'error', 'critical')),
  actor_id uuid references auth.users(id),
  actor_role text,
  tenant_id text,
  resource_type text,
  resource_id text,
  summary text not null,
  before_state jsonb,
  after_state jsonb,
  evidence_links text[] default '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists idx_platform_audit_events_created_at on public.platform_audit_events(created_at desc);
create index if not exists idx_platform_audit_events_actor_id on public.platform_audit_events(actor_id);
create index if not exists idx_platform_audit_events_event_category on public.platform_audit_events(event_category);

alter table public.platform_audit_events enable row level security;

-- Audit events: platform_admin and super_admin can read all; insert via service role
create policy "platform_audit_read" on public.platform_audit_events
  for select using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
  );

-- Subscription Tier Catalog
create table if not exists public.platform_subscription_tiers (
  id uuid default gen_random_uuid() primary key,
  tier_key text not null unique,
  name text not null,
  description text,
  monthly_price_cents int not null default 0,
  annual_price_cents int not null default 0,
  max_users int,
  max_sites int,
  features jsonb not null default '[]',
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.platform_subscription_tiers enable row level security;

create policy "platform_tiers_read_all" on public.platform_subscription_tiers
  for select using (true);

create policy "platform_tiers_manage" on public.platform_subscription_tiers
  for all using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
  );

-- Tenant subscription assignments
create table if not exists public.platform_tenant_subscriptions (
  id uuid default gen_random_uuid() primary key,
  tenant_name text not null,
  tenant_email text,
  tier_id uuid references public.platform_subscription_tiers(id),
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'cancelled', 'paused')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  max_users_override int,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.platform_tenant_subscriptions enable row level security;

create policy "platform_tenant_subscriptions_manage" on public.platform_tenant_subscriptions
  for all using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
  );

-- Platform Health Check Log
create table if not exists public.platform_health_checks (
  id uuid default gen_random_uuid() primary key,
  check_name text not null,
  status text not null check (status in ('pass', 'warn', 'fail')),
  response_ms int,
  details jsonb,
  checked_at timestamptz default now()
);

create index if not exists idx_platform_health_checks_checked_at on public.platform_health_checks(checked_at desc);

alter table public.platform_health_checks enable row level security;

create policy "platform_health_read" on public.platform_health_checks
  for select using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
  );

-- Auto-update triggers
create trigger trg_platform_subscription_tiers_updated_at before update on public.platform_subscription_tiers for each row execute procedure public.update_platform_updated_at();
create trigger trg_platform_tenant_subscriptions_updated_at before update on public.platform_tenant_subscriptions for each row execute procedure public.update_platform_updated_at();

-- Seed default subscription tiers
insert into public.platform_subscription_tiers (tier_key, name, description, monthly_price_cents, annual_price_cents, max_users, max_sites, features, sort_order)
values
  ('starter', 'Starter', 'Single-site safety management for small teams.', 29900, 287040, 10, 1, '["Incident reporting","Hazard tracking","Basic training","Email notifications"]', 1),
  ('professional', 'Professional', 'Multi-site operations with AI-assisted risk scoring.', 79900, 767040, 50, 5, '["Everything in Starter","AI risk scoring","Predictive analytics","Advanced reporting","API access"]', 2),
  ('enterprise', 'Enterprise', 'Unlimited sites, custom verticals, and dedicated support.', 199900, 1919040, null, null, '["Everything in Professional","Custom vertical packages","Dedicated CSM","SSO/SAML","Audit export","SLA guarantee"]', 3)
on conflict (tier_key) do nothing;
