-- Ties a proposal to the deal it prices — lifecycle steps 7-10.
--
-- MODULE_ID: client_lifecycle
--
-- client_proposals.client_id says which COMPANY a proposal is for, which was
-- enough while a company could only ever have one deal in flight. The
-- opportunity record breaks that assumption on purpose: renewal and expansion
-- mean several live deals against one account, and "the proposals for this
-- client" then cannot tell you which of them prices THIS deal.
--
-- Nullable, and nothing backfills it. Every proposal written before the
-- lifecycle existed keeps working exactly as it does today, reached through
-- client_id; the column only carries meaning once somebody links a proposal to
-- an opportunity from step 7.
--
-- ADDITIVE AND REVERSIBLE. No existing column, policy or row is touched.
--
-- ROLLBACK:
--   drop index if exists public.client_proposals_opportunity_idx;
--   alter table public.client_proposals drop column if exists opportunity_id;

alter table public.client_proposals
  add column if not exists opportunity_id uuid
    references public.opportunities(id) on delete set null;

comment on column public.client_proposals.opportunity_id is
  'The deal this proposal prices. Null for proposals that predate the lifecycle, or that were never linked — client_id remains the company link in both cases.';

-- Partial: most rows are null and always will be, so the index only carries the
-- ones a lifecycle screen actually looks up.
create index if not exists client_proposals_opportunity_idx
  on public.client_proposals (opportunity_id, created_at desc)
  where opportunity_id is not null;

-- No RLS change. client_proposals already carries its own policies, and adding
-- a column does not widen them: whoever could read or write a proposal before
-- can read or write exactly the same proposals now.
