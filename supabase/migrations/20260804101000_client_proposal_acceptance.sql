-- MODULE_ID: client_proposals
-- PURPOSE: Record client-side evidence of acceptance/decline on client_proposals
--          and bind it to the exact revision the client was shown.
--
-- WHY
--   `accepted` and `declined` were self-reported: an employee clicked a button
--   and the status changed. There was no client identity, no client-side
--   timestamp, no originating IP, and — most importantly — no link to the
--   revision that was actually in front of the client. These columns are written
--   by acceptProposalViaShareLink(), which can only be reached by a holder of a
--   valid, unexpired, unrevoked share link (20260804100000), so
--   `accepted_revision_id` is always the revision that link was bound to.
--
--   `accepted_by_email` is the discriminator the UI uses to tell a
--   client-verified acceptance (email present) from a legacy employee-reported
--   one (email null).
--
-- STRICTLY ADDITIVE
--   Only `add column if not exists`. No column is altered, renamed, dropped or
--   backfilled; no existing constraint, policy, index or trigger is touched. The
--   existing employee update policy on client_proposals already covers these
--   columns, so no RLS change is required — and none is made (RLS changes are a
--   CLAUDE.md stop condition).
--
--   acceptance_ip is `text`, not `inet`: the value comes from a proxy
--   `x-forwarded-for` header and an `inet` column would raise 22P02 on a
--   malformed hop, turning a client's acceptance into a 500. The application
--   trims to the first hop and length-caps it.
--
-- ROLLBACK STEPS (single statement, reversible, destroys only data written by
-- this feature — run only if no acceptance has been captured that you need):
--   alter table public.client_proposals
--     drop column if exists accepted_at,
--     drop column if exists accepted_by_name,
--     drop column if exists accepted_by_email,
--     drop column if exists acceptance_ip,
--     drop column if exists accepted_revision_id,
--     drop column if exists declined_at,
--     drop column if exists decline_reason;
--   drop index if exists public.idx_client_proposals_accepted_revision;
--   NOTE: dropping these columns discards the only client-side evidence of
--   acceptance. Export
--     select id, accepted_at, accepted_by_name, accepted_by_email,
--            acceptance_ip, accepted_revision_id, declined_at, decline_reason
--       from public.client_proposals
--      where accepted_at is not null or declined_at is not null;
--   before running the rollback.

alter table public.client_proposals
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by_name text,
  add column if not exists accepted_by_email text,
  add column if not exists acceptance_ip text,
  add column if not exists accepted_revision_id uuid
    references public.client_proposal_revisions(id) on delete set null,
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text;

create index if not exists idx_client_proposals_accepted_revision
  on public.client_proposals(accepted_revision_id)
  where accepted_revision_id is not null;

comment on column public.client_proposals.accepted_revision_id is
  'The revision the client actually saw and accepted, taken from the share link they used. This is the binding between the displayed document and the agreement.';
comment on column public.client_proposals.accepted_by_email is
  'Set only for a client-side acceptance captured through a share link. NULL means the acceptance was recorded by an employee with no client evidence.';
comment on column public.client_proposals.acceptance_ip is
  'First hop of x-forwarded-for at the moment of acceptance, captured server-side. Never accepted from client input.';
