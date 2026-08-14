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
-- NOTHING ALREADY NUMBERED IS REWRITTEN. WFU-01, WFU-02, SE-04, BD-01 and the
-- two RPS-2026-* rows keep the numbers they were issued under: a reference a
-- client already holds must not change beneath them, or their copy and ours
-- disagree with nothing to reconcile them. Both allocators fire only on a NULL
-- number, so this is structural rather than a matter of being careful.
--
-- ADDITIVE AND REVERSIBLE. One new table, two replaced functions, one widened
-- CHECK. No row is rewritten and no column is dropped.
--
-- ROLLBACK:
--   -- restore the old code shape (fails if any code is now longer than 3):
--   alter table public.company_clients drop constraint if exists company_clients_client_code_format;
--   alter table public.company_clients add constraint company_clients_client_code_format
--     check (client_code is null or client_code ~ '^[A-Z]{2,3}$');
--   drop table if exists public.client_document_counters;
--   -- then re-run the allocator bodies from 20260809200000 and 20260814120000.

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
  -- A supplied number is honoured, which is what keeps every already-issued
  -- reference intact and lets a historical import keep its own numbering.
  if new.proposal_number is not null then
    return new;
  end if;

  v_year := extract(year from coalesce(new.created_at, now()))::integer;

  if new.client_id is not null then
    select client_code into v_code from public.company_clients where id = new.client_id;
  end if;

  if v_code is null or btrim(v_code) = '' then
    -- No moniker assigned yet: fall back to the house sequence rather than
    -- refusing to create the proposal. Assigning a code renumbers nothing, so
    -- this row keeps the house number for life.
    insert into public.client_invoice_counters (year, last_seq)
    values (v_year, 1)
    on conflict (year) do update
      set last_seq = public.client_invoice_counters.last_seq + 1
    returning last_seq into v_seq;

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
    insert into public.client_invoice_counters (year, last_seq)
    values (v_year, 1)
    on conflict (year) do update
      set last_seq = public.client_invoice_counters.last_seq + 1
    returning last_seq into v_seq;

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
