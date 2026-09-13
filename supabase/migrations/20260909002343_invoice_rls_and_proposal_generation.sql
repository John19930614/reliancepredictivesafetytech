-- Restrict invoice data to owners and explicitly enabled finance users, then
-- add accepted-revision provenance and one atomic proposal-to-invoice write.
--
-- The RPC is intentionally SECURITY INVOKER and executable only by
-- service_role. It therefore keeps the existing numbering and contract-value
-- triggers in force while removing the old header-then-lines partial-write gap.
--
-- ROLLBACK (review data-retention impact before running):
--   revoke execute on function public.generate_client_invoice_from_proposal(
--     uuid, uuid, uuid, uuid, jsonb, numeric
--   ) from service_role;
--   drop function if exists public.generate_client_invoice_from_proposal(
--     uuid, uuid, uuid, uuid, jsonb, numeric
--   );
--   drop policy if exists "Invoice users can read invoices" on public.client_invoices;
--   drop policy if exists "Invoice users can create draft invoices" on public.client_invoices;
--   drop policy if exists "Invoice admins can settle invoices" on public.client_invoices;
--   drop policy if exists "Invoice users can delete invoices" on public.client_invoices;
--   drop policy if exists "Invoice users can read invoice lines" on public.client_invoice_line_items;
--   drop policy if exists "Invoice users can create invoice lines" on public.client_invoice_line_items;
--   drop policy if exists "Invoice users can update invoice lines" on public.client_invoice_line_items;
--   drop policy if exists "Invoice users can delete invoice lines" on public.client_invoice_line_items;
--   drop policy if exists "Invoice users can read invoice payments" on public.client_invoice_payments;
--   drop policy if exists "Invoice users can start invoice payments" on public.client_invoice_payments;
--   drop policy if exists "Invoice admins can settle invoice payments" on public.client_invoice_payments;
--   -- Recreate the prior Employee/Admin policies from
--   -- 20260814160815_client_workflow_and_invoices.sql and
--   -- 20260819125516_stripe_payments.sql if the old access model is required.
--   revoke execute on function private.can_access_client_invoices() from authenticated;
--   drop function if exists private.can_access_client_invoices();
--   drop index if exists public.client_invoice_line_items_source_idx;
--   drop index if exists public.client_invoice_line_items_source_per_invoice_key;
--   drop index if exists public.client_invoices_generation_key_key;
--   alter table public.client_invoice_line_items
--     drop constraint if exists client_invoice_line_items_provenance_all_or_none,
--     drop column if exists proposal_unit_amount,
--     drop column if exists proposal_quantity,
--     drop column if exists source_proposal_line_key,
--     drop column if exists source_proposal_revision_id;
--   alter table public.client_invoices drop column if exists generation_key;
--   -- Dropping the provenance columns destroys billing-source evidence. Prefer
--   -- leaving additive columns in place during an application rollback.

/* -------------------------------------------------------------------------- */
/* 1. One exact authorization predicate for every invoice policy              */
/* -------------------------------------------------------------------------- */

create schema if not exists private;

create or replace function private.can_access_client_invoices()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.user_roles role
        where role.user_id = (select auth.uid())
          and role.account_status = 'active'
          and role.role in ('platform_admin', 'super_admin')
      )
      or exists (
        select 1
        from public.company_finance_authorized_users finance_user
        join public.user_roles role
          on role.user_id = finance_user.user_id
         and role.account_status = 'active'
        join public.portal_user_module_access module_access
          on module_access.user_id = finance_user.user_id
         and module_access.module_key = 'finance'
        where finance_user.user_id = (select auth.uid())
      )
    );
$$;

comment on function private.can_access_client_invoices() is
  'True only for an active platform/super owner, or an active finance-authorized user who also has portal_user_module_access(module_key = finance). This is the single predicate used by invoice, line-item, and payment RLS policies.';

grant usage on schema private to authenticated;
revoke execute on function private.can_access_client_invoices() from public, anon, service_role;
grant execute on function private.can_access_client_invoices() to authenticated;

/* client_invoices --------------------------------------------------------- */

drop policy if exists "Employees can read invoices" on public.client_invoices;
drop policy if exists "Employees can create draft invoices" on public.client_invoices;
drop policy if exists "Employees can update invoices" on public.client_invoices;
drop policy if exists "Admins can settle invoices" on public.client_invoices;
drop policy if exists "Admins can delete invoices" on public.client_invoices;

