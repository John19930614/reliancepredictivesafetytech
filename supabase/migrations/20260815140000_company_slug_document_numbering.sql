-- Document numbering: company name, year, sequence — and an invoice that can
-- always name its parent.
--
-- DECISION OF RECORD (call 2026-08-14, John Haldemann / Steven Sladky). This
-- REVERSES the 2026-08-07 build review that produced
-- 20260809200000_client_proposal_client_codes.sql. Code monikers ("WFU", "HUN")
-- are abandoned: the full company name makes a record unique AND readable, and
-- a human reading an invoice can tell whose it is without a lookup table.
--
--   PROPOSAL   {SLUG}-{YYYY}-{NNN}      WONDFOUSA-2026-001
--   INVOICE    {PROPOSAL}-{NN}          WONDFOUSA-2026-001-01
--
-- ONE PROPOSAL CARRIES MANY INVOICES. A task-based proposal bills 6-9+ times
-- over its life, and the invoice number must always trace back to its parent —
-- that is the entire point of the format. The old model allowed exactly three
-- (deposit / full / balance) and enforced it with a unique index. That index is
-- dropped here, and because it was also the ONLY thing preventing the same
-- contract being billed twice, it is replaced rather than simply removed. See
-- section 5.
--
-- WHAT IS NOT RENUMBERED. Sent, accepted, declined and countersigned proposals
-- keep the numbers they were issued under, forever. A client has that number on
-- a document they signed; rewriting it to tidy our own records would make our
-- copy disagree with theirs. Only DRAFTS move onto the new scheme, and
-- renumber_client_draft_proposals() has refused to touch anything else since
-- 20260809200000 — that guarantee is extended here, not re-implemented.
--
-- ROLLBACK:
--   drop trigger if exists guard_client_invoice_total on public.client_invoices;
--   drop function if exists public.guard_client_invoice_total();
--   drop trigger if exists lock_company_slug on public.company_clients;
--   drop function if exists public.lock_company_slug();
--   -- restore the two allocators verbatim from their original migrations:
--   --   public.allocate_client_proposal_number()  <- 20260809200000 section 2
--   --   public.allocate_client_invoice_number()   <- 20260814120000 section 3
--   --   public.renumber_client_draft_proposals()  <- 20260809200000 section 3
--   create unique index if not exists client_invoices_one_live_per_kind
--     on public.client_invoices (proposal_id, kind)
--     where proposal_id is not null and status <> 'void';
--   alter table public.client_invoices alter column kind set not null;
--   alter table public.client_proposals
--     drop column if exists legacy_proposal_number,
--     drop column if exists invoice_seq;
--   alter table public.company_clients drop column if exists company_slug;
--   drop table if exists public.client_proposal_year_counters;
--
-- Rolling back does NOT restore old numbers to rows this migration renumbered.
-- legacy_proposal_number keeps the previous value for exactly that reason, so
-- the reversal is a data fix with the evidence still on the row rather than a
-- guess. Only drafts are ever renumbered, so no issued document is at stake.

/* -------------------------------------------------------------------------- */
/* 1. The slug                                                                 */
/* -------------------------------------------------------------------------- */

alter table public.company_clients
  add column if not exists company_slug text;

alter table public.company_clients
  drop constraint if exists company_clients_company_slug_format;
alter table public.company_clients
  add constraint company_clients_company_slug_format
  check (company_slug is null or company_slug ~ '^[A-Z0-9]{2,40}$');

-- Partial unique index, not a UNIQUE constraint: most clients sit at NULL until
-- someone writes their first proposal. Same shape as company_clients_client_code_key.
create unique index if not exists company_clients_company_slug_key
  on public.company_clients (company_slug)
  where company_slug is not null;

comment on column public.company_clients.company_slug is
  'Full company name, uppercase, no spaces or punctuation, 2-40 chars (WONDFOUSA). Prefixes every proposal number. Supersedes client_code, which is retained so legacy numbers stay explicable.';

