alter table public.employee_profiles
  add column if not exists work_state text;

create table if not exists public.hr_candidate_intakes (
  id uuid primary key default gen_random_uuid(),
  candidate_name text not null,
  email text not null,
  target_role text not null default 'Employee',
  jurisdiction_state text,
  source text,
  status text not null default 'new',
  notes text,
  human_decision text not null default 'pending',
  human_decision_notes text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamp with time zone,
  converted_user_id uuid references auth.users(id) on delete set null,
  invite_generated_at timestamp with time zone,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint hr_candidate_intakes_status_check check (status in ('new', 'screening', 'approved_for_invite', 'invited', 'rejected', 'archived')),
  constraint hr_candidate_intakes_decision_check check (human_decision in ('pending', 'approved_to_invite', 'not_selected', 'hold'))
);

create index if not exists hr_candidate_intakes_status_updated_idx
on public.hr_candidate_intakes(status, updated_at desc);

create index if not exists hr_candidate_intakes_email_idx
on public.hr_candidate_intakes(lower(email));

create table if not exists public.employee_payroll_setup_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_candidate_id uuid references public.hr_candidate_intakes(id) on delete set null,
  status text not null default 'not_started',
  jurisdiction_state text,
  payroll_provider text,
  due_date date,
  w4_received boolean not null default false,
  i9_reviewed boolean not null default false,
  direct_deposit_ready boolean not null default false,
  state_new_hire_reported boolean not null default false,
  benefits_reviewed boolean not null default false,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamp with time zone,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (user_id),
  constraint employee_payroll_setup_tasks_status_check check (status in ('not_started', 'in_progress', 'ready_for_payroll', 'completed', 'blocked', 'not_required'))
);

create index if not exists employee_payroll_setup_tasks_status_due_idx
on public.employee_payroll_setup_tasks(status, due_date);

create table if not exists public.hr_automation_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  candidate_intake_id uuid references public.hr_candidate_intakes(id) on delete set null,
  notification_id uuid references public.portal_notifications(id) on delete set null,
  source_type text not null,
  source_id text,
  event_type text not null,
  title text not null,
  body text,
  created_by_ai boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create index if not exists hr_automation_events_target_created_idx
on public.hr_automation_events(target_user_id, created_at desc);

create index if not exists hr_automation_events_source_idx
on public.hr_automation_events(source_type, source_id);

drop trigger if exists set_hr_candidate_intakes_updated_at on public.hr_candidate_intakes;
create trigger set_hr_candidate_intakes_updated_at
before update on public.hr_candidate_intakes
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_payroll_setup_tasks_updated_at on public.employee_payroll_setup_tasks;
create trigger set_employee_payroll_setup_tasks_updated_at
before update on public.employee_payroll_setup_tasks
for each row execute function public.set_updated_at();

alter table public.hr_candidate_intakes enable row level security;
alter table public.employee_payroll_setup_tasks enable row level security;
alter table public.hr_automation_events enable row level security;

grant select, insert, update, delete on table public.hr_candidate_intakes to authenticated;
grant select, insert, update, delete on table public.employee_payroll_setup_tasks to authenticated;
grant select, insert, update, delete on table public.hr_automation_events to authenticated;
grant select, update on table public.employee_profiles to authenticated;

drop policy if exists "Admins can manage candidate intakes" on public.hr_candidate_intakes;
create policy "Admins can manage candidate intakes"
on public.hr_candidate_intakes
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read own payroll setup" on public.employee_payroll_setup_tasks;
create policy "Employees can read own payroll setup"
on public.employee_payroll_setup_tasks
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Admins can manage payroll setup" on public.employee_payroll_setup_tasks;
create policy "Admins can manage payroll setup"
on public.employee_payroll_setup_tasks
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read related automation events" on public.hr_automation_events;
create policy "Employees can read related automation events"
on public.hr_automation_events
for select
to authenticated
using (
  public.is_company_portal_admin()
  or target_user_id = (select auth.uid())
  or actor_user_id = (select auth.uid())
);

drop policy if exists "Employees can create own automation events" on public.hr_automation_events;
create policy "Employees can create own automation events"
on public.hr_automation_events
for insert
to authenticated
with check (
  public.is_company_portal_employee()
  and (
    target_user_id = (select auth.uid())
    or actor_user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can manage automation events" on public.hr_automation_events;
create policy "Admins can manage automation events"
on public.hr_automation_events
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());
