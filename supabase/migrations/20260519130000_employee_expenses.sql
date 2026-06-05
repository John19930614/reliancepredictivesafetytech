create table if not exists public.employee_expense_reports (
  id uuid primary key default gen_random_uuid(),
  employee_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category text not null,
  amount numeric(12,2) not null,
  expense_date date not null default current_date,
  merchant text,
  payment_method text,
  business_purpose text not null,
  notes text,
  status text not null default 'submitted',
  finance_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamp with time zone,
  reimbursed_by uuid references auth.users(id) on delete set null,
  reimbursed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint employee_expense_reports_amount_check check (amount > 0),
  constraint employee_expense_reports_category_check check (
    category in (
      'Hotel',
      'Fuel',
      'Flight',
      'Meals',
      'Parking',
      'Rideshare / Taxi',
      'Supplies',
      'Training / Certifications',
      'Other'
    )
  ),
  constraint employee_expense_reports_status_check check (
    status in ('submitted', 'needs_info', 'approved', 'rejected', 'reimbursed', 'cancelled')
  )
);

create table if not exists public.employee_expense_receipts (
  id uuid primary key default gen_random_uuid(),
  expense_report_id uuid not null references public.employee_expense_reports(id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  file_type text,
  file_size bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now()
);

create index if not exists employee_expense_reports_employee_date_idx
on public.employee_expense_reports(employee_user_id, expense_date desc);

create index if not exists employee_expense_reports_status_date_idx
on public.employee_expense_reports(status, expense_date desc);

create index if not exists employee_expense_receipts_report_idx
on public.employee_expense_receipts(expense_report_id);

drop trigger if exists set_employee_expense_reports_updated_at on public.employee_expense_reports;
create trigger set_employee_expense_reports_updated_at
before update on public.employee_expense_reports
for each row execute function public.set_updated_at();

alter table public.employee_expense_reports enable row level security;
alter table public.employee_expense_receipts enable row level security;

grant select, insert, update, delete on public.employee_expense_reports to authenticated;
grant select, insert, update, delete on public.employee_expense_receipts to authenticated;

drop policy if exists "Employees and finance can read expense reports" on public.employee_expense_reports;
create policy "Employees and finance can read expense reports"
on public.employee_expense_reports
for select
to authenticated
using (
  employee_user_id = (select auth.uid())
  or public.is_company_finance_user()
  or public.is_company_portal_owner()
);

drop policy if exists "Employees can create own expense reports" on public.employee_expense_reports;
create policy "Employees can create own expense reports"
on public.employee_expense_reports
for insert
to authenticated
with check (
  employee_user_id = (select auth.uid())
  and public.is_company_portal_employee()
  and status = 'submitted'
);

drop policy if exists "Employees can edit pending own expense reports" on public.employee_expense_reports;
create policy "Employees can edit pending own expense reports"
on public.employee_expense_reports
for update
to authenticated
using (
  employee_user_id = (select auth.uid())
  and status in ('submitted', 'needs_info')
)
with check (
  employee_user_id = (select auth.uid())
  and status in ('submitted', 'needs_info', 'cancelled')
);

drop policy if exists "Finance users can review expense reports" on public.employee_expense_reports;
create policy "Finance users can review expense reports"
on public.employee_expense_reports
for update
to authenticated
using (public.is_company_finance_user() or public.is_company_portal_owner())
with check (public.is_company_finance_user() or public.is_company_portal_owner());

drop policy if exists "Employees and finance can read expense receipts" on public.employee_expense_receipts;
create policy "Employees and finance can read expense receipts"
on public.employee_expense_receipts
for select
to authenticated
using (
  exists (
    select 1
    from public.employee_expense_reports report
    where report.id = employee_expense_receipts.expense_report_id
      and (
        report.employee_user_id = (select auth.uid())
        or public.is_company_finance_user()
        or public.is_company_portal_owner()
      )
  )
);

drop policy if exists "Employees can create own expense receipts" on public.employee_expense_receipts;
create policy "Employees can create own expense receipts"
on public.employee_expense_receipts
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.employee_expense_reports report
    where report.id = employee_expense_receipts.expense_report_id
      and report.employee_user_id = (select auth.uid())
      and report.status in ('submitted', 'needs_info')
  )
);

drop policy if exists "Employees can delete pending own expense receipts" on public.employee_expense_receipts;
create policy "Employees can delete pending own expense receipts"
on public.employee_expense_receipts
for delete
to authenticated
using (
  exists (
    select 1
    from public.employee_expense_reports report
    where report.id = employee_expense_receipts.expense_report_id
      and report.employee_user_id = (select auth.uid())
      and report.status in ('submitted', 'needs_info')
  )
);

drop policy if exists "Finance users can delete expense receipts" on public.employee_expense_receipts;
create policy "Finance users can delete expense receipts"
on public.employee_expense_receipts
for delete
to authenticated
using (public.is_company_finance_user() or public.is_company_portal_owner());

insert into storage.buckets (id, name, public)
values ('employee-expense-receipts', 'employee-expense-receipts', false)
on conflict (id) do update set public = false;

drop policy if exists "Employees and finance can view expense receipt files" on storage.objects;
create policy "Employees and finance can view expense receipt files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-expense-receipts'
  and (
    owner = (select auth.uid())
    or (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_company_finance_user()
    or public.is_company_portal_owner()
  )
);

drop policy if exists "Employees can upload expense receipt files" on storage.objects;
create policy "Employees can upload expense receipt files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'employee-expense-receipts'
  and owner = (select auth.uid())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.is_company_portal_employee()
);

drop policy if exists "Employees can delete own expense receipt files" on storage.objects;
create policy "Employees can delete own expense receipt files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'employee-expense-receipts'
  and (
    owner = (select auth.uid())
    or (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_company_finance_user()
    or public.is_company_portal_owner()
  )
);

alter table public.portal_user_module_access
  drop constraint if exists portal_user_module_access_module_key_check;

alter table public.portal_user_module_access
  add constraint portal_user_module_access_module_key_check
  check (
    module_key in (
      'dashboard',
      'ai_command',
      'website_operations',
      'work_management',
      'parking_lots',
      'employee_expenses',
      'finance',
      'operations_database',
      'startup_checklist',
      'demo_showcase',
      'request_inbox',
      'sales_pipeline',
      'active_companies',
      'company_tree',
      'hr_onboarding',
      'training',
      'hr_documents',
      'time_cards',
      'master_document_library',
      'legal_issues',
      'required_documents',
      'launch_gate',
      'users',
      'settings'
    )
  );
