create table if not exists public.employee_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  legal_name text,
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  onboarding_status text not null default 'not_started',
  onboarding_completed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.hr_document_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'People / HR',
  body_text text not null,
  version integer not null default 1,
  active boolean not null default true,
  required boolean not null default true,
  sort_order integer not null default 100,
  source_document_id uuid references public.company_documents(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (title, version)
);

create table if not exists public.employee_document_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.hr_document_templates(id) on delete cascade,
  status text not null default 'pending',
  due_date date,
  assigned_by uuid references auth.users(id) on delete set null,
  existing_document_id uuid references public.company_documents(id) on delete set null,
  signed_at timestamp with time zone,
  waived_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (user_id, template_id)
);

alter table public.employee_document_assignments
  add column if not exists existing_document_id uuid references public.company_documents(id) on delete set null;

create table if not exists public.employee_document_signatures (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.employee_document_assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.hr_document_templates(id) on delete restrict,
  template_version integer not null,
  document_title text not null,
  document_body text not null,
  source_document_id uuid references public.company_documents(id) on delete set null,
  source_file_path text,
  typed_legal_name text not null,
  consented boolean not null default false,
  signer_email text,
  signer_ip text,
  signer_user_agent text,
  signed_at timestamp with time zone not null default now(),
  created_at timestamp with time zone default now(),
  unique (assignment_id)
);

drop trigger if exists set_employee_profiles_updated_at on public.employee_profiles;
create trigger set_employee_profiles_updated_at
before update on public.employee_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_hr_document_templates_updated_at on public.hr_document_templates;
create trigger set_hr_document_templates_updated_at
before update on public.hr_document_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_document_assignments_updated_at on public.employee_document_assignments;
create trigger set_employee_document_assignments_updated_at
before update on public.employee_document_assignments
for each row execute function public.set_updated_at();

alter table public.employee_profiles enable row level security;
alter table public.hr_document_templates enable row level security;
alter table public.employee_document_assignments enable row level security;
alter table public.employee_document_signatures enable row level security;

