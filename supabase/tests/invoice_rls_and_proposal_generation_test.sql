begin;

select plan(30);

create or replace function pg_temp.sqlstate_of(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return null;
exception
  when others then
    return sqlstate;
end;
$$;

-- Stable fixture identities make the dynamic RPC calls below readable. The
-- entire file is transactional, so none of these rows survive the test run.
insert into auth.users (id, email, aud, role)
values
  ('11000000-0000-4000-8000-000000000001', 'invoice-owner@example.test', 'authenticated', 'authenticated'),
  ('22000000-0000-4000-8000-000000000002', 'invoice-finance@example.test', 'authenticated', 'authenticated'),
  ('33000000-0000-4000-8000-000000000003', 'invoice-no-module@example.test', 'authenticated', 'authenticated'),
  ('44000000-0000-4000-8000-000000000004', 'invoice-employee@example.test', 'authenticated', 'authenticated'),
  ('55000000-0000-4000-8000-000000000005', 'invoice-admin@example.test', 'authenticated', 'authenticated'),
  ('66000000-0000-4000-8000-000000000006', 'invoice-inactive-owner@example.test', 'authenticated', 'authenticated');

insert into public.user_roles (user_id, role, account_status)
values
  ('11000000-0000-4000-8000-000000000001', 'platform_admin', 'active'),
  ('22000000-0000-4000-8000-000000000002', 'employee', 'active'),
  ('33000000-0000-4000-8000-000000000003', 'employee', 'active'),
  ('44000000-0000-4000-8000-000000000004', 'employee', 'active'),
  ('55000000-0000-4000-8000-000000000005', 'admin', 'active'),
  ('66000000-0000-4000-8000-000000000006', 'platform_admin', 'inactive');

insert into public.company_finance_authorized_users (user_id)
values
  ('22000000-0000-4000-8000-000000000002'),
  ('33000000-0000-4000-8000-000000000003'),
  ('55000000-0000-4000-8000-000000000005');

insert into public.portal_user_module_access (user_id, module_key)
values
  ('22000000-0000-4000-8000-000000000002', 'finance'),
  ('55000000-0000-4000-8000-000000000005', 'finance');

insert into public.company_clients (id, name, client_code)
values ('77000000-0000-4000-8000-000000000007', 'Invoice Test Client', 'IVT');

insert into public.client_proposals (
  id, client_id, title, status, proposal_value, created_by
)
values (
  '88000000-0000-4000-8000-000000000008',
  '77000000-0000-4000-8000-000000000007',
  'Locked proposal title',
  'accepted',
  100000,
  '11000000-0000-4000-8000-000000000001'
);

insert into public.client_proposal_revisions (
  id, proposal_id, revision_number, title, status_at_save, created_by, form_data
)
values (
  '99000000-0000-4000-8000-000000000009',
  '88000000-0000-4000-8000-000000000008',
  1,
  'Accepted billing title',
  'accepted',
  '11000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'v', 1,
    'fields', jsonb_build_object(
      'packageSelect', 'professional',
      -- annualPrice deliberately omitted: the frozen $65,000 catalog fallback
      -- must be used before the 10% accepted discount is applied.
      'discountPct', 10,
      'paymentTerms', 'Net 30 from invoice date',
      'preparedBy', 'Invoice Test Owner'
    ),
    'phases', jsonb_build_array(
      jsonb_build_object('key', 'discovery', 'qty', 2, 'price', 100, 'name', 'Discovery')
    ),
    'services', jsonb_build_array(
      jsonb_build_object('key', 'training', 'qty', 4, 'price', 25, 'name', 'Training', 'unit', 'Attendee')
    )
  )
);

update public.client_proposals
set accepted_revision_id = '99000000-0000-4000-8000-000000000009'
where id = '88000000-0000-4000-8000-000000000008';

