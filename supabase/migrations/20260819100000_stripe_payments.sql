-- Stripe payment plumbing: a Stripe customer per client, and one row per
-- payment attempt against a client invoice.
--
-- WHY THIS EXISTS. client_invoices already knows how to be draft, issued, paid
-- or void, but "paid" has always meant "an admin clicked settle after money
-- showed up somewhere else" — there is no record of a payment attempt, no
-- gateway reference to reconcile against, and no way for a webhook (which has
-- no Supabase session at all) to mark an invoice paid on its own. This
-- migration adds the two things that need: a place to remember which Stripe
-- customer a client is, and an append-heavy ledger of payment attempts keyed
-- to Stripe's own identifiers so a webhook delivery can find its row and an
-- accidental redelivery cannot double-process it.
--
-- STRICTLY ADDITIVE. client_invoices itself is not touched by this migration —
-- not its columns, not its constraints, not its RLS. Only company_clients
-- gains one nullable column, and client_invoice_payments is new.
--
-- ROLLBACK:
--   drop trigger if exists set_client_invoice_payments_updated_at on public.client_invoice_payments;
--   drop table if exists public.client_invoice_payments;
--   alter table public.company_clients drop column if exists stripe_customer_id;

/* -------------------------------------------------------------------------- */
/* 1. Stripe customer per client                                              */
/* -------------------------------------------------------------------------- */

-- Nullable, no default: a client has no Stripe customer until the first
-- checkout session is created for them, at which point lib/stripe/customers.ts
-- creates one and writes it back here so every later payment reuses it instead
-- of minting a new Stripe customer per invoice.
alter table public.company_clients
  add column if not exists stripe_customer_id text;

comment on column public.company_clients.stripe_customer_id is
  'Stripe Customer id (cus_...) for this client, created lazily on the first checkout session and reused after. Null until then.';

/* -------------------------------------------------------------------------- */
/* 2. Payment attempts against an invoice                                     */
/* -------------------------------------------------------------------------- */

-- One row per payment attempt, not per invoice: an invoice can be attempted,
-- abandoned at Checkout, retried and eventually paid, and each of those is its
-- own Stripe object with its own id. The invoice itself stays the single source
-- of truth for "is this paid" (client_invoices.status / paid_at) — this table
-- is the evidence trail behind that flip, not a second copy of it.
create table if not exists public.client_invoice_payments (
  id                          uuid primary key default gen_random_uuid(),
  invoice_id                  uuid not null references public.client_invoices(id) on delete cascade,
  stripe_payment_intent_id    text,
  stripe_checkout_session_id  text,
  stripe_customer_id          text,
  -- The Stripe Event id (evt_...) that most recently moved this row's status.
  -- Read back BEFORE writing on every webhook delivery so a redelivered event
  -- (Stripe retries until it gets a 2xx) is recognised and skipped rather than
  -- re-applied — the same idempotency shape app/api/training/webhook/route.ts
  -- uses, just as a check-before-update instead of a check-before-insert
  -- because this table's row already exists by the time the webhook fires.
  stripe_event_id             text,
  amount                      numeric(14, 2) not null check (amount > 0),
  currency                    text not null default 'usd' check (char_length(currency) = 3),
  status                      text not null default 'pending'
                                check (status in ('pending', 'processing', 'succeeded', 'failed', 'canceled', 'refunded')),
  payment_method_type         text,
  failure_reason              text check (failure_reason is null or char_length(failure_reason) <= 1000),
  initiated_by                uuid references auth.users(id) on delete set null,
  initiated_at                timestamptz not null default now(),
  succeeded_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.client_invoice_payments is
  'One row per Stripe payment attempt against a client_invoices row. Written by app/api/stripe/checkout (pending, RLS-gated) and app/api/stripe/webhook (succeeded/failed, admin client only). stripe_event_id is checked before every webhook update so a redelivered Stripe event cannot double-apply.';

comment on column public.client_invoice_payments.stripe_event_id is
  'The Stripe Event id (evt_...) that most recently changed this row''s status. The webhook handler reads this back before updating and skips a delivery whose event id it already recorded.';

-- Nullable-safe uniqueness: most rows have a payment_intent_id (Checkout in
-- payment mode always creates one), but a row can exist before Stripe has
-- assigned one (freshly inserted as 'pending', before createInvoiceCheckoutSession
-- returns), and two such rows must not collide on a shared NULL the way a plain
-- unique constraint would force.
create unique index if not exists client_invoice_payments_payment_intent_idx
  on public.client_invoice_payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create unique index if not exists client_invoice_payments_checkout_session_idx
  on public.client_invoice_payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists client_invoice_payments_invoice_idx
  on public.client_invoice_payments (invoice_id);

/* updated_at ----------------------------------------------------------------*/

drop trigger if exists set_client_invoice_payments_updated_at on public.client_invoice_payments;
create trigger set_client_invoice_payments_updated_at
before update on public.client_invoice_payments
for each row execute function public.set_updated_at();

/* RLS -------------------------------------------------------------------- */

alter table public.client_invoice_payments enable row level security;

-- Mirrors client_invoices exactly (20260814120000): every active portal
-- employee may read every invoice, so every active portal employee may read
-- every payment attempt against one. There is no per-client tenant boundary in
-- this schema to narrow against — is_company_portal_employee() IS the
-- predicate client_invoices itself reads under.
drop policy if exists "Employees can read invoice payments" on public.client_invoice_payments;
create policy "Employees can read invoice payments"
  on public.client_invoice_payments for select to authenticated
  using (public.is_company_portal_employee());

-- Starting a payment (POSTing to /api/stripe/checkout) is ordinary work, open
-- to the same roles that may read an invoice — but only as a fresh 'pending'
-- attempt naming themselves as the initiator, the same shape
-- "Employees can create draft invoices" pins status and created_by on
-- client_invoices. A row born already 'succeeded' would let an employee mark
-- their own attempt paid without Stripe ever being asked.
drop policy if exists "Employees can start invoice payments" on public.client_invoice_payments;
create policy "Employees can start invoice payments"
  on public.client_invoice_payments for insert to authenticated
  with check (
    public.is_company_portal_employee()
    and status = 'pending'
    and succeeded_at is null
    and initiated_by = (select auth.uid())
  );

-- Settling a payment — succeeded, failed, refunded — asserts what actually
-- happened at Stripe. The webhook does this through the service-role/admin
-- client (createAdminClient(), which bypasses RLS entirely, exactly like
-- app/api/training/webhook/route.ts), so this policy exists only for a human
-- correcting a stuck row through the admin surface, not for the webhook path.
-- Same posture as "Admins can settle invoices" on client_invoices.
drop policy if exists "Admins can settle invoice payments" on public.client_invoice_payments;
create policy "Admins can settle invoice payments"
  on public.client_invoice_payments for update to authenticated
  using (public.is_company_portal_admin())
  with check (public.is_company_portal_admin());

-- No delete policy: a payment attempt is financial evidence, not a draft — the
-- same posture client_invoices takes on anything past a draft, and stricter,
-- because unlike an invoice a payment row has no void/self-delete escape hatch
-- at all. RLS with no delete policy denies every role, including admins.
