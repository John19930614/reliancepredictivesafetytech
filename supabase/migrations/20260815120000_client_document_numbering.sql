-- Readable, year-scoped document numbers: Wondfo-2026-001.
--
-- MODULE_ID: client_proposals / active_companies
--
-- WHAT CHANGES. The client code stops being 2-3 shouted initials (WFU) and
-- becomes the moniker people actually use (Wondfo). Document numbers gain the
-- YEAR and a 3-digit sequence that restarts each January, so a reference says
-- when it was issued without anyone looking it up:
--
--   proposals   CODE-YYYY-NNN        Wondfo-2026-001
--   invoices    CODE-INV-YYYY-NNN    Wondfo-INV-2026-001
--
-- WHY INVOICES CARRY A MARKER. The two sequences are independent, so without
-- one the same string would name both a quote and a demand for payment, and
-- whoever holds "Wondfo-2026-001" could not tell which. Four characters buys
-- an unambiguous reference on a financial document.
--
-- NO ISSUED NUMBER IS REWRITTEN. WFU-01, WFU-02, SE-04 and BD-01 keep the
-- numbers they were issued under: a reference a client already holds must not
-- change beneath them, or their copy and ours disagree with nothing to
-- reconcile them.
--
-- Three writers touch these columns, not two — the omission that made an
-- earlier draft of this file wrong. Both allocators are BEFORE INSERT, so rows
-- that already exist are never re-evaluated; the third,
-- renumber_client_draft_proposals(), is rewritten in section 4 and now touches
-- DRAFTS ONLY. A draft is a number nobody has seen, so renumbering it onto the
-- client's own series is a courtesy rather than a rewrite of history.
--
-- ADDITIVE AND REVERSIBLE. One new table, two replaced functions, one widened
-- CHECK. No row is rewritten and no column is dropped.
--
-- ROLLBACK:
--   -- restore the old code shape (fails if any code is now longer than 3):
--   alter table public.company_clients drop constraint if exists company_clients_client_code_format;
--   alter table public.company_clients add constraint company_clients_client_code_format
--     check (client_code is null or client_code ~ '^[A-Z]{2,3}$');
--   drop index if exists public.company_clients_client_code_key;
--   create unique index company_clients_client_code_key
--     on public.company_clients (client_code) where client_code is not null;
--   drop table if exists public.client_document_counters;
--   drop table if exists public.client_house_counters;
--   drop function if exists public.next_client_document_seq(uuid, integer, text);
--   drop function if exists public.next_house_document_seq(integer);
--   -- then re-run the allocator and renumber bodies from 20260809200000
--   -- and 20260814120000.

/* -------------------------------------------------------------------------- */
/* 1. The code becomes a moniker                                              */
/* -------------------------------------------------------------------------- */

-- 2-24 letters or digits, starting with a letter. No spaces or punctuation:
-- this string is embedded in a reference typed into emails, spreadsheets and
-- bank memos, and anything needing escaping causes trouble downstream.
-- Mirrors clientCodePattern in lib/proposals/client-codes.ts.
alter table public.company_clients
  drop constraint if exists company_clients_client_code_format;
alter table public.company_clients
  add constraint company_clients_client_code_format
  check (client_code is null or client_code ~ '^[A-Za-z][A-Za-z0-9]{1,23}$');

-- Uniqueness goes case-insensitive with the case-sensitive storage: "Wondfo"
-- is preserved exactly as typed, but "wondfo" can no longer be assigned beside
-- it and mint two indistinguishable document series.
drop index if exists public.company_clients_client_code_key;
create unique index if not exists company_clients_client_code_key
  on public.company_clients (lower(client_code))
  where client_code is not null;

comment on column public.company_clients.client_code is
  'Document moniker: 2-24 letters or digits, case preserved, unique case-insensitively. Prefixes every document number (Wondfo-2026-001).';

/* -------------------------------------------------------------------------- */
/* 2. Per-client, per-year, per-kind sequences                                */
/* -------------------------------------------------------------------------- */

-- The HOUSE fallback sequence, for clients with no moniker.
--
-- Seeded from the highest RPS- suffix already issued, NOT from zero. Restarting
-- at 1 would walk straight into RPS-2026-0007 and RPS-2026-0011, and because a
-- counter bump lives inside the failed INSERT it rolls back with it — so every
-- retry recomputes the same taken number and proposal creation wedges
-- permanently, with no in-app way to roll the counter forward.
--
-- Separate from client_invoice_counters on purpose: sharing one counter across
-- proposals and invoices leaves both series full of holes, which is the first
-- thing an auditor asks about on a numbered financial document.
create table if not exists public.client_house_counters (
  year      integer primary key check (year between 2000 and 2999),
  kind_seq  integer not null default 0 check (kind_seq >= 0)
);

