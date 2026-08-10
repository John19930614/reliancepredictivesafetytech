-- Per-certification issue and expiry dates for EHS Talent Engine candidates.
--
-- MODULE_ID: ehs_talent_engine
--
-- WHY
-- Build-review spec (2026-08-07): "The Certification Tracker shall record
-- certification type, issue and expiry dates, and shall flag certifications
-- expiring within 60 days." The candidate row carries one cert_expiry_date for
-- the whole person — a CSP expiring in March and an OSHA 30 expiring in
-- September cannot both be represented, so the tracker could only warn at the
-- person level.
--
-- WHAT THIS TABLE IS (AND IS NOT)
-- A DATES LEDGER, keyed by (candidate, certification). The authoritative list
-- of WHICH certifications a candidate claims, and which are verified, stays in
-- talent_candidates.certifications / verified_certifications — those arrays
-- are the inputs to the submittal gate (requiresHumanApproval in
-- lib/talent-engine/policy.ts), and this migration deliberately does not touch
-- that machinery. A row exists here when someone has recorded dates for a
-- claimed certification; removing the claim prunes the row (app-side, in
-- updateCandidate).
--
-- cert_expiry_date on talent_candidates is KEPT: sourcing and older rows still
-- carry it, and the expiring-soon scan unions both sources. The backfill below
-- copies it into a row only where it is unambiguous — the candidate claims
-- exactly one certification — because assigning one person-level date to five
-- different certs would fabricate four expiry dates.
--
-- Rollback:
--   drop table if exists public.talent_candidate_certifications;

create table if not exists public.talent_candidate_certifications (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.talent_candidates(id) on delete cascade,
  -- As claimed on the candidate row, e.g. "CSP". Compared case-insensitively.
  certification text not null check (char_length(btrim(certification)) between 1 and 80),
  issued_on    date,
  expires_on   date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- An issue date after the expiry date is a typo, not information.
  constraint talent_candidate_certifications_date_order
    check (issued_on is null or expires_on is null or issued_on <= expires_on)
);

comment on table public.talent_candidate_certifications is
  'Issue/expiry dates per claimed certification. The claim list and verification live on talent_candidates; this is the dates ledger the 60-day expiry flag reads.';

create unique index if not exists talent_candidate_certifications_one_per_cert
  on public.talent_candidate_certifications (candidate_id, lower(btrim(certification)));

create index if not exists idx_talent_candidate_certifications_expiry
  on public.talent_candidate_certifications (expires_on)
  where expires_on is not null;

drop trigger if exists talent_candidate_certifications_updated_at
  on public.talent_candidate_certifications;
create trigger talent_candidate_certifications_updated_at
  before update on public.talent_candidate_certifications
  for each row execute function public.set_talent_engine_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — same audience as talent_candidates: reading and maintaining cert data
-- is whole-team screening work; deleting rows also happens when an employee
-- removes a claimed cert, so delete matches the update audience rather than
-- the admin-only shape used for whole candidate rows.
-- ---------------------------------------------------------------------------

alter table public.talent_candidate_certifications enable row level security;

drop policy if exists "talent_candidate_certs_read_employee" on public.talent_candidate_certifications;
create policy "talent_candidate_certs_read_employee" on public.talent_candidate_certifications
  for select to authenticated using (public.is_company_portal_employee());

drop policy if exists "talent_candidate_certs_insert_employee" on public.talent_candidate_certifications;
create policy "talent_candidate_certs_insert_employee" on public.talent_candidate_certifications
  for insert to authenticated with check (public.is_company_portal_employee());

drop policy if exists "talent_candidate_certs_update_employee" on public.talent_candidate_certifications;
create policy "talent_candidate_certs_update_employee" on public.talent_candidate_certifications
  for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());

drop policy if exists "talent_candidate_certs_delete_employee" on public.talent_candidate_certifications;
create policy "talent_candidate_certs_delete_employee" on public.talent_candidate_certifications
  for delete to authenticated using (public.is_company_portal_employee());

-- ---------------------------------------------------------------------------
-- Backfill: only the unambiguous case (exactly one claimed certification).
-- ---------------------------------------------------------------------------

insert into public.talent_candidate_certifications (candidate_id, certification, expires_on)
select c.id, btrim(c.certifications[1]), c.cert_expiry_date
from public.talent_candidates c
where c.cert_expiry_date is not null
  and array_length(c.certifications, 1) = 1
  and btrim(c.certifications[1]) <> ''
  and not exists (
    select 1 from public.talent_candidate_certifications existing
    where existing.candidate_id = c.id
  );
