create extension if not exists pgcrypto;

create table if not exists public.company_checklist_items (
  id uuid primary key default gen_random_uuid(),
  section text not null,
  title text not null,
  description text,
  priority text,
  status text default 'Not Started',
  owner text,
  due_date date,
  estimated_cost text,
  notes text,
  completed boolean default false,
  linked_document_id uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create unique index if not exists company_checklist_items_section_title_idx
on public.company_checklist_items(section, title);

create table if not exists public.company_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  checklist_item_id uuid references public.company_checklist_items(id) on delete set null,
  file_path text,
  file_name text,
  file_type text,
  status text default 'Uploaded',
  owner text,
  revision text,
  notes text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_checklist_items_linked_document_id_fkey'
  ) then
    alter table public.company_checklist_items
      add constraint company_checklist_items_linked_document_id_fkey
      foreign key (linked_document_id) references public.company_documents(id) on delete set null;
  end if;
end $$;

create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text not null,
  phone text,
  role text,
  company_type text,
  interested_products text[],
  message text,
  status text default 'new',
  created_at timestamp with time zone default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_company_portal_employee()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and account_status = 'active'
      and role in (
        'platform_admin',
        'super_admin',
        'admin',
        'company_admin',
        'employee',
        'internal_reviewer',
        'marketing'
      )
  );
$$;

drop trigger if exists set_company_checklist_items_updated_at on public.company_checklist_items;
create trigger set_company_checklist_items_updated_at
before update on public.company_checklist_items
for each row execute function public.set_updated_at();

drop trigger if exists set_company_documents_updated_at on public.company_documents;
create trigger set_company_documents_updated_at
before update on public.company_documents
for each row execute function public.set_updated_at();

alter table public.company_checklist_items enable row level security;
alter table public.company_documents enable row level security;
alter table public.demo_requests enable row level security;

drop policy if exists "Employees can read checklist items" on public.company_checklist_items;
create policy "Employees can read checklist items"
on public.company_checklist_items
for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Employees can update checklist items" on public.company_checklist_items;
create policy "Employees can update checklist items"
on public.company_checklist_items
for update
to authenticated
using (public.is_company_portal_employee())
with check (public.is_company_portal_employee());

drop policy if exists "Employees can read documents" on public.company_documents;
create policy "Employees can read documents"
on public.company_documents
for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Employees can create documents" on public.company_documents;
create policy "Employees can create documents"
on public.company_documents
for insert
to authenticated
with check (uploaded_by = (select auth.uid()) and public.is_company_portal_employee());

drop policy if exists "Employees can update documents" on public.company_documents;
create policy "Employees can update documents"
on public.company_documents
for update
to authenticated
using (public.is_company_portal_employee())
with check (public.is_company_portal_employee());

drop policy if exists "Employees can delete documents" on public.company_documents;
create policy "Employees can delete documents"
on public.company_documents
for delete
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Public users can create demo requests" on public.demo_requests;
create policy "Public users can create demo requests"
on public.demo_requests
for insert
to anon, authenticated
with check (true);

drop policy if exists "Employees can read demo requests" on public.demo_requests;
create policy "Employees can read demo requests"
on public.demo_requests
for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Employees can update demo requests" on public.demo_requests;
create policy "Employees can update demo requests"
on public.demo_requests
for update
to authenticated
using (public.is_company_portal_employee())
with check (public.is_company_portal_employee());

insert into storage.buckets (id, name, public)
values ('company-documents', 'company-documents', false)
on conflict (id) do update set public = false;

drop policy if exists "Employees can view company document files" on storage.objects;
create policy "Employees can view company document files"
on storage.objects
for select
to authenticated
using (bucket_id = 'company-documents' and public.is_company_portal_employee());

drop policy if exists "Employees can upload company document files" on storage.objects;
create policy "Employees can upload company document files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-documents'
  and owner = (select auth.uid())
  and public.is_company_portal_employee()
);

drop policy if exists "Employees can replace company document files" on storage.objects;
create policy "Employees can replace company document files"
on storage.objects
for update
to authenticated
using (bucket_id = 'company-documents' and public.is_company_portal_employee())
with check (bucket_id = 'company-documents' and public.is_company_portal_employee());

drop policy if exists "Employees can delete company document files" on storage.objects;
create policy "Employees can delete company document files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'company-documents' and public.is_company_portal_employee());

