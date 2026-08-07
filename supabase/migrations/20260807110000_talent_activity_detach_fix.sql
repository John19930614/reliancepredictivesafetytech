-- EHS Talent Engine — allow referential detach on the append-only activity log
-- MODULE_ID: ehs_talent_engine
--
-- BUG (found in the production smoke test, 2026-08-07): talent_activity_log's
-- subject FKs (match_id, job_order_id, candidate_id — and actor_id to
-- auth.users) are ON DELETE SET NULL, and that referential action is executed
-- as an UPDATE on the activity rows. enforce_talent_append_only() blocked ALL
-- UPDATEs, so deleting any job order / candidate / match that had ever been
-- logged failed with 42501 — the audit design accidentally made its subjects
-- immortal.
--
-- FIX: permit exactly the shape the referential action produces — every other
-- column byte-identical, each changed FK going non-null → null, and the parent
-- row already gone (the action runs after the parent delete, so a manual
-- "detach" aimed at a live parent is still refused). Everything else stays
-- blocked, including nulling a reference whose parent still exists and any
-- edit to action/summary/tier/timestamps.
--
-- talent_match_approvals is unaffected: its only FK is ON DELETE CASCADE
-- (row removal, not update), which the existing DELETE arm already handles.
--
-- ROLLBACK: re-run the enforce_talent_append_only() definition from
--   20260806140000_ehs_talent_engine.sql (restores the unconditional block,
--   and with it this bug).

create or replace function public.enforce_talent_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  detach_ok boolean;
begin
  if tg_op = 'UPDATE' then
    if tg_table_name = 'talent_activity_log' then
      detach_ok :=
        -- Every column other than the four references is unchanged…
        (to_jsonb(new) - 'match_id' - 'job_order_id' - 'candidate_id' - 'actor_id')
          = (to_jsonb(old) - 'match_id' - 'job_order_id' - 'candidate_id' - 'actor_id')
        -- …and each reference is either untouched, or detaching from a parent
        -- that no longer exists.
        and (new.match_id is not distinct from old.match_id
             or (new.match_id is null and old.match_id is not null
                 and not exists (select 1 from public.talent_matches where id = old.match_id)))
        and (new.job_order_id is not distinct from old.job_order_id
             or (new.job_order_id is null and old.job_order_id is not null
                 and not exists (select 1 from public.talent_job_orders where id = old.job_order_id)))
        and (new.candidate_id is not distinct from old.candidate_id
             or (new.candidate_id is null and old.candidate_id is not null
                 and not exists (select 1 from public.talent_candidates where id = old.candidate_id)))
        and (new.actor_id is not distinct from old.actor_id
             or (new.actor_id is null and old.actor_id is not null
                 and not exists (select 1 from auth.users where id = old.actor_id)));

      if detach_ok then
        return new;
      end if;
    end if;

    raise exception
      'public.% is append-only and cannot be modified. Record a new row instead.', tg_table_name
      using errcode = '42501';
  end if;

  -- tg_op = 'DELETE'.
  if tg_table_name = 'talent_match_approvals' then
    if exists (select 1 from public.talent_matches where id = old.match_id) then
      raise exception
        'talent_match_approvals is append-only: an approval cannot be deleted while its match exists. Delete the match itself if the whole record must go.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  raise exception
    'talent_activity_log is append-only and cannot be deleted.'
    using errcode = '42501';
end;
$$;

comment on function public.enforce_talent_append_only() is
  'Append-only guard for talent_match_approvals and talent_activity_log. Blocks all UPDATEs except the referential ON DELETE SET NULL detach on the activity log (verified: parent row gone, no other column changed); allows DELETE on approvals only via the parent-match cascade, and never on the activity log.';

-- The original migration already revoked EXECUTE from public/anon/authenticated
-- via the hardening follow-up; CREATE OR REPLACE preserves existing grants, so
-- nothing to re-revoke.
