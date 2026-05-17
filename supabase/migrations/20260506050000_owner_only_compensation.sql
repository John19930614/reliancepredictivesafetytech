create schema if not exists private;
revoke all on schema private from anon, authenticated;

create or replace function public.is_company_portal_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and account_status = 'active'
      and role in ('platform_admin', 'super_admin')
  );
$$;

drop policy if exists "Admins can manage employee pay rates" on public.employee_pay_rates;
drop policy if exists "Owners can manage employee pay rates" on public.employee_pay_rates;
create policy "Owners can manage employee pay rates"
on public.employee_pay_rates
for all
to authenticated
using (public.is_company_portal_owner())
with check (public.is_company_portal_owner());

drop policy if exists "Admins can manage time card payroll" on public.employee_time_card_payroll;
drop policy if exists "Owners can manage time card payroll" on public.employee_time_card_payroll;
create policy "Owners can manage time card payroll"
on public.employee_time_card_payroll
for all
to authenticated
using (public.is_company_portal_owner())
with check (public.is_company_portal_owner());

create or replace function private.prevent_non_owner_compensation_changes()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if public.is_company_portal_owner() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.salary_min is not null or new.salary_max is not null then
      raise exception 'Only owners can set position compensation.';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.salary_min is distinct from old.salary_min
      or new.salary_max is distinct from old.salary_max
      or new.salary_period is distinct from old.salary_period then
      raise exception 'Only owners can change position compensation.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_non_owner_compensation_changes on public.company_positions;
create trigger prevent_non_owner_compensation_changes
before insert or update on public.company_positions
for each row execute function private.prevent_non_owner_compensation_changes();
