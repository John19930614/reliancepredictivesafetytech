-- Scrub the Executive Summary writing-guidance out of saved proposals.
--
-- MODULE_ID: client_proposals
--
-- WHY
-- 20260809102000 blanked the generator's placeholder text out of the five
-- identity fields, but the sweep missed one: the asset also shipped its
-- Executive Summary <textarea id="customSummary"> pre-filled with guidance for
-- the WRITER ("Summarize the engagement in two or three sentences: ..."). The
-- autosave persisted it, and buildProposalDocumentModel prints customSummary
-- verbatim as section 01 — so a client-facing document opened by explaining to
-- the client how its own summary should have been written. The live Hunzinger
-- draft carries exactly this value today.
--
-- The asset is fixed alongside this migration (the guidance moved into the
-- textarea's placeholder attribute, which is never part of the value and so
-- never autosaves), and lib/guardrails/generator-asset-prefill.test.ts now
-- fails the build if any prose input ships pre-filled content again.
--
-- SAFETY
-- Same contract as 20260809102000: the UPDATE matches the placeholder EXACTLY
-- (modulo \r\n normalization and outer whitespace) and writes an empty string.
-- Anything a seller actually wrote differs by at least one character and is
-- left untouched. An empty summary is the honest outcome: the renderer prints
-- its neutral "no summary provided" copy rather than fabricated prose.
--
-- client_proposal_revisions is deliberately NOT touched — revisions are the
-- immutable record of what a proposal said, enforced by trigger (20260804102000).
--
-- Rollback:
--   None, by design — the discarded value is a constant from the asset, not
--   seller data. Re-typing it would mean re-introducing the defect.

update public.client_proposals
   set form_data = jsonb_set(form_data, '{fields,customSummary}', '""'::jsonb, false)
 where btrim(replace(coalesce(form_data->'fields'->>'customSummary', ''), chr(13), ''))
     = 'Summarize the engagement in two or three sentences: what the client is trying to achieve, what this proposal puts in place, and what happens at the end of the term. The package, term dates, included users and pricing are already stated elsewhere in the document — do not repeat figures here, or they will fall out of date when the numbers change.';
