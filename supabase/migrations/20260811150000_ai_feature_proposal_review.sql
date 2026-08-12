-- Adds the 'proposal_review' AI feature key.
--
-- Backs the Proposal Builder's advisory AI review, available at every workflow
-- stage (draft, in_review, sent, accepted, declined, archived) via
-- POST /api/proposals/[id]/review. The endpoint layers a model review on top of
-- free deterministic readiness checks and returns findings only — it writes
-- nothing to any proposal. Additive only: it widens a CHECK constraint and
-- seeds one budget row. No existing row is read, rewritten, or invalidated,
-- and the ledger keeps its history because the constraint is only ever
-- loosened.
--
-- The cap is deliberately small. One review is a single completion against a
-- digest of one document, and the action is manual — a seller or approver
-- clicking a button, not a cron fanning out.
--
-- ROLLBACK (safe only once no ledger row uses the key):
--   delete from public.platform_ai_feature_budgets where feature_key = 'proposal_review';
--   delete from public.platform_ai_usage_events   where feature_key = 'proposal_review';
--   alter table public.platform_ai_usage_events
--     drop constraint platform_ai_usage_events_feature_key_check;
--   alter table public.platform_ai_usage_events
--     add constraint platform_ai_usage_events_feature_key_check check (
--       feature_key in ('legal_research','document_builder','lead_triage',
--                       'talent_sourcing','ai_command','website_command',
--                       'sales_meeting_notes','proposal_narrative')
--     );

-- ============================================================================
-- 1. Widen the ledger's feature_key CHECK
-- ============================================================================
alter table public.platform_ai_usage_events
  drop constraint if exists platform_ai_usage_events_feature_key_check;

alter table public.platform_ai_usage_events
  add constraint platform_ai_usage_events_feature_key_check check (
    feature_key in (
      'legal_research',
      'document_builder',
      'lead_triage',
      'talent_sourcing',
      'ai_command',
      'website_command',
      'sales_meeting_notes',
      'proposal_narrative',
      'proposal_review'
    )
  );

-- ============================================================================
-- 2. Seed the per-feature budget row
-- ============================================================================
insert into public.platform_ai_feature_budgets (feature_key, daily_cap_cents)
values ('proposal_review', 50)
on conflict (feature_key) do nothing;
