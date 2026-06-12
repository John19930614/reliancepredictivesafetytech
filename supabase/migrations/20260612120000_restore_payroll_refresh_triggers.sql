-- Recreate the payroll refresh function
create or replace function private.refresh_time_card_payroll(target_card_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  total numeric(10,2);
  rate  numeric(10,2);
  card_row public.employee_time_cards%rowtype;
begin
  select * into card_row from public.employee_time_cards where id = target_card_id;

  select coalesce(sum(hours), 0)
  into total
  from public.employee_time_entries
  where time_card_id = target_card_id;

  select coalesce(
    (select hourly_rate from public.employee_time_card_payroll where time_card_id = target_card_id),
    (select hourly_rate from public.employee_pay_rates where user_id = card_row.employee_user_id),
    75
  )
  into rate;

  insert into public.employee_time_card_payroll (time_card_id, hourly_rate, total_hours, paid_value)
  values (target_card_id, rate, total, (rate * total)::numeric(12,2))
  on conflict (time_card_id)
  do update set
    total_hours = excluded.total_hours,
    paid_value  = (public.employee_time_card_payroll.hourly_rate * excluded.total_hours)::numeric(12,2),
    updated_at  = now();
end;
$$;

-- Trigger function: fires after any change to a time entry
create or replace function private.refresh_time_card_payroll_from_entry()
returns trigger
language plpgsql
security definer
as $$
begin
  perform private.refresh_time_card_payroll(coalesce(new.time_card_id, old.time_card_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists refresh_employee_time_card_payroll_on_entry on public.employee_time_entries;
create trigger refresh_employee_time_card_payroll_on_entry
after insert or update or delete on public.employee_time_entries
for each row execute function private.refresh_time_card_payroll_from_entry();

-- Trigger function: fires when a time card is created or its employee changes
create or replace function private.refresh_time_card_payroll_from_card()
returns trigger
language plpgsql
security definer
as $$
begin
  perform private.refresh_time_card_payroll(new.id);
  return new;
end;
$$;

drop trigger if exists refresh_employee_time_card_payroll_on_card on public.employee_time_cards;
create trigger refresh_employee_time_card_payroll_on_card
after insert or update of employee_user_id on public.employee_time_cards
for each row execute function private.refresh_time_card_payroll_from_card();

-- Backfill all existing time cards that have entries but no payroll row
do $$
declare
  card_id uuid;
begin
  for card_id in
    select distinct tc.id
    from public.employee_time_cards tc
    join public.employee_time_entries te on te.time_card_id = tc.id
    left join public.employee_time_card_payroll p on p.time_card_id = tc.id
    where p.time_card_id is null
  loop
    perform private.refresh_time_card_payroll(card_id);
  end loop;
end;
$$;
