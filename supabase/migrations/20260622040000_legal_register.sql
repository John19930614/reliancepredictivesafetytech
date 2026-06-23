-- Legal Register: tracks all applicable regulations, laws, standards, and policies
-- Used by the AI Legal Research tool to build a comprehensive compliance register

create table if not exists public.legal_register_items (
  id uuid default gen_random_uuid() primary key,

  -- Identification
  title text not null,
  citation text,                    -- e.g. "29 CFR 1910.1200", "ISO 45001:2018"
  issuing_body text,               -- e.g. "OSHA", "EPA", "ISO", "ANSI"

  -- Classification
  category text not null default 'regulation' check (
    category in (
      'federal_law', 'state_law', 'local_law',
      'federal_regulation', 'state_regulation',
      'standard', 'guideline', 'policy', 'other'
    )
  ),
  jurisdiction text not null default 'federal' check (
    jurisdiction in ('federal', 'state', 'local', 'international', 'multi')
  ),
  jurisdiction_state text,         -- e.g. "TX", "CA" when jurisdiction = 'state'
  industry_sectors text[] default '{}', -- e.g. ['chemical', 'construction', 'manufacturing']

  -- Content
  description text,
  compliance_requirements text,
  penalties text,

  -- Applicability
  applies_to_us boolean default true,
  applicability_notes text,
  compliance_status text not null default 'not_assessed' check (
    compliance_status in ('compliant', 'non_compliant', 'in_progress', 'not_applicable', 'not_assessed')
  ),

  -- Dates
  effective_date date,
  review_date date,
  last_updated_from_source date,

  -- Research metadata
  source_urls text[] default '{}',
  ai_researched boolean default false,
  ai_research_query text,

  -- Ownership
  owner_user_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Research session log (tracks each AI research run)
create table if not exists public.legal_research_sessions (
  id uuid default gen_random_uuid() primary key,
  query text not null,
  model text not null default 'gpt-4o',
  items_found int default 0,
  items_saved int default 0,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  error_message text,
  researched_by uuid references auth.users(id),
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Indexes
create index if not exists idx_legal_register_category on public.legal_register_items(category);
create index if not exists idx_legal_register_compliance_status on public.legal_register_items(compliance_status);
create index if not exists idx_legal_register_jurisdiction on public.legal_register_items(jurisdiction);
create index if not exists idx_legal_register_updated_at on public.legal_register_items(updated_at desc);
create index if not exists idx_legal_research_sessions_created_at on public.legal_research_sessions(created_at desc);

-- RLS
alter table public.legal_register_items enable row level security;
alter table public.legal_research_sessions enable row level security;

-- Admins can do full CRUD on the register
create policy "legal_register_items_admin_all" on public.legal_register_items
  for all
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
      and account_status = 'active'
    )
  );

-- All active portal users can read the register
create policy "legal_register_items_read_active" on public.legal_register_items
  for select
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and account_status = 'active'
    )
  );

-- Admins manage research sessions
create policy "legal_research_sessions_admin" on public.legal_research_sessions
  for all
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
      and account_status = 'active'
    )
  );

-- updated_at auto-trigger
create or replace function public.set_legal_register_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger legal_register_items_updated_at
  before update on public.legal_register_items
  for each row execute function public.set_legal_register_updated_at();
