-- Employee calendar events and attendees

create table employee_calendar_events (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null references auth.users(id),
  title        text not null,
  description  text,
  event_type   text not null default 'meeting'
                 check (event_type in ('meeting', 'time_off', 'holiday', 'other')),
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  all_day      boolean not null default false,
  visibility   text not null default 'company'
                 check (visibility in ('private', 'company')),
  status       text not null default 'confirmed'
                 check (status in ('pending', 'confirmed', 'approved', 'rejected', 'cancelled')),
  location     text,
  approved_by  uuid references auth.users(id),
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_at >= start_at)
);

create index employee_calendar_events_created_by_idx on employee_calendar_events (created_by);
create index employee_calendar_events_start_at_idx   on employee_calendar_events (start_at);
create index employee_calendar_events_event_type_idx on employee_calendar_events (event_type);
create index employee_calendar_events_status_idx     on employee_calendar_events (status);

alter table employee_calendar_events enable row level security;

-- All active employees can view company-visible events or their own private events
create policy "Employees can view calendar events"
  on employee_calendar_events for select
  using (
    public.is_company_portal_employee()
    and (visibility = 'company' or created_by = auth.uid())
  );

create policy "Employees can create calendar events"
  on employee_calendar_events for insert
  with check (
    public.is_company_portal_employee()
    and created_by = auth.uid()
  );

-- Employees can update their own events; admins can update all (for approvals)
create policy "Employees can update their own calendar events"
  on employee_calendar_events for update
  using (
    public.is_company_portal_employee()
    and (created_by = auth.uid() or public.is_company_portal_admin())
  );

create policy "Employees can delete their own calendar events"
  on employee_calendar_events for delete
  using (
    public.is_company_portal_employee()
    and created_by = auth.uid()
  );

-- Attendees for meeting events
create table employee_calendar_event_attendees (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references employee_calendar_events(id) on delete cascade,
  user_id    uuid not null references auth.users(id),
  status     text not null default 'invited'
               check (status in ('invited', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index employee_calendar_event_attendees_event_id_idx on employee_calendar_event_attendees (event_id);
create index employee_calendar_event_attendees_user_id_idx  on employee_calendar_event_attendees (user_id);

alter table employee_calendar_event_attendees enable row level security;

create policy "Employees can view attendees for visible events"
  on employee_calendar_event_attendees for select
  using (public.is_company_portal_employee());

create policy "Employees can manage attendees for their events"
  on employee_calendar_event_attendees for insert
  with check (
    public.is_company_portal_employee()
    and exists (
      select 1 from employee_calendar_events
      where id = event_id and created_by = auth.uid()
    )
  );

create policy "Employees can delete attendees for their events"
  on employee_calendar_event_attendees for delete
  using (
    public.is_company_portal_employee()
    and exists (
      select 1 from employee_calendar_events
      where id = event_id and created_by = auth.uid()
    )
  );

