update public.company_positions position
set portal_user_id = profile.user_id
from public.employee_profiles profile
where position.portal_user_id is null
  and nullif(position.employee_name, '') is not null
  and coalesce(profile.profile_status, 'active') = 'active'
  and (
    lower(position.employee_name) = lower(coalesce(profile.display_name, profile.legal_name, profile.email))
    or lower(position.employee_name) = lower(split_part(coalesce(profile.display_name, profile.legal_name, profile.email), ' ', 1))
    or lower(position.employee_email) = lower(profile.email)
  );

drop view if exists public.company_position_employee_directory;

drop trigger if exists sync_company_positions_on_employee_profile on public.employee_profiles;
drop function if exists private.sync_company_positions_from_employee_profile();

alter table public.company_positions
  drop column if exists employee_name,
  drop column if exists employee_email,
  drop column if exists employee_phone;

create view public.company_position_employee_directory
with (security_barrier = true)
as
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

revoke all on public.company_position_employee_directory from anon, authenticated;
grant select on public.company_position_employee_directory to authenticated;
