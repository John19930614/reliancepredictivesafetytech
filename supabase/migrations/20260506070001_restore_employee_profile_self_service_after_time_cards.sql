drop policy if exists "Employees can insert own profile" on public.employee_profiles;
create policy "Employees can insert own profile"
on public.employee_profiles for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_company_portal_employee()
);

drop policy if exists "Employees can update own profile" on public.employee_profiles;
create policy "Employees can update own profile"
on public.employee_profiles for update
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_company_portal_employee()
)
with check (
  user_id = (select auth.uid())
  and public.is_company_portal_employee()
);
