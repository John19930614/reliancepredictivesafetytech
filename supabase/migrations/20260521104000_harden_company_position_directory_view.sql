create schema if not exists private;
revoke all on schema private from anon, authenticated;

create or replace function private.get_company_position_employee_directory()
returns table (
  position_id uuid,
  user_id uuid,
  display_name text,
  legal_name text,
  email text,
  phone text,
  profile_status text
)
language sql
stable
security definer
set search_path = public, private
as $$
  select
    position.id as position_id,
    profile.user_id,
    profile.display_name,
    profile.legal_name,
    profile.email,
    profile.phone,
    profile.profile_status
  from public.company_positions position
  join public.employee_profiles profile
    on profile.user_id = position.portal_user_id
  where coalesce(profile.profile_status, 'active') = 'active'
    and public.is_company_portal_employee();
$$;

revoke all on function private.get_company_position_employee_directory() from public, anon, authenticated;
grant execute on function private.get_company_position_employee_directory() to authenticated;

drop view if exists public.company_position_employee_directory;
create view public.company_position_employee_directory
with (security_invoker = true, security_barrier = true)
as
select * from private.get_company_position_employee_directory();

revoke all on public.company_position_employee_directory from anon, authenticated;
grant select on public.company_position_employee_directory to authenticated;