select ok(
  (select prosecdef from pg_proc where oid = 'private.can_access_client_invoices()'::regprocedure),
  'invoice-access helper is SECURITY DEFINER'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.generate_client_invoice_from_proposal(uuid,uuid,uuid,uuid,jsonb,numeric)'::regprocedure),
  'proposal invoice RPC is SECURITY INVOKER'
);
select ok(
  has_function_privilege('service_role', 'public.generate_client_invoice_from_proposal(uuid,uuid,uuid,uuid,jsonb,numeric)', 'EXECUTE'),
  'service_role can execute the proposal invoice RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.generate_client_invoice_from_proposal(uuid,uuid,uuid,uuid,jsonb,numeric)', 'EXECUTE'),
  'authenticated users cannot execute the proposal invoice RPC'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_invoices'
      and column_name = 'generation_key' and udt_name = 'uuid'
  ),
  'invoice generation_key is a uuid'
);
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'client_invoice_line_items'
     and column_name in ('source_proposal_revision_id', 'source_proposal_line_key', 'proposal_quantity', 'proposal_unit_amount')),
  4,
  'all four invoice-line provenance columns exist'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'client_invoice_line_items_provenance_all_or_none'),
  'provenance has an all-or-none check constraint'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'client_invoices_generation_key_key'),
  'generation keys have a unique index'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'client_invoice_line_items_source_per_invoice_key'),
  'source line keys are unique within an invoice'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'client_invoice_line_items_source_idx'),
  'remaining-quantity lookups have a provenance index'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select ok(private.can_access_client_invoices(), 'active portal owners are invoice users');
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select ok(private.can_access_client_invoices(), 'active finance-authorized users with the Finance module are invoice users');
select set_config('request.jwt.claim.sub', '33000000-0000-4000-8000-000000000003', true);
select ok(not private.can_access_client_invoices(), 'finance authorization without the Finance module is insufficient');
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select ok(not private.can_access_client_invoices(), 'an ordinary active employee is not an invoice user');
select set_config('request.jwt.claim.sub', '66000000-0000-4000-8000-000000000006', true);
select ok(not private.can_access_client_invoices(), 'an inactive portal owner is not an invoice user');
reset role;

set local role service_role;
select is(
  pg_temp.sqlstate_of($sql$
    select * from public.generate_client_invoice_from_proposal(
      '88000000-0000-4000-8000-000000000008',
      '99000000-0000-4000-8000-000000000009',
      '11000000-0000-4000-8000-000000000001',
      'aa000000-0000-4000-8000-00000000000a',
      jsonb_build_array(jsonb_build_object(
        'line_key', '99000000-0000-4000-8000-000000000009:0',
        'quantity', 1, 'description', 'Professional package', 'unit', '',
        'qty_basis', 'flat', 'unit_amount', 58500, 'line_total', 58500, 'sort_order', 10
      )),
      0
    )
  $sql$),
  null::text,
  'RPC accepts catalog-backed package pricing at the accepted discount'
);
reset role;

select ok(
  exists (
    select 1 from public.client_invoices
    where generation_key = 'aa000000-0000-4000-8000-00000000000a'
      and client_id = '77000000-0000-4000-8000-000000000007'
      and proposal_id = '88000000-0000-4000-8000-000000000008'
      and status = 'draft' and kind is null and currency = 'USD'
      and subtotal = 58500 and tax_amount = 0 and total = 58500
      and job_name = 'Accepted billing title'
      and payment_terms = 'Net 30 from invoice date'
      and prepared_by = 'Invoice Test Owner'
      and due_date = current_date + 30
  ),
  'RPC derives and stores the invoice header from the locked proposal and revision'
);
select ok(
  exists (
    select 1
    from public.client_invoice_line_items line
    join public.client_invoices invoice on invoice.id = line.invoice_id
    where invoice.generation_key = 'aa000000-0000-4000-8000-00000000000a'
      and line.source_proposal_revision_id = '99000000-0000-4000-8000-000000000009'
      and line.source_proposal_line_key = '99000000-0000-4000-8000-000000000009:0'
      and line.quantity = 1 and line.unit_amount = 58500
      and line.proposal_quantity = 1 and line.proposal_unit_amount = 58500
  ),
  'RPC stores accepted discounted price and line provenance'
);

set local role service_role;
select is(
  pg_temp.sqlstate_of($sql$
    select * from public.generate_client_invoice_from_proposal(
      '88000000-0000-4000-8000-000000000008',
      '99000000-0000-4000-8000-000000000009',
      '11000000-0000-4000-8000-000000000001',
      'aa000000-0000-4000-8000-00000000000a',
      '[]'::jsonb,
      999
    )
  $sql$),
  null::text,
  'an idempotent retry returns before revalidating a changed payload'
);
reset role;
select is(
  (select count(*)::integer from public.client_invoices where generation_key = 'aa000000-0000-4000-8000-00000000000a'),
  1,
  'an idempotent retry does not insert another invoice'
);

