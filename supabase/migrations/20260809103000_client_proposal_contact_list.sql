-- Fold each proposal's single addressee into the new addressee list.
--
-- MODULE_ID: client_proposals
--
-- WHY
-- The Prepared For block used to hold exactly one person, stored across three
-- generator fields (`clientContact`, `clientTitle`, `clientEmail`). It now
-- holds up to six, stored as one newline-separated scalar in `clientContacts`
-- (encoding documented in lib/proposals/client-contacts.ts).
--
-- The three legacy inputs have been REMOVED from the generator asset, and the
-- editor's bridge collects `state.fields` by walking the document's inputs — a
-- field with no element is simply not collected. So on the next save of any
-- untouched proposal, the legacy fields would silently vanish and the document
-- would lose its addressee. This migration moves them across first.
--
-- The legacy fields are then BLANKED on the working copy. Left in place they
-- would resurrect a deleted addressee: parseClientContacts() falls back to them
-- whenever `clientContacts` is empty, so removing the last person from a
-- proposal would print the old one again.
--
-- client_proposal_revisions is deliberately NOT touched — immutable by trigger
-- (20260804102000), and the parser's legacy fallback is exactly what lets a
-- historical revision keep rendering the addressee it was saved with.
--
-- Rollback:
--   The legacy values remain recoverable from revision history. To drop the new
--   field: update public.client_proposals
--             set form_data = form_data #- '{fields,clientContacts}';

/* -------------------------------------------------------------------------- */
/* 1. Build the list from the legacy triple                                    */
/* -------------------------------------------------------------------------- */

-- POSITIONAL encoding: "name | title | email". The separators for a blank
-- middle field must be preserved, or an addressee with an email but no title
-- would parse with their email as their job title. `rtrim(..., ' |')` then
-- drops only the TRAILING empty slots, so a name-only contact stores as
-- "Kevin Sanducker" rather than "Kevin Sanducker |  | ".
update public.client_proposals
   set form_data = jsonb_set(
         form_data,
         '{fields,clientContacts}',
         to_jsonb(
           rtrim(
             concat_ws(
               ' | ',
               btrim(form_data->'fields'->>'clientContact'),
               btrim(coalesce(form_data->'fields'->>'clientTitle', '')),
               btrim(coalesce(form_data->'fields'->>'clientEmail', ''))
             ),
             ' |'
           )
         ),
         true
       )
 where coalesce(btrim(form_data->'fields'->>'clientContact'), '') <> ''
   and coalesce(btrim(form_data->'fields'->>'clientContacts'), '') = '';

/* -------------------------------------------------------------------------- */
/* 2. Clear the legacy triple on the working copy                              */
/* -------------------------------------------------------------------------- */

-- Guarded on the list being populated, so a proposal whose conversion did not
-- run (no contact recorded at all) keeps whatever it had.
update public.client_proposals
   set form_data = form_data
       #- '{fields,clientContact}'
       #- '{fields,clientTitle}'
       #- '{fields,clientEmail}'
 where coalesce(btrim(form_data->'fields'->>'clientContacts'), '') <> '';
