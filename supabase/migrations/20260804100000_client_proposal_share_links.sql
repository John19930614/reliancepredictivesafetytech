-- MODULE_ID: client_proposals
-- PURPOSE: Give a `sent` proposal a real client-facing artifact — a revocable,
--          expiring share link that is bound to ONE specific immutable revision,
--          so "what the client was shown" is a stored fact rather than a guess.
--
-- WHY THIS TABLE EXISTS
--   Before this, a proposal could be marked `sent` with no record of what was
--   sent. The document carries arbitration, liability-cap and governing-law
--   clauses; if a client disputes terms there is nothing that proves what they
--   received. A share link pins `revision_id`, and the acceptance capture added
--   in 20260804101000 pins the same revision onto the proposal, closing the loop
--   between "what they saw" and "what they agreed to".
--
-- TOKEN HANDLING
--   Only `token_hash` is stored — the SHA-256 hex digest of a 256-bit random
--   token. The raw token exists exactly once, in the response of
--   createProposalShareLink(). A database dump therefore cannot be replayed into
--   working share URLs. `unique` on token_hash supplies the lookup index; the
--   application additionally does a constant-time compare of the returned hash.
--
-- ACCESS MODEL (deliberate)
--   * RLS enabled. Employees (public.is_company_portal_employee()) may read,
--     create and update (revoke) links. There is intentionally NO policy for
--     `anon`: the unauthenticated /proposals/share/[token] route reads through
--     the server-only service-role client after it has resolved the token
--     itself. Granting anon any SELECT here would let an anonymous caller
--     enumerate every share link, its proposal id, and its expiry.
--   * There is intentionally NO DELETE policy. A share link is evidence of what
--     was sent to a client — it is revoked (revoked_at), never deleted. Rows
--     still disappear via the ON DELETE CASCADE from client_proposals, because
--     referential cascade actions are not RLS-checked; that is the one path by
--     which a link row can be removed, and it only happens when the whole
--     proposal is deleted by an admin.
--
-- ROLLBACK STEPS (run in this order):
--   1. drop trigger if exists client_proposal_share_links_updated_at
--        on public.client_proposal_share_links;
--   2. drop index if exists public.idx_client_proposal_share_links_proposal;
--      drop index if exists public.idx_client_proposal_share_links_revision;
--   3. drop policy if exists "client_proposal_share_links_read_employee"
--        on public.client_proposal_share_links;
--      drop policy if exists "client_proposal_share_links_insert_employee"
--        on public.client_proposal_share_links;
--      drop policy if exists "client_proposal_share_links_update_employee"
--        on public.client_proposal_share_links;
--   4. drop table if exists public.client_proposal_share_links;
--   Nothing outside this table is touched, so the rollback is complete and does
--   not affect client_proposals or client_proposal_revisions. Any share URLs
--   already handed to clients stop resolving — that is the intended effect of
--   rolling this back.

-- ============================================================================
-- client_proposal_share_links
-- ============================================================================
create table if not exists public.client_proposal_share_links (
  id uuid default gen_random_uuid() primary key,

  proposal_id uuid not null
    references public.client_proposals(id) on delete cascade,

  -- The whole point of the table: a share is bound to ONE revision. Cascade
  -- rather than restrict because a revision can only be deleted as part of
  -- deleting its parent proposal (enforced by the trigger added in
  -- 20260804102000), and that same delete already cascades this row away.
  revision_id uuid not null
    references public.client_proposal_revisions(id) on delete cascade,

  -- SHA-256 hex of the raw token. Never store the raw token.
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),

  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),

  -- View tracking. Written by the public route through the service-role client.
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0 check (view_count >= 0),

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_proposal_share_links_proposal
  on public.client_proposal_share_links(proposal_id, created_at desc);
create index if not exists idx_client_proposal_share_links_revision
  on public.client_proposal_share_links(revision_id);

comment on table public.client_proposal_share_links is
  'Revocable, expiring, revision-bound client-facing links for client_proposals. Stores only the SHA-256 hash of the token.';
comment on column public.client_proposal_share_links.token_hash is
  'SHA-256 hex digest of the raw share token. The raw token is returned to the creator exactly once and is never recoverable.';
comment on column public.client_proposal_share_links.revision_id is
  'The immutable revision this link renders. Binds "what the client was shown" to a specific snapshot.';

-- ============================================================================
-- RLS — employee-only management, no anon grants at all
-- ============================================================================
alter table public.client_proposal_share_links enable row level security;

drop policy if exists "client_proposal_share_links_read_employee"
  on public.client_proposal_share_links;
create policy "client_proposal_share_links_read_employee"
  on public.client_proposal_share_links
  for select to authenticated
  using (public.is_company_portal_employee());

drop policy if exists "client_proposal_share_links_insert_employee"
  on public.client_proposal_share_links;
create policy "client_proposal_share_links_insert_employee"
  on public.client_proposal_share_links
  for insert to authenticated
  with check (public.is_company_portal_employee());

-- Update exists so an employee can revoke a link. It is also the only way an
-- authenticated user can change view counters; the public route writes those
-- through the service-role client, which bypasses RLS.
drop policy if exists "client_proposal_share_links_update_employee"
  on public.client_proposal_share_links;
create policy "client_proposal_share_links_update_employee"
  on public.client_proposal_share_links
  for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());

-- ============================================================================
-- updated_at trigger (NOTHING MISSED checklist — the table has a mutable
-- updated_at column, so it gets the module's existing trigger function)
-- ============================================================================
drop trigger if exists client_proposal_share_links_updated_at
  on public.client_proposal_share_links;
create trigger client_proposal_share_links_updated_at
  before update on public.client_proposal_share_links
  for each row execute function public.set_client_proposals_updated_at();
