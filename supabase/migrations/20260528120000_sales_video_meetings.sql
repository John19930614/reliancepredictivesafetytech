create table if not exists public.sales_video_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_by uuid references auth.users(id) on delete set null,
  client_id uuid references public.company_clients(id) on delete set null,
  demo_request_id uuid references public.demo_requests(id) on delete set null,
  status text not null default 'scheduled',
  scheduled_at timestamp with time zone,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  expires_at timestamp with time zone not null default (now() + interval '7 days'),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint sales_video_meetings_status_check check (status in ('scheduled', 'active', 'ended', 'cancelled'))
);

create table if not exists public.sales_video_meeting_invites (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.sales_video_meetings(id) on delete cascade,
  recipient_email text not null,
  recipient_name text,
  token_hash text not null unique,
  status text not null default 'pending',
  sent_at timestamp with time zone,
  accepted_at timestamp with time zone,
  revoked_at timestamp with time zone,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint sales_video_meeting_invites_status_check check (status in ('pending', 'sent', 'accepted', 'revoked', 'expired'))
);

create table if not exists public.sales_video_meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.sales_video_meetings(id) on delete cascade,
  invite_id uuid references public.sales_video_meeting_invites(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade,
  guest_user_id uuid references auth.users(id) on delete cascade,
  participant_type text not null,
  display_name text not null,
  email text,
  status text not null default 'invited',
  audio_enabled boolean not null default true,
  video_enabled boolean not null default true,
  screen_sharing boolean not null default false,
  joined_at timestamp with time zone,
  left_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint sales_video_meeting_participants_type_check check (participant_type in ('employee', 'guest')),
  constraint sales_video_meeting_participants_status_check check (status in ('invited', 'joined', 'left', 'declined')),
  constraint sales_video_meeting_participants_identity_check check (
    (participant_type = 'employee' and user_id is not null and guest_user_id is null)
    or
    (participant_type = 'guest' and guest_user_id is not null)
  )
);

create unique index if not exists sales_video_meeting_participants_employee_unique
on public.sales_video_meeting_participants(meeting_id, user_id)
where user_id is not null;

create unique index if not exists sales_video_meeting_participants_guest_unique
on public.sales_video_meeting_participants(meeting_id, guest_user_id)
where guest_user_id is not null;

create index if not exists sales_video_meetings_creator_idx
on public.sales_video_meetings(created_by, created_at desc);

create index if not exists sales_video_meeting_invites_meeting_idx
on public.sales_video_meeting_invites(meeting_id, recipient_email);

create index if not exists sales_video_meeting_participants_meeting_idx
on public.sales_video_meeting_participants(meeting_id, status);

drop trigger if exists set_sales_video_meetings_updated_at on public.sales_video_meetings;
create trigger set_sales_video_meetings_updated_at
before update on public.sales_video_meetings
for each row execute function public.set_updated_at();

drop trigger if exists set_sales_video_meeting_invites_updated_at on public.sales_video_meeting_invites;
create trigger set_sales_video_meeting_invites_updated_at
before update on public.sales_video_meeting_invites
for each row execute function public.set_updated_at();

drop trigger if exists set_sales_video_meeting_participants_updated_at on public.sales_video_meeting_participants;
create trigger set_sales_video_meeting_participants_updated_at
before update on public.sales_video_meeting_participants
for each row execute function public.set_updated_at();

create or replace function private.can_access_sales_video_meeting(meeting_id uuid)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select
    public.is_company_portal_employee()
    or exists (
      select 1
      from public.sales_video_meeting_participants participant
      join public.sales_video_meetings meeting
        on meeting.id = participant.meeting_id
      where participant.meeting_id = $1
        and participant.guest_user_id = (select auth.uid())
        and participant.participant_type = 'guest'
        and participant.status in ('invited', 'joined')
        and meeting.status in ('scheduled', 'active')
        and meeting.expires_at > now()
    );
$$;

