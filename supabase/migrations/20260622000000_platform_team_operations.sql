-- Platform Team Operations: Sprint, Release, QA, Docs, Packages

-- Sprint Planning
create table if not exists public.platform_sprints (
  id uuid default gen_random_uuid() primary key,
  sprint_number int not null,
  title text not null,
  goal text,
  start_date date not null,
  end_date date not null,
  status text not null default 'planning' check (status in ('planning', 'active', 'completed', 'cancelled')),
  velocity_points int,
  capacity_points int,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.platform_sprint_tasks (
  id uuid default gen_random_uuid() primary key,
  sprint_id uuid references public.platform_sprints(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'backlog' check (status in ('backlog', 'in_progress', 'review', 'done', 'blocked')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  estimate_points int,
  assigned_to uuid references auth.users(id),
  tags text[] default '{}',
  blocker_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Build & Release Management
create table if not exists public.platform_releases (
  id uuid default gen_random_uuid() primary key,
  version text not null,
  title text not null,
  environment text not null default 'development' check (environment in ('development', 'staging', 'pilot', 'production')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'deployed', 'rolled_back', 'cancelled')),
  release_notes text,
  migration_required boolean default false,
  rollback_plan text,
  sign_off_required boolean default true,
  deployed_by uuid references auth.users(id),
  deployed_at timestamptz,
  signed_off_by uuid references auth.users(id),
  signed_off_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- QA & Testing
create table if not exists public.platform_test_plans (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  related_release_id uuid references public.platform_releases(id),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'archived')),
  total_scenarios int default 0,
  passed_scenarios int default 0,
  failed_scenarios int default 0,
  blocked_scenarios int default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.platform_test_results (
  id uuid default gen_random_uuid() primary key,
  test_plan_id uuid references public.platform_test_plans(id) on delete cascade,
  scenario text not null,
  acceptance_criteria text,
  result text not null default 'pending' check (result in ('pending', 'pass', 'fail', 'blocked', 'skipped')),
  notes text,
  tested_by uuid references auth.users(id),
  tested_at timestamptz,
  created_at timestamptz default now()
);

-- Documentation & Runbooks
create table if not exists public.platform_runbooks (
  id uuid default gen_random_uuid() primary key,
  category text not null default 'general' check (category in ('setup', 'architecture', 'api', 'deployment', 'incident', 'general')),
  title text not null,
  content text not null default '',
  version text default '1.0',
  last_reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Vertical Package Management
create table if not exists public.platform_vertical_packages (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  vertical_key text not null unique,
  description text,
  current_version text not null default '0.1.0',
  status text not null default 'development' check (status in ('development', 'pilot', 'production', 'deprecated')),
  changelog text,
  pilot_feature_flags jsonb default '{}',
  scenario_test_count int default 0,
  repository_url text,
  owner_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-update updated_at
create or replace function public.update_platform_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_platform_sprints_updated_at before update on public.platform_sprints for each row execute procedure public.update_platform_updated_at();
create trigger trg_platform_sprint_tasks_updated_at before update on public.platform_sprint_tasks for each row execute procedure public.update_platform_updated_at();
create trigger trg_platform_releases_updated_at before update on public.platform_releases for each row execute procedure public.update_platform_updated_at();
create trigger trg_platform_test_plans_updated_at before update on public.platform_test_plans for each row execute procedure public.update_platform_updated_at();
create trigger trg_platform_runbooks_updated_at before update on public.platform_runbooks for each row execute procedure public.update_platform_updated_at();
create trigger trg_platform_vertical_packages_updated_at before update on public.platform_vertical_packages for each row execute procedure public.update_platform_updated_at();

-- RLS: platform_admin and super_admin only
alter table public.platform_sprints enable row level security;
alter table public.platform_sprint_tasks enable row level security;
alter table public.platform_releases enable row level security;
alter table public.platform_test_plans enable row level security;
alter table public.platform_test_results enable row level security;
alter table public.platform_runbooks enable row level security;
alter table public.platform_vertical_packages enable row level security;

create policy "platform_team_sprints" on public.platform_sprints for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "platform_team_sprint_tasks" on public.platform_sprint_tasks for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "platform_team_releases" on public.platform_releases for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "platform_team_test_plans" on public.platform_test_plans for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "platform_team_test_results" on public.platform_test_results for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "platform_team_runbooks" on public.platform_runbooks for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "platform_team_vertical_packages" on public.platform_vertical_packages for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);

-- Seed: SafePredict vertical package
insert into public.platform_vertical_packages (name, vertical_key, description, current_version, status, scenario_test_count)
values ('SafePredict', 'safepredict', 'Predictive safety risk scoring engine — near-miss forecasting, hazard classification, and OSHA severity scoring.', '0.2.0', 'development', 0)
on conflict (vertical_key) do nothing;