create policy "Invoice users can read invoices"
  on public.client_invoices for select to authenticated
  using ((select private.can_access_client_invoices()));

create policy "Invoice users can create draft invoices"
  on public.client_invoices for insert to authenticated
  with check (
    (select private.can_access_client_invoices())
    and status = 'draft'
    and issued_at is null
    and paid_at is null
    and created_by = (select auth.uid())
  );

-- Settlement and all other header edits remain an admin operation. Requiring
-- both predicates prevents a non-finance company_admin from reaching invoices.
create policy "Invoice admins can settle invoices"
  on public.client_invoices for update to authenticated
  using (
    (select private.can_access_client_invoices())
    and (select public.is_company_portal_admin())
  )
  with check (
    (select private.can_access_client_invoices())
    and (select public.is_company_portal_admin())
  );

create policy "Invoice users can delete invoices"
  on public.client_invoices for delete to authenticated
  using (
    (select private.can_access_client_invoices())
    and (
      (select public.is_company_portal_admin())
      or (status = 'draft' and created_by = (select auth.uid()))
    )
  );

/* client_invoice_line_items ---------------------------------------------- */

drop policy if exists "Employees can read invoice lines" on public.client_invoice_line_items;
drop policy if exists "Employees can create invoice lines" on public.client_invoice_line_items;
drop policy if exists "Employees can update invoice lines" on public.client_invoice_line_items;
drop policy if exists "Employees can delete invoice lines" on public.client_invoice_line_items;

create policy "Invoice users can read invoice lines"
  on public.client_invoice_line_items for select to authenticated
  using ((select private.can_access_client_invoices()));

create policy "Invoice users can create invoice lines"
  on public.client_invoice_line_items for insert to authenticated
  with check (
    (select private.can_access_client_invoices())
    and exists (
      select 1
      from public.client_invoices invoice
      where invoice.id = invoice_id
        and invoice.status = 'draft'
    )
  );

create policy "Invoice users can update invoice lines"
  on public.client_invoice_line_items for update to authenticated
  using (
    (select private.can_access_client_invoices())
    and exists (
      select 1
      from public.client_invoices invoice
      where invoice.id = invoice_id
        and invoice.status = 'draft'
    )
  )
  with check (
    (select private.can_access_client_invoices())
    and exists (
      select 1
      from public.client_invoices invoice
      where invoice.id = invoice_id
        and invoice.status = 'draft'
    )
  );

create policy "Invoice users can delete invoice lines"
  on public.client_invoice_line_items for delete to authenticated
  using (
    (select private.can_access_client_invoices())
    and exists (
      select 1
      from public.client_invoices invoice
      where invoice.id = invoice_id
        and invoice.status = 'draft'
    )
  );

/* client_invoice_payments ------------------------------------------------ */

drop policy if exists "Employees can read invoice payments" on public.client_invoice_payments;
drop policy if exists "Employees can start invoice payments" on public.client_invoice_payments;
drop policy if exists "Admins can settle invoice payments" on public.client_invoice_payments;

create policy "Invoice users can read invoice payments"
  on public.client_invoice_payments for select to authenticated
  using ((select private.can_access_client_invoices()));

create policy "Invoice users can start invoice payments"
  on public.client_invoice_payments for insert to authenticated
  with check (
    (select private.can_access_client_invoices())
    and status = 'pending'
    and succeeded_at is null
    and initiated_by = (select auth.uid())
  );

create policy "Invoice admins can settle invoice payments"
  on public.client_invoice_payments for update to authenticated
  using (
    (select private.can_access_client_invoices())
    and (select public.is_company_portal_admin())
  )
  with check (
    (select private.can_access_client_invoices())
    and (select public.is_company_portal_admin())
  );

/* -------------------------------------------------------------------------- */
/* 2. Idempotency and accepted-revision provenance                            */
/* -------------------------------------------------------------------------- */

alter table public.client_invoices
  add column if not exists generation_key uuid;

comment on column public.client_invoices.generation_key is
  'Caller-generated idempotency key for one proposal-to-invoice request. A retry returns the existing invoice instead of allocating another invoice number.';

create unique index if not exists client_invoices_generation_key_key
  on public.client_invoices (generation_key)
  where generation_key is not null;

