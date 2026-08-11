-- Proposal maker–checker: an approver capability, and a per-revision approval record.
--
-- Steve authors proposals, John reviews and sends them. Until now every gate in
-- the Proposal Builder was `canManage` (true for any active portal role) and
-- both of them hold super_admin, so there was no difference between them: a
-- proposal could go to a client with nobody having read it.
--
-- Two objects:
--   1. user_roles.can_approve_proposals — the capability, granted per user
--      rather than derived from a role (a role-derived answer gives the maker
--      and the reviewer identical rights, since both are super_admin).
--   2. client_proposal_approvals — append-only decision history, each row
--      naming the IMMUTABLE revision it was made about. Approval binds to a
--      revision, not to the proposal, because saveProposalDraft() rewrites
--      client_proposals.form_data on a 30-second autosave without minting a
--      revision — an approval attached to the proposal would silently come to
--      cover text nobody read.
--
-- SAFETY POSTURE: additive only. No existing column changes type or nullability,
-- no policy on an existing table is dropped or rewritten, and the new column
-- defaults to FALSE so the capability is denied until explicitly granted. The
-- app-side gates in lib/proposals/approval.ts are the enforcement path; these
-- policies are the backstop that keeps a hand-crafted PostgREST call from
-- writing an approval it could not obtain through the UI.
--
-- ROLLBACK:
--   drop table if exists public.client_proposal_approvals cascade;
--   alter table public.user_roles drop column if exists can_approve_proposals;
--   -- and restore the draft -> sent transition in lib/proposals/policy.ts

-- ============================================================================
-- 1. The approver capability
-- ============================================================================
alter table public.user_roles
  add column if not exists can_approve_proposals boolean not null default false;

comment on column public.user_roles.can_approve_proposals is
  'May approve a client proposal and issue it to a client. Granted per user, not per role — see lib/proposals/approval.ts.';

-- Seed the reviewer. Matched by email rather than a hardcoded uuid so the
-- migration is readable and reproducible on a restored database. Idempotent,
-- and a no-op on any environment where that account does not exist — which
-- deliberately leaves NOBODY able to send rather than guessing at a grant.
update public.user_roles ur
set can_approve_proposals = true
from auth.users u
where u.id = ur.user_id
  and lower(u.email) = 'john.h.haldemann@gmail.com';

-- ============================================================================
-- 2. client_proposal_approvals — append-only decision history
-- ============================================================================
create table if not exists public.client_proposal_approvals (
  id uuid default gen_random_uuid() primary key,
  proposal_id uuid not null references public.client_proposals(id) on delete cascade,
  -- The exact document the decision was made about. ON DELETE SET NULL rather
  -- than CASCADE: if a revision row is ever removed, the fact that a decision
  -- was taken must survive it. revision_number is denormalised for the same
  -- reason — it is what the gates and the banner compare against.
  revision_id uuid references public.client_proposal_revisions(id) on delete set null,
  revision_number integer not null check (revision_number >= 1),
  decision text not null check (decision in ('approved', 'changes_requested')),
  note text check (note is null or char_length(note) <= 1000),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now()
);

comment on table public.client_proposal_approvals is
  'Append-only maker-checker decisions. One row per approve / request-changes, pinned to the revision reviewed.';

-- The gates read the newest decision for a proposal on every load of the
-- document view, the editor and every send path.
create index if not exists idx_client_proposal_approvals_proposal
  on public.client_proposal_approvals (proposal_id, decided_at desc);

-- ============================================================================
-- 3. RLS
--
-- Read: any active portal employee — the maker must be able to see that his
-- proposal was approved, and read the reviewer's note when changes are asked
-- for. Insert: approvers only, and only as themselves.
--
-- No UPDATE and no DELETE policy, on purpose. The table is the audit trail of
-- who authorised what going to a client; it is appended to, never edited.
-- ============================================================================
alter table public.client_proposal_approvals enable row level security;

grant select, insert on public.client_proposal_approvals to authenticated;

create policy "client_proposal_approvals_select_portal" on public.client_proposal_approvals
  for select to authenticated using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and account_status = 'active'
        and role in (
          'platform_admin', 'super_admin', 'company_admin', 'admin',
          'internal_reviewer', 'marketing', 'employee'
        )
    )
  );

create policy "client_proposal_approvals_insert_approver" on public.client_proposal_approvals
  for insert to authenticated with check (
    -- Recorded as yourself: a caller cannot attribute a decision to someone else.
    decided_by = auth.uid()
    and exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and account_status = 'active'
        and can_approve_proposals = true
    )
  );