-- IMMUTABLE ONCE USED. A slug may be corrected freely right up until the client
-- has been issued its first number. After that, changing it would orphan every
-- proposal and invoice already carrying the old prefix — the numbers would no
-- longer resolve to the company they name. Enforced here rather than in the
-- action because the action is not the only way to write this table: the sales
-- board writes company_clients straight from the browser.
create or replace function public.lock_company_slug()
returns trigger
language plpgsql
as $$
begin
  if old.company_slug is null then
    return new;
  end if;
  if new.company_slug is distinct from old.company_slug
     and exists (select 1 from public.client_proposal_year_counters c
                  where c.client_id = old.id) then
    raise exception
      'company_slug is locked once the client has been issued a proposal number (% is in use)', old.company_slug
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists lock_company_slug on public.company_clients;
create trigger lock_company_slug
before update on public.company_clients
for each row execute function public.lock_company_slug();

comment on function public.lock_company_slug() is
  'Refuses a company_slug change once any proposal number has been allocated for that client. Prevents orphaning issued numbers.';

/* -------------------------------------------------------------------------- */
/* 2. Per-company, per-year proposal counter                                   */
/* -------------------------------------------------------------------------- */

-- company_clients.proposal_seq cannot express this: it is one counter per
-- client for all time, and the new scheme restarts at 001 each calendar year.
-- It is left in place, untouched, so a rollback still has its value.
--
-- Shaped like client_invoice_counters from 20260814120000 rather than inventing
-- a second pattern: an upsert-and-increment in one statement is atomic under
-- concurrent inserts, where a read-then-write is not.
create table if not exists public.client_proposal_year_counters (
  client_id uuid not null references public.company_clients(id) on delete cascade,
  year      integer not null,
  last_seq  integer not null default 0,
  primary key (client_id, year)
);

alter table public.client_proposal_year_counters enable row level security;

-- No policy, deliberately, exactly as client_invoice_counters has none: the only
-- thing that touches this table is the SECURITY DEFINER allocator below. RLS on
-- with zero policies denies everyone, which is the intent.

comment on table public.client_proposal_year_counters is
  'Last proposal sequence allocated per client per calendar year. Written only by allocate_client_proposal_number(); no RLS policy by design.';

/* -------------------------------------------------------------------------- */
/* 3. Per-proposal invoice counter                                             */
/* -------------------------------------------------------------------------- */

alter table public.client_proposals
  add column if not exists invoice_seq integer not null default 0,
  add column if not exists legacy_proposal_number text;

comment on column public.client_proposals.invoice_seq is
  'Last invoice sequence allocated against this proposal. Bumped atomically by allocate_client_invoice_number(); never edited by hand.';
comment on column public.client_proposals.legacy_proposal_number is
  'The number this proposal carried before being renumbered onto the company-slug scheme. Drafts only — an issued document is never renumbered.';

/* -------------------------------------------------------------------------- */
/* 4. The allocators                                                           */
/* -------------------------------------------------------------------------- */

-- PROPOSAL. SLUG-YYYY-NNN, falling back to the global RPS scheme for a proposal
-- with no client or a client nobody has slugged yet.
--
-- CHANGED FROM 20260809200000: a caller-supplied proposal_number is no longer
-- honoured. That was a squatting surface, and it is the same one the invoice
-- allocator was hardened against on 2026-08-14 — RLS lets any portal employee
-- insert a proposal, so a hand-crafted PostgREST call could claim a number just
-- ahead of the counter, and every later insert would then collide on the unique
-- index. Worse, the failed statement rolls the counter bump back with it,
-- wedging proposal creation for that client for the year. No application code
-- ever set this column; only test mocks did.
--
-- search_path names pg_catalog FIRST: naming it last let a public.lpad() shadow
-- the builtin inside a SECURITY DEFINER function that mints financial
-- identifiers. Same reasoning as allocate_client_invoice_number().
create or replace function public.allocate_client_proposal_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_slug text;
  v_year integer;
  v_seq  integer;
begin
  v_year := extract(year from coalesce(new.created_at, now()))::integer;

  if new.client_id is not null then
    select company_slug into v_slug
      from public.company_clients
     where id = new.client_id;

    if v_slug is not null then
      insert into public.client_proposal_year_counters (client_id, year, last_seq)
      values (new.client_id, v_year, 1)
      on conflict (client_id, year) do update
        set last_seq = public.client_proposal_year_counters.last_seq + 1
      returning last_seq into v_seq;

      -- greatest() guard: lpad TRUNCATES a longer string, so a bare lpad(...,3)
      -- would turn sequence 1000 into "100" and mint a duplicate identifier.
      new.proposal_number := v_slug || '-' || v_year::text || '-'
        || lpad(v_seq::text, greatest(3, length(v_seq::text)), '0');
      return new;
    end if;
  end if;

  new.proposal_number := public.next_client_proposal_number();
  return new;
