-- Client workflow gates + real invoice records.
--
-- MODULE_ID: sales_pipeline / active_companies (no new module — the workflow
--   view lives under /employee/clients, which the active_companies catalog
--   entry already covers by prefix.)
--
-- WHY THIS EXISTS. The lead-to-active journey was a drag-and-drop board with a
-- free-text stage column: any card could be dropped in any column, nothing was
-- required to leave a stage, and "winning" a deal filed expected-income rows
-- with no invoice behind them. This migration adds the three things the
-- workflow needs to be a process rather than a picture:
--
--   1. client_invoices (+ line items) — a real invoice record, numbered,
--      issued, and payable, so "Invoicing" is a step that produces something
--      instead of a status somebody types.
--   2. client_stage_transitions — an append-only record of every stage move,
--      including who forced one past a failing gate and why.
--   3. company_clients.stage_changed_at — how long the client has sat where
--      they are, which is the one number a pipeline review always asks for.
--
-- ADDITIVE AND REVERSIBLE. No column is dropped, no row is rewritten, and no
-- existing policy is touched. The new "Invoicing" lifecycle stage is a string
-- the application writes; lifecycle_stage remains free text (see the note at
-- the foot of this file for why that is deliberate here).
--
-- ROLLBACK:
--   drop trigger if exists allocate_client_invoice_number on public.client_invoices;
--   drop function if exists public.allocate_client_invoice_number();
--   drop table if exists public.client_invoice_line_items;
--   drop table if exists public.client_invoices;
--   drop table if exists public.client_invoice_counters;
--   drop table if exists public.client_stage_transitions;
--   alter table public.company_finance_transactions drop column if exists related_invoice_id;
--   alter table public.company_clients drop column if exists stage_changed_at;

/* -------------------------------------------------------------------------- */
/* 1. How long has this client been where they are                            */
/* -------------------------------------------------------------------------- */

alter table public.company_clients
  add column if not exists stage_changed_at timestamptz not null default now();

comment on column public.company_clients.stage_changed_at is
  'When lifecycle_stage last changed. Set by the advance/override server actions, not by a trigger, so a bulk backfill of another column cannot reset every clock.';

/* -------------------------------------------------------------------------- */
/* 2. Stage transition history                                                */
/* -------------------------------------------------------------------------- */

-- Append-only. This is the record that answers "who moved this deal to Active
-- Company without a signed contract, and what did they say about it?" — which
-- the sales board could not answer at all, because it wrote one column and
-- logged nothing.
create table if not exists public.client_stage_transitions (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.company_clients(id) on delete cascade,
  from_stage       text,
  to_stage         text not null,
  -- True when a gate was failing and an admin moved the client anyway.
  was_override     boolean not null default false,
  -- Required by the application whenever was_override is true.
  override_reason  text check (override_reason is null or char_length(btrim(override_reason)) between 1 and 1000),
  -- The gate failures that stood at the moment of the move, so the record keeps
  -- its meaning after the underlying checklist is later completed.
  blocked_reasons  jsonb not null default '[]'::jsonb,
  changed_by       uuid references auth.users(id) on delete set null,
  changed_at       timestamptz not null default now()
);

create index if not exists client_stage_transitions_client_idx
  on public.client_stage_transitions (client_id, changed_at desc);

create index if not exists client_stage_transitions_override_idx
  on public.client_stage_transitions (changed_at desc)
  where was_override;

alter table public.client_stage_transitions enable row level security;

create policy "Employees can read stage transitions"
  on public.client_stage_transitions for select to authenticated
  using (public.is_company_portal_employee());

create policy "Employees can record stage transitions"
  on public.client_stage_transitions for insert to authenticated
  with check (public.is_company_portal_employee());

-- No UPDATE and no DELETE policy: the history is appended to, never edited.
-- Same posture as client_proposal_approvals.

/* -------------------------------------------------------------------------- */
/* 3. Invoice numbering                                                       */
/* -------------------------------------------------------------------------- */

-- A per-year counter. The upsert-returning below is atomic, so two invoices
-- created in the same instant cannot take the same number — which a
-- select-max-and-add-one scheme would happily do under concurrency.
create table if not exists public.client_invoice_counters (
  year      integer primary key,
  last_seq  integer not null default 0
);

alter table public.client_invoice_counters enable row level security;

-- No policy at all: only the security-definer allocator below touches this
-- table, and it runs as the definer. Nothing reads it over the API.

/* -------------------------------------------------------------------------- */
/* 4. Invoices                                                                */
/* -------------------------------------------------------------------------- */

create table if not exists public.client_invoices (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.company_clients(id) on delete cascade,
  -- The contract this invoice bills against. SET NULL rather than CASCADE: an
  -- issued invoice is a financial record and must outlive the proposal row.
  proposal_id     uuid references public.client_proposals(id) on delete set null,
  invoice_number  text not null unique,
  status          text not null default 'draft'
                    check (status in ('draft', 'issued', 'paid', 'void')),
  issue_date      date,
  due_date        date,
  currency        text not null default 'USD' check (char_length(currency) = 3),
  subtotal        numeric(14, 2) not null default 0 check (subtotal >= 0),
  total           numeric(14, 2) not null default 0 check (total >= 0),
  notes           text check (notes is null or char_length(notes) <= 4000),
  issued_at       timestamptz,
  issued_by       uuid references auth.users(id) on delete set null,
  paid_at         timestamptz,
  paid_by         uuid references auth.users(id) on delete set null,
  voided_at       timestamptz,
  void_reason     text check (void_reason is null or char_length(void_reason) <= 1000),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- An issued invoice must carry the date it was issued on, and a paid one the
  -- date it was paid. Without this a row could claim a status its own evidence
  -- columns contradict.
  constraint client_invoices_issued_has_date
    check (status <> 'issued' or (issued_at is not null and issue_date is not null)),
  constraint client_invoices_paid_has_date
    check (status <> 'paid' or paid_at is not null)
);

