create table if not exists public.employee_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  paid_at timestamp with time zone,
  paid_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint employee_payroll_runs_period_check check (period_end >= period_start),
  constraint employee_payroll_runs_status_check check (status in ('draft', 'ready', 'paid', 'held'))
);

create table if not exists public.employee_payroll_run_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.employee_payroll_runs(id) on delete cascade,
  time_card_id uuid not null references public.employee_time_cards(id) on delete restrict,
  employee_user_id uuid references auth.users(id) on delete set null,
  total_hours numeric(10,2) not null default 0,
  hourly_rate numeric(10,2) not null default 0,
  gross_pay numeric(12,2) not null default 0,
  item_status text not null default 'ready',
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint employee_payroll_run_items_status_check check (item_status in ('ready', 'paid', 'held')),
  constraint employee_payroll_run_items_nonnegative_check check (total_hours >= 0 and hourly_rate >= 0 and gross_pay >= 0),
  unique (time_card_id),
  unique (payroll_run_id, time_card_id)
);

create index if not exists employee_payroll_runs_period_status_idx
on public.employee_payroll_runs(period_start desc, period_end desc, status);

create index if not exists employee_payroll_run_items_run_idx
on public.employee_payroll_run_items(payroll_run_id);

create index if not exists employee_payroll_run_items_employee_idx
on public.employee_payroll_run_items(employee_user_id);

drop trigger if exists set_employee_payroll_runs_updated_at on public.employee_payroll_runs;
create trigger set_employee_payroll_runs_updated_at
before update on public.employee_payroll_runs
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_payroll_run_items_updated_at on public.employee_payroll_run_items;
create trigger set_employee_payroll_run_items_updated_at
before update on public.employee_payroll_run_items
for each row execute function public.set_updated_at();

alter table public.employee_payroll_runs enable row level security;
alter table public.employee_payroll_run_items enable row level security;

grant select, insert, update, delete on public.employee_payroll_runs to authenticated;
grant select, insert, update, delete on public.employee_payroll_run_items to authenticated;

drop policy if exists "Owners can manage payroll runs" on public.employee_payroll_runs;
create policy "Owners can manage payroll runs"
on public.employee_payroll_runs
for all
to authenticated
using (public.is_company_portal_owner())
with check (public.is_company_portal_owner());

drop policy if exists "Owners can manage payroll run items" on public.employee_payroll_run_items;
create policy "Owners can manage payroll run items"
on public.employee_payroll_run_items
for all
to authenticated
using (public.is_company_portal_owner())
with check (public.is_company_portal_owner());

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
      'payroll_tracker',
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
