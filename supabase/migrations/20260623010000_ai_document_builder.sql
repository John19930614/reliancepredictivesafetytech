-- AI Safety Document Builder + Internal Document Sharing
-- Adds the Document Builder module (generate → human review → publish SOPs/Policies
-- as PDF + DOCX into the Master Document Library) and an internal document-sharing
-- handoff for the existing company_documents library.
--
-- TENANT MODEL: platform-wide, mirroring legal_register_items / research_runs.
--   Admins have full CRUD; internal_reviewer may act on the draft review workflow;
--   all active portal users may read. No company_id tenant-isolation RLS, so no
--   cross-tenant exposure surface.
--
-- SHARING NOTE: company_documents read is already governed by
--   is_company_portal_employee() — every active employee can read every document.
--   Internal sharing is therefore an explicit handoff + "Shared with me" inbox +
--   audit trail, NOT an access gate. company_documents RLS is intentionally
--   UNCHANGED by this migration.
--
-- ROLLBACK:
--   drop table if exists public.document_shares cascade;
--   drop table if exists public.document_builder_drafts cascade;
--   drop table if exists public.document_builder_generations cascade;
--   drop function if exists public.set_document_builder_updated_at();

-- ============================================================================
-- updated_at trigger function (module-local, generic now() setter)
-- ============================================================================
create or replace function public.set_document_builder_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. document_builder_generations — one row per AI generation run
-- ============================================================================
create table if not exists public.document_builder_generations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  doc_type text not null check (doc_type in ('sop', 'policy')),
  title text not null,
  inputs jsonb,
  status text not null default 'running' check (
    status in ('running', 'completed', 'needs_review', 'error')
  ),
  gateway_status text,
  error_message text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_doc_builder_generations_created_at
  on public.document_builder_generations(created_at desc);
create index if not exists idx_doc_builder_generations_status
  on public.document_builder_generations(status);

-- ============================================================================
-- 2. document_builder_drafts — editable, reviewable draft documents
-- ============================================================================
create table if not exists public.document_builder_drafts (
  id uuid default gen_random_uuid() primary key,
  generation_id uuid references public.document_builder_generations(id) on delete set null,
  doc_type text not null check (doc_type in ('sop', 'policy')),
  title text not null,
  sections jsonb not null default '[]'::jsonb,
  body_markdown text,
  review_status text not null default 'draft' check (
    review_status in ('draft', 'needs_review', 'approved', 'rejected', 'changes_requested')
  ),
  human_review_required boolean default false,
  confidence_level text,
  review_reason text,
  reviewed_by uuid references auth.users(id),
  last_reviewed_at timestamptz,
  company_document_id uuid references public.company_documents(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_doc_builder_drafts_review_status
  on public.document_builder_drafts(review_status);
create index if not exists idx_doc_builder_drafts_generation
  on public.document_builder_drafts(generation_id);
create index if not exists idx_doc_builder_drafts_created_at
  on public.document_builder_drafts(created_at desc);

-- ============================================================================
-- 3. document_shares — explicit internal handoff of a library document
-- ============================================================================
create table if not exists public.document_shares (
  id uuid default gen_random_uuid() primary key,
  document_id uuid not null references public.company_documents(id) on delete cascade,
  shared_with_user_id uuid not null references auth.users(id) on delete cascade,
  shared_by uuid references auth.users(id),
  permission text not null default 'view' check (permission in ('view')),
  note text,
  revoked boolean default false,
  created_at timestamptz default now(),
  revoked_at timestamptz,
  unique (document_id, shared_with_user_id)
);

create index if not exists idx_document_shares_recipient
  on public.document_shares(shared_with_user_id);
create index if not exists idx_document_shares_document
  on public.document_shares(document_id);

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.document_builder_generations enable row level security;
alter table public.document_builder_drafts enable row level security;
alter table public.document_shares enable row level security;

-- document_builder_generations: admins full CRUD; all active users read
create policy "doc_builder_generations_admin_all" on public.document_builder_generations
  for all using (
    exists (select 1 from public.user_roles where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin') and account_status = 'active')
  );
create policy "doc_builder_generations_read_active" on public.document_builder_generations
  for select using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and account_status = 'active')
  );

-- document_builder_drafts: admins full CRUD; reviewers may update (review workflow); all active users read
create policy "doc_builder_drafts_admin_all" on public.document_builder_drafts
  for all using (
    exists (select 1 from public.user_roles where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin') and account_status = 'active')
  );
create policy "doc_builder_drafts_reviewer_update" on public.document_builder_drafts
  for update using (
    exists (select 1 from public.user_roles where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin', 'internal_reviewer')
      and account_status = 'active')
  );
create policy "doc_builder_drafts_read_active" on public.document_builder_drafts
  for select using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and account_status = 'active')
  );

-- document_shares:
--   insert  — any active employee, on their own behalf (shared_by = self)
--   select  — the sharer, the recipient, or an admin
--   update  — the sharer or an admin (used to revoke)
create policy "document_shares_insert_self" on public.document_shares
  for insert with check (
    shared_by = auth.uid()
    and exists (select 1 from public.user_roles where user_id = auth.uid() and account_status = 'active')
  );
create policy "document_shares_select_participant" on public.document_shares
  for select using (
    shared_by = auth.uid()
    or shared_with_user_id = auth.uid()
    or exists (select 1 from public.user_roles where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin') and account_status = 'active')
  );
create policy "document_shares_update_owner" on public.document_shares
  for update using (
    shared_by = auth.uid()
    or exists (select 1 from public.user_roles where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin') and account_status = 'active')
  );

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create trigger document_builder_drafts_updated_at
  before update on public.document_builder_drafts
  for each row execute function public.set_document_builder_updated_at();
