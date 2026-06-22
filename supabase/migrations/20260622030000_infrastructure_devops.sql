-- Infrastructure & DevOps: Cost Tracking, Deployment Log, Security Events

-- Deployment log for tracking all deployments
create table if not exists public.infra_deployment_log (
  id uuid default gen_random_uuid() primary key,
  release_id uuid references public.platform_releases(id),
  environment text not null check (environment in ('development', 'staging', 'pilot', 'production')),
  deploy_method text not null default 'vercel' check (deploy_method in ('vercel', 'manual', 'rollback', 'hotfix')),
  git_sha text,
  git_branch text,
  status text not null default 'in_progress' check (status in ('in_progress', 'success', 'failed', 'rolled_back')),
  duration_seconds int,
  error_message text,
  triggered_by uuid references auth.users(id),
  started_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_infra_deployment_log_started_at on public.infra_deployment_log(started_at desc);

alter table public.infra_deployment_log enable row level security;
create policy "infra_deployment_log_platform" on public.infra_deployment_log for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);

-- Monthly cost tracking
create table if not exists public.infra_cost_entries (
  id uuid default gen_random_uuid() primary key,
  period_month text not null,  -- format: YYYY-MM
  service text not null,        -- vercel, supabase, resend, openai, etc.
  category text not null default 'compute' check (category in ('compute', 'database', 'storage', 'ai', 'email', 'monitoring', 'other')),
  amount_cents int not null default 0,
  currency text not null default 'USD',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (period_month, service)
);

alter table public.infra_cost_entries enable row level security;
create policy "infra_cost_entries_platform" on public.infra_cost_entries for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);

-- Security scan log
create table if not exists public.infra_security_scans (
  id uuid default gen_random_uuid() primary key,
  scan_type text not null check (scan_type in ('dependency_audit', 'sast', 'secret_scan', 'rls_review', 'manual')),
  status text not null check (status in ('pass', 'warn', 'fail')),
  findings_count int default 0,
  critical_count int default 0,
  high_count int default 0,
  summary text,
  raw_output text,
  remediated_at timestamptz,
  remediated_by uuid references auth.users(id),
  scanned_at timestamptz default now()
);

alter table public.infra_security_scans enable row level security;
create policy "infra_security_scans_platform" on public.infra_security_scans for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);

-- Auto-update triggers
create trigger trg_infra_cost_entries_updated_at before update on public.infra_cost_entries for each row execute procedure public.update_platform_updated_at();

-- Seed: current month placeholder costs
insert into public.infra_cost_entries (period_month, service, category, amount_cents, notes)
values
  ('2026-06', 'Vercel', 'compute', 2000, 'Pro plan — $20/mo base'),
  ('2026-06', 'Supabase', 'database', 2500, 'Pro plan — $25/mo base'),
  ('2026-06', 'Resend', 'email', 0, 'Free tier — up to 3,000 emails/mo'),
  ('2026-06', 'OpenAI', 'ai', 0, 'Usage-based via AI Gateway — update monthly')
on conflict (period_month, service) do nothing;
