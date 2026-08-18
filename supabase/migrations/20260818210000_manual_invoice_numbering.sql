-- Manual invoices carry the client's name too.
--
-- DECISION OF RECORD, extending the call of 2026-08-14 (John Haldemann /
-- Steven Sladky) to the case that call did not have in front of it.
--
--   PROPOSAL         {SLUG}-{YYYY}-{NNN}      WONDFOUSA-2026-001
--   INVOICE          {PROPOSAL}-{NN}          WONDFOUSA-2026-001-01
--   MANUAL INVOICE   {SLUG}-{YYYY}-INV-{NN}   WONDFOUSA-2026-INV-01
--
-- THE DEFECT. Manual invoicing — raising an invoice for work with no proposal
-- behind it — landed on 2026-08-18 and inherited the no-proposal branch of
-- allocate_client_invoice_number(), which mints RPS-INV-{YYYY}-{NNNN} off a
-- single global counter. That is the LEGACY shape. It says nothing about whose
-- invoice it is, which is the one property the whole scheme exists to
-- guarantee: a human reading an invoice can tell whose it is without a lookup
-- table. Two drafts already carry such a number.
--
-- WHY A LITERAL 'INV' FIELD. A manual invoice has no parent to hang off, so it
-- is numbered off the slug directly. It cannot simply be {SLUG}-{YYYY}-{NNN}:
-- that is a proposal number, and the first person to read WONDFOUSA-2026-004
-- off an invoice would go looking for a proposal that does not exist — or
-- worse, find an unrelated one. 'INV' sits exactly where a proposal's sequence
-- sits, and a sequence is always digits, so the two shapes can never collide in
-- either direction. lib/proposals/company-slug.ts asserts that property from
-- both sides (parseManualInvoiceNumber / parseProposalNumber).
--
-- NO SLUG, NO MANUAL INVOICE. A client without a company_slug cannot be
-- invoiced this way, and the third branch below raises rather than falling
-- back. A slug is NOT auto-generated here: it becomes a permanent prefix on
-- documents a client signs, suggestCompanySlug() is explicitly "a starting
-- point a human overtypes, never an automatic assignment", and inventing one
-- inside a BEFORE INSERT trigger would make that decision invisibly, at the
-- worst possible moment, in the one place nobody is looking. The UI assigns the
-- slug before it inserts (components/invoices/ManualInvoiceForm.tsx) and the
-- server action refuses first with a message naming the client, so this
-- exception is the backstop for PostgREST and psql, not the normal path.
--
-- WHAT IS NOT RENUMBERED, and what is not dropped. The two existing RPS-INV
-- drafts keep their numbers unless a human renumbers them; nothing here touches
-- existing rows. client_invoice_counters stays exactly where it is, still
-- carrying the sequence those numbers came off, so they remain explicable — the
-- same reason client_code and client-codes.ts were kept. It is simply no longer
-- reachable for new rows.
--
-- ROLLBACK:
--   -- restore the allocator verbatim from 20260815140000 section 4:
--   --   public.allocate_client_invoice_number()
--   drop table if exists public.client_invoice_year_counters;
--
-- Rolling back does NOT restore old numbers to rows minted under this scheme,
-- and it does not need to: the restored allocator only ever runs on new rows,
-- and a WONDFOUSA-2026-INV-01 already issued stays readable either way.

/* -------------------------------------------------------------------------- */
/* 1. Per-client, per-year manual invoice counter                              */
/* -------------------------------------------------------------------------- */

-- client_invoice_counters cannot express this: it is one counter for the whole
-- company, and this scheme restarts at 01 per client per calendar year. It is
-- left in place, untouched, so the numbers it already minted keep their source.
--
-- Shaped exactly like client_proposal_year_counters from 20260815140000 rather
-- than inventing a second pattern: an upsert-and-increment in one statement is
-- atomic under concurrent inserts, where a read-then-write is not.
create table if not exists public.client_invoice_year_counters (
  client_id uuid not null references public.company_clients(id) on delete cascade,
  year      integer not null,
  last_seq  integer not null default 0,
  primary key (client_id, year)
);

alter table public.client_invoice_year_counters enable row level security;

-- No policy, deliberately, exactly as client_proposal_year_counters and
-- client_invoice_counters have none: the only thing that touches this table is
-- the SECURITY DEFINER allocator below. RLS on with zero policies denies
-- everyone, which is the intent.

comment on table public.client_invoice_year_counters is
  'Last manual-invoice sequence allocated per client per calendar year. Written only by allocate_client_invoice_number(); no RLS policy by design.';

/* -------------------------------------------------------------------------- */
/* 2. The allocator                                                            */
/* -------------------------------------------------------------------------- */

-- Replaces the version in 20260815140000 section 4. The proposal branch is
-- UNCHANGED, character for character — including the UPDATE ... RETURNING,
-- whose row lock guard_client_invoice_total() depends on: without it two
-- concurrent inserts would each read a stale invoiced total and both pass. Only
-- the no-proposal path is rewritten.
--
-- search_path names pg_catalog FIRST: naming it last let a public.lpad() shadow
-- the builtin inside a SECURITY DEFINER function that mints financial
-- identifiers. Unchanged, and load-bearing for the same reason as before.
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
  v_slug   text;
  v_name   text;
