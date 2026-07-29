-- Client Proposal Builder (Commercial group)
-- MODULE_ID: client_proposals — draft, assign, and track client proposals with
-- immutable revision history. A proposal may be assigned to a company
-- (company_clients); every content save creates a numbered revision snapshot so
-- earlier versions can be viewed and restored.
--
-- TENANT MODEL: internal portal, mirroring company_clients / company_sales_activities.
--   Any active portal employee may read, create, and update proposals (sales is a
--   whole-team activity here); only admins may delete. Revisions are append-only —
--   there is intentionally NO update policy on client_proposal_revisions.
--
-- ROLLBACK:
--   drop table if exists public.client_proposal_revisions cascade;
--   drop table if exists public.client_proposals cascade;
--   drop function if exists public.set_client_proposals_updated_at();

-- ============================================================================
-- updated_at trigger function (module-local, generic now() setter)
-- ============================================================================
create or replace function public.set_client_proposals_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. client_proposals — the working copy + workflow state of each proposal
-- ============================================================================
create table if not exists public.client_proposals (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references public.company_clients(id) on delete set null,
  title text not null,
  status text not null default 'draft' check (
    status in ('draft', 'in_review', 'sent', 'accepted', 'declined', 'archived')
  ),
  owner text,
  proposal_value numeric(14, 2),
  valid_until date,
  summary text,
  body_markdown text,
  current_revision integer not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_client_proposals_client
  on public.client_proposals(client_id);
create index if not exists idx_client_proposals_status
  on public.client_proposals(status);
create index if not exists idx_client_proposals_created_at
  on public.client_proposals(created_at desc);

-- ============================================================================
-- 2. client_proposal_revisions — immutable snapshot per saved revision
-- ============================================================================
create table if not exists public.client_proposal_revisions (
  id uuid default gen_random_uuid() primary key,
  proposal_id uuid not null references public.client_proposals(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  title text not null,
  summary text,
  body_markdown text,
  change_note text,
  status_at_save text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique (proposal_id, revision_number)
);

create index if not exists idx_client_proposal_revisions_proposal
  on public.client_proposal_revisions(proposal_id, revision_number desc);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.client_proposals enable row level security;
alter table public.client_proposal_revisions enable row level security;

-- client_proposals: active employees read/create/update (matches company_clients);
-- delete is admin-only.
create policy "client_proposals_read_employee" on public.client_proposals
  for select to authenticated using (public.is_company_portal_employee());
create policy "client_proposals_insert_employee" on public.client_proposals
  for insert to authenticated with check (public.is_company_portal_employee());
create policy "client_proposals_update_employee" on public.client_proposals
  for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());
create policy "client_proposals_delete_admin" on public.client_proposals
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- client_proposal_revisions: append-only. Employees read + insert; no update
-- policy (revisions are immutable); delete is admin-only (normally via cascade).
create policy "client_proposal_revisions_read_employee" on public.client_proposal_revisions
  for select to authenticated using (public.is_company_portal_employee());
create policy "client_proposal_revisions_insert_employee" on public.client_proposal_revisions
  for insert to authenticated with check (public.is_company_portal_employee());
create policy "client_proposal_revisions_delete_admin" on public.client_proposal_revisions
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ============================================================================
-- updated_at trigger
-- ============================================================================
drop trigger if exists client_proposals_updated_at on public.client_proposals;
create trigger client_proposals_updated_at
  before update on public.client_proposals
  for each row execute function public.set_client_proposals_updated_at();
