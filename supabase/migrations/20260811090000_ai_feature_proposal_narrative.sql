-- Adds the 'proposal_narrative' AI feature key.
--
-- Backs the Proposal Builder's "Fix figures with AI" action, which rewrites the
-- executive summary, the assumptions block, and per-line scope paragraphs so
-- their stated user/jobsite/term/price figures agree with the proposal's own
-- fields. Additive only: it widens a CHECK constraint and seeds one budget row.
-- No existing row is read, rewritten, or invalidated, and the ledger keeps its
-- history because the constraint is only ever loosened.
--
-- The cap is deliberately small. One rewrite is a single short completion
-- against a handful of passages, and the action is manual — a seller clicking a
-- button, not a cron fanning out.
--
-- ROLLBACK (safe only once no ledger row uses the key):
--   delete from public.platform_ai_feature_budgets where feature_key = 'proposal_narrative';
--   delete from public.platform_ai_usage_events   where feature_key = 'proposal_narrative';
--   alter table public.platform_ai_usage_events
--     drop constraint platform_ai_usage_events_feature_key_check;
--   alter table public.platform_ai_usage_events
--     add constraint platform_ai_usage_events_feature_key_check check (
--       feature_key in ('legal_research','document_builder','lead_triage',
--                       'talent_sourcing','ai_command','website_command',
--                       'sales_meeting_notes')
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
      'proposal_narrative'
    )
  );

-- ============================================================================
-- 2. Seed the per-feature budget row
-- ============================================================================
insert into public.platform_ai_feature_budgets (feature_key, daily_cap_cents)
values ('proposal_narrative', 50)
on conflict (feature_key) do nothing;
