create table if not exists public.employee_chat_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  role text not null default 'employee',
  team text,
  account_status text not null default 'active',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.employee_chat_threads (
  id uuid primary key default gen_random_uuid(),
  thread_type text not null,
  title text,
  participant_one_user_id uuid references auth.users(id) on delete cascade,
  participant_two_user_id uuid references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint employee_chat_threads_type_check check (thread_type in ('company', 'direct')),
  constraint employee_chat_threads_shape_check check (
    (
      thread_type = 'company'
      and participant_one_user_id is null
      and participant_two_user_id is null
    )
    or (
      thread_type = 'direct'
      and participant_one_user_id is not null
      and participant_two_user_id is not null
      and participant_one_user_id < participant_two_user_id
    )
  )
);

create table if not exists public.employee_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.employee_chat_threads(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamp with time zone default now(),
  constraint employee_chat_messages_body_check check (
    char_length(btrim(body)) between 1 and 2000
  )
);

create unique index if not exists employee_chat_threads_company_unique_idx
on public.employee_chat_threads(thread_type)
where thread_type = 'company';

create unique index if not exists employee_chat_threads_direct_pair_idx
on public.employee_chat_threads(participant_one_user_id, participant_two_user_id)
where thread_type = 'direct';

create index if not exists employee_chat_profiles_active_idx
on public.employee_chat_profiles(account_status, display_name);

create index if not exists employee_chat_messages_thread_created_idx
on public.employee_chat_messages(thread_id, created_at desc);

drop trigger if exists set_employee_chat_profiles_updated_at on public.employee_chat_profiles;
create trigger set_employee_chat_profiles_updated_at
before update on public.employee_chat_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_chat_threads_updated_at on public.employee_chat_threads;
create trigger set_employee_chat_threads_updated_at
before update on public.employee_chat_threads
for each row execute function public.set_updated_at();

create or replace function private.sync_employee_chat_profile_from_user_role()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.employee_chat_profiles (
    user_id,
    display_name,
    email,
    role,
    team,
    account_status
  )
  select
    new.user_id,
    nullif(coalesce(profile.display_name, profile.legal_name, ''), ''),
    profile.email,
    new.role,
    new.team,
    new.account_status
  from (select 1) seed
  left join public.employee_profiles profile
    on profile.user_id = new.user_id
  on conflict (user_id)
  do update set
    display_name = coalesce(excluded.display_name, public.employee_chat_profiles.display_name),
    email = coalesce(excluded.email, public.employee_chat_profiles.email),
    role = excluded.role,
    team = excluded.team,
    account_status = excluded.account_status,
    updated_at = now();

  return new;
end;
$$;

create or replace function private.sync_employee_chat_profile_from_employee_profile()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.employee_chat_profiles (
    user_id,
    display_name,
    email,
    role,
    team,
    account_status
  )
  select
    new.user_id,
    nullif(coalesce(new.display_name, new.legal_name, ''), ''),
    new.email,
    coalesce(role_row.role, 'employee'),
    role_row.team,
    coalesce(role_row.account_status, new.profile_status, 'active')
  from public.user_roles role_row
  where role_row.user_id = new.user_id
  on conflict (user_id)
  do update set
    display_name = excluded.display_name,
    email = excluded.email,
    role = excluded.role,
    team = excluded.team,
    account_status = excluded.account_status,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists sync_employee_chat_profile_on_user_role on public.user_roles;
create trigger sync_employee_chat_profile_on_user_role
after insert or update of role, team, account_status
on public.user_roles
for each row execute function private.sync_employee_chat_profile_from_user_role();

drop trigger if exists sync_employee_chat_profile_on_employee_profile on public.employee_profiles;
create trigger sync_employee_chat_profile_on_employee_profile
after insert or update of display_name, legal_name, email, profile_status
on public.employee_profiles
for each row execute function private.sync_employee_chat_profile_from_employee_profile();

insert into public.employee_chat_profiles (
  user_id,
  display_name,
  email,
  role,
  team,
  account_status
)
select
  role_row.user_id,
  nullif(coalesce(profile.display_name, profile.legal_name, ''), ''),
  profile.email,
  role_row.role,
  role_row.team,
  role_row.account_status
from public.user_roles role_row
left join public.employee_profiles profile
  on profile.user_id = role_row.user_id
on conflict (user_id)
do update set
  display_name = coalesce(excluded.display_name, public.employee_chat_profiles.display_name),
  email = coalesce(excluded.email, public.employee_chat_profiles.email),
  role = excluded.role,
  team = excluded.team,
  account_status = excluded.account_status,
  updated_at = now();

insert into public.employee_chat_threads (thread_type, title)
values ('company', 'Company Room')
on conflict do nothing;

alter table public.employee_chat_profiles enable row level security;
alter table public.employee_chat_threads enable row level security;
alter table public.employee_chat_messages enable row level security;

drop policy if exists "Employees can read active chat profiles" on public.employee_chat_profiles;
create policy "Employees can read active chat profiles"
on public.employee_chat_profiles
for select
to authenticated
using (
  public.is_company_portal_employee()
  and account_status = 'active'
);

drop policy if exists "Admins can manage chat profiles" on public.employee_chat_profiles;
create policy "Admins can manage chat profiles"
on public.employee_chat_profiles
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read accessible chat threads" on public.employee_chat_threads;
create policy "Employees can read accessible chat threads"
on public.employee_chat_threads
for select
to authenticated
using (
  public.is_company_portal_employee()
  and (
    thread_type = 'company'
    or participant_one_user_id = (select auth.uid())
    or participant_two_user_id = (select auth.uid())
  )
);

drop policy if exists "Employees can create direct chat threads" on public.employee_chat_threads;
create policy "Employees can create direct chat threads"
on public.employee_chat_threads
for insert
to authenticated
with check (
  public.is_company_portal_employee()
  and thread_type = 'direct'
  and (
    participant_one_user_id = (select auth.uid())
    or participant_two_user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.employee_chat_profiles profile
    where profile.user_id = participant_one_user_id
      and profile.account_status = 'active'
  )
  and exists (
    select 1
    from public.employee_chat_profiles profile
    where profile.user_id = participant_two_user_id
      and profile.account_status = 'active'
  )
);

drop policy if exists "Employees can read accessible chat messages" on public.employee_chat_messages;
create policy "Employees can read accessible chat messages"
on public.employee_chat_messages
for select
to authenticated
using (
  public.is_company_portal_employee()
  and exists (
    select 1
    from public.employee_chat_threads thread
    where thread.id = employee_chat_messages.thread_id
      and (
        thread.thread_type = 'company'
        or thread.participant_one_user_id = (select auth.uid())
        or thread.participant_two_user_id = (select auth.uid())
      )
  )
);

drop policy if exists "Employees can send accessible chat messages" on public.employee_chat_messages;
create policy "Employees can send accessible chat messages"
on public.employee_chat_messages
for insert
to authenticated
with check (
  public.is_company_portal_employee()
  and sender_user_id = (select auth.uid())
  and exists (
    select 1
    from public.employee_chat_threads thread
    where thread.id = employee_chat_messages.thread_id
      and (
        thread.thread_type = 'company'
        or thread.participant_one_user_id = (select auth.uid())
        or thread.participant_two_user_id = (select auth.uid())
      )
  )
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
      and tablename = 'employee_chat_messages'
  ) then
    alter publication supabase_realtime add table public.employee_chat_messages;
  end if;
end $$;
