create table if not exists public.portal_user_module_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  primary key (user_id, module_key)
);

alter table public.portal_user_module_access
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists module_key text,
  add column if not exists granted_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamp with time zone default now(),
  add column if not exists updated_at timestamp with time zone default now();

alter table public.portal_user_module_access
  alter column user_id set not null,
  alter column module_key set not null;

alter table public.portal_user_module_access
  drop constraint if exists portal_user_module_access_module_key_check;

alter table public.portal_user_module_access
  add constraint portal_user_module_access_module_key_check
  check (
    module_key in (
      'dashboard',
      'ai_command',
      'website_operations',
      'work_management',
      'parking_lots',
      'finance',
      'operations_database',
      'startup_checklist',
      'demo_showcase',
      'request_inbox',
      'sales_pipeline',
      'active_companies',
      'company_tree',
      'hr_onboarding',
      'training',
      'hr_documents',
      'time_cards',
      'master_document_library',
      'legal_issues',
      'required_documents',
      'launch_gate',
      'users',
      'settings'
    )
  );

create or replace function public.is_company_portal_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and account_status = 'active'
      and role = 'super_admin'
  );
$$;

drop trigger if exists set_portal_user_module_access_updated_at on public.portal_user_module_access;
create trigger set_portal_user_module_access_updated_at
before update on public.portal_user_module_access
for each row execute function public.set_updated_at();

alter table public.portal_user_module_access enable row level security;

grant select, insert, update, delete on public.portal_user_module_access to authenticated;

drop policy if exists "Users can read own portal module access" on public.portal_user_module_access;
create policy "Users can read own portal module access"
on public.portal_user_module_access
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_super_admin());

drop policy if exists "Super admins can create portal module access" on public.portal_user_module_access;
create policy "Super admins can create portal module access"
on public.portal_user_module_access
for insert
to authenticated
with check (public.is_company_portal_super_admin());

drop policy if exists "Super admins can update portal module access" on public.portal_user_module_access;
create policy "Super admins can update portal module access"
on public.portal_user_module_access
for update
to authenticated
using (public.is_company_portal_super_admin())
with check (public.is_company_portal_super_admin());

drop policy if exists "Super admins can delete portal module access" on public.portal_user_module_access;
create policy "Super admins can delete portal module access"
on public.portal_user_module_access
for delete
to authenticated
using (public.is_company_portal_super_admin());
