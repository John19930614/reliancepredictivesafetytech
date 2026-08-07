-- EHS Talent Engine — function hardening follow-up
-- MODULE_ID: ehs_talent_engine
--
-- 20260806140000_ehs_talent_engine.sql revoked EXECUTE on the append-only
-- trigger functions from `anon` and `authenticated`, but Postgres grants
-- EXECUTE on new functions to PUBLIC by default, and both roles inherit that
-- grant — so the security linter still (rightly) flagged
-- `enforce_talent_append_only()` as anon-executable via /rest/v1/rpc.
-- Revoking from PUBLIC is what actually closes it. Triggers are unaffected:
-- the trigger executor does not consult EXECUTE grants.
--
-- While here, pin search_path on the module's updated_at setter, which the
-- linter flags as role-mutable (0011_function_search_path_mutable). It only
-- assigns new.updated_at = now(), so a hijacked search_path has nothing to
-- resolve today — pinning it is cheap insurance, not a live fix.
--
-- ROLLBACK:
--   grant execute on function public.enforce_talent_append_only() to public;
--   grant execute on function public.block_talent_append_only_truncate() to public;
--   alter function public.set_talent_engine_updated_at() reset search_path;

revoke execute on function public.enforce_talent_append_only() from public, anon, authenticated;
revoke execute on function public.block_talent_append_only_truncate() from public, anon, authenticated;

alter function public.set_talent_engine_updated_at() set search_path = public;
