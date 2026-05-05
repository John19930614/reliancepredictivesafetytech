alter table public.company_documents
  add column if not exists requirement_id uuid,
  add column if not exists client_id uuid,
  add column if not exists record_type text default 'Company Record',
  add column if not exists lifecycle_stage text,
  add column if not exists effective_date date,
  add column if not exists executed_date date,
  add column if not exists expiration_date date,
  add column if not exists renewal_date date,
  add column if not exists legal_hold boolean default false;

create table if not exists public.company_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  company_type text,
  lifecycle_stage text not null default 'Lead',
  status text not null default 'Active',
  owner text,
  source text default 'Manual',
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.company_sales_activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.company_clients(id) on delete cascade,
  activity_type text not null default 'Note',
  title text not null,
  notes text,
  activity_date date,
  owner text,
  outcome text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.company_document_requirements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  lifecycle_stage text not null,
  required_for_active boolean default false,
  description text,
  sort_order integer default 100,
  created_at timestamp with time zone default now(),
  unique (title, category, lifecycle_stage)
);

create table if not exists public.client_onboarding_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.company_clients(id) on delete cascade,
  title text not null,
  section text not null,
  lifecycle_stage text not null,
  status text not null default 'Not Started',
  owner text,
  due_date date,
  completed boolean default false,
  linked_document_id uuid references public.company_documents(id) on delete set null,
  notes text,
  sort_order integer default 100,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (client_id, title)
);

create table if not exists public.company_legal_issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  severity text not null default 'Medium',
  status text not null default 'Open',
  owner text,
  due_date date,
  client_id uuid references public.company_clients(id) on delete set null,
  linked_document_id uuid references public.company_documents(id) on delete set null,
  description text,
  resolution_notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_documents_requirement_id_fkey') then
    alter table public.company_documents
      add constraint company_documents_requirement_id_fkey
      foreign key (requirement_id) references public.company_document_requirements(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'company_documents_client_id_fkey') then
    alter table public.company_documents
      add constraint company_documents_client_id_fkey
      foreign key (client_id) references public.company_clients(id) on delete set null;
  end if;
end $$;

drop trigger if exists set_company_clients_updated_at on public.company_clients;
create trigger set_company_clients_updated_at
before update on public.company_clients
for each row execute function public.set_updated_at();

drop trigger if exists set_company_sales_activities_updated_at on public.company_sales_activities;
create trigger set_company_sales_activities_updated_at
before update on public.company_sales_activities
for each row execute function public.set_updated_at();

drop trigger if exists set_client_onboarding_items_updated_at on public.client_onboarding_items;
create trigger set_client_onboarding_items_updated_at
before update on public.client_onboarding_items
for each row execute function public.set_updated_at();

drop trigger if exists set_company_legal_issues_updated_at on public.company_legal_issues;
create trigger set_company_legal_issues_updated_at
before update on public.company_legal_issues
for each row execute function public.set_updated_at();

alter table public.company_clients enable row level security;
alter table public.company_sales_activities enable row level security;
alter table public.company_document_requirements enable row level security;
alter table public.client_onboarding_items enable row level security;
alter table public.company_legal_issues enable row level security;

drop policy if exists "Employees can read clients" on public.company_clients;
create policy "Employees can read clients" on public.company_clients for select to authenticated using (public.is_company_portal_employee());
drop policy if exists "Employees can create clients" on public.company_clients;
create policy "Employees can create clients" on public.company_clients for insert to authenticated with check (public.is_company_portal_employee());
drop policy if exists "Employees can update clients" on public.company_clients;
create policy "Employees can update clients" on public.company_clients for update to authenticated using (public.is_company_portal_employee()) with check (public.is_company_portal_employee());

drop policy if exists "Employees can read sales activities" on public.company_sales_activities;
create policy "Employees can read sales activities" on public.company_sales_activities for select to authenticated using (public.is_company_portal_employee());
drop policy if exists "Employees can create sales activities" on public.company_sales_activities;
create policy "Employees can create sales activities" on public.company_sales_activities for insert to authenticated with check (public.is_company_portal_employee());
drop policy if exists "Employees can update sales activities" on public.company_sales_activities;
create policy "Employees can update sales activities" on public.company_sales_activities for update to authenticated using (public.is_company_portal_employee()) with check (public.is_company_portal_employee());

