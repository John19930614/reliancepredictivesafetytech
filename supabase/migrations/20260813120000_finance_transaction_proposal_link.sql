-- Links a finance transaction back to the proposal that sold it.
--
-- Accepting a proposal now writes its expected-income schedule into
-- company_finance_transactions (see lib/proposals/acceptance-income.ts). Without
-- this column those rows would be indistinguishable from hand-entered ones,
-- which matters for two reasons: re-running acceptance must not duplicate a
-- schedule already filed, and the Finance Center needs a way back to the
-- contract behind an expected receivable.
--
-- Additive and reversible: nothing reads the column until the writer ships, and
-- rolling back is `alter table ... drop column related_proposal_id`.

alter table public.company_finance_transactions
  add column if not exists related_proposal_id uuid
    references public.client_proposals(id) on delete set null;

-- The idempotency lookup: "has this proposal already had its schedule filed?"
create index if not exists company_finance_transactions_related_proposal_idx
  on public.company_finance_transactions(related_proposal_id)
  where related_proposal_id is not null;
