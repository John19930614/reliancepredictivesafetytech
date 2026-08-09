-- Our own company record — the seller side of every proposal.
--
-- MODULE_ID: platform_company_profile
-- GROUP: Platform
-- PATH_PREFIX: /employee/settings/company
--
-- WHY
-- The "Prepared By" block on every proposal was hardcoded as literal strings
-- inside assets/proposal-generator-v15.html, a 255 KB static file:
--
--     <input id="sellerName" value="Reliance Predictive Safety Technologies">
--     <textarea id="sellerContact">Sussex, Wisconsin
--     Email: john.h.haldemann@gmail.com</textarea>
--     <input id="preparedBy" value="John Haldemann">
--
-- Consequences, all of them live in production today: every proposal prints a
-- personal gmail address as the company's contact, every proposal is "Prepared
-- By John Haldemann" no matter who wrote it, and the company address cannot be
-- corrected without editing a static asset and re-running a build script.
--
-- This table is the one place that information lives. A proposal SNAPSHOTS it
-- into form_data at prefill time rather than resolving it at render time, so
-- moving offices next year does not silently rewrite the address on a proposal
-- a client signed this year.
--
-- WHY A SINGLE-ROW TABLE
-- The platform is single-tenant on the seller side: there is one Reliance. The
-- boolean primary key with a `check (id)` constraint makes "at most one row" a
-- database guarantee rather than a convention every caller has to remember.
-- Turning this into a multi-tenant table later is an ordinary ALTER; recovering
-- from three conflicting company profiles is not.
--
-- Rollback:
--   drop table if exists public.platform_company_profile;

create table if not exists public.platform_company_profile (
  -- Always true. `check (id)` rejects false, so the primary key admits exactly
  -- one row for the lifetime of the table.
  id            boolean primary key default true check (id),

  -- The registered entity, used where the document has to be precise:
  -- "This proposal is produced by <legal_name>".
  legal_name    text not null default '' check (char_length(legal_name) <= 200),
  -- The wordmark across the top of the document. Usually the legal name
  -- without the "LLC".
  display_name  text not null default '' check (char_length(display_name) <= 200),

  address_line1 text not null default '' check (char_length(address_line1) <= 200),
  address_line2 text not null default '' check (char_length(address_line2) <= 200),
  city          text not null default '' check (char_length(city) <= 120),
  state         text not null default '' check (char_length(state) <= 120),
  postal_code   text not null default '' check (char_length(postal_code) <= 40),
  country       text not null default '' check (char_length(country) <= 120),

  -- The address a client should reply to. NOT an individual's inbox — this
  -- prints on documents that outlive whoever wrote them.
  email         text not null default '' check (char_length(email) <= 254),
  phone         text not null default '' check (char_length(phone) <= 40),
  website       text not null default '' check (char_length(website) <= 200),

  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id) on delete set null
);

comment on table public.platform_company_profile is
  'Single-row seller identity. Proposals snapshot it into form_data at prefill time.';
comment on column public.platform_company_profile.email is
  'Company reply-to address printed on client documents. Not a personal inbox.';

drop trigger if exists set_platform_company_profile_updated_at on public.platform_company_profile;
create trigger set_platform_company_profile_updated_at
before update on public.platform_company_profile
for each row execute function public.set_updated_at();

alter table public.platform_company_profile enable row level security;

-- Readable by every employee: writing a proposal means printing this block, and
-- the row holds nothing that is not already on the front page of a document we
-- hand to clients.
drop policy if exists "Employees can read the company profile" on public.platform_company_profile;
create policy "Employees can read the company profile"
  on public.platform_company_profile for select to authenticated
  using (public.is_company_portal_employee());

-- Writable by admins only. This is the legal name and address that appears on
-- every commercial document the company issues; it is not a field a new hire
-- should be able to change while editing a proposal.
drop policy if exists "Admins can update the company profile" on public.platform_company_profile;
create policy "Admins can update the company profile"
  on public.platform_company_profile for update to authenticated
  using (public.is_company_portal_admin())
  with check (public.is_company_portal_admin());

drop policy if exists "Admins can insert the company profile" on public.platform_company_profile;
create policy "Admins can insert the company profile"
  on public.platform_company_profile for insert to authenticated
  with check (public.is_company_portal_admin());

-- Seed from the values the static asset has been printing, so applying this
-- migration changes nothing about what a proposal says until someone edits the
-- record. Street address and ZIP are left BLANK on purpose: the asset never
-- carried them, and inventing an address for a legal entity is precisely the
-- class of bug this migration exists to remove. The document omits blank lines.
insert into public.platform_company_profile
  (id, legal_name, display_name, city, state, country, email)
values (
  true,
  'Reliance Predictive Safety Technologies LLC',
  'Reliance Predictive Safety Technologies',
  'Sussex',
  'Wisconsin',
  'United States',
  'john.h.haldemann@gmail.com'
)
on conflict (id) do nothing;
