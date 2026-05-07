drop policy if exists "Finance users and admins can read authorized finance users" on public.company_finance_authorized_users;
create policy "Finance users can read own authorization and owners can read all"
on public.company_finance_authorized_users
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_owner());

drop policy if exists "Admins can create authorized finance users" on public.company_finance_authorized_users;
create policy "Owners can create authorized finance users"
on public.company_finance_authorized_users
for insert
to authenticated
with check (public.is_company_portal_owner());

drop policy if exists "Admins can update authorized finance users" on public.company_finance_authorized_users;
create policy "Owners can update authorized finance users"
on public.company_finance_authorized_users
for update
to authenticated
using (public.is_company_portal_owner())
with check (public.is_company_portal_owner());

drop policy if exists "Admins can delete authorized finance users" on public.company_finance_authorized_users;
create policy "Owners can delete authorized finance users"
on public.company_finance_authorized_users
for delete
to authenticated
using (public.is_company_portal_owner());