begin
  if new.proposal_id is not null then
    update public.client_proposals
       set invoice_seq = invoice_seq + 1
     where id = new.proposal_id
       and proposal_number is not null
    returning proposal_number, invoice_seq into v_parent, v_seq;

    -- The parent's number is used VERBATIM, whatever scheme it belongs to. A
    -- sent or countersigned proposal keeps its legacy number forever, so
    -- RPS-2026-0007-01 and HUN-01-02 are real numbers this mints and they are
    -- correct: the invoice names its actual parent rather than a tidier one
    -- that does not exist. Anything deriving the parent from an invoice number
    -- must fall back to proposal_id — parseInvoiceNumber() in
    -- lib/proposals/company-slug.ts deliberately returns null for these.
    if v_parent is not null then
      new.invoice_number := v_parent || '-'
        || lpad(v_seq::text, greatest(2, length(v_seq::text)), '0');
      return new;
    end if;
  end if;

  -- No parent proposal: a manual invoice. The year comes off the issue date so
  -- the sequence lines up with the year printed on the document; an invoice
  -- raised today for work issued in December belongs to December's run.
  v_year := extract(year from coalesce(new.issue_date, current_date))::integer;

  select company_slug, name into v_slug, v_name
    from public.company_clients
   where id = new.client_id;

  if v_slug is null then
    raise exception
      'cannot number a manual invoice for %: this company has no company slug yet',
      coalesce(v_name, new.client_id::text)
      using errcode = 'check_violation',
            hint = 'Set the company slug on the client record first — it becomes the permanent prefix on this company''s documents, so a person has to choose it. Open the company, set the slug, then raise the invoice again.';
  end if;

  insert into public.client_invoice_year_counters (client_id, year, last_seq)
  values (new.client_id, v_year, 1)
  on conflict (client_id, year) do update
    set last_seq = public.client_invoice_year_counters.last_seq + 1
  returning last_seq into v_seq;

  -- greatest() guard: lpad TRUNCATES a longer string, so a bare lpad(...,2)
  -- would turn sequence 100 into "10" and mint a duplicate financial
  -- identifier. Same rule, same width as the sibling branch above and as
  -- formatManualInvoiceNumber() in lib/proposals/company-slug.ts.
  --
  -- DO NOT "tidy" this to a plain lpad(...,2). The pad width is also what lets
  -- that module tell this scheme apart from the legacy ones: its parser accepts
  -- exactly-two-digits, or wider with no leading zero. Widen the pad and every
  -- number minted here stops parsing.
  --
  -- The legacy global fallback — 'RPS-INV-' || year || '-' || lpad(seq, 4) off
  -- client_invoice_counters — is RETIRED as of this migration and no longer
  -- reachable. It is not restored under any condition: a number that cannot
  -- name its client is the defect this fixes, not a safety net.
  new.invoice_number := v_slug || '-' || v_year::text || '-INV-'
    || lpad(v_seq::text, greatest(2, length(v_seq::text)), '0');
  return new;
end $$;

revoke execute on function public.allocate_client_invoice_number() from public, anon, authenticated;

comment on function public.allocate_client_invoice_number() is
  'BEFORE INSERT on client_invoices, three branches: PROPOSAL-NN against a numbered parent; SLUG-YYYY-INV-NN off client_invoice_year_counters for a manual invoice for a slugged client; and a check_violation for a manual invoice for a client with no company_slug, which is refused rather than numbered under the retired global RPS-INV scheme. Never honours a caller-supplied number.';

-- ---------------------------------------------------------------------------
-- Close the lock the new counter opens.
--
-- company_slug_locked() decided "this slug can no longer change" by asking one
-- question: has any PROPOSAL number been allocated for this client. That was a
-- complete test while proposals were the only thing a slug could prefix. It is
-- not any more. A client whose only document is a manual invoice would answer
-- false, lock_company_slug() would allow the rename, and WONDFOUSA-2026-INV-01
-- would be left quoting a slug the company no longer has — the exact orphaning
-- the lock exists to prevent, reached by the one path the lock did not watch.
--
-- Widened to either counter. Still SECURITY DEFINER for the reason it always
-- was: both counter tables have RLS on with no policies, so an invoker-rights
-- read returns zero rows for every application user and the guarantee silently
-- becomes a no-op.
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
  ) or exists (
    select 1 from public.client_invoice_year_counters c
     where c.client_id = p_client
  );
$$;

revoke execute on function public.company_slug_locked(uuid) from public, anon;
grant execute on function public.company_slug_locked(uuid) to authenticated;

comment on function public.company_slug_locked(uuid) is
  'True once any proposal OR manual-invoice number has been allocated for this client, i.e. once company_slug can no longer be changed without orphaning a number a client already holds. Reads the two counter tables the application is otherwise denied.';
