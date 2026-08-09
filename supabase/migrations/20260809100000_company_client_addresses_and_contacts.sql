-- Company addresses, and more than one person per company.
--
-- MODULE_ID: client_proposals
--
-- WHY
-- A proposal prints a "Prepared For" block: the company, the people it is
-- addressed to, and the company's address. company_clients could supply the
-- company NAME and nothing else — it had no address columns at all, and room
-- for exactly ONE person (contact_name / email / phone).
--
-- The proposal generator papered over the gap with hardcoded placeholder text
-- ("Street Address / City, State ZIP", "client@email.com", "Safety /
-- Operations Leader"). The editor then autosaved that placeholder into
-- client_proposals.form_data and PRINTED it on client-facing documents as
-- though it were real data. See 20260809102000 for the cleanup of what already
-- shipped that way.
--
-- This migration gives the company record the two things the document actually
-- needs, so the proposal can pull instead of invent.
--
-- WHY A CONTACTS TABLE RATHER THAN MORE COLUMNS
-- A construction client has a safety director, a project executive and an AP
-- contact, and a proposal is routinely addressed to two or three of them at
-- once. A fixed contact_2_name / contact_3_name widening would cap the count
-- arbitrarily and leave the ordering to column position.
--
-- contact_name / email / phone on company_clients are deliberately KEPT and
-- left nullable. Roughly thirty call sites across the sales pipeline, AI
-- command routes and the mobile lead views read them, and breaking those to
-- ship an address is not a trade worth making. The backfill below mirrors the
-- existing single contact into the new table as the primary, so both views
-- agree from the first day.
--
-- Rollback:
--   drop table if exists public.company_client_contacts;
--   alter table public.company_clients
--     drop column if exists address_line1,
--     drop column if exists address_line2,
--     drop column if exists city,
--     drop column if exists state,
--     drop column if exists postal_code,
--     drop column if exists country,
--     drop column if exists website;

/* -------------------------------------------------------------------------- */
/* 1. Address on the company record                                            */
/* -------------------------------------------------------------------------- */

-- Structured rather than one free-text blob: the proposal document prints
-- "City, State ZIP" as its own line, and a single textarea cannot be formatted
-- per-renderer (screen, print, PDF) without re-parsing prose.
alter table public.company_clients
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city          text,
  add column if not exists state         text,
  add column if not exists postal_code   text,
  add column if not exists country       text,
  add column if not exists website       text;

comment on column public.company_clients.address_line1 is
  'Street address, line 1. Printed on proposals in the Prepared For block.';
comment on column public.company_clients.address_line2 is
  'Suite / floor / mail stop. Omitted from the document when blank.';
comment on column public.company_clients.state is
  'State or province, spelled out or abbreviated as it should print.';
comment on column public.company_clients.country is
  'Left blank for domestic clients; the document omits it rather than assuming.';

/* -------------------------------------------------------------------------- */
/* 2. People at the company                                                    */
/* -------------------------------------------------------------------------- */

create table if not exists public.company_client_contacts (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.company_clients(id) on delete cascade,
  -- Name as it should print on a client-facing document.
  name       text not null check (char_length(btrim(name)) between 1 and 160),
  -- Role line printed after the name: "Kevin Sanducker — Safety Director".
  title      text not null default '' check (char_length(title) <= 160),
  email      text not null default '' check (char_length(email) <= 254),
  phone      text not null default '' check (char_length(phone) <= 40),
  -- The default addressee. Exactly one per company (partial unique index
  -- below) so a proposal opening on a new company has an unambiguous choice.
  is_primary boolean not null default false,
  -- Display order in the picker and on the document. Ties break by name.
  sort_order integer not null default 100,
  -- Internal only. Deliberately NOT printed on any client-facing document —
  -- "hates email, call his cell" must never leak onto a proposal.
  notes      text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.company_client_contacts is
  'People at a client company. Selected contacts print in a proposal''s Prepared For block.';
comment on column public.company_client_contacts.notes is
  'Internal note. Never rendered on a client-facing document.';

create index if not exists company_client_contacts_client_idx
  on public.company_client_contacts (client_id, sort_order, name);

-- At most one primary per company. A partial index rather than a constraint so
-- the many rows with is_primary = false do not contend on a shared key.
create unique index if not exists company_client_contacts_one_primary
  on public.company_client_contacts (client_id)
  where is_primary;

drop trigger if exists set_company_client_contacts_updated_at on public.company_client_contacts;
create trigger set_company_client_contacts_updated_at
before update on public.company_client_contacts
for each row execute function public.set_updated_at();

/* -------------------------------------------------------------------------- */
/* 3. RLS — same audience as the company record it hangs off                   */
/* -------------------------------------------------------------------------- */

alter table public.company_client_contacts enable row level security;

drop policy if exists "Employees can read client contacts" on public.company_client_contacts;
create policy "Employees can read client contacts"
  on public.company_client_contacts for select to authenticated
  using (public.is_company_portal_employee());

drop policy if exists "Employees can create client contacts" on public.company_client_contacts;
create policy "Employees can create client contacts"
  on public.company_client_contacts for insert to authenticated
  with check (public.is_company_portal_employee());

drop policy if exists "Employees can update client contacts" on public.company_client_contacts;
create policy "Employees can update client contacts"
  on public.company_client_contacts for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());

-- Deleting a contact is how a person who left the company is removed, so it is
-- an employee action rather than an admin one. The proposals that already named
-- them are unaffected: a proposal snapshots the contact text into form_data
-- rather than holding a foreign key, so an executed document cannot be
-- rewritten by a later CRM edit.
drop policy if exists "Employees can delete client contacts" on public.company_client_contacts;
create policy "Employees can delete client contacts"
  on public.company_client_contacts for delete to authenticated
  using (public.is_company_portal_employee());

/* -------------------------------------------------------------------------- */
/* 4. Backfill the single contact that already exists                          */
/* -------------------------------------------------------------------------- */

-- Idempotent: re-running the migration adds nothing, and a company that already
-- has contacts (because someone used the new UI first) is skipped entirely
-- rather than gaining a duplicate primary.
insert into public.company_client_contacts (client_id, name, email, phone, is_primary, sort_order)
select
  c.id,
  btrim(c.contact_name),
  coalesce(nullif(btrim(c.email), ''), ''),
  coalesce(nullif(btrim(c.phone), ''), ''),
  true,
  10
from public.company_clients c
where coalesce(btrim(c.contact_name), '') <> ''
  and not exists (
    select 1 from public.company_client_contacts existing
    where existing.client_id = c.id
  );