end $$;

revoke execute on function public.allocate_client_proposal_number() from public, anon, authenticated;

comment on function public.allocate_client_proposal_number() is
  'BEFORE INSERT on client_proposals: SLUG-YYYY-NNN for slugged clients, global RPS fallback otherwise. Never honours a caller-supplied number.';

-- INVOICE. PROPOSAL-NN, falling back to the global per-year scheme when the
-- invoice has no parent proposal or the parent has no number.
--
-- The UPDATE ... RETURNING on the parent both allocates the sequence and takes a
-- row lock on that proposal. Section 5's guard depends on that lock: without it
-- two concurrent inserts would each read a stale invoiced total and both pass.
create or replace function public.allocate_client_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_parent text;
  v_seq    integer;
  v_year   integer;
begin
  if new.proposal_id is not null then
    update public.client_proposals
       set invoice_seq = invoice_seq + 1
     where id = new.proposal_id
       and proposal_number is not null
    returning proposal_number, invoice_seq into v_parent, v_seq;

    if v_parent is not null then
      new.invoice_number := v_parent || '-'
        || lpad(v_seq::text, greatest(2, length(v_seq::text)), '0');
      return new;
    end if;
  end if;

  v_year := extract(year from coalesce(new.issue_date, current_date))::integer;
  insert into public.client_invoice_counters (year, last_seq)
  values (v_year, 1)
  on conflict (year) do update
    set last_seq = public.client_invoice_counters.last_seq + 1
  returning last_seq into v_seq;

  new.invoice_number := 'RPS-INV-' || v_year::text || '-'
    || lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');
  return new;
end $$;

revoke execute on function public.allocate_client_invoice_number() from public, anon, authenticated;

comment on function public.allocate_client_invoice_number() is
  'BEFORE INSERT on client_invoices: PROPOSAL-NN against a numbered parent, global RPS-INV fallback otherwise. Never honours a caller-supplied number.';

/* -------------------------------------------------------------------------- */
/* 5. Retiring `kind`, and replacing the guard it carried                      */
/* -------------------------------------------------------------------------- */

-- The old index allowed at most one live invoice per (proposal, kind), so a
-- proposal could carry three. D-4 needs 6-9+, so it goes.
--
-- But that index was doing a second job nobody wrote down: it was the only thing
-- stopping "deposit" and "full" both being raised against one proposal, where
-- full already includes the deposit — 200% of the contract across two perfectly
-- valid numbered documents. Dropping it without a replacement would reopen
-- exactly the defect the 2026-08-14 hardening closed.
--
-- The replacement is a cap on the money rather than a cap on the count: the live
-- invoices against a proposal may not exceed its contract value. That permits
-- nine invoices and still refuses to bill the same work twice.
drop index if exists public.client_invoices_one_live_per_kind;

-- `kind` is retired, not dropped. Existing rows carry deposit/full/balance and
-- that history stays readable; new rows need not supply it.
alter table public.client_invoices alter column kind drop not null;
-- Default dropped too: a new invoice that says nothing about `kind` should
-- record nothing, not silently claim to be the "full" one.
alter table public.client_invoices alter column kind drop default;

comment on column public.client_invoices.kind is
  'RETIRED 2026-08-14. Historical deposit/full/balance carve. New invoices sequence off the parent proposal instead; retained so existing rows stay explicable.';

create or replace function public.guard_client_invoice_total()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_value   numeric(14, 2);
  v_live    numeric(14, 2);