create or replace function private.can_access_sales_video_meeting_topic(topic text)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select private.can_access_sales_video_meeting(
    nullif(substring(topic from '^sales-meeting:([0-9a-fA-F-]{36})$'), '')::uuid
  );
$$;

revoke execute on function private.can_access_sales_video_meeting(uuid) from public, anon;
revoke execute on function private.can_access_sales_video_meeting_topic(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_access_sales_video_meeting(uuid) to authenticated;
grant execute on function private.can_access_sales_video_meeting_topic(text) to authenticated;

alter table public.sales_video_meetings enable row level security;
alter table public.sales_video_meeting_invites enable row level security;
alter table public.sales_video_meeting_participants enable row level security;

drop policy if exists "Employees can read sales video meetings" on public.sales_video_meetings;
create policy "Employees can read sales video meetings"
on public.sales_video_meetings
for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Employees can create sales video meetings" on public.sales_video_meetings;
create policy "Employees can create sales video meetings"
on public.sales_video_meetings
for insert
to authenticated
with check (public.is_company_portal_employee() and created_by = (select auth.uid()));

drop policy if exists "Employees can update sales video meetings" on public.sales_video_meetings;
create policy "Employees can update sales video meetings"
on public.sales_video_meetings
for update
to authenticated
using (public.is_company_portal_employee())
with check (public.is_company_portal_employee());

drop policy if exists "Guests can read joined sales video meetings" on public.sales_video_meetings;
create policy "Guests can read joined sales video meetings"
on public.sales_video_meetings
for select
to authenticated
using (private.can_access_sales_video_meeting(id));

drop policy if exists "Employees can manage sales video meeting invites" on public.sales_video_meeting_invites;
create policy "Employees can manage sales video meeting invites"
on public.sales_video_meeting_invites
for all
to authenticated
using (public.is_company_portal_employee())
with check (public.is_company_portal_employee());

drop policy if exists "Guests can read own sales video meeting invite" on public.sales_video_meeting_invites;
create policy "Guests can read own sales video meeting invite"
on public.sales_video_meeting_invites
for select
to authenticated
using (
  exists (
    select 1
    from public.sales_video_meeting_participants participant
    where participant.invite_id = sales_video_meeting_invites.id
      and participant.guest_user_id = (select auth.uid())
      and participant.participant_type = 'guest'
  )
);

drop policy if exists "Employees can manage sales video meeting participants" on public.sales_video_meeting_participants;
create policy "Employees can manage sales video meeting participants"
on public.sales_video_meeting_participants
for all
to authenticated
using (public.is_company_portal_employee())
with check (public.is_company_portal_employee());

drop policy if exists "Participants can read sales video meeting participants" on public.sales_video_meeting_participants;
create policy "Participants can read sales video meeting participants"
on public.sales_video_meeting_participants
for select
to authenticated
using (private.can_access_sales_video_meeting(meeting_id));

drop policy if exists "Guests can update own sales video meeting participant" on public.sales_video_meeting_participants;
create policy "Guests can update own sales video meeting participant"
on public.sales_video_meeting_participants
for update
to authenticated
using (
  participant_type = 'guest'
  and guest_user_id = (select auth.uid())
  and private.can_access_sales_video_meeting(meeting_id)
)
with check (
  participant_type = 'guest'
  and guest_user_id = (select auth.uid())
  and private.can_access_sales_video_meeting(meeting_id)
);

drop policy if exists "Sales meeting participants can receive signaling" on realtime.messages;
create policy "Sales meeting participants can receive signaling"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.can_access_sales_video_meeting_topic((select realtime.topic()))
);

drop policy if exists "Sales meeting participants can send signaling" on realtime.messages;
create policy "Sales meeting participants can send signaling"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.can_access_sales_video_meeting_topic((select realtime.topic()))
);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sales_video_meetings'
  ) then
    alter publication supabase_realtime add table public.sales_video_meetings;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sales_video_meeting_participants'
  ) then
    alter publication supabase_realtime add table public.sales_video_meeting_participants;
  end if;
end $$;
