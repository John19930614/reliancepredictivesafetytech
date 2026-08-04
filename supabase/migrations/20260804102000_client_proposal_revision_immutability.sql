-- MODULE_ID: client_proposals
-- PURPOSE: Make client_proposal_revisions genuinely append-only at the database
--          level, so immutability survives the service-role key, a future
--          policy edit, and a direct psql session.
--
-- WHAT WAS WRONG
--   20260729120000_client_proposals.sql made revisions "immutable" purely by
--   omitting an UPDATE policy. That is convention, not a constraint:
--     * `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely, and this codebase
--       uses the service-role client in several places (lib/supabase/admin.ts);
--     * `client_proposal_revisions_delete_admin` grants DELETE to four roles;
--     * anyone with a direct database connection is unaffected by RLS anyway;
--     * a future migration that adds an UPDATE policy would silently reopen it.
--   A revision is the evidentiary record of a document containing arbitration,
--   liability-cap and governing-law clauses. It needs a hard guard.
--
-- THE ESCAPE HATCH — deliberate, narrow, and self-documenting
--   UPDATE:   blocked unconditionally. There is NO escape hatch. Nothing in the
--             application updates a revision (verified: no `.update()` targets
--             client_proposal_revisions anywhere in the repo), and "correcting"
--             a revision in place is exactly the tampering this guard exists to
--             prevent. Restoring an old revision already works by copying it
--             forward as a NEW revision.
--
--   DELETE:   permitted in exactly one case — when the parent proposal row no
--             longer exists in the current transaction. That is only true
--             inside the ON DELETE CASCADE fired by deleting the parent
--             client_proposals row, because the FK cascade runs as an AFTER
--             DELETE action on the parent, so the parent is already gone by the
--             time this BEFORE DELETE trigger sees the child.
--
--             Why keep it: a row-level BEFORE DELETE trigger DOES fire for
--             cascade-deleted rows. Blocking DELETE unconditionally would break
--             the existing admin `deleteProposal()` action — every proposal
--             deletion would abort on the first cascaded revision. It would also
--             leave no lawful way to honour a deletion request for a whole
--             proposal.
--
--             Why it is safe: the hatch cannot be reached by a targeted delete.
--             `delete from client_proposal_revisions where id = '...'` — from an
--             admin, from the service role, or from psql — leaves the parent
--             proposal in place and is rejected. Deleting the parent is a
--             separate, admin-gated, audited action that destroys the entire
--             proposal, so it cannot be used to quietly rewrite history by
--             removing one inconvenient revision.
--
--   The existing `client_proposal_revisions_delete_admin` RLS policy is
--   deliberately LEFT IN PLACE. Dropping it would be a change to an existing RLS
--   policy, which CLAUDE.md lists as a stop condition requiring human sign-off.
--   With this trigger the policy is no longer load-bearing: it can still admit a
--   targeted DELETE past RLS, and the trigger then refuses it. Removing the now-
--   redundant policy is proposed as a separate, signed-off change.
--
--   The function is SECURITY DEFINER on purpose: the parent-existence check must
--   see the true state of client_proposals. If it ran as the invoker and RLS hid
--   the parent row from them, "parent not found" would wrongly open the hatch.
--
-- ROLLBACK STEPS (fully reverses this migration, restores the previous
-- convention-only behaviour):
--   1. drop trigger if exists client_proposal_revisions_immutable
--        on public.client_proposal_revisions;
--   2. drop trigger if exists client_proposal_revisions_no_truncate
--        on public.client_proposal_revisions;
--   3. drop function if exists public.enforce_client_proposal_revision_immutability();
--   4. drop function if exists public.block_client_proposal_revision_truncate();
--   No data is written or removed by this migration, and no table, column,
--   index, constraint or policy is modified — so the rollback is lossless and
--   can be run at any time.

-- ============================================================================
-- Row-level guard: no UPDATE ever; DELETE only as a parent cascade
-- ============================================================================
create or replace function public.enforce_client_proposal_revision_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception
      'client_proposal_revisions is append-only: revision % of proposal % cannot be modified. Save a new revision instead.',
      old.revision_number, old.proposal_id
      using errcode = '42501';
  end if;

  -- tg_op = 'DELETE'. The only lawful deletion is the cascade from deleting the
  -- parent proposal, in which case the parent row is already gone.
  if exists (select 1 from public.client_proposals where id = old.proposal_id) then
    raise exception
      'client_proposal_revisions is append-only: revision % of proposal % cannot be deleted while the proposal exists. Delete the proposal itself if the whole record must go.',
      old.revision_number, old.proposal_id
      using errcode = '42501';
  end if;

  return old;
end;
$$;

comment on function public.enforce_client_proposal_revision_immutability() is
  'Append-only guard for client_proposal_revisions. Blocks all UPDATEs; allows DELETE only when the parent client_proposals row is already gone (i.e. the FK cascade).';

drop trigger if exists client_proposal_revisions_immutable
  on public.client_proposal_revisions;
create trigger client_proposal_revisions_immutable
  before update or delete on public.client_proposal_revisions
  for each row execute function public.enforce_client_proposal_revision_immutability();

-- ============================================================================
-- Statement-level guard: TRUNCATE bypasses row triggers entirely
-- ============================================================================
create or replace function public.block_client_proposal_revision_truncate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'client_proposal_revisions is append-only and cannot be truncated.'
    using errcode = '42501';
end;
$$;

drop trigger if exists client_proposal_revisions_no_truncate
  on public.client_proposal_revisions;
create trigger client_proposal_revisions_no_truncate
  before truncate on public.client_proposal_revisions
  for each statement execute function public.block_client_proposal_revision_truncate();
