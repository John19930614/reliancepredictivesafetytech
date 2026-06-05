create table if not exists public.employee_chat_calls (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.employee_chat_threads(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'active',
  started_at timestamp with time zone default now(),
  ended_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint employee_chat_calls_status_check check (status in ('active', 'ended', 'declined', 'missed'))
);

create table if not exists public.employee_chat_call_participants (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.employee_chat_calls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'invited',
  audio_enabled boolean not null default true,
  video_enabled boolean not null default true,
  screen_sharing boolean not null default false,
  joined_at timestamp with time zone,
  left_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint employee_chat_call_participants_status_check check (status in ('invited', 'joined', 'declined', 'left', 'missed')),
  constraint employee_chat_call_participants_unique unique (call_id, user_id)
);

create index if not exists employee_chat_calls_thread_started_idx
on public.employee_chat_calls(thread_id, started_at desc);

create index if not exists employee_chat_calls_status_idx
on public.employee_chat_calls(status, started_at desc);

create index if not exists employee_chat_call_participants_user_idx
on public.employee_chat_call_participants(user_id, status);

drop trigger if exists set_employee_chat_calls_updated_at on public.employee_chat_calls;
create trigger set_employee_chat_calls_updated_at
before update on public.employee_chat_calls
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_chat_call_participants_updated_at on public.employee_chat_call_participants;
create trigger set_employee_chat_call_participants_updated_at
before update on public.employee_chat_call_participants
for each row execute function public.set_updated_at();

create or replace function private.can_access_employee_chat_call_topic(topic text)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.employee_chat_calls call
    join public.employee_chat_threads thread
      on thread.id = call.thread_id
    where call.id = nullif(substring(topic from '^employee-call:([0-9a-fA-F-]{36})$'), '')::uuid
      and public.is_company_portal_employee()
      and (
        thread.thread_type = 'company'
        or thread.participant_one_user_id = (select auth.uid())
        or thread.participant_two_user_id = (select auth.uid())
      )
  );
$$;

revoke execute on function private.can_access_employee_chat_call_topic(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_access_employee_chat_call_topic(text) to authenticated;

alter table public.employee_chat_calls enable row level security;
alter table public.employee_chat_call_participants enable row level security;

drop policy if exists "Employees can read accessible chat calls" on public.employee_chat_calls;
create policy "Employees can read accessible chat calls"
on public.employee_chat_calls
for select
to authenticated
using (
  public.is_company_portal_employee()
  and exists (
    select 1
    from public.employee_chat_threads thread
    where thread.id = employee_chat_calls.thread_id
      and (
        thread.thread_type = 'company'
        or thread.participant_one_user_id = (select auth.uid())
        or thread.participant_two_user_id = (select auth.uid())
      )
  )
);

drop policy if exists "Employees can create accessible chat calls" on public.employee_chat_calls;
create policy "Employees can create accessible chat calls"
on public.employee_chat_calls
for insert
to authenticated
with check (
  public.is_company_portal_employee()
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.employee_chat_threads thread
    where thread.id = employee_chat_calls.thread_id
      and (
        thread.thread_type = 'company'
        or thread.participant_one_user_id = (select auth.uid())
        or thread.participant_two_user_id = (select auth.uid())
      )
  )
);

drop policy if exists "Employees can update joined chat calls" on public.employee_chat_calls;
create policy "Employees can update joined chat calls"
on public.employee_chat_calls
for update
to authenticated
using (
  public.is_company_portal_employee()
  and exists (
    select 1
    from public.employee_chat_threads thread
    where thread.id = employee_chat_calls.thread_id
      and (
        thread.thread_type = 'company'
        or thread.participant_one_user_id = (select auth.uid())
        or thread.participant_two_user_id = (select auth.uid())
      )
  )
)
with check (
  public.is_company_portal_employee()
  and exists (
    select 1
    from public.employee_chat_threads thread
    where thread.id = employee_chat_calls.thread_id
      and (
        thread.thread_type = 'company'
        or thread.participant_one_user_id = (select auth.uid())
        or thread.participant_two_user_id = (select auth.uid())
      )
  )
);

drop policy if exists "Employees can read accessible chat call participants" on public.employee_chat_call_participants;
create policy "Employees can read accessible chat call participants"
on public.employee_chat_call_participants
for select
to authenticated
using (
  public.is_company_portal_employee()
  and exists (
    select 1
    from public.employee_chat_calls call
    join public.employee_chat_threads thread
      on thread.id = call.thread_id
    where call.id = employee_chat_call_participants.call_id
      and (
        thread.thread_type = 'company'
        or thread.participant_one_user_id = (select auth.uid())
        or thread.participant_two_user_id = (select auth.uid())
      )
  )
);

drop policy if exists "Employees can create accessible chat call participants" on public.employee_chat_call_participants;
create policy "Employees can create accessible chat call participants"
on public.employee_chat_call_participants
for insert
to authenticated
with check (
  public.is_company_portal_employee()
  and (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.employee_chat_calls call
      where call.id = employee_chat_call_participants.call_id
        and call.created_by = (select auth.uid())
    )
  )
  and exists (
    select 1
    from public.employee_chat_calls call
    join public.employee_chat_threads thread
      on thread.id = call.thread_id
    where call.id = employee_chat_call_participants.call_id
      and (
        thread.thread_type = 'company'
        or thread.participant_one_user_id = (select auth.uid())
        or thread.participant_two_user_id = (select auth.uid())
      )
  )
);

drop policy if exists "Employees can update own chat call participants" on public.employee_chat_call_participants;
create policy "Employees can update own chat call participants"
on public.employee_chat_call_participants
for update
to authenticated
using (
  public.is_company_portal_employee()
  and (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.employee_chat_calls call
      where call.id = employee_chat_call_participants.call_id
        and call.created_by = (select auth.uid())
    )
  )
)
with check (
  public.is_company_portal_employee()
  and (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.employee_chat_calls call
      where call.id = employee_chat_call_participants.call_id
        and call.created_by = (select auth.uid())
    )
  )
);

drop policy if exists "Employees can receive employee call signaling" on realtime.messages;
create policy "Employees can receive employee call signaling"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.can_access_employee_chat_call_topic((select realtime.topic()))
);

drop policy if exists "Employees can send employee call signaling" on realtime.messages;
create policy "Employees can send employee call signaling"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.can_access_employee_chat_call_topic((select realtime.topic()))
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
      and tablename = 'employee_chat_calls'
  ) then
    alter publication supabase_realtime add table public.employee_chat_calls;
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
      and tablename = 'employee_chat_call_participants'
  ) then
    alter publication supabase_realtime add table public.employee_chat_call_participants;
  end if;
end $$;