create index if not exists client_invoices_client_idx
  on public.client_invoices (client_id, created_at desc);

create index if not exists client_invoices_proposal_idx
  on public.client_invoices (proposal_id)
  where proposal_id is not null;

create index if not exists client_invoices_status_idx
  on public.client_invoices (status);

create table if not exists public.client_invoice_line_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.client_invoices(id) on delete cascade,
  description  text not null check (char_length(btrim(description)) between 1 and 500),
  quantity     numeric(12, 2) not null default 1 check (quantity > 0),
  unit_amount  numeric(14, 2) not null default 0 check (unit_amount >= 0),
  line_total   numeric(14, 2) not null default 0 check (line_total >= 0),
  sort_order   integer not null default 100,
  created_at   timestamptz not null default now()
);

create index if not exists client_invoice_line_items_invoice_idx
  on public.client_invoice_line_items (invoice_id, sort_order);

/* Allocator ---------------------------------------------------------------- */

-- BEFORE INSERT on client_invoices. Mirrors allocate_client_proposal_number():
-- security definer because it writes a counter table the caller has no policy
-- on, and revoked from the API because it must only ever fire from the trigger.
create or replace function public.allocate_client_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_year integer;
  v_seq  integer;
begin
  -- An explicit number (a migration, a backfill, an import) is respected as-is.
  if new.invoice_number is not null then
    return new;
  end if;

  v_year := extract(year from coalesce(new.issue_date, current_date))::integer;

  insert into public.client_invoice_counters (year, last_seq)
  values (v_year, 1)
  on conflict (year) do update
    set last_seq = public.client_invoice_counters.last_seq + 1
  returning last_seq into v_seq;

  -- greatest() guard: lpad TRUNCATES a longer string, so a bare lpad would turn
  -- sequence 10000 into "0000" and collide. Same trap as the proposal numbers.
  new.invoice_number := 'RPS-INV-' || v_year::text || '-'
    || lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');

  return new;
end $$;

revoke execute on function public.allocate_client_invoice_number() from public, anon, authenticated;

comment on function public.allocate_client_invoice_number() is
  'BEFORE INSERT on client_invoices: allocates RPS-INV-YYYY-NNNN from a per-year counter.';

drop trigger if exists allocate_client_invoice_number on public.client_invoices;
create trigger allocate_client_invoice_number
before insert on public.client_invoices
for each row execute function public.allocate_client_invoice_number();

/* updated_at --------------------------------------------------------------- */

drop trigger if exists set_client_invoices_updated_at on public.client_invoices;
create trigger set_client_invoices_updated_at
before update on public.client_invoices
for each row execute function public.set_updated_at();

/* RLS ---------------------------------------------------------------------- */

alter table public.client_invoices enable row level security;
alter table public.client_invoice_line_items enable row level security;

create policy "Employees can read invoices"
  on public.client_invoices for select to authenticated
  using (public.is_company_portal_employee());

create policy "Employees can create invoices"
  on public.client_invoices for insert to authenticated
  with check (public.is_company_portal_employee());

create policy "Employees can update invoices"
  on public.client_invoices for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());

-- Deleting an invoice destroys a numbered financial record; voiding is the
-- supported route and keeps the number spent. Admins only, matching the
-- delete-is-admin posture on company_files and the docusign envelope table.
create policy "Admins can delete invoices"
  on public.client_invoices for delete to authenticated
  using (public.is_company_portal_admin());

create policy "Employees can read invoice lines"
  on public.client_invoice_line_items for select to authenticated
  using (public.is_company_portal_employee());

create policy "Employees can create invoice lines"
  on public.client_invoice_line_items for insert to authenticated
  with check (public.is_company_portal_employee());

create policy "Employees can update invoice lines"
  on public.client_invoice_line_items for update to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());

create policy "Employees can delete invoice lines"
  on public.client_invoice_line_items for delete to authenticated
  using (public.is_company_portal_employee());

/* -------------------------------------------------------------------------- */
/* 5. Ledger link                                                             */
/* -------------------------------------------------------------------------- */

-- Lets a receivable point at the invoice that bills it, the same way
-- related_proposal_id (20260813120000) points at the contract that created it.
alter table public.company_finance_transactions
  add column if not exists related_invoice_id uuid
    references public.client_invoices(id) on delete set null;

create index if not exists company_finance_transactions_related_invoice_idx
  on public.company_finance_transactions(related_invoice_id)
  where related_invoice_id is not null;

/* -------------------------------------------------------------------------- */
/* Note on lifecycle_stage                                                    */
/* -------------------------------------------------------------------------- */

-- company_clients.lifecycle_stage stays free text. A CHECK constraint here was
-- considered and rejected for this migration: three code paths write that
-- column today (the sales board, the client record, and app/m/actions.ts), and
-- adding a constraint in the same change that introduces a new stage value
-- would turn any missed write path into a hard 23514 failure in production
-- rather than a visible-but-recoverable bad value. The stage vocabulary is
-- enforced in lib/pipeline/stages.ts and re-validated in every server action.
-- Tightening the column belongs in its own migration, after the write paths
-- have been consolidated.
