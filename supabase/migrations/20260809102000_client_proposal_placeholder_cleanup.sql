-- Scrub the generator's placeholder text out of saved proposals, and give every
-- proposal a proposal number that is actually its own.
--
-- MODULE_ID: client_proposals
--
-- WHY
-- assets/proposal-generator-v15.html shipped its inputs pre-filled with example
-- text ("Street Address / City, State ZIP", "client@email.com", "Client
-- Representative", "Safety / Operations Leader", proposal number
-- "RPS-2026-PILOT-01"). The editor's bridge overwrites only the handful of
-- fields it prefills from the company record, and the autosave then persists
-- everything the form holds — placeholders included. The document renderer has
-- no way to tell an example from an entry, so it printed them.
--
-- A live proposal in production is addressed to a real person at a real
-- construction company and states their address as "Street Address / City,
-- State ZIP" and their email as "client@email.com".
--
-- SAFETY
-- Every update below matches the placeholder EXACTLY (modulo \r\n line endings)
-- and writes an empty string. Anything a seller actually typed differs from the
-- placeholder by at least one character and is left untouched. Blanking is the
-- honest outcome: buildProposalDocumentModel renders a missing identity field
-- as an em dash rather than inventing a value, which is the correct behavior on
-- a document a client may sign.
--
-- client_proposal_revisions is deliberately NOT touched. Revisions are
-- immutable by trigger (20260804102000) and are the historical record of what a
-- proposal said at a point in time — rewriting them would be falsifying an
-- archive, and the immutability trigger would reject it regardless.
--
-- Rollback:
--   There is none for the blanking, by design — the discarded values were
--   placeholder constants, not data. To undo the numbering:
--     alter table public.client_proposals alter column proposal_number drop default;
--     alter table public.client_proposals drop column if exists proposal_number;
--     drop function if exists public.next_client_proposal_number();
--     drop sequence if exists public.client_proposal_number_seq;

/* -------------------------------------------------------------------------- */
/* 1. Blank the placeholder identity fields                                    */
/* -------------------------------------------------------------------------- */

-- `replace(..., chr(13), '')` normalizes CRLF before comparing: the multi-line
-- address placeholder round-trips through a <textarea> as
-- "Street Address\r\nCity, State ZIP" on some browsers and "\n" on others.
--
-- Written as five explicit statements rather than a loop over a values list:
-- this migration rewrites production proposal content, and every predicate it
-- runs should be readable in full at the point it runs.

update public.client_proposals
   set form_data = jsonb_set(form_data, '{fields,clientCompany}', '""'::jsonb, false)
 where form_data->'fields'->>'clientCompany' = 'Client Company Name';

update public.client_proposals
   set form_data = jsonb_set(form_data, '{fields,clientContact}', '""'::jsonb, false)
 where form_data->'fields'->>'clientContact' = 'Client Representative';

update public.client_proposals
   set form_data = jsonb_set(form_data, '{fields,clientTitle}', '""'::jsonb, false)
 where form_data->'fields'->>'clientTitle' = 'Safety / Operations Leader';

update public.client_proposals
   set form_data = jsonb_set(form_data, '{fields,clientAddress}', '""'::jsonb, false)
 where replace(coalesce(form_data->'fields'->>'clientAddress', ''), chr(13), '')
     = 'Street Address' || chr(10) || 'City, State ZIP';

update public.client_proposals
   set form_data = jsonb_set(form_data, '{fields,clientEmail}', '""'::jsonb, false)
 where form_data->'fields'->>'clientEmail' = 'client@email.com';

-- The seller block is deliberately NOT touched here. Its placeholder is a
-- personal inbox rather than example text, and blanking it would leave existing
-- proposals with no seller contact at all — strictly worse. It is corrected by
-- editing the company profile seeded in 20260809101000; the editor's "Refresh
-- from company profile" action then pulls the new values onto a proposal.

/* -------------------------------------------------------------------------- */
/* 2. A real proposal number per proposal                                      */
/* -------------------------------------------------------------------------- */

-- Every proposal carried the asset's literal "RPS-2026-PILOT-01", so the number
-- identified the TEMPLATE rather than the document. Two proposals sent to two
-- clients in the same week quoted the same reference.
--
-- The number lives on the row rather than in form_data because it identifies
-- the proposal itself: it must survive a revision restore, must not be
-- editable into a collision, and is the thing a client quotes back on a PO.
create sequence if not exists public.client_proposal_number_seq start with 1;

create or replace function public.next_client_proposal_number()
returns text
language sql
volatile
set search_path = public, pg_catalog
as $$
  select 'RPS-'
      || to_char(now() at time zone 'UTC', 'YYYY')
      || '-'
      || lpad(nextval('public.client_proposal_number_seq')::text, 4, '0');
$$;

comment on function public.next_client_proposal_number() is
  'Allocates the next client-facing proposal reference, e.g. RPS-2026-0007.';

alter table public.client_proposals
  add column if not exists proposal_number text;

-- Backfilled in creation order so the oldest proposal gets the lowest number,
-- which is what anyone reading the list will expect.
do $$
declare
  row_to_number record;
begin
  for row_to_number in
    select id from public.client_proposals
    where proposal_number is null
    order by created_at nulls last, id
  loop
    update public.client_proposals
       set proposal_number = public.next_client_proposal_number()
     where id = row_to_number.id;
  end loop;
end $$;

alter table public.client_proposals
  alter column proposal_number set default public.next_client_proposal_number();

create unique index if not exists client_proposals_proposal_number_key
  on public.client_proposals (proposal_number);

comment on column public.client_proposals.proposal_number is
  'Client-facing reference, allocated once at creation. Printed as the document''s Proposal Number.';

-- Point the saved form state at the row's number wherever it still holds the
-- asset's shared placeholder, so existing documents stop quoting the template.
update public.client_proposals p
   set form_data = jsonb_set(p.form_data, '{fields,proposalNo}', to_jsonb(p.proposal_number), false)
 where p.form_data->'fields'->>'proposalNo' = 'RPS-2026-PILOT-01'
   and p.proposal_number is not null;
