-- Employee Time Off (PTO): policies, per-year balances, and request workflow.
--
-- MODULE_ID: employee_time_off
-- Closes the gap between Time Cards (hours worked), Calendar (event_type
-- 'time_off' with no balance tracking), and Payroll (no leave input).
--
-- Rollback:
--   drop table if exists public.employee_time_off_requests;
--   drop table if exists public.employee_time_off_balances;
--   drop table if exists public.employee_time_off_policies;

-- ---------------------------------------------------------------------------
-- Policies: one row per leave type, admin-managed.
-- ---------------------------------------------------------------------------
create table employee_time_off_policies (
  id                  uuid primary key default gen_random_uuid(),
  leave_type          text not null unique
                        check (leave_type in ('vacation', 'sick', 'personal', 'bereavement', 'jury_duty', 'unpaid')),
  label               text not null,
  annual_hours        numeric(6, 2) not null default 0 check (annual_hours >= 0),
  carryover_cap_hours numeric(6, 2) not null default 0 check (carryover_cap_hours >= 0),
  requires_approval   boolean not null default true,
  is_paid             boolean not null default true,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table employee_time_off_policies enable row level security;

create policy "Employees can view time off policies"
  on employee_time_off_policies for select
  using (public.is_company_portal_employee());

create policy "Admins can manage time off policies"
  on employee_time_off_policies for all
  using (public.is_company_portal_admin())
  with check (public.is_company_portal_admin());

drop trigger if exists set_employee_time_off_policies_updated_at on public.employee_time_off_policies;
create trigger set_employee_time_off_policies_updated_at
before update on public.employee_time_off_policies
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Balances: one row per user / leave type / policy year.
-- ---------------------------------------------------------------------------
create table employee_time_off_balances (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  leave_type       text not null
                     check (leave_type in ('vacation', 'sick', 'personal', 'bereavement', 'jury_duty', 'unpaid')),
  policy_year      integer not null,
  accrued_hours    numeric(6, 2) not null default 0 check (accrued_hours >= 0),
  carryover_hours  numeric(6, 2) not null default 0 check (carryover_hours >= 0),
  used_hours       numeric(6, 2) not null default 0 check (used_hours >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, leave_type, policy_year)
);

create index employee_time_off_balances_user_id_idx on employee_time_off_balances (user_id);
create index employee_time_off_balances_year_idx    on employee_time_off_balances (policy_year);

alter table employee_time_off_balances enable row level security;

-- An employee sees only their own balance; admins see everyone's.
create policy "Employees can view their own time off balance"
  on employee_time_off_balances for select
  using (
    public.is_company_portal_employee()
    and (user_id = auth.uid() or public.is_company_portal_admin())
  );

create policy "Admins can manage time off balances"
  on employee_time_off_balances for all
  using (public.is_company_portal_admin())
  with check (public.is_company_portal_admin());

drop trigger if exists set_employee_time_off_balances_updated_at on public.employee_time_off_balances;
create trigger set_employee_time_off_balances_updated_at
before update on public.employee_time_off_balances
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Requests: the approval workflow.
-- ---------------------------------------------------------------------------
create table employee_time_off_requests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  leave_type        text not null
                      check (leave_type in ('vacation', 'sick', 'personal', 'bereavement', 'jury_duty', 'unpaid')),
  start_date        date not null,
  end_date          date not null,
  hours_requested   numeric(6, 2) not null check (hours_requested > 0),
  reason            text,
  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'denied', 'cancelled')),
  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  review_note       text,
  calendar_event_id uuid references employee_calendar_events(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_date >= start_date)
);

create index employee_time_off_requests_user_id_idx    on employee_time_off_requests (user_id);
create index employee_time_off_requests_status_idx     on employee_time_off_requests (status);
create index employee_time_off_requests_start_date_idx on employee_time_off_requests (start_date);

alter table employee_time_off_requests enable row level security;

create policy "Employees can view their own time off requests"
  on employee_time_off_requests for select
  using (
    public.is_company_portal_employee()
    and (user_id = auth.uid() or public.is_company_portal_admin())
  );

-- Employees may only file requests for themselves, and only in 'pending'.
create policy "Employees can create their own time off requests"
  on employee_time_off_requests for insert
  with check (
    public.is_company_portal_employee()
    and user_id = auth.uid()
    and status = 'pending'
  );

-- Employees may edit their own request (to cancel); admins may review any.
create policy "Employees can update their own time off requests"
  on employee_time_off_requests for update
  using (
    public.is_company_portal_employee()
    and (user_id = auth.uid() or public.is_company_portal_admin())
  )
  with check (
    public.is_company_portal_employee()
    and (user_id = auth.uid() or public.is_company_portal_admin())
  );

-- Deliberately no DELETE policy: requests are an auditable record and are
-- cancelled (status = 'cancelled'), never removed.

drop trigger if exists set_employee_time_off_requests_updated_at on public.employee_time_off_requests;
create trigger set_employee_time_off_requests_updated_at
before update on public.employee_time_off_requests
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Seed the default policy set.
-- ---------------------------------------------------------------------------
insert into employee_time_off_policies (leave_type, label, annual_hours, carryover_cap_hours, requires_approval, is_paid)
values
  ('vacation',    'Vacation',            80, 40, true,  true),
  ('sick',        'Sick Leave',          40,  0, false, true),
  ('personal',    'Personal Day',        16,  0, true,  true),
  ('bereavement', 'Bereavement Leave',   24,  0, true,  true),
  ('jury_duty',   'Jury Duty',            0,  0, true,  true),
  ('unpaid',      'Unpaid Leave',         0,  0, true,  false)
on conflict (leave_type) do nothing;