alter table public.client_house_counters enable row level security;

insert into public.client_house_counters (year, kind_seq)
select
  y.year,
  greatest(
    coalesce(max((regexp_match(p.proposal_number, '^RPS-[0-9]{4}-([0-9]+)$'))[1]::integer), 0),
    coalesce(max((regexp_match(i.invoice_number, '^RPS-INV-[0-9]{4}-([0-9]+)$'))[1]::integer), 0)
  )
from (select distinct extract(year from now())::integer as year) y
left join public.client_proposals p
  on p.proposal_number ~ ('^RPS-' || y.year::text || '-[0-9]+$')
left join public.client_invoices i
  on i.invoice_number ~ ('^RPS-INV-' || y.year::text || '-[0-9]+$')
group by y.year
on conflict (year) do update set kind_seq = greatest(public.client_house_counters.kind_seq, excluded.kind_seq);

create or replace function public.next_house_document_seq(p_year integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_seq integer;
begin
  insert into public.client_house_counters (year, kind_seq)
  values (p_year, 1)
  on conflict (year) do update
    set kind_seq = public.client_house_counters.kind_seq + 1
  returning kind_seq into v_seq;

  return v_seq;
end $$;

revoke execute on function public.next_house_document_seq(integer) from public, anon, authenticated;

-- company_clients.proposal_seq was a single lifetime counter, which cannot
-- express "restart in January". It is left in place untouched so the old
-- numbers remain explicable; every NEW number comes from here.
create table if not exists public.client_document_counters (
  client_id  uuid not null references public.company_clients(id) on delete cascade,
  year       integer not null check (year between 2000 and 2999),
  kind       text not null check (kind in ('proposal', 'invoice')),
  last_seq   integer not null default 0 check (last_seq >= 0),
  primary key (client_id, year, kind)
);

comment on table public.client_document_counters is
  'Per-client, per-year, per-kind document sequence. Bumped atomically by the numbering triggers; never edited by hand.';

alter table public.client_document_counters enable row level security;

-- No policy, deliberately: only the two SECURITY DEFINER allocators below touch
-- this table and they run as the definer. Nothing reads it over the API, and an
-- employee who could rewind a counter could mint a duplicate invoice number.

/* -------------------------------------------------------------------------- */
/* 3. Allocation                                                              */
/* -------------------------------------------------------------------------- */

-- Shared by both triggers. The upsert-returning is atomic, so two documents
-- created in the same instant cannot take the same number — which a
-- select-max-and-add-one scheme would happily do under concurrency.
create or replace function public.next_client_document_seq(
  p_client_id uuid,
  p_year integer,
  p_kind text
)
returns integer
language plpgsql
security definer
-- pg_catalog FIRST: naming it explicitly removes the implicit priority it
-- normally has, so a public.lpad() cannot shadow the builtin and run as the
-- definer. This function mints financial identifiers.
set search_path = pg_catalog, public
as $$
declare
  v_seq integer;
begin
  insert into public.client_document_counters (client_id, year, kind, last_seq)
  values (p_client_id, p_year, p_kind, 1)
  on conflict (client_id, year, kind) do update
    set last_seq = public.client_document_counters.last_seq + 1
  returning last_seq into v_seq;

  return v_seq;
end $$;

revoke execute on function public.next_client_document_seq(uuid, integer, text) from public, anon, authenticated;

/* --- Proposals ------------------------------------------------------------ */

create or replace function public.allocate_client_proposal_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text;
  v_year integer;
  v_seq  integer;
begin
  -- NO honour-a-supplied-number hatch, deliberately.
  --
  -- It buys nothing: this is a BEFORE INSERT trigger, so rows that already
  -- exist are never re-evaluated and every issued reference is safe regardless.
  -- What it costs is a wedge — anyone able to insert could squat a number just
  -- ahead of the counter, and since the bump rolls back with the failing
  -- statement, that client's year jams with no way to roll it forward
  -- (client_document_counters has RLS on and no policy at all). The invoice
  -- allocator refused this hatch for exactly this reason; proposals now match.
  if new.proposal_number is not null then
    new.proposal_number := null;
  end if;

  v_year := extract(year from coalesce(new.created_at, now()))::integer;

  if new.client_id is not null then
    select client_code into v_code from public.company_clients where id = new.client_id;
  end if;

  if v_code is null or btrim(v_code) = '' then
    -- No moniker assigned yet: fall back to the house sequence rather than
    -- refusing to create the proposal. Assigning a code renumbers nothing, so
    -- this row keeps the house number for life.
    v_seq := public.next_house_document_seq(v_year);

    new.proposal_number := 'RPS-' || v_year::text || '-'
      || lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');
    return new;
  end if;

  v_seq := public.next_client_document_seq(new.client_id, v_year, 'proposal');

  -- greatest() guard: lpad TRUNCATES a longer string, so a bare 3-char pad
  -- would turn sequence 1000 into "000" and collide with the first document of
  -- the year. Same trap the invoice allocator was written against.
  new.proposal_number := v_code || '-' || v_year::text || '-'
    || lpad(v_seq::text, greatest(3, length(v_seq::text)), '0');

  return new;
end $$;

revoke execute on function public.allocate_client_proposal_number() from public, anon, authenticated;

/* --- Invoices ------------------------------------------------------------- */

create or replace function public.allocate_client_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text;
  v_year integer;
  v_seq  integer;
begin
  -- The number is ALWAYS allocated here, never accepted from the caller.
  --
  -- Unlike proposals, there is no historical invoice series to preserve — and
  -- RLS lets any employee insert, so honouring a supplied number would let
  -- somebody squat one just ahead of the counter, making every later insert
  -- collide on the unique index and rolling the counter back with each failure.
  -- That wedges invoice creation for the year on a table nobody has a policy to
  -- repair.
  v_year := extract(year from coalesce(new.issue_date, current_date))::integer;

  select client_code into v_code from public.company_clients where id = new.client_id;

  if v_code is null or btrim(v_code) = '' then
    v_seq := public.next_house_document_seq(v_year);

    new.invoice_number := 'RPS-INV-' || v_year::text || '-'
      || lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');
    return new;
  end if;

  v_seq := public.next_client_document_seq(new.client_id, v_year, 'invoice');

  new.invoice_number := v_code || '-INV-' || v_year::text || '-'
    || lpad(v_seq::text, greatest(3, length(v_seq::text)), '0');

  return new;
end $$;

revoke execute on function public.allocate_client_invoice_number() from public, anon, authenticated;

comment on function public.allocate_client_invoice_number() is
  'BEFORE INSERT on client_invoices: allocates CODE-INV-YYYY-NNN, or RPS-INV-YYYY-NNNN when the client has no moniker.';

/* -------------------------------------------------------------------------- */
/* 4. The third writer                                                        */
/* -------------------------------------------------------------------------- */

-- renumber_client_draft_proposals() (20260809200000) rewrites a client's DRAFT
-- proposal numbers when a code is first assigned. It was written for the old
-- CODE-NN scheme and still emits it, so assigning "Wondfo" to the client
-- holding RPS-2026-0011 rewrote that row to "Wondfo-01" — changing one of the
-- very numbers this migration's header promises to preserve, into the format
-- this migration exists to replace.
--
-- Replaced with the new scheme rather than dropped: renumbering a DRAFT is
-- legitimate and useful (nobody has seen it), and removing it would leave a
-- client's first proposals stranded on the house series forever.
-- The parameter keeps its original name. CREATE OR REPLACE cannot rename an
-- input parameter (42P13), so calling it p_client_id here would have made the
-- whole migration fail to apply — caught by rehearsing it rather than reading
-- it. Dropping the function first would work too, but it is reachable by RPC
-- and a drop leaves a window where the app's assign-code path 404s.
create or replace function public.renumber_client_draft_proposals(p_client uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code    text;
  v_changed integer := 0;
  v_row     record;
  v_year    integer;
  v_seq     integer;
begin
  select client_code into v_code from public.company_clients where id = p_client;
  if v_code is null or btrim(v_code) = '' then
    return 0;
  end if;

  -- DRAFTS ONLY. A sent or accepted proposal is a reference the client already
  -- holds; changing it means their copy and ours disagree with nothing to
  -- reconcile them.
  for v_row in
    select id, coalesce(created_at, now()) as created_at
      from public.client_proposals
     where client_id = p_client
       and status = 'draft'
     order by created_at
  loop
    v_year := extract(year from v_row.created_at)::integer;
    v_seq  := public.next_client_document_seq(p_client, v_year, 'proposal');

    update public.client_proposals
       set proposal_number = v_code || '-' || v_year::text || '-'
         || lpad(v_seq::text, greatest(3, length(v_seq::text)), '0')
     where id = v_row.id;

    v_changed := v_changed + 1;
  end loop;

  return v_changed;
end $$;

revoke execute on function public.renumber_client_draft_proposals(uuid) from public, anon;