set local role service_role;
select is(
  pg_temp.sqlstate_of($sql$
    select * from public.generate_client_invoice_from_proposal(
      '88000000-0000-4000-8000-000000000008',
      '99000000-0000-4000-8000-000000000009',
      '11000000-0000-4000-8000-000000000001',
      'bb000000-0000-4000-8000-00000000000b',
      jsonb_build_array(jsonb_build_object(
        'line_key', '99000000-0000-4000-8000-000000000009:1',
        'quantity', 1, 'description', 'Discovery slice', 'unit', 'Session',
        'qty_basis', 'session', 'unit_amount', 90, 'line_total', 90, 'sort_order', 20
      )),
      0
    )
  $sql$),
  null::text,
  'RPC can reserve part of a divisible accepted line'
);
select is(
  pg_temp.sqlstate_of($sql$
    select * from public.generate_client_invoice_from_proposal(
      '88000000-0000-4000-8000-000000000008',
      '99000000-0000-4000-8000-000000000009',
      '11000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-00000000000c',
      jsonb_build_array(jsonb_build_object(
        'line_key', '99000000-0000-4000-8000-000000000009:1',
        'quantity', 2, 'description', 'Too much discovery', 'unit', 'Session',
        'qty_basis', 'session', 'unit_amount', 90, 'line_total', 180, 'sort_order', 20
      )),
      0
    )
  $sql$),
  '23514',
  'RPC rejects quantities already reserved by non-void invoices'
);
select is(
  pg_temp.sqlstate_of($sql$
    select * from public.generate_client_invoice_from_proposal(
      '88000000-0000-4000-8000-000000000008',
      '99000000-0000-4000-8000-000000000009',
      '11000000-0000-4000-8000-000000000001',
      'dd000000-0000-4000-8000-00000000000d',
      jsonb_build_array(
        jsonb_build_object('line_key', '99000000-0000-4000-8000-000000000009:2', 'quantity', 1, 'description', 'Training A', 'unit', 'Attendee', 'qty_basis', 'attendee', 'unit_amount', 22.5, 'line_total', 22.5, 'sort_order', 30),
        jsonb_build_object('line_key', '99000000-0000-4000-8000-000000000009:2', 'quantity', 1, 'description', 'Training B', 'unit', 'Attendee', 'qty_basis', 'attendee', 'unit_amount', 22.5, 'line_total', 22.5, 'sort_order', 31)
      ),
      0
    )
  $sql$),
  '22023',
  'RPC rejects duplicate line keys in one request'
);
select is(
  pg_temp.sqlstate_of($sql$
    select * from public.generate_client_invoice_from_proposal(
      '88000000-0000-4000-8000-000000000008',
      '99999999-9999-4999-8999-999999999999',
      '11000000-0000-4000-8000-000000000001',
      'ee000000-0000-4000-8000-00000000000e',
      jsonb_build_array(jsonb_build_object('line_key', '99999999-9999-4999-8999-999999999999:0')),
      0
    )
  $sql$),
  '22023',
  'RPC requires the proposal accepted_revision_id to match'
);
reset role;

insert into public.client_invoice_payments (invoice_id, amount, status, initiated_by)
select id, 100, 'pending', '11000000-0000-4000-8000-000000000001'
from public.client_invoices
where generation_key = 'aa000000-0000-4000-8000-00000000000a';

set local role authenticated;
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000004', true);
select ok(
  (select count(*) from public.client_invoices) = 0
  and (select count(*) from public.client_invoice_line_items) = 0
  and (select count(*) from public.client_invoice_payments) = 0,
  'invoice, line, and payment RLS hides all rows from ordinary employees'
);
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000002', true);
select ok(
  (select count(*) from public.client_invoices) > 0
  and (select count(*) from public.client_invoice_line_items) > 0
  and (select count(*) from public.client_invoice_payments) > 0,
  'invoice, line, and payment RLS exposes rows to exact invoice users'
);
select is(
  (with changed as (
    update public.client_invoices set notes = 'finance-only edit denied'
    where generation_key = 'aa000000-0000-4000-8000-00000000000a'
    returning 1
  ) select count(*)::integer from changed),
  0,
  'a non-admin invoice user cannot settle or edit invoice headers'
);
select is(
  (with changed as (
    update public.client_invoice_payments set status = 'processing'
    returning 1
  ) select count(*)::integer from changed),
  0,
  'a non-admin invoice user cannot settle payments'
);
select set_config('request.jwt.claim.sub', '55000000-0000-4000-8000-000000000005', true);
select is(
  (with changed as (
    update public.client_invoices set notes = 'admin finance edit allowed'
    where generation_key = 'aa000000-0000-4000-8000-00000000000a'
    returning 1
  ) select count(*)::integer from changed),
  1,
  'an admin who is also an invoice user can edit invoice headers'
);
select is(
  (with changed as (
    update public.client_invoice_payments set status = 'processing'
    returning 1
  ) select count(*)::integer from changed),
  1,
  'an admin who is also an invoice user can settle payments'
);
reset role;

select * from finish();
rollback;