begin
  if new.proposal_id is null or new.status = 'void' then
    return new;
  end if;

  -- FOR UPDATE, and it is load-bearing. Without a lock on the parent, two
  -- concurrent statements each read a stale invoiced total and both pass, which
  -- is precisely the double-billing this guard exists to stop. The insert path
  -- happens to be serialised already (the number allocator bumps invoice_seq on
  -- this same row), but the UPDATE path — repricing a draft — does not run the
  -- allocator at all and would otherwise be unprotected. Taking the lock here
  -- makes the guard correct on its own rather than by borrowing someone else's.
  select proposal_value into v_value
    from public.client_proposals
   where id = new.proposal_id
     for update;

  -- A proposal with no value recorded cannot bound anything. Allowing the
  -- invoice is deliberate: refusing would block invoicing on every proposal
  -- whose value was never filled in, which is a worse failure than the one
  -- being prevented.
  if v_value is null or v_value <= 0 then
    return new;
  end if;

  -- Includes the row that fired this trigger: an AFTER trigger sees it, so this
  -- is the real live total, not "everything else plus the new one". That also
  -- makes INSERT and UPDATE take the identical path.
  select coalesce(sum(total), 0) into v_live
    from public.client_invoices
   where proposal_id = new.proposal_id
     and status <> 'void';

  if v_live > v_value then
    raise exception
      'invoices against this proposal would total %, above its contract value of %',
      v_live, v_value
      using errcode = 'check_violation',
            hint = 'Void or reprice an existing invoice, or raise the proposal value.';
  end if;

  return new;
end $$;

revoke execute on function public.guard_client_invoice_total() from public, anon, authenticated;

-- AFTER, not BEFORE, so the row being checked is already visible to the sum and
-- the arithmetic is a plain total rather than "everything else, plus this one".
-- Firing on UPDATE too catches a draft being repriced upward after the fact.
drop trigger if exists guard_client_invoice_total on public.client_invoices;
create trigger guard_client_invoice_total
after insert or update of total, status, proposal_id on public.client_invoices
for each row execute function public.guard_client_invoice_total();

comment on function public.guard_client_invoice_total() is
  'Refuses an invoice that would take the live invoiced total above the parent proposal value. Replaces client_invoices_one_live_per_kind, which capped the count instead of the money.';

/* -------------------------------------------------------------------------- */
/* 6. Renumbering drafts — and only drafts                                     */
/* -------------------------------------------------------------------------- */

-- Extends the function from 20260809200000 onto the new scheme. Replaced rather
-- than duplicated so the drafts-only guarantee lives in exactly one place.
--
-- Unchanged from the original, deliberately: security invoker (so a caller
-- without UPDATE on company_clients cannot renumber), the zero-row bail-out that
-- stops rather than minting duplicates, creation-order processing, and mirroring
-- the new number into form_data.fields.proposalNo so the rendered document and
-- the column agree.
create or replace function public.renumber_client_draft_proposals(p_client uuid)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_slug   text;
  v_year   integer;
  v_seq    integer;
  v_number text;
  v_count  integer := 0;
  r        record;
begin
  select company_slug into v_slug
    from public.company_clients
   where id = p_client;

  if v_slug is null then
    return 0;
  end if;

  for r in
    select p.id, p.proposal_number, p.created_at
      from public.client_proposals p
     where p.client_id = p_client
       and p.status = 'draft'
       and (p.proposal_number is null or p.proposal_number not like v_slug || '-%')
     order by p.created_at nulls last, p.id
  loop
    v_year := extract(year from coalesce(r.created_at, now()))::integer;

    insert into public.client_proposal_year_counters (client_id, year, last_seq)
    values (p_client, v_year, 1)
    on conflict (client_id, year) do update
      set last_seq = public.client_proposal_year_counters.last_seq + 1
    returning last_seq into v_seq;

    if v_seq is null then
      return v_count;
    end if;

    v_number := v_slug || '-' || v_year::text || '-'
      || lpad(v_seq::text, greatest(3, length(v_seq::text)), '0');

    update public.client_proposals
       set proposal_number = v_number,
           legacy_proposal_number = coalesce(legacy_proposal_number, r.proposal_number),
           form_data = case
             when form_data ? 'fields'
               then jsonb_set(form_data, '{fields,proposalNo}', to_jsonb(v_number), true)
             else form_data
           end
     where id = r.id
       and status = 'draft';

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

revoke execute on function public.renumber_client_draft_proposals(uuid) from public, anon;
grant execute on function public.renumber_client_draft_proposals(uuid) to authenticated;

comment on function public.renumber_client_draft_proposals(uuid) is
  'Moves a client''s DRAFT proposals onto SLUG-YYYY-NNN in creation order, keeping the previous number in legacy_proposal_number and mirroring the new one into form_data. Never touches a sent, accepted, declined or archived proposal. Runs with the caller''s rights.';
