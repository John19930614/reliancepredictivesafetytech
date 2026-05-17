create table if not exists public.company_positions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null default 'Leadership',
  parent_position_id uuid references public.company_positions(id) on delete set null,
  status text not null default 'Needed' check (status in ('Filled', 'Open', 'Needed', 'On Hold')),
  employee_name text,
  employee_email text,
  employee_phone text,
  portal_user_id uuid references auth.users(id) on delete set null,
  job_description text,
  salary_min numeric(12, 2),
  salary_max numeric(12, 2),
  salary_period text default 'Annual',
  employment_type text default 'Full-time',
  location text,
  hiring_priority text default 'Medium',
  sort_order integer not null default 0,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists company_positions_parent_position_id_idx
on public.company_positions(parent_position_id);

create index if not exists company_positions_status_idx
on public.company_positions(status);

create index if not exists company_positions_department_idx
on public.company_positions(department);

drop trigger if exists set_company_positions_updated_at on public.company_positions;
create trigger set_company_positions_updated_at
before update on public.company_positions
for each row execute function public.set_updated_at();

alter table public.company_positions enable row level security;

drop policy if exists "Employees can read company positions" on public.company_positions;
create policy "Employees can read company positions"
on public.company_positions
for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Admins can insert company positions" on public.company_positions;
create policy "Admins can insert company positions"
on public.company_positions
for insert
to authenticated
with check (public.is_company_portal_admin());

drop policy if exists "Admins can update company positions" on public.company_positions;
create policy "Admins can update company positions"
on public.company_positions
for update
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Admins can delete company positions" on public.company_positions;
create policy "Admins can delete company positions"
on public.company_positions
for delete
to authenticated
using (public.is_company_portal_admin());

insert into public.company_positions
  (
    id,
    title,
    department,
    parent_position_id,
    status,
    employee_name,
    job_description,
    salary_min,
    salary_max,
    salary_period,
    employment_type,
    location,
    hiring_priority,
    sort_order,
    notes
  )
values
  (
    '00000000-0000-0000-0000-000000000101',
    'Founder / Managing Member',
    'Leadership',
    null,
    'Filled',
    'John',
    null,
    null,
    null,
    'Annual',
    'Full-time',
    null,
    'High',
    10,
    'Seeded founder role. Add email and phone when ready.'
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    'Product / Technology Lead',
    'Technology / Product',
    '00000000-0000-0000-0000-000000000101',
    'Filled',
    'Steven',
    null,
    null,
    null,
    'Annual',
    'Full-time',
    null,
    'High',
    20,
    'Seeded filled role. Add email and phone when ready.'
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    'Sales / Marketing Lead',
    'Sales / Marketing',
    '00000000-0000-0000-0000-000000000101',
    'Filled',
    'Ryan',
    null,
    null,
    null,
    'Annual',
    'Full-time',
    null,
    'High',
    30,
    'Seeded filled role. Add email and phone when ready.'
  ),
  (
    '00000000-0000-0000-0000-000000000104',
    'Safety Product SME',
    'Safety',
    '00000000-0000-0000-0000-000000000102',
    'Open',
    null,
    'Support safety product accuracy by reviewing CSEP, PSHSEP, JSA, permit, incident, SOR, and corrective action workflows for field realism and compliance readiness.',
    75000,
    110000,
    'Annual',
    'Full-time',
    'Remote / Hybrid',
    'High',
    70,
    'Use this role when preparing a safety subject matter expert job posting.'
  ),
  (
    '00000000-0000-0000-0000-000000000110',
    'Safety Trainer',
    'Safety',
    '00000000-0000-0000-0000-000000000104',
    'Needed',
    null,
    'Prepare and deliver safety training content, onboarding training, refresher modules, toolbox talks, and role-based safety learning materials.',
    null,
    null,
    'Annual',
    'Full-time',
    'Remote / Hybrid',
    'Medium',
    72,
    'Future trainer role for safety content, onboarding, and customer education.'
  ),
  (
    '00000000-0000-0000-0000-000000000111',
    'PHSEP / CSEP Review Specialist',
    'Safety',
    '00000000-0000-0000-0000-000000000104',
    'Needed',
    null,
    'Review PHSEP and CSEP drafts for safety accuracy, completeness, field usability, project alignment, and readiness for admin or owner approval.',
    null,
    null,
    'Annual',
    'Full-time',
    'Remote / Hybrid',
    'High',
    74,
    'Dedicated review spot for PHSEP and CSEP document quality control.'
  ),
  (
    '00000000-0000-0000-0000-000000000105',
    'Customer Success / Onboarding Manager',
    'Customer Success',
    '00000000-0000-0000-0000-000000000101',
    'Open',
    null,
    'Own customer onboarding from signed agreement through setup, training, documentation collection, feedback capture, and active company readiness.',
    65000,
    90000,
    'Annual',
    'Full-time',
    'Remote / Hybrid',
    'High',
    40,
    'Use this role for client onboarding and renewal support.'
  ),
  (
    '00000000-0000-0000-0000-000000000106',
    'Sales Development Representative',
    'Sales / Marketing',
    '00000000-0000-0000-0000-000000000103',
    'Needed',
    null,
    'Prospect contractor, safety, and operations buyers; qualify demo requests; prepare outreach lists; and keep early sales follow-up organized.',
    45000,
    65000,
    'Annual',
    'Full-time',
    'Remote',
    'Medium',
    90,
    'Future sales capacity role.'
  ),
  (
    '00000000-0000-0000-0000-000000000107',
    'Compliance / Legal Operations Coordinator',
    'Legal / Compliance',
    '00000000-0000-0000-0000-000000000101',
    'Needed',
    null,
    'Coordinate legal documents, compliance packets, review dates, renewal records, insurance updates, vendor forms, and audit-ready operating files.',
    55000,
    80000,
    'Annual',
    'Full-time',
    'Remote / Hybrid',
    'Medium',
    50,
    'Future compliance operations support role.'
  ),
  (
    '00000000-0000-0000-0000-000000000108',
    'Finance / Accounting Support',
    'Finance',
    '00000000-0000-0000-0000-000000000101',
    'Needed',
    null,
    'Support invoicing, billing records, cost tracking, bookkeeping coordination, budget reporting, and monthly close preparation.',
    45000,
    70000,
    'Annual',
    'Part-time / Full-time',
    'Remote',
    'Medium',
    60,
    'Future finance support role.'
  ),
  (
    '00000000-0000-0000-0000-000000000109',
    'Software Engineer / Platform Support',
    'Technology / Product',
    '00000000-0000-0000-0000-000000000102',
    'Needed',
    null,
    'Build and maintain the Reliance platform, Supabase-backed workflows, document generation tools, admin dashboards, quality checks, and customer-facing product improvements.',
    90000,
    130000,
    'Annual',
    'Full-time',
    'Remote',
    'Medium',
    80,
    'Future platform engineering role.'
  )
on conflict (id) do update set
  title = excluded.title,
  department = excluded.department,
  parent_position_id = excluded.parent_position_id,
  status = excluded.status,
  employee_name = excluded.employee_name,
  job_description = excluded.job_description,
  salary_min = excluded.salary_min,
  salary_max = excluded.salary_max,
  salary_period = excluded.salary_period,
  employment_type = excluded.employment_type,
  location = excluded.location,
  hiring_priority = excluded.hiring_priority,
  sort_order = excluded.sort_order,
  notes = excluded.notes;
