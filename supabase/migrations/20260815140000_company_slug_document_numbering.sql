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
--   drop trigger if exists guard_client_proposal_billing_fields on public.client_proposals;
--   drop function if exists public.guard_client_proposal_billing_fields();
--   drop trigger if exists lock_company_slug on public.company_clients;
--   drop function if exists public.lock_company_slug();
--   drop function if exists public.company_slug_locked(uuid);
--   -- restore the two allocators verbatim from their original migrations:
--   --   public.allocate_client_proposal_number()  <- 20260809200000 section 2
--   --   public.allocate_client_invoice_number()   <- 20260814120000 section 3
--   --   public.renumber_client_draft_proposals()  <- 20260809200000 section 3
--   create unique index if not exists client_invoices_one_live_per_kind
--     on public.client_invoices (proposal_id, kind)
--     where proposal_id is not null and status <> 'void';
--   -- Default FIRST, then NOT NULL: the restored insert paths omit `kind`, so
--   -- setting NOT NULL without putting the default back fails every one of them.
--   alter table public.client_invoices alter column kind set default 'full';
--   update public.client_invoices set kind = 'full' where kind is null;
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
-- 'RPS' is RESERVED, and the reason is not cosmetic. The fallback allocator
-- next_client_proposal_number() mints 'RPS-YYYY-NNNN' off a global sequence that
-- never resets. Below 1000 those numbers carry a leading zero (RPS-2026-0007)
-- and are distinguishable from this scheme; at 1000 it emits RPS-2026-1000,
-- which is shape-identical to a proposal for a client slugged 'RPS'. The
-- sequence currently sits around 7, so this is a trap laid years out — which is
-- exactly the kind that gets sprung after everyone who understood it has stopped
-- looking. Closing it costs one word.
alter table public.company_clients
  add constraint company_clients_company_slug_format
  check (
    company_slug is null
    or (company_slug ~ '^[A-Z0-9]{2,40}$' and company_slug <> 'RPS')
  );

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
-- SECURITY DEFINER, and it is the difference between this working and being
-- decoration. client_proposal_year_counters has RLS on with no policies, so an
-- invoker-rights read of it from `authenticated` returns ZERO ROWS SILENTLY —
-- RLS filters, it does not raise. An invoker-rights version of this function
-- therefore finds no counter for any client, concludes nothing is locked, and
-- permits every change: the guarantee reads correctly and enforces nothing.
--
-- The lock question is delegated to company_slug_locked() rather than
-- re-implemented, so there is exactly one definition of "locked" and the UI and
-- the trigger cannot drift apart.
create or replace function public.lock_company_slug()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.company_slug is null then
    return new;
  end if;
  if new.company_slug is distinct from old.company_slug
     and public.company_slug_locked(old.id) then
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

-- Because that table denies everyone, nothing in the app can ask the question
-- the UI actually needs: "is this client's slug locked yet?". Without an answer
-- the form has to guess from proposal numbers and let the trigger correct it,
-- which shows the wrong control to the user and only tells them after they
-- submit. This exposes the one boolean, and nothing else about the counters.
create or replace function public.company_slug_locked(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.client_proposal_year_counters c
     where c.client_id = p_client
  );
$$;

revoke execute on function public.company_slug_locked(uuid) from public, anon;
grant execute on function public.company_slug_locked(uuid) to authenticated;

comment on function public.company_slug_locked(uuid) is
  'True once any proposal number has been allocated for this client, i.e. once company_slug can no longer be changed. Reads the counter table the app is otherwise denied.';

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
  v_code text;
  v_year integer;
  v_seq  integer;
begin
  v_year := extract(year from coalesce(new.created_at, now()))::integer;

  if new.client_id is not null then
    select company_slug, client_code into v_slug, v_code
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
      --
      -- DO NOT "tidy" this to a plain lpad(...,3). The pad width is also what
      -- lets lib/proposals/company-slug.ts tell this scheme apart from the
      -- legacy ones: its parser accepts exactly-three-digits, or wider with no
      -- leading zero. Widen the pad and every number minted here stops parsing.
      new.proposal_number := v_slug || '-' || v_year::text || '-'
        || lpad(v_seq::text, greatest(3, length(v_seq::text)), '0');
      return new;
    end if;

    -- No slug, but a legacy client_code: stay on that client's OWN sequence
    -- rather than dropping to the global one. A client mid-migration would
    -- otherwise see HUN-01, HUN-02, RPS-2026-0008 — three schemes in one
    -- account, and their per-client sequence silently abandoned — whenever a
    -- proposal is created by a path that does not prompt for a slug (template
    -- create, duplicate, lifecycle). Identical to the 20260809200000 behaviour
    -- this supersedes, kept until every client carries a slug.
    if v_code is not null then
      update public.company_clients
         set proposal_seq = proposal_seq + 1
       where id = new.client_id
      returning proposal_seq into v_seq;

      if v_seq is not null then
        new.proposal_number := v_code || '-'
          || lpad(v_seq::text, greatest(2, length(v_seq::text)), '0');
        return new;
      end if;
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

    -- The parent's number is used VERBATIM, whatever scheme it belongs to. A
    -- sent or countersigned proposal keeps its legacy number forever (see
    -- section 6), so RPS-2026-0007-01 and HUN-01-02 are real numbers this mints
    -- and they are correct: the invoice names its actual parent rather than a
    -- tidier one that does not exist. Anything deriving the parent from an
    -- invoice number must fall back to proposal_id — parseInvoiceNumber() in
    -- lib/proposals/company-slug.ts deliberately returns null for these.
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

