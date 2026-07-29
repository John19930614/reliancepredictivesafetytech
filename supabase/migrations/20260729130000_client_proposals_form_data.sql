-- Client Proposals: store the Proposal & Billing Generator form state.
-- form_data holds the serialized generator state ({v, fields, phases, services})
-- for the working copy (client_proposals) and per revision snapshot
-- (client_proposal_revisions). Additive only — no RLS or policy changes.
--
-- ROLLBACK:
--   alter table public.client_proposals drop column if exists form_data;
--   alter table public.client_proposal_revisions drop column if exists form_data;

alter table public.client_proposals
  add column if not exists form_data jsonb;

alter table public.client_proposal_revisions
  add column if not exists form_data jsonb;
