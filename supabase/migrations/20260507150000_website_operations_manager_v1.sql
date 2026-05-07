create table if not exists public.website_content_items (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  route_path text not null default '/',
  content_type text not null default 'text',
  title text not null,
  fallback_value text not null default '',
  draft_value text,
  approved_value text,
  status text not null default 'draft',
  risk_level text not null default 'low',
  ai_notes text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamp with time zone,
  created_by_ai boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint website_content_items_type_check check (content_type in ('text', 'metadata', 'json')),
  constraint website_content_items_status_check check (status in ('draft', 'pending_approval', 'approved', 'archived')),
  constraint website_content_items_risk_check check (risk_level in ('low', 'medium', 'high', 'critical'))
);

create index if not exists website_content_items_route_status_idx
on public.website_content_items(route_path, status, updated_at desc);

create table if not exists public.website_health_checks (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null default gen_random_uuid(),
  route_path text not null,
  target_url text not null,
  status text not null default 'warning',
  status_code integer,
  response_ms integer,
  checked_at timestamp with time zone not null default now(),
  error_message text,
  seo_title text,
  seo_description text,
  h1 text,
  broken_links jsonb not null default '[]'::jsonb,
  content_gaps text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  constraint website_health_checks_status_check check (status in ('ok', 'warning', 'error'))
);

create index if not exists website_health_checks_scan_idx
on public.website_health_checks(scan_id, route_path);

create index if not exists website_health_checks_route_checked_idx
on public.website_health_checks(route_path, checked_at desc);

create table if not exists public.website_operations_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  notification_id uuid references public.portal_notifications(id) on delete set null,
  health_check_id uuid references public.website_health_checks(id) on delete set null,
  proposal_id uuid references public.workflow_action_proposals(id) on delete set null,
  source_type text not null,
  source_id text,
  event_type text not null,
  title text not null,
  body text,
  risk_level text not null default 'low',
  created_by_ai boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  constraint website_operations_events_risk_check check (risk_level in ('low', 'medium', 'high', 'critical'))
);

create index if not exists website_operations_events_created_idx
on public.website_operations_events(created_at desc);

create index if not exists website_operations_events_source_idx
on public.website_operations_events(source_type, source_id);

insert into public.website_content_items (content_key, route_path, title, fallback_value, status, risk_level, metadata)
values
  (
    'home.hero.eyebrow',
    '/',
    'Homepage hero eyebrow',
    'Prevention-first AI safety intelligence',
    'draft',
    'low',
    '{"seeded_from":"website_operations_manager_v1"}'::jsonb
  ),
  (
    'home.hero.summary',
    '/',
    'Homepage hero summary',
    'Reliance is a prevention tool built to help contractors, safety teams, and project owners reduce risk before injuries happen. We collect safety data with AI-assisted workflows, turn field signals into usable trends, and make risk more predictable for safer decisions.',
    'draft',
    'medium',
    '{"seeded_from":"website_operations_manager_v1"}'::jsonb
  ),
  (
    'home.products.heading',
    '/',
    'Products section heading',
    'Prevention work, made visible.',
    'draft',
    'low',
    '{"seeded_from":"website_operations_manager_v1"}'::jsonb
  ),
  (
    'home.products.summary',
    '/',
    'Products section summary',
    'Reliance brings document generation, AI-assisted data collection, field tracking, review workflows, and predictive visibility into a professional safety technology suite focused on measurable risk reduction.',
    'draft',
    'medium',
    '{"seeded_from":"website_operations_manager_v1"}'::jsonb
  ),
  (
    'home.why.heading',
    '/',
    'Why Reliance heading',
    'Built for safety teams that want fewer surprises.',
    'draft',
    'low',
    '{"seeded_from":"website_operations_manager_v1"}'::jsonb
  ),
  (
    'home.why.summary',
    '/',
    'Why Reliance summary',
    'The platform is designed to reduce repetitive admin work while preserving review discipline, so safety leaders can identify recurring signals, compare trends, and act before risk turns into loss.',
    'draft',
    'medium',
    '{"seeded_from":"website_operations_manager_v1"}'::jsonb
  ),
  (
    'home.contact.heading',
    '/',
    'Contact section heading',
    'See how prevention-focused safety work can move faster.',
    'draft',
    'low',
    '{"seeded_from":"website_operations_manager_v1"}'::jsonb
  ),
  (
    'home.contact.summary',
    '/',
    'Contact section summary',
    'Tell us what you want to solve first: AI-assisted data collection, CSEP/PSHSEP generation, SOR scoring, incident and near-miss trend analysis, corrective actions, permit/JSA workflows, training matrices, or document control.',
    'draft',
    'medium',
    '{"seeded_from":"website_operations_manager_v1"}'::jsonb
  )
on conflict (content_key) do update set
  route_path = excluded.route_path,
  title = excluded.title,
  fallback_value = excluded.fallback_value,
  risk_level = excluded.risk_level;

drop trigger if exists set_website_content_items_updated_at on public.website_content_items;
create trigger set_website_content_items_updated_at
before update on public.website_content_items
for each row execute function public.set_updated_at();

alter table public.website_content_items enable row level security;
alter table public.website_health_checks enable row level security;
alter table public.website_operations_events enable row level security;

grant select on table public.website_content_items to anon;
grant select, insert, update, delete on table public.website_content_items to authenticated;
grant select, insert, update, delete on table public.website_health_checks to authenticated;
grant select, insert, update, delete on table public.website_operations_events to authenticated;

drop policy if exists "Public can read approved website content" on public.website_content_items;
create policy "Public can read approved website content"
on public.website_content_items
for select
to anon, authenticated
using (status = 'approved' or public.is_company_portal_admin());

drop policy if exists "Admins can manage website content" on public.website_content_items;
create policy "Admins can manage website content"
on public.website_content_items
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Admins can manage website health checks" on public.website_health_checks;
create policy "Admins can manage website health checks"
on public.website_health_checks
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Admins can manage website operations events" on public.website_operations_events;
create policy "Admins can manage website operations events"
on public.website_operations_events
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());
