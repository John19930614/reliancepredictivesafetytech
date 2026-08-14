-- Records winning a deal as its own kind of move — lifecycle step 11.
--
-- MODULE_ID: client_lifecycle
--
-- opportunity_stage_events.kind covered the four ways a deal MOVES and the
-- three ways it LEAVES, but not the one way it is won. Until now nothing set
-- opportunities.status = 'won' at all: advanceOpportunity carries the status
-- forward unchanged, so a deal that reached Closed Won & Onboarded sat there
-- still marked 'open'. Every count of won deals, and every weighted-value
-- figure, read that as a live deal.
--
-- 'won' is deliberately NOT folded into 'exit'. The exit kinds are the three
-- lost paths, and the exception index is built on them — reporting "deals that
-- left the lifecycle without closing" would start counting wins the day the
-- first one landed.
--
-- Winning needs no written reason, the same as an ordinary advance: the step
-- and the accepted contract behind it are the record. So the reason-required
-- constraint widens with it.
--
-- ADDITIVE AND REVERSIBLE. Both constraints are widened, never narrowed — every
-- row that satisfied the old check satisfies the new one, so this cannot fail
-- on existing data and needs no backfill.
--
-- ROLLBACK (safe only while no 'won' event exists; delete those rows first):
--   alter table public.opportunity_stage_events
--     drop constraint if exists opportunity_stage_events_kind_check;
--   alter table public.opportunity_stage_events
--     add constraint opportunity_stage_events_kind_check
--     check (kind in ('advance', 'skip', 'back', 'exit', 'reopen'));
--   alter table public.opportunity_stage_events
--     drop constraint if exists opportunity_stage_events_reason_required;
--   alter table public.opportunity_stage_events
--     add constraint opportunity_stage_events_reason_required
--     check (kind = 'advance' or reason is not null);

alter table public.opportunity_stage_events
  drop constraint if exists opportunity_stage_events_kind_check;

alter table public.opportunity_stage_events
  add constraint opportunity_stage_events_kind_check
  check (kind in ('advance', 'skip', 'back', 'exit', 'reopen', 'won'));

alter table public.opportunity_stage_events
  drop constraint if exists opportunity_stage_events_reason_required;

alter table public.opportunity_stage_events
  add constraint opportunity_stage_events_reason_required
  check (kind in ('advance', 'won') or reason is not null);

comment on column public.opportunity_stage_events.kind is
  'advance — the ordinary Next Step · skip — jumped one or more steps · back — moved backwards to correct a mistake · exit — Closed Lost / On Hold / Disqualified · reopen — brought back from an exit · won — closed won at step 11.';

-- No RLS change. The insert policy already pins changed_by to auth.uid() and
-- says nothing about kind, so whoever could record a move can record this one.
