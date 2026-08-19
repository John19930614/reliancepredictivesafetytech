-- Adds the 'expense_receipt_extraction' AI feature key.
--
-- Backs the Employee Expenses "AI autofill from receipt" action
-- (POST /api/expenses/extract-receipt): an employee selects a receipt photo
-- while filling out the create-expense form, the model reads vendor/amount/
-- date/category/payment method, and the form is pre-filled for the employee
-- to review and edit before they submit. The endpoint writes nothing to any
-- record itself — it only returns a suggestion. Additive only: it widens a
-- CHECK constraint and seeds one budget row. No existing row is read,
-- rewritten, or invalidated, and the ledger keeps its history because the
-- constraint is only ever loosened.
--
-- The cap is sized like the other manual, single-image/single-document
-- actions (proposal_narrative, proposal_review) — a person clicking a file
-- picker, not a cron fanning out. Vision input costs a little more per call
-- than a short text completion, so the cap sits slightly above those.
--
-- ROLLBACK (safe only once no ledger row uses the key):
--   delete from public.platform_ai_feature_budgets where feature_key = 'expense_receipt_extraction';
--   delete from public.platform_ai_usage_events   where feature_key = 'expense_receipt_extraction';
--   alter table public.platform_ai_usage_events
--     drop constraint platform_ai_usage_events_feature_key_check;
--   alter table public.platform_ai_usage_events
--     add constraint platform_ai_usage_events_feature_key_check check (
--       feature_key in ('legal_research','document_builder','lead_triage',
--                       'talent_sourcing','ai_command','website_command',
--                       'sales_meeting_notes','proposal_narrative','proposal_review')
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
      'proposal_review',
      'expense_receipt_extraction'
    )
  );

-- ============================================================================
-- 2. Seed the per-feature budget row
-- ============================================================================
insert into public.platform_ai_feature_budgets (feature_key, daily_cap_cents)
values ('expense_receipt_extraction', 60)
on conflict (feature_key) do nothing;