drop policy if exists "Employees can read document requirements" on public.company_document_requirements;
create policy "Employees can read document requirements" on public.company_document_requirements for select to authenticated using (public.is_company_portal_employee());
drop policy if exists "Employees can manage document requirements" on public.company_document_requirements;
create policy "Employees can manage document requirements" on public.company_document_requirements for all to authenticated using (public.is_company_portal_employee()) with check (public.is_company_portal_employee());

drop policy if exists "Employees can read onboarding items" on public.client_onboarding_items;
create policy "Employees can read onboarding items" on public.client_onboarding_items for select to authenticated using (public.is_company_portal_employee());
drop policy if exists "Employees can create onboarding items" on public.client_onboarding_items;
create policy "Employees can create onboarding items" on public.client_onboarding_items for insert to authenticated with check (public.is_company_portal_employee());
drop policy if exists "Employees can update onboarding items" on public.client_onboarding_items;
create policy "Employees can update onboarding items" on public.client_onboarding_items for update to authenticated using (public.is_company_portal_employee()) with check (public.is_company_portal_employee());

drop policy if exists "Employees can read legal issues" on public.company_legal_issues;
create policy "Employees can read legal issues" on public.company_legal_issues for select to authenticated using (public.is_company_portal_employee());
drop policy if exists "Employees can create legal issues" on public.company_legal_issues;
create policy "Employees can create legal issues" on public.company_legal_issues for insert to authenticated with check (public.is_company_portal_employee());
drop policy if exists "Employees can update legal issues" on public.company_legal_issues;
create policy "Employees can update legal issues" on public.company_legal_issues for update to authenticated using (public.is_company_portal_employee()) with check (public.is_company_portal_employee());

insert into public.company_document_requirements
  (category, lifecycle_stage, title, required_for_active, sort_order)
values
  ('Sales / Marketing', 'First Pitch', 'Marketing Deck', false, 10),
  ('Sales / Marketing', 'First Pitch', 'Product Flyer', false, 20),
  ('Sales / Marketing', 'Demo Scheduled', 'Demo Script', false, 30),
  ('Sales / Marketing', 'Demo Completed', 'Buyer FAQ', false, 40),
  ('Sales / Marketing', 'Proposal Sent', 'Proposal Template', true, 50),
  ('Finance', 'Proposal Sent', 'One-Page Pricing Sheet', true, 60),
  ('Legal / Customer', 'Legal Review', 'Mutual NDA', true, 70),
  ('Legal / Customer', 'Contract Sent', 'Master Services Agreement', true, 80),
  ('Legal / Customer', 'Contract Sent', 'Statement of Work Template', true, 90),
  ('Legal / Customer', 'Legal Review', 'Pilot / Beta Agreement', false, 100),
  ('Legal / Customer', 'Legal Review', 'Terms of Use', true, 110),
  ('Legal / Customer', 'Legal Review', 'Privacy Policy', true, 120),
  ('Legal / Customer', 'Legal Review', 'Data Processing Addendum', true, 130),
  ('Legal / Customer', 'Legal Review', 'E-Sign Consent', true, 140),
  ('Legal / Customer', 'Legal Review', 'AI Output Disclaimer', true, 150),
  ('Operations', 'Onboarding', 'Client Contact Sheet', true, 160),
  ('Operations', 'Onboarding', 'Admin Setup Record', true, 170),
  ('Finance', 'Onboarding', 'Billing Confirmation', true, 180),
  ('Product', 'Onboarding', 'Sample Data Request', false, 190),
  ('Operations', 'Onboarding', 'Onboarding Meeting Notes', true, 200),
  ('Operations', 'Active Company', 'Renewal Notes', false, 210),
  ('Legal / Customer', 'Active Company', 'Contract Expiration Record', true, 220),
  ('Compliance / Certifications', 'Active Company', 'Insurance / Legal Updates', false, 230),
  ('Operations', 'Active Company', 'Support Notes', false, 240),
  ('Operations', 'Renewal / Expansion', 'Account Review Record', false, 250)
on conflict (title, category, lifecycle_stage) do nothing;
