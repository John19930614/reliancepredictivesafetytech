-- Client Proposal Templates (Commercial group)
--
-- ===========================================================================
-- MODULE SPECIFICATION CONTRACT (CLAUDE.md)
-- ===========================================================================
-- MODULE_ID: client_proposal_templates
-- PURPOSE: Save a proven proposal's generator state as a reusable, client-scrubbed
--          starting point so a seller never retypes the same scope.
-- ROLES_ALLOWED: platform_admin, super_admin, company_admin, admin,
--                internal_reviewer, marketing, employee
--                (exactly `portalUserRoles`, i.e. the set accepted by
--                 public.is_company_portal_employee(); delete is admin-only)
-- GROUP: Commercial
-- PATH_PREFIX: /employee/proposals/templates
-- DATA_OBJECTS:
--   client_proposal_templates       read/write (this module owns it)
--   client_proposals                read (capture source) / write (create from template)
--   client_proposal_revisions       write (revision 1 of a proposal created from a template)
--   company_clients                 read (prefill the new client's identity block)
-- WORKFLOW_STATES: active -> archived (is_archived, reversible). Hard delete is
--                  admin-only and permanent; there is no soft-delete tombstone.
-- ACCEPTANCE_CRITERIA:
--   - [ ] A template stores a complete, valid GeneratorState in form_data.
--   - [ ] Applying a template NEVER carries the captured client's company,
--         contact, title, email or address into another client's proposal.
--   - [ ] Proposal-instance fields (proposalNo, proposalDate, preparedBy) do not
--         carry across either.
--   - [ ] Any active portal employee may read/create/update; only admins delete.
--   - [ ] Archived templates are hidden from the "start from template" picker.
--   - [ ] Every update/delete asks for the affected ids back, so a zero-row write
--         is surfaced as a failure instead of a silent success.
--
-- TENANT MODEL: internal portal. Mirrors client_proposals exactly — any active
--   portal employee may read, create and update templates (a template is shared
--   sales collateral, not personal property); only admins may delete.
--
-- ===========================================================================
-- ROLLBACK STEPS (run in this order; safe to run more than once)
-- ===========================================================================
--   1. drop trigger if exists client_proposal_templates_updated_at
--        on public.client_proposal_templates;
--   2. drop index if exists public.idx_client_proposal_templates_active;
--      drop index if exists public.idx_client_proposal_templates_created_at;
--   3. drop policy if exists "client_proposal_templates_read_employee"
--        on public.client_proposal_templates;
--      drop policy if exists "client_proposal_templates_insert_employee"
--        on public.client_proposal_templates;
--      drop policy if exists "client_proposal_templates_update_employee"
--        on public.client_proposal_templates;
--      drop policy if exists "client_proposal_templates_delete_admin"
--        on public.client_proposal_templates;
--   4. drop table if exists public.client_proposal_templates;
--
--   Steps 1-3 are only needed if you want to unwind partially; step 4 alone
--   removes everything this migration created, because the trigger, indexes and
--   policies all hang off the table and are dropped with it.
--
--   DATA LOSS WARNING: step 4 destroys every saved template. Templates are
--   authored content with no other copy — take a backup first:
--     create table public.client_proposal_templates_backup_20260804 as
--       select * from public.client_proposal_templates;
--
--   This migration adds NOTHING to client_proposals / client_proposal_revisions,
--   so proposals created from a template are unaffected by the rollback: their
--   form_data was copied at creation time, not referenced.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.client_proposal_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text check (length(description) <= 500),
  -- A full serialized GeneratorState ({v, fields, phases, services}), already
  -- scrubbed of client-identity and proposal-instance fields by
  -- lib/proposals/templates.ts before it is written. `jsonb not null` because a
  -- template with no state is not a template.
  form_data jsonb not null,
  created_by uuid references auth.users(id),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The picker reads only live templates, newest first.
create index if not exists idx_client_proposal_templates_active
  on public.client_proposal_templates(is_archived, name);
create index if not exists idx_client_proposal_templates_created_at
  on public.client_proposal_templates(created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — CLAUDE.md: every table MUST have RLS enabled.
-- Policy style and predicates copied from 20260729120000_client_proposals.sql so
-- the two cannot drift.
-- ---------------------------------------------------------------------------
alter table public.client_proposal_templates enable row level security;

create policy "client_proposal_templates_read_employee" on public.client_proposal_templates
  for select to authenticated using (public.is_company_portal_employee());

create policy "client_proposal_templates_insert_employee" on public.client_proposal_templates
  for insert to authenticated with check (public.is_company_portal_employee());

create policy "client_proposal_templates_update_employee" on public.client_proposal_templates
  for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());

-- Delete is admin-only, matching client_proposals_delete_admin verbatim.
create policy "client_proposal_templates_delete_admin" on public.client_proposal_templates
  for delete to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role in ('platform_admin', 'super_admin', 'company_admin', 'admin')
        and account_status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- updated_at trigger (NOTHING MISSED checklist — 20260729120000_client_proposals
-- needed a module-local function; the shared public.set_updated_at() from
-- 20260505000000_company_portal.sql already exists, so use it.)
-- ---------------------------------------------------------------------------
drop trigger if exists client_proposal_templates_updated_at on public.client_proposal_templates;
create trigger client_proposal_templates_updated_at
  before update on public.client_proposal_templates
  for each row execute function public.set_updated_at();