alter table public.client_invoice_line_items
  add column if not exists source_proposal_revision_id uuid
    references public.client_proposal_revisions(id) on delete restrict,
  add column if not exists source_proposal_line_key text,
  add column if not exists proposal_quantity numeric,
  add column if not exists proposal_unit_amount numeric;

alter table public.client_invoice_line_items
  drop constraint if exists client_invoice_line_items_provenance_all_or_none;

alter table public.client_invoice_line_items
  add constraint client_invoice_line_items_provenance_all_or_none
  check (
    (
      source_proposal_revision_id is null
      and source_proposal_line_key is null
      and proposal_quantity is null
      and proposal_unit_amount is null
    )
    or (
      source_proposal_revision_id is not null
      and source_proposal_line_key is not null
      and source_proposal_line_key ~ (
        '^' || source_proposal_revision_id::text || ':[0-9]+$'
      )
      and proposal_quantity > 0
      and proposal_unit_amount >= 0
    )
  );

comment on column public.client_invoice_line_items.source_proposal_revision_id is
  'The immutable accepted proposal revision from which this billed line was selected.';
comment on column public.client_invoice_line_items.source_proposal_line_key is
  'Stable accepted-revision line identity: <revision UUID>:<zero-based fee-table order>.';
comment on column public.client_invoice_line_items.proposal_quantity is
  'Quantity authorized on the accepted proposal line, copied at invoice generation time.';
comment on column public.client_invoice_line_items.proposal_unit_amount is
  'Unit amount authorized on the accepted proposal line, copied at invoice generation time.';

create unique index if not exists client_invoice_line_items_source_per_invoice_key
  on public.client_invoice_line_items (invoice_id, source_proposal_line_key)
  where source_proposal_line_key is not null;

create index if not exists client_invoice_line_items_source_idx
  on public.client_invoice_line_items (
    source_proposal_revision_id,
    source_proposal_line_key,
    invoice_id
  )
  include (quantity)
  where source_proposal_revision_id is not null;

/* -------------------------------------------------------------------------- */
/* 3. Atomic accepted-proposal invoice generation                             */
/* -------------------------------------------------------------------------- */

