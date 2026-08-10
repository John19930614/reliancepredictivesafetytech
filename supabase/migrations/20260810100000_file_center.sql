-- File Center (Governance group)
-- MODULE_ID: file_center — one place to store and browse the company's own
-- files and the files kept per client. Two scopes share one pair of tables:
--   'company' — client_id is null; the firm's internal library
--   'client'  — client_id points at company_clients; that client's folder tree
-- A scope/client consistency check makes the broken states (company file
-- pointing at a client, client file with no client) unrepresentable, so the
-- browse surface never has to defend against them.
--
-- TENANT MODEL: single-tenant internal portal, mirroring client_proposals /
--   company_clients. Any active portal employee may read, upload, and organize
--   files and folders; deleting a FILE row (the destructive act — it orphans a
--   storage object) is admin-only. Deleting a FOLDER is employee-level because
--   it is non-destructive: the files FK sets folder_id null, so a removed
--   folder spills its contents back to the scope root instead of taking them
--   down with it. Employees who want a file gone use archived_at.
--
-- ROLLBACK:
--   drop policy if exists "Employees can view file center files" on storage.objects;
--   drop policy if exists "Employees can upload file center files" on storage.objects;
--   drop policy if exists "Employees can replace file center files" on storage.objects;
--   drop policy if exists "Employees can delete file center files" on storage.objects;
--   delete from storage.objects where bucket_id = 'file-center';
--   delete from storage.buckets where id = 'file-center';
--   drop table if exists public.company_files cascade;
--   drop table if exists public.company_file_folders cascade;
--   delete from public.portal_user_module_access where module_key = 'file_center';
--   -- then re-apply the module_key check from 20260731120000_mobile_app_module_access.sql
--   -- (plus 'ehs_talent_engine' and 'employee_time_off', which this migration also repairs)

-- ============================================================================
-- 1. company_file_folders — nested folder tree, one tree per scope/client
-- ============================================================================
create table if not exists public.company_file_folders (
  id uuid default gen_random_uuid() primary key,
  scope text not null check (scope in ('company', 'client')),
  client_id uuid references public.company_clients(id) on delete cascade,
  -- Cascade on parent delete only removes descendant FOLDERS; files survive via
  -- their own set-null FK below.
  parent_id uuid references public.company_file_folders(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_file_folders_scope_client check (
    (scope = 'company' and client_id is null)
    or (scope = 'client' and client_id is not null)
  )
);

comment on table public.company_file_folders is
  'Folder tree for the File Center; scope=company is the firm library, scope=client is per-client.';

-- Sibling names are unique per location, case-insensitively, so the picker can
-- never show two "Contracts" folders side by side. Postgres treats nulls as
-- distinct in unique indexes, which would exempt every root-level folder
-- (parent_id null) and every company-scope folder (client_id null) from the
-- rule — coalescing to the zero uuid turns "root" into a real, comparable
-- location.
create unique index if not exists company_file_folders_sibling_name_key
  on public.company_file_folders (
    scope,
    coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

-- ============================================================================
-- 2. company_files — one row per stored object
-- ============================================================================
create table if not exists public.company_files (
  id uuid default gen_random_uuid() primary key,
  scope text not null check (scope in ('company', 'client')),
  client_id uuid references public.company_clients(id) on delete cascade,
  -- set null, NOT cascade: deleting a folder must never delete files. Orphaned
  -- files surface at the scope root, where they can be re-filed.
  folder_id uuid references public.company_file_folders(id) on delete set null,
  -- Display name, kept pretty. The storage object key is derived separately
  -- (see lib/files/validation.ts buildStoragePath) so the key can be strict
  -- ASCII while the name the team sees keeps its spaces and casing.
  name text not null check (char_length(name) between 1 and 200),
  storage_bucket text not null default 'file-center',
  -- Unique: exactly one row may claim an object. Without this, deleting one of
  -- two rows that share a path would strand the survivor pointing at an object
  -- the cleanup pass already removed.
  storage_path text not null unique,
  mime_type text not null default '',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  description text not null default '' check (char_length(description) <= 1000),
  uploaded_by uuid references auth.users(id) on delete set null,
  -- Soft archive: employees can tidy the library without holding the
  -- admin-only delete right. Null = live.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_files_scope_client check (
    (scope = 'company' and client_id is null)
    or (scope = 'client' and client_id is not null)
  )
);

comment on table public.company_files is
  'File Center metadata rows; the bytes live in the private file-center storage bucket.';

create index if not exists idx_company_files_scope_client
  on public.company_files (scope, client_id);
create index if not exists idx_company_files_folder
  on public.company_files (folder_id);
create index if not exists idx_company_files_created_at
  on public.company_files (created_at desc);

-- ============================================================================
-- updated_at triggers (shared helper from 20260505000000_company_portal.sql)
-- ============================================================================
drop trigger if exists set_company_file_folders_updated_at on public.company_file_folders;
create trigger set_company_file_folders_updated_at
before update on public.company_file_folders
for each row execute function public.set_updated_at();

drop trigger if exists set_company_files_updated_at on public.company_files;
create trigger set_company_files_updated_at
before update on public.company_files
for each row execute function public.set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.company_file_folders enable row level security;
alter table public.company_files enable row level security;

grant select, insert, update, delete on public.company_file_folders to authenticated;
grant select, insert, update, delete on public.company_files to authenticated;

-- company_file_folders: active employees read/create/rename/move/delete.
-- Folder delete stays employee-level because the files FK makes it
-- non-destructive (see TENANT MODEL above). Inserts must self-attribute so a
-- folder cannot be planted in a colleague's name.
create policy "company_file_folders_read_employee" on public.company_file_folders
  for select to authenticated using (public.is_company_portal_employee());
create policy "company_file_folders_insert_employee" on public.company_file_folders
  for insert to authenticated with check (
    public.is_company_portal_employee()
    and created_by = (select auth.uid())
  );
create policy "company_file_folders_update_employee" on public.company_file_folders
  for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());
create policy "company_file_folders_delete_employee" on public.company_file_folders
  for delete to authenticated using (public.is_company_portal_employee());

-- company_files: active employees read/upload/edit metadata; delete is
-- admin-only because removing the row is what orphans the stored object.
create policy "company_files_read_employee" on public.company_files
  for select to authenticated using (public.is_company_portal_employee());
create policy "company_files_insert_employee" on public.company_files
  for insert to authenticated with check (
    public.is_company_portal_employee()
    and uploaded_by = (select auth.uid())
  );
create policy "company_files_update_employee" on public.company_files
  for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());