insert into public.company_checklist_items
  (section, title, description, priority, status, owner, estimated_cost)
values
  ('Business Formation and Ownership', 'Confirm legal name, LLC details, ownership roles, and revenue/equity split.', 'Booklet priority 1: protect the business before selling or piloting.', 'High - required', 'Not Started', 'John / Steven', 'State filing plus attorney review'),
  ('Business Formation and Ownership', 'File or confirm LLC, EIN, business bank account, accounting setup, and insurance review.', 'Formation package foundation before paid customers or outside contributors.', 'High - required', 'Not Started', 'John', 'Filing fees, CPA, insurance quotes'),
  ('Legal Protection Package', 'Create NDA, operating agreement, IP assignment, MSA/SOW, pilot agreement, terms, privacy policy, and e-sign consent.', 'Draft internally where useful, then route final legal documents for attorney review.', 'High - required', 'Not Started', 'Steven / John', '$1,500-$7,500 legal planning range'),
  ('Platform and Product Build Package', 'Finalize demo platform with sample data and active quick-access demo link.', 'Demo should work on laptop and phone using sample data only.', 'Required', 'Not Started', 'Steven / John', 'Vercel/Supabase plus development time'),
  ('Safety Document Product Package', 'Finalize CSEP demo, review checklist, SOR template, SOR scoring guide, and safety document revision SOP.', 'Controlled product library for CSEP/PSHSEP/JSA/permit/SOR/incident documents.', 'Required', 'Not Started', 'John', 'Internal time; SME/legal review if needed'),
  ('Data Governance and AI Integrity Package', 'Document SOR quality, injury intake, data validation, AI review, confidence labels, retention, and audit log rules.', 'Do not let low-quality observations influence predictive outputs equally.', 'Required', 'Not Started', 'John / Steven', 'Internal time plus privacy review if needed'),
  ('Pricing, Billing, and Accounting', 'Approve pricing model, one-page pricing sheet, quote template, invoice items, payment terms, and discount rules.', 'Separate software access, document generation, review, setup, customization, and forecasting value.', 'Required', 'Not Started', 'John / Steven', 'QuickBooks/Stripe/CPA costs'),
  ('Sales, Marketing, and Demo Package', 'Prepare website copy, demo request path, marketing deck, flyer, demo script, buyer FAQ, proposal, and email templates.', 'The buyer should understand the problem, solution, and risk-reduction value in five minutes.', 'Required', 'Not Started', 'John / Ryan / Steven', 'Design, print, domain, CRM, email costs'),
  ('Certifications and Compliance', 'Build ISO 45001 capability matrix, WI DVB packet, CA DVBE packet, cybersecurity checklist, and privacy/data retention checklist.', 'Use certifications to support credibility without distracting from launch readiness.', 'High', 'Not Started', 'John / Steven', 'WI DVB $150 if applying; internal review'),
  ('Technology, Security, and Backup', 'Document server backup, access control, production/development separation, incident response, vendor register, and change log.', 'Buyers will ask where data lives, who can access it, retention, and recovery expectations.', 'Required', 'Not Started', 'John / Steven', 'Supabase backups/storage and internal time'),
  ('Corporate Folder System and Document Control', 'Create corporate folders, document numbering, owner, version, approval status, and review cycle.', 'Recommended folders cover admin, legal, finance, product, safety library, clients, sales, personnel, compliance, and backups.', 'Required', 'Not Started', 'John', 'Workspace storage cost varies'),
  ('Team Roles and Meeting Cadence', 'Set role map, weekly priority meeting, decision log, escalation rule, and no-new-task rule.', 'Define who owns decisions, who recommends, who reviews, and who approves.', 'High', 'Not Started', 'John / Steven / Ryan', '$0 internal'),
  ('30-60-90 Day Launch Plan', 'Execute foundation, sales readiness, controlled pilot outreach, onboarding, feedback, and launch decision stages.', 'Get protected and demo-ready without overbuilding the future platform first.', 'High', 'Not Started', 'John / Steven', 'Track one-time costs, monthly burn, and budget cap'),
  ('Final Launch Gate Checklist', 'Complete go/no-go checks before accepting a paying customer or launching a real-data pilot.', 'Must confirm entity, legal package, demo, CSEP, pricing, backup, folders, data rules, website/legal links, and cost tracker.', 'Must be yes', 'Not Started', 'John / Steven', 'Must be yes before launch')
on conflict (section, title) do nothing;
