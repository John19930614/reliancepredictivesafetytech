create or replace function private.enforce_super_admin_time_card_review()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status in ('approved', 'rejected') and coalesce(old.status, '') <> new.status then
    if new.reviewed_by is null then
      raise exception 'A super admin reviewer is required to approve or reject time cards.';
    end if;

    if not exists (
      select 1
      from public.user_roles reviewer
      where reviewer.user_id = new.reviewed_by
        and reviewer.account_status = 'active'
        and reviewer.role = 'super_admin'
    ) then
      raise exception 'Only super admins can approve or reject time cards.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_super_admin_time_card_review on public.employee_time_cards;
create trigger enforce_super_admin_time_card_review
before update on public.employee_time_cards
for each row execute function private.enforce_super_admin_time_card_review();
