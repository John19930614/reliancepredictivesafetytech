alter table public.employee_chat_profiles
add column if not exists last_seen_at timestamp with time zone;

create index if not exists employee_chat_profiles_last_seen_at_idx
on public.employee_chat_profiles(last_seen_at desc);

create or replace function public.mark_employee_last_seen()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or not public.is_company_portal_employee() then
    raise exception 'Not authorized.';
  end if;

  update public.employee_chat_profiles
  set
    last_seen_at = now(),
    updated_at = now()
  where user_id = current_user_id;

  if found then
    return;
  end if;

  insert into public.employee_chat_profiles (
    user_id,
    display_name,
    email,
    role,
    team,
    account_status,
    last_seen_at
  )
  select
    role_row.user_id,
    nullif(coalesce(profile.display_name, profile.legal_name, ''), ''),
    profile.email,
    role_row.role,
    role_row.team,
    role_row.account_status,
    now()
  from public.user_roles role_row
  left join public.employee_profiles profile
    on profile.user_id = role_row.user_id
  where role_row.user_id = current_user_id
    and role_row.account_status = 'active';
end;
$$;

revoke execute on function public.mark_employee_last_seen() from public, anon;
grant execute on function public.mark_employee_last_seen() to authenticated;
