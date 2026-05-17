create schema if not exists private;
revoke all on schema private from anon, authenticated;

create index if not exists company_positions_portal_user_id_idx
on public.company_positions(portal_user_id);

create or replace function private.sync_company_positions_from_employee_profile()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if coalesce(new.profile_status, 'active') = 'active' then
    update public.company_positions
    set
      employee_name = nullif(coalesce(new.display_name, new.legal_name, ''), ''),
      employee_email = new.email,
      employee_phone = new.phone
    where portal_user_id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_company_positions_on_employee_profile on public.employee_profiles;
create trigger sync_company_positions_on_employee_profile
after insert or update of display_name, legal_name, email, phone, profile_status
on public.employee_profiles
for each row execute function private.sync_company_positions_from_employee_profile();

update public.company_positions position
set
  employee_name = nullif(coalesce(profile.display_name, profile.legal_name, ''), ''),
  employee_email = profile.email,
  employee_phone = profile.phone
from public.employee_profiles profile
where position.portal_user_id = profile.user_id
  and coalesce(profile.profile_status, 'active') = 'active';
