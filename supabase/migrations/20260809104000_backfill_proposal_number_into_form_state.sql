-- Print the allocated reference on proposals that were saved without one.
--
-- MODULE_ID: client_proposals
--
-- WHY
-- 20260809102000 allocated a `proposal_number` to every row and replaced the
-- shared placeholder "RPS-2026-PILOT-01" wherever the saved form state carried
-- it. It did NOT reach proposals that never had a proposalNo in their state at
-- all — a proposal created but not yet opened in the generator. Those rows have
-- a perfectly good reference on the row and print an em dash on the document.
--
-- New proposals are unaffected: createProposal() and the template path both
-- stamp the number onto the state at creation, and buildPrefillState() supplies
-- it for any proposal whose form_data is not a usable generator state.
--
-- Rollback:
--   update public.client_proposals set form_data = form_data #- '{fields,proposalNo}';

-- Restricted to rows whose `fields` is genuinely an object: jsonb_set cannot
-- create a missing parent, so a row with null form_data would be a silent
-- no-op here anyway — and those rows get the number from the editor's prefill,
-- which runs precisely when the saved state is unusable.
update public.client_proposals p
   set form_data = jsonb_set(p.form_data, '{fields,proposalNo}', to_jsonb(p.proposal_number), true)
 where p.proposal_number is not null
   and jsonb_typeof(p.form_data->'fields') = 'object'
   and coalesce(btrim(p.form_data->'fields'->>'proposalNo'), '') = '';

-- The allocator is only ever reached through the column default on
-- client_proposals. Exposed as a PostgREST RPC it is a volatile function any
-- signed-in user could call in a loop, burning sequence values and leaving
-- visible gaps in the client-facing reference numbers. Nothing calls it over
-- the API, so take the grant away.
revoke execute on function public.next_client_proposal_number() from anon, authenticated;