create policy "company_files_delete_admin" on public.company_files
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ============================================================================
-- Storage — private bucket, whole-team access, matching the tables above
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('file-center', 'file-center', false)
on conflict (id) do update set public = false;

drop policy if exists "Employees can view file center files" on storage.objects;
create policy "Employees can view file center files"
on storage.objects
for select
to authenticated
using (bucket_id = 'file-center' and public.is_company_portal_employee());

-- Uploads must be owned by the uploader so the object's owner column matches
-- the row's uploaded_by attribution.
drop policy if exists "Employees can upload file center files" on storage.objects;
create policy "Employees can upload file center files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'file-center'
  and owner = (select auth.uid())
  and public.is_company_portal_employee()
);

drop policy if exists "Employees can replace file center files" on storage.objects;
create policy "Employees can replace file center files"
on storage.objects
for update
to authenticated
using (bucket_id = 'file-center' and public.is_company_portal_employee())
with check (bucket_id = 'file-center' and public.is_company_portal_employee());

drop policy if exists "Employees can delete file center files" on storage.objects;
create policy "Employees can delete file center files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'file-center' and public.is_company_portal_employee());

-- ============================================================================
-- Module access — regenerate the module_key check, then backfill grants
-- ============================================================================
-- The check is regenerated (not amended) from the full lib/user-management.ts
-- catalog, per the idiom in 20260731120000_mobile_app_module_access.sql. That
-- also repairs known drift: 'ehs_talent_engine' and 'employee_time_off' shipped
-- in the catalog after the last regeneration, so the live constraint currently
-- blocks super admins from granting them.
alter table public.portal_user_module_access
  drop constraint if exists portal_user_module_access_module_key_check;

alter table public.portal_user_module_access
  add constraint portal_user_module_access_module_key_check
  check (
    module_key in (
      'dashboard',
      'mobile_app',
      'ai_command',
      'website_operations',
      'work_management',
      'parking_lots',
      'employee_expenses',
      'reports',
      'finance',
      'payroll_tracker',
      'operations_database',
      'startup_checklist',
      'demo_showcase',
      'request_inbox',
      'sales_pipeline',
      'client_proposals',
      'ehs_talent_engine',
      'active_companies',
      'employee_mail',
      'company_tree',
      'hr_onboarding',
      'training',
      'performance_reviews',
      'hr_documents',
      'time_cards',
      'employee_time_off',
      'employee_calendar',
      'master_document_library',
      'file_center',
      'ai_document_builder',
      'legal_issues',
      'legal_register',
      'required_documents',
      'launch_gate',
      'users',
      'settings',
      'platform_sprint',
      'platform_releases',
      'platform_qa',
      'platform_metrics',
      'platform_docs',
      'platform_packages',
      'platform_billing',
      'platform_audit',
      'platform_ai_services',
      'platform_infrastructure',
      'platform_dev_command'
    )
  );

-- Backfill: every active user gets the File Center, matching the whole-team
-- read model of the tables above. Owner roles bypass grants entirely; new
-- users are covered by the app-side default grant list.
insert into public.portal_user_module_access (user_id, module_key, granted_by)
select role_row.user_id, 'file_center', null
from public.user_roles role_row
where role_row.account_status = 'active'
on conflict (user_id, module_key) do nothing;
