create schema if not exists private;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  submitter_name text not null,
  submitter_email text not null,
  submitter_phone text,
  company text,
  subject text not null,
  category text not null default 'Other',
  priority text not null default 'normal',
  issue_url text,
  message text not null,
  status text not null default 'new',
  submitted_by_user_id uuid references auth.users(id) on delete set null,
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint support_tickets_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint support_tickets_status_check check (status in ('new', 'reviewing', 'waiting on customer', 'resolved', 'closed'))
);

create index if not exists support_tickets_status_created_idx
on public.support_tickets(status, created_at desc);

create index if not exists support_tickets_assigned_created_idx
on public.support_tickets(assigned_to_user_id, created_at desc);

create table if not exists public.support_ticket_recipients (
  recipient_user_id uuid primary key references auth.users(id) on delete cascade,
  label text not null default 'Support inbox',
  active boolean not null default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

drop trigger if exists set_support_tickets_updated_at on public.support_tickets;
create trigger set_support_tickets_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

drop trigger if exists set_support_ticket_recipients_updated_at on public.support_ticket_recipients;
create trigger set_support_ticket_recipients_updated_at
before update on public.support_ticket_recipients
for each row execute function public.set_updated_at();

alter table public.support_tickets enable row level security;
alter table public.support_ticket_recipients enable row level security;

drop policy if exists "Public users can create support tickets" on public.support_tickets;
create policy "Public users can create support tickets"
on public.support_tickets
for insert
to anon, authenticated
with check (
  status = 'new'
  and assigned_to_user_id is null
  and (submitted_by_user_id is null or submitted_by_user_id = (select auth.uid()))
  and priority in ('low', 'normal', 'high', 'urgent')
);

drop policy if exists "Employees can read support tickets" on public.support_tickets;
create policy "Employees can read support tickets"
on public.support_tickets
for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Employees can update support tickets" on public.support_tickets;
create policy "Employees can update support tickets"
on public.support_tickets
for update
to authenticated
using (public.is_company_portal_employee())
with check (public.is_company_portal_employee());

drop policy if exists "Admins can read support ticket recipients" on public.support_ticket_recipients;
create policy "Admins can read support ticket recipients"
on public.support_ticket_recipients
for select
to authenticated
using (public.is_company_portal_admin());

drop policy if exists "Admins can manage support ticket recipients" on public.support_ticket_recipients;
create policy "Admins can manage support ticket recipients"
on public.support_ticket_recipients
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

grant insert on public.support_tickets to anon, authenticated;
grant select, update on public.support_tickets to authenticated;
grant select, insert, update, delete on public.support_ticket_recipients to authenticated;

create or replace function private.create_support_ticket_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.portal_notifications (
    recipient_user_id,
    title,
    body,
    priority,
    source_type,
    source_id,
    action_href,
    dedupe_key,
    created_by_ai,
    metadata
  )
  select
    recipient.recipient_user_id,
    'New tech support ticket: ' || left(new.subject, 110),
    concat(
      new.submitter_name,
      ' submitted a ',
      new.category,
      ' ticket. ',
      left(new.message, 260)
    ),
    case
      when new.priority = 'urgent' then 'critical'
      when new.priority = 'high' then 'high'
      else 'medium'
    end,
    'support_ticket',
    new.id::text,
    '/employee/inbox?tab=support#support-ticket-' || new.id::text,
    'support-ticket-' || new.id::text,
    false,
    jsonb_build_object(
      'ticket_id', new.id,
      'category', new.category,
      'priority', new.priority,
      'submitter_email', new.submitter_email
    )
  from public.support_ticket_recipients recipient
  where recipient.active = true
  on conflict (recipient_user_id, dedupe_key)
  where dedupe_key is not null and status <> 'archived'
  do nothing;

  return new;
end;
$$;

drop trigger if exists create_support_ticket_notifications on public.support_tickets;
create trigger create_support_ticket_notifications
after insert on public.support_tickets
for each row execute function private.create_support_ticket_notifications();

insert into public.support_ticket_recipients (recipient_user_id, label, active)
select id, 'Primary support inbox', true
from auth.users
where lower(email) = lower('john.h.haldemann@gmail.com')
on conflict (recipient_user_id) do update
set active = true,
    label = excluded.label;