create or replace function public.generate_client_invoice_from_proposal(
  p_proposal_id uuid,
  p_revision_id uuid,
  p_created_by uuid,
  p_generation_key uuid,
  p_lines jsonb,
  p_tax_amount numeric
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_proposal public.client_proposals%rowtype;
  v_revision public.client_proposal_revisions%rowtype;
  v_existing_id uuid;
  v_existing_number text;
  v_existing_proposal_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_validated_lines jsonb := '[]'::jsonb;
  v_seen_line_keys text[] := array[]::text[];
  v_line jsonb;
  v_source_line jsonb;
  v_ordinality bigint;
  v_line_key text;
  v_line_index integer;
  v_source_index integer;
  v_phase_count integer;
  v_service_count integer;
  v_has_package boolean;
  v_package_key text;
  v_package_unit_amount numeric := 0;
  v_accepted_subtotal numeric := 0;
  v_discount_pct numeric := 0;
  v_discount_amount numeric := 0;
  v_discount_scale numeric := 1;
  v_quantity numeric;
  v_unit_amount numeric;
  v_line_total numeric;
  v_expected_line_total numeric;
  v_sort_order integer;
  v_description text;
  v_unit text;
  v_qty_basis text;
  v_proposal_quantity numeric;
  v_original_unit_amount numeric;
  v_proposal_unit_amount numeric;
  v_used_quantity numeric;
  v_subtotal numeric := 0;
  v_tax_amount numeric;
  v_total numeric;
  v_job_name text;
  v_payment_terms text;
  v_prepared_by text;
  v_due_date date;
  v_net_match text[];
begin
  if p_proposal_id is null
     or p_revision_id is null
     or p_created_by is null
     or p_generation_key is null then
    raise exception 'proposal, revision, actor, and generation key are required'
      using errcode = '22023';
  end if;

  -- The proposal row is the concurrency lock for every quantity reservation
  -- sourced from any of its accepted revisions. Calls for the same proposal
  -- therefore validate and reserve in one deterministic order.
  select proposal.*
    into v_proposal
    from public.client_proposals proposal
   where proposal.id = p_proposal_id
   for update;

  if not found then
    raise exception 'proposal % was not found', p_proposal_id
      using errcode = 'P0002';
  end if;

  -- A completed first call wins even if a later workflow change has reopened
  -- the proposal. Reusing a key for another proposal is never idempotency.
  select invoice.id, invoice.invoice_number, invoice.proposal_id
    into v_existing_id, v_existing_number, v_existing_proposal_id
    from public.client_invoices invoice
   where invoice.generation_key = p_generation_key;

  if found then
    if v_existing_proposal_id is distinct from p_proposal_id then
      raise exception 'generation key % is already used by another proposal', p_generation_key
        using errcode = '23505';
    end if;

    return query select v_existing_id, v_existing_number;
    return;
  end if;

  if v_proposal.accepted_revision_id is distinct from p_revision_id then
    raise exception 'revision % is not the proposal''s accepted revision', p_revision_id
      using errcode = '22023',
            hint = 'Generate only from the revision recorded in client_proposals.accepted_revision_id.';
  end if;

  select revision.*
    into v_revision
    from public.client_proposal_revisions revision
   where revision.id = p_revision_id
     and revision.proposal_id = p_proposal_id;

  if not found then
    raise exception 'accepted revision % does not belong to proposal %', p_revision_id, p_proposal_id
      using errcode = '22023';
  end if;

  if v_proposal.client_id is null then
    raise exception 'proposal % has no client', p_proposal_id
      using errcode = '23514';
  end if;

  -- Although only trusted service code can call this function, preserve the
  -- human authorization boundary as defense in depth for p_created_by.
  if not (
    exists (
      select 1
      from public.user_roles role
      where role.user_id = p_created_by
        and role.account_status = 'active'
        and role.role in ('platform_admin', 'super_admin')
    )
    or exists (
      select 1
      from public.company_finance_authorized_users finance_user
      join public.user_roles role
        on role.user_id = finance_user.user_id
       and role.account_status = 'active'
      join public.portal_user_module_access module_access
        on module_access.user_id = finance_user.user_id
       and module_access.module_key = 'finance'
      where finance_user.user_id = p_created_by
    )
  ) then
    raise exception 'actor % is not authorized to generate invoices', p_created_by
      using errcode = '42501';
  end if;

  if v_revision.form_data is null
     or jsonb_typeof(v_revision.form_data) <> 'object'
     or jsonb_typeof(v_revision.form_data -> 'fields') <> 'object'
     or jsonb_typeof(v_revision.form_data -> 'phases') <> 'array'
     or jsonb_typeof(v_revision.form_data -> 'services') <> 'array' then
    raise exception 'accepted revision % has no valid fee-table snapshot', p_revision_id
      using errcode = '22023';
  end if;

  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'at least one invoice line is required'
      using errcode = '22023';
  end if;

  v_tax_amount := round(coalesce(p_tax_amount, 0), 2);
  if v_tax_amount < 0 or coalesce(p_tax_amount, 0) <> v_tax_amount then
    raise exception 'tax amount must be a non-negative amount with at most two decimals'
      using errcode = '22023';
  end if;

  v_package_key := coalesce(
    nullif(btrim(v_revision.form_data #>> '{fields,packageSelect}'), ''),
    'blank'
  );
  -- Unknown package keys are rendered as the blank/default package by the
  -- accepted-proposal pricing model. Only the explicit `none` option removes
  -- the package row from the stable fee-table order.
  if v_package_key not in (
    'starter', 'professional', 'enterprise', 'blacklabel', 'custom', 'blank', 'none'
  ) then
    v_package_key := 'blank';
  end if;

  v_has_package := v_package_key <> 'none';
  v_phase_count := jsonb_array_length(v_revision.form_data -> 'phases');
  v_service_count := jsonb_array_length(v_revision.form_data -> 'services');

  -- Rebuild the accepted revision's proposal-level discount scale exactly as
  -- the invoice service does. annualPrice is an optional override: legacy
  -- accepted snapshots can omit it, so use the frozen package catalog value
  -- rather than treating the accepted package price as NULL.
  if v_has_package then
    begin
      if nullif(btrim(v_revision.form_data #>> '{fields,annualPrice}'), '') is null then
        raise invalid_text_representation;
      end if;
      v_package_unit_amount :=
        greatest((v_revision.form_data #>> '{fields,annualPrice}')::numeric, 0);
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        v_package_unit_amount := case v_package_key
          when 'starter' then 35000
          when 'professional' then 65000
          when 'enterprise' then 99500
          when 'blacklabel' then 155000
          when 'custom' then 5000
          else 0
        end;
    end;

    v_accepted_subtotal := round(v_package_unit_amount, 2);
  end if;

  for v_source_line in
    select source.value
    from jsonb_array_elements(
      (v_revision.form_data -> 'phases') ||
      (v_revision.form_data -> 'services')
    ) as source(value)
  loop
    begin
      v_proposal_quantity := greatest((v_source_line ->> 'qty')::numeric, 0);
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        v_proposal_quantity := 0;
    end;
    begin
      v_original_unit_amount := greatest((v_source_line ->> 'price')::numeric, 0);
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        v_original_unit_amount := 0;
    end;

    v_accepted_subtotal := v_accepted_subtotal + round(
      coalesce(v_proposal_quantity, 0) * coalesce(v_original_unit_amount, 0),
      2
    );
  end loop;
  v_accepted_subtotal := round(v_accepted_subtotal, 2);

  begin
    v_discount_pct := greatest(
      least((v_revision.form_data #>> '{fields,discountPct}')::numeric, 100),
      0
    );
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      v_discount_pct := 0;
  end;
  v_discount_pct := coalesce(v_discount_pct, 0);
  v_discount_amount := round(v_accepted_subtotal * (v_discount_pct / 100), 2);
  if v_accepted_subtotal > 0 then
    v_discount_scale :=
      (v_accepted_subtotal - greatest(v_discount_amount, 0)) /
      v_accepted_subtotal;
  end if;

  for v_line, v_ordinality in
    select line.value, line.ordinality
    from jsonb_array_elements(p_lines) with ordinality as line(value, ordinality)
  loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'invoice line % must be a JSON object', v_ordinality - 1
        using errcode = '22023';
    end if;

    v_line_key := btrim(coalesce(v_line ->> 'line_key', ''));
    if v_line_key !~ ('^' || p_revision_id::text || ':[0-9]+$') then
      raise exception 'invoice line % has an invalid line_key', v_ordinality - 1
        using errcode = '22023',
              hint = 'line_key must be <accepted revision UUID>:<zero-based fee-table order>.';
    end if;

    if v_line_key = any(v_seen_line_keys) then
      raise exception 'duplicate proposal line key %', v_line_key
        using errcode = '22023';
    end if;
    v_seen_line_keys := array_append(v_seen_line_keys, v_line_key);

    begin
      v_line_index := split_part(v_line_key, ':', 2)::integer;
      v_quantity := (v_line ->> 'quantity')::numeric;
      v_unit_amount := (v_line ->> 'unit_amount')::numeric;
      v_line_total := (v_line ->> 'line_total')::numeric;
      v_sort_order := (v_line ->> 'sort_order')::integer;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'invoice line % contains an invalid numeric value', v_ordinality - 1
          using errcode = '22023';
    end;

    v_description := btrim(coalesce(v_line ->> 'description', ''));
    v_unit := coalesce(v_line ->> 'unit', '');
    v_qty_basis := coalesce(v_line ->> 'qty_basis', '');

    if char_length(v_description) not between 1 and 500 then
      raise exception 'invoice line % description must contain 1 to 500 characters', v_ordinality - 1
        using errcode = '22023';
    end if;
    if char_length(v_unit) > 60 then
      raise exception 'invoice line % unit exceeds 60 characters', v_ordinality - 1
        using errcode = '22023';
    end if;
    if v_qty_basis not in ('session', 'attendee', 'hour', 'flat') then
      raise exception 'invoice line % has an invalid qty_basis', v_ordinality - 1
        using errcode = '22023';
    end if;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'invoice line % quantity must be greater than zero', v_ordinality - 1
        using errcode = '22023';
    end if;
    if v_quantity <> round(v_quantity, 2) then
      raise exception 'invoice line % quantity must have at most two decimals', v_ordinality - 1
        using errcode = '22023';
    end if;
    if v_unit_amount is null or v_unit_amount < 0 then
      raise exception 'invoice line % unit_amount must be non-negative', v_ordinality - 1
        using errcode = '22023';
    end if;
    if v_line_total is null or v_line_total < 0 or v_line_total <> round(v_line_total, 2) then
      raise exception 'invoice line % line_total must be non-negative with at most two decimals', v_ordinality - 1
        using errcode = '22023';
    end if;

    -- Accepted fee-table order is package (unless services-only), then phases,
    -- then services. This is the same stable order used by the proposal model.
    v_source_index := v_line_index;
    v_source_line := null;
    if v_has_package and v_source_index = 0 then
      v_proposal_quantity := 1;
      v_original_unit_amount := round(v_package_unit_amount, 2);
    else
      if v_has_package then
        v_source_index := v_source_index - 1;
      end if;

      if v_source_index >= 0 and v_source_index < v_phase_count then
        v_source_line := (v_revision.form_data -> 'phases') -> v_source_index;
      elsif v_source_index >= v_phase_count
            and v_source_index < v_phase_count + v_service_count then
        v_source_line := (v_revision.form_data -> 'services') ->
          (v_source_index - v_phase_count);
      else
        raise exception 'proposal line key % does not identify a fee-table row', v_line_key
          using errcode = '22023';
      end if;

      begin
        v_proposal_quantity := round(
          greatest((v_source_line ->> 'qty')::numeric, 0),
          2
        );
        v_original_unit_amount := round(
          greatest((v_source_line ->> 'price')::numeric, 0),
          2
        );
      exception
        when invalid_text_representation or numeric_value_out_of_range then
          raise exception 'accepted proposal line % has invalid quantity or price', v_line_key
            using errcode = '22023';
      end;
    end if;

    -- proposal_unit_amount is the accepted *discounted* unit price. The raw
    -- fee-table amount remains recoverable from the immutable revision, while
    -- this provenance value is the exact price the invoice may charge.
    v_proposal_unit_amount := round(
      coalesce(v_original_unit_amount, 0) * v_discount_scale,
      2
    );

    if v_proposal_quantity is null or v_proposal_quantity <= 0
       or v_proposal_unit_amount is null or v_proposal_unit_amount < 0 then
      raise exception 'accepted proposal line % is not billable', v_line_key
        using errcode = '22023';
    end if;

    if v_unit_amount <> round(v_proposal_unit_amount, 2) then
      raise exception 'invoice line % unit amount differs from the accepted proposal', v_line_key
        using errcode = '23514';
    end if;

    v_expected_line_total := round(
      case
        when v_qty_basis = 'flat' then v_unit_amount
        else v_quantity * v_unit_amount
      end,
      2
    );

    if v_line_total <> v_expected_line_total then
      raise exception 'invoice line % total must be %', v_line_key, v_expected_line_total
        using errcode = '23514';
    end if;

    -- A flat fee is indivisible: allowing two half-quantity reservations would
    -- charge the full flat amount twice while appearing to stay within quantity.
    if v_qty_basis = 'flat'
       and (v_proposal_quantity <> 1 or v_quantity <> 1) then
      raise exception 'flat proposal line % must be billed once at quantity 1', v_line_key
        using errcode = '23514';
    end if;

    select coalesce(sum(line_item.quantity), 0)
      into v_used_quantity
      from public.client_invoice_line_items line_item
      join public.client_invoices invoice
        on invoice.id = line_item.invoice_id
     where line_item.source_proposal_revision_id = p_revision_id
       and line_item.source_proposal_line_key = v_line_key
       and invoice.status <> 'void';

    if v_quantity > v_proposal_quantity - v_used_quantity then
      raise exception 'proposal line % has % remaining but % was requested',
        v_line_key,
        greatest(v_proposal_quantity - v_used_quantity, 0),
        v_quantity
        using errcode = '23514';
    end if;

    v_validated_lines := v_validated_lines || jsonb_build_array(
      jsonb_build_object(
        'description', v_description,
        'quantity', v_quantity,
        'unit_amount', v_unit_amount,
        'line_total', v_line_total,
        'unit', v_unit,
        'qty_basis', v_qty_basis,
        'sort_order', v_sort_order,
        'source_proposal_revision_id', p_revision_id,
        'source_proposal_line_key', v_line_key,
        'proposal_quantity', v_proposal_quantity,
        'proposal_unit_amount', v_proposal_unit_amount
      )
    );
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_total := round(v_subtotal + v_tax_amount, 2);
  v_job_name := coalesce(nullif(btrim(v_revision.title), ''), v_proposal.title);
  v_payment_terms := nullif(
    btrim(v_revision.form_data #>> '{fields,paymentTerms}'),
    ''
  );
  v_prepared_by := nullif(
    btrim(v_revision.form_data #>> '{fields,preparedBy}'),
    ''
  );

  if char_length(v_job_name) > 300 then
    raise exception 'accepted proposal title exceeds the invoice job-name limit'
      using errcode = '22023';
  end if;
  if char_length(v_payment_terms) > 1000 then
    raise exception 'accepted proposal payment terms exceed the invoice limit'
      using errcode = '22023';
  end if;
  if char_length(v_prepared_by) > 200 then
    raise exception 'accepted proposal prepared-by value exceeds the invoice limit'
      using errcode = '22023';
  end if;

  -- Keep the displayed terms and due date synchronized for terms the generator
  -- expresses unambiguously. Less mechanical terms remain unset for review.
  if lower(coalesce(v_payment_terms, '')) ~ 'due (upon|on) receipt' then
    v_due_date := current_date;
  else
    v_net_match := regexp_match(
      lower(coalesce(v_payment_terms, '')),
      'net[[:space:]]+([0-9]{1,3})'
    );
    if v_net_match is not null then
      v_due_date := current_date + v_net_match[1]::integer;
    end if;
  end if;

  begin
    insert into public.client_invoices (
      client_id,
      proposal_id,
      status,
      kind,
      issue_date,
      due_date,
      currency,
      subtotal,
      tax_amount,
      total,
      job_name,
      payment_terms,
      prepared_by,
      notes,
      variance_reason,
      created_by,
      generation_key
    )
    values (
      v_proposal.client_id,
      p_proposal_id,
      'draft',
      null,
      current_date,
      v_due_date,
      'USD',
      v_subtotal,
      v_tax_amount,
      v_total,
      v_job_name,
      v_payment_terms,
      v_prepared_by,
      null,
      null,
      p_created_by,
      p_generation_key
    )
    returning id, client_invoices.invoice_number
      into v_invoice_id, v_invoice_number;
  exception
    when unique_violation then
      select invoice.id, invoice.invoice_number, invoice.proposal_id
        into v_existing_id, v_existing_number, v_existing_proposal_id
        from public.client_invoices invoice
       where invoice.generation_key = p_generation_key;

      if found and v_existing_proposal_id = p_proposal_id then
        return query select v_existing_id, v_existing_number;
        return;
      end if;
      raise;
  end;

  insert into public.client_invoice_line_items (
    invoice_id,
    description,
    quantity,
    unit_amount,
    line_total,
    unit,
    qty_basis,
    sort_order,
    source_proposal_revision_id,
    source_proposal_line_key,
    proposal_quantity,
    proposal_unit_amount
  )
  select
    v_invoice_id,
    line.description,
    line.quantity,
    line.unit_amount,
    line.line_total,
    line.unit,
    line.qty_basis,
    line.sort_order,
    line.source_proposal_revision_id,
    line.source_proposal_line_key,
    line.proposal_quantity,
    line.proposal_unit_amount
  from jsonb_to_recordset(v_validated_lines) as line(
    description text,
    quantity numeric,
    unit_amount numeric,
    line_total numeric,
    unit text,
    qty_basis text,
    sort_order integer,
    source_proposal_revision_id uuid,
    source_proposal_line_key text,
    proposal_quantity numeric,
    proposal_unit_amount numeric
  );

  return query select v_invoice_id, v_invoice_number;
end;
$$;

comment on function public.generate_client_invoice_from_proposal(
  uuid, uuid, uuid, uuid, jsonb, numeric
) is
  'Service-role-only, SECURITY INVOKER invoice generation. Locks the proposal, requires its accepted revision, validates stable line keys/prices and non-void remaining quantities, inserts the draft header and provenance lines atomically, and returns the id/number. Existing invoice numbering and contract/variance triggers remain authoritative.';

revoke execute on function public.generate_client_invoice_from_proposal(
  uuid, uuid, uuid, uuid, jsonb, numeric
) from public, anon, authenticated;
grant execute on function public.generate_client_invoice_from_proposal(
  uuid, uuid, uuid, uuid, jsonb, numeric
) to service_role;
