-- Proposal team bios and saved signatures.
--
-- MODULE_ID: client_proposals
-- Two things a seller needs when preparing a client proposal:
--   1. The bio of whoever is the point of contact on THAT deal. Not everyone
--      appears on every proposal, so the editor shows a checkbox per teammate
--      and only the checked bios are printed.
--   2. Their own signature, applied by the platform at signing time instead of
--      printing the document, signing it by hand, and scanning it back.
--
-- WHY A SEPARATE TABLE RATHER THAN COLUMNS ON employee_profiles
-- employee_profiles carries emergency contacts, legal name, and work state, and
-- its select policy is deliberately "own row + admins". A proposal has to print
-- a COLLEAGUE's bio, so the bio has to be readable by every active employee.
-- RLS is row-level, not column-level: widening the employee_profiles select
-- policy to make the bio readable would expose every other column on the row
-- with it. A separate table keeps the readable surface to exactly the fields
-- that belong on a client-facing document.
--
-- The signature image lives in a PRIVATE storage bucket; this table stores only
-- the bucket/path pair. Signatures are used to execute commercial agreements,
-- so the object is never public — the document render fetches it server-side
-- with the service role and inlines it as a data: URI.
--
-- Rollback:
--   drop policy if exists "Employees can read own signature file" on storage.objects;
--   drop policy if exists "Employees can write own signature file" on storage.objects;
--   drop policy if exists "Admins can manage signature files" on storage.objects;
--   delete from storage.objects where bucket_id = 'employee-signatures';
--   delete from storage.buckets where id = 'employee-signatures';
--   drop table if exists public.proposal_team_bios;

create table proposal_team_bios (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  -- Name as it should print on a client document. Falls back to the profile's
  -- display name in the app when blank, but is stored separately because the
  -- name on a proposal ("John H. Haldemann") is often not the portal handle.
  display_name         text not null default '' check (char_length(display_name) <= 120),
  -- Role line under the name: "Founder & Principal Safety Strategist".
  title                text not null default '' check (char_length(title) <= 160),
  -- Blank-line-separated paragraphs. Capped so one bio cannot push the
  -- document past a sane length on its own.
  bio                  text not null default '' check (char_length(bio) <= 4000),
  -- Storage coordinates for the signature image. Both null until uploaded.
  signature_bucket     text check (signature_bucket is null or char_length(signature_bucket) <= 100),
  signature_path       text check (signature_path is null or char_length(signature_path) <= 400),
  signature_updated_at timestamptz,
  -- Off by default: an empty bio should not appear in the proposal editor's
  -- roster until its owner has actually written something worth printing.
  is_publishable       boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Either both storage coordinates are set or neither is. A half-populated
  -- pair would make the document renderer construct a path it cannot fetch.
  constraint proposal_team_bios_signature_pair
    check ((signature_bucket is null) = (signature_path is null))
);

comment on table proposal_team_bios is
  'Client-facing bio and saved signature for each employee, printed on proposals.';

alter table proposal_team_bios enable row level security;

-- Every active employee can read every bio: preparing a proposal means putting
-- a colleague's bio on it. Only the columns above are exposed by this policy.
create policy "Employees can read team bios"
  on proposal_team_bios for select
  using (public.is_company_portal_employee());

create policy "Employees can insert own bio"
  on proposal_team_bios for insert
  with check (
    user_id = (select auth.uid())
    and public.is_company_portal_employee()
  );

create policy "Employees can update own bio"
  on proposal_team_bios for update
  using (
    user_id = (select auth.uid())
    and public.is_company_portal_employee()
  )
  with check (
    user_id = (select auth.uid())
    and public.is_company_portal_employee()
  );

-- Deliberately no self-delete: a bio referenced by a sent proposal should be
-- unpublished, not removed out from under the document. Admins can still clean
-- up a departed employee.
create policy "Admins can manage team bios"
  on proposal_team_bios for all
  using (public.is_company_portal_admin())
  with check (public.is_company_portal_admin());

drop trigger if exists set_proposal_team_bios_updated_at on public.proposal_team_bios;
create trigger set_proposal_team_bios_updated_at
before update on public.proposal_team_bios
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Signature image storage — private bucket, one object per employee.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('employee-signatures', 'employee-signatures', false)
on conflict (id) do update set public = false;

-- Objects are keyed by "<user_id>/<filename>", so ownership is the first path
-- segment. storage.foldername() returns the path segments minus the filename.
drop policy if exists "Employees can read own signature file" on storage.objects;
create policy "Employees can read own signature file"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-signatures'
  and (
    public.is_company_portal_admin()
    or (storage.foldername(name))[1] = (select auth.uid())::text
  )
);

drop policy if exists "Employees can write own signature file" on storage.objects;
create policy "Employees can write own signature file"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'employee-signatures'
  and public.is_company_portal_employee()
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'employee-signatures'
  and public.is_company_portal_employee()
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Admins can manage signature files" on storage.objects;
create policy "Admins can manage signature files"
on storage.objects
for all
to authenticated
using (bucket_id = 'employee-signatures' and public.is_company_portal_admin())
with check (bucket_id = 'employee-signatures' and public.is_company_portal_admin());