drop policy if exists "Employees can read own profile" on public.employee_profiles;
create policy "Employees can read own profile"
on public.employee_profiles
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Employees can update own profile" on public.employee_profiles;
create policy "Employees can update own profile"
on public.employee_profiles
for update
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin())
with check (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Employees can insert own profile" on public.employee_profiles;
create policy "Employees can insert own profile"
on public.employee_profiles
for insert
to authenticated
with check (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Admins can delete employee profiles" on public.employee_profiles;
create policy "Admins can delete employee profiles"
on public.employee_profiles
for delete
to authenticated
using (public.is_company_portal_admin());

drop policy if exists "Employees can read assigned HR templates" on public.hr_document_templates;
create policy "Employees can read assigned HR templates"
on public.hr_document_templates
for select
to authenticated
using (
  public.is_company_portal_admin()
  or (
    active
    and exists (
      select 1
      from public.employee_document_assignments assignment
      where assignment.template_id = hr_document_templates.id
        and assignment.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Admins can insert HR templates" on public.hr_document_templates;
create policy "Admins can insert HR templates"
on public.hr_document_templates
for insert
to authenticated
with check (public.is_company_portal_admin());

drop policy if exists "Admins can update HR templates" on public.hr_document_templates;
create policy "Admins can update HR templates"
on public.hr_document_templates
for update
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Admins can delete HR templates" on public.hr_document_templates;
create policy "Admins can delete HR templates"
on public.hr_document_templates
for delete
to authenticated
using (public.is_company_portal_admin());

drop policy if exists "Employees can read own HR assignments" on public.employee_document_assignments;
create policy "Employees can read own HR assignments"
on public.employee_document_assignments
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Admins can insert HR assignments" on public.employee_document_assignments;
create policy "Admins can insert HR assignments"
on public.employee_document_assignments
for insert
to authenticated
with check (public.is_company_portal_admin());

drop policy if exists "Employees can update own HR assignments" on public.employee_document_assignments;
create policy "Employees can update own HR assignments"
on public.employee_document_assignments
for update
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin())
with check (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Admins can delete HR assignments" on public.employee_document_assignments;
create policy "Admins can delete HR assignments"
on public.employee_document_assignments
for delete
to authenticated
using (public.is_company_portal_admin());

drop policy if exists "Employees can read own HR signatures" on public.employee_document_signatures;
create policy "Employees can read own HR signatures"
on public.employee_document_signatures
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Employees can create own HR signatures" on public.employee_document_signatures;
create policy "Employees can create own HR signatures"
on public.employee_document_signatures
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and consented = true
  and exists (
    select 1
    from public.employee_document_assignments assignment
    where assignment.id = employee_document_signatures.assignment_id
      and assignment.user_id = (select auth.uid())
      and assignment.template_id = employee_document_signatures.template_id
      and assignment.status = 'pending'
  )
);

insert into public.hr_document_templates
  (title, category, body_text, version, active, required, sort_order)
values
  (
    'Offer / Role Acknowledgment',
    'People / HR',
    'This placeholder acknowledgment confirms the employee has reviewed their role, reporting expectations, employment basics, and any written offer or role terms provided by Reliance Predictive Safety Technologies LLC. Replace this text with attorney-reviewed or leadership-approved HR language before production use.',
    1,
    true,
    true,
    10
  ),
  (
    'Employee Handbook Acknowledgment',
    'People / HR',
    'This placeholder acknowledgment confirms the employee has received and reviewed the company handbook, including workplace expectations, conduct standards, reporting channels, timekeeping expectations, and policy-change notices. Replace this text with the finalized handbook acknowledgment.',
    1,
    true,
    true,
    20
  ),
  (
    'Confidentiality / IP Assignment',
    'Legal / People',
    'This placeholder acknowledgment confirms the employee understands confidentiality obligations, protection of company information, and assignment of work product or intellectual property created for company business. Replace this text with attorney-reviewed confidentiality and IP assignment terms.',
    1,
    true,
    true,
    30
  ),
  (
    'Acceptable Use Policy',
    'Technology / Security',
    'This placeholder acknowledgment confirms the employee agrees to use company systems, data, devices, accounts, and AI-assisted tools responsibly and only for authorized company work. Replace this text with the finalized acceptable use policy.',
    1,
    true,
    true,
    40
  ),
  (
    'Safety / Data Policy Acknowledgment',
    'Safety / Data',
    'This placeholder acknowledgment confirms the employee understands that safety-critical documents, SOR records, incidents, client data, and predictive outputs must be handled carefully, reviewed by qualified humans, and protected from unauthorized access or misuse.',
    1,
    true,
    true,
    50
  ),
  (
    'E-Sign Consent',
    'Legal / People',
    'This placeholder acknowledgment confirms the employee consents to use electronic records and electronic signatures for company onboarding documents and internal acknowledgments within the Reliance website. Replace this text with attorney-reviewed e-sign consent language.',
    1,
    true,
    true,
    60
  ),
  (
    'AI Output Disclaimer',
    'Technology / Security',
    'This placeholder acknowledgment confirms the employee understands AI-assisted outputs are drafts or decision-support materials, must be reviewed by qualified humans, and should not be treated as final safety, legal, or compliance advice without appropriate review.',
    1,
    true,
    true,
    70
  ),
  (
    'Privacy Acknowledgment',
    'Privacy',
    'This placeholder acknowledgment confirms the employee has reviewed the company privacy expectations for employee, client, and operational data, including collection, use, retention, access, and reporting obligations. Replace this text with finalized privacy language.',
    1,
    true,
    true,
    80
  ),
  (
    'Emergency Contact Form',
    'People / HR',
    'This placeholder form confirms the employee will provide and maintain current emergency contact information in their employee profile. The profile fields completed during onboarding serve as the current emergency contact record.',
    1,
    true,
    true,
    90
  ),
  (
    'Tax / Payroll Upload Checklist',
    'Finance / Payroll',
    'This placeholder checklist confirms the employee understands that payroll, tax, direct deposit, identification, and eligibility documents may be requested through approved company channels. Do not upload sensitive payroll documents unless the final secure process has been approved.',
    1,
    true,
    true,
    100
  )
on conflict (title, version) do nothing;