-- The other half of that guard, and without it the first half is porous.
--
-- The cap above is bounded by a column in a DIFFERENT table, and
-- client_proposals_update_employee (20260729120000) grants UPDATE on every
-- column of client_proposals to any portal employee with no status restriction.
-- So the ceiling could be raised, invoices raised against it, and the ceiling
-- put back — leaving live invoices at several times the contract with nothing
-- in the database ever noticing. The index this replaced was a structural
-- invariant that could not be defeated by editing a value somewhere else; its
-- replacement has to be defended on both tables to match.
--
-- This also moves two guarantees out of application code and into the database:
--   * a proposal that is no longer a draft cannot be renumbered. That was a
--     property of renumber_client_draft_proposals() alone, which meant it held
--     only for callers who went through it — not for a PostgREST PATCH. A client
--     holds that number on a document they signed.
--   * invoice_seq only ever goes up. Resetting it to 0 makes the next invoice
--     mint a number that already exists, and the resulting unique violation
--     wedges invoicing for that proposal until the sequence climbs back past
--     the collisions.
create or replace function public.guard_client_proposal_billing_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_live numeric(14, 2);
begin
  if new.proposal_number is distinct from old.proposal_number
     and old.status is distinct from 'draft' then
    raise exception
      'proposal % is %, and an issued document''s number cannot change', old.proposal_number, old.status
      using errcode = 'check_violation',
            hint = 'Only drafts are renumbered. The client holds this number on the document they were sent.';
  end if;

  if new.invoice_seq < old.invoice_seq then
    raise exception 'invoice_seq only moves forward (% -> %)', old.invoice_seq, new.invoice_seq
      using errcode = 'check_violation',
            hint = 'Lowering it would re-mint invoice numbers that already exist.';
  end if;

  -- Only the LOWERING direction is refused. Raising the value is a change order,
  -- which is legitimate business and is what the invoice guard's own hint tells
  -- an operator to do.
  if new.proposal_value is not null
     and new.proposal_value < coalesce(old.proposal_value, 0) then
    select coalesce(sum(total), 0) into v_live
      from public.client_invoices
     where proposal_id = old.id
       and status <> 'void';

    if v_live > new.proposal_value then
      raise exception
        'live invoices against this proposal already total %, so its value cannot drop to %', v_live, new.proposal_value
        using errcode = 'check_violation',
              hint = 'Void or reprice the invoices first.';
    end if;
  end if;

  return new;
end $$;

revoke execute on function public.guard_client_proposal_billing_fields() from public, anon, authenticated;

drop trigger if exists guard_client_proposal_billing_fields on public.client_proposals;
create trigger guard_client_proposal_billing_fields
before update on public.client_proposals
for each row execute function public.guard_client_proposal_billing_fields();

comment on function public.guard_client_proposal_billing_fields() is
  'Keeps proposal_value from dropping below what is already invoiced, pins the number of a non-draft proposal, and keeps invoice_seq monotonic. The other half of guard_client_invoice_total().';

/* -------------------------------------------------------------------------- */
/* 6. Renumbering drafts — and only drafts                                     */
/* -------------------------------------------------------------------------- */

-- Extends the function from 20260809200000 onto the new scheme. Replaced rather
-- than duplicated so the drafts-only guarantee lives in exactly one place.
--
-- SECURITY DEFINER, changed from the original's invoker rights, and the change
-- is forced. The original bumped company_clients.proposal_seq, which an employee
-- may update — that is what made "invoker rights add no authority" true. This
-- version writes client_proposal_year_counters instead, which has RLS on and no
-- policies, so an invoker-rights INSERT raises and the RPC fails on its first
-- draft, every time.
--
-- Definer rights mean the RLS that used to authorise the caller no longer runs,
-- so the check it was doing implicitly is now done explicitly below. Without
-- that, granting EXECUTE to `authenticated` would let any signed-in user
-- renumber any client's drafts.
create or replace function public.renumber_client_draft_proposals(p_client uuid)
returns integer
language plpgsql
security definer
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
  -- Replaces the authorisation the RLS on company_clients used to perform when
  -- this ran with invoker rights. Same role set the table's own policies use.
  if not public.is_company_portal_employee() then
    raise exception 'not authorised to renumber proposals'
      using errcode = 'insufficient_privilege';
  end if;

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

    v_number := v_slug || '-' || v_year::text || '-'
      || lpad(v_seq::text, greatest(3, length(v_seq::text)), '0');

    -- jsonb_typeof, not just `? 'fields'`: the key test passes for an ARRAY
    -- too, and jsonb_set into '{fields,proposalNo}' on an array raises "path
    -- element is not an integer" — which would abort the whole RPC and its
    -- transaction over one malformed row. form_data is persisted, untrusted
    -- JSON; a row that cannot carry the mirror keeps its number and is skipped
    -- rather than taking the other drafts down with it.
    update public.client_proposals
       set proposal_number = v_number,
           legacy_proposal_number = coalesce(legacy_proposal_number, r.proposal_number),
           form_data = case
             when jsonb_typeof(form_data -> 'fields') = 'object'
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
  'Moves a client''s DRAFT proposals onto SLUG-YYYY-NNN in creation order, keeping the previous number in legacy_proposal_number and mirroring the new one into form_data. Never touches a sent, accepted, declined or archived proposal. SECURITY DEFINER with an explicit is_company_portal_employee() check.';
