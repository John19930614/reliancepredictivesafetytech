create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'employee',
  team text,
  account_status text not null default 'active',
  company_id uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.user_roles
  add column if not exists role text not null default 'employee',
  add column if not exists team text,
  add column if not exists account_status text not null default 'active',
  add column if not exists company_id uuid,
  add column if not exists created_at timestamp with time zone default now(),
  add column if not exists updated_at timestamp with time zone default now();

create or replace function public.is_company_portal_admin()
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
      and role in (
        'platform_admin',
        'super_admin',
        'admin',
        'company_admin'
      )
  );
$$;

drop trigger if exists set_user_roles_updated_at on public.user_roles;
create trigger set_user_roles_updated_at
before update on public.user_roles
for each row execute function public.set_updated_at();

alter table public.user_roles enable row level security;

drop policy if exists "Employees can read own user role" on public.user_roles;
create policy "Employees can read own user role"
on public.user_roles
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Admins can insert user roles" on public.user_roles;
create policy "Admins can insert user roles"
on public.user_roles
for insert
to authenticated
with check (public.is_company_portal_admin());

drop policy if exists "Admins can update user roles" on public.user_roles;
create policy "Admins can update user roles"
on public.user_roles
for update
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Admins can delete user roles" on public.user_roles;
create policy "Admins can delete user roles"
on public.user_roles
for delete
to authenticated
using (public.is_company_portal_admin());
