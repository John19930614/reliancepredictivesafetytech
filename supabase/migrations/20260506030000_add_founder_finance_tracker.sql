create table if not exists public.company_finance_authorized_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_label text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create or replace function public.is_company_finance_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_finance_authorized_users finance_user
    join public.user_roles role
      on role.user_id = finance_user.user_id
    where finance_user.user_id = (select auth.uid())
      and role.account_status = 'active'
  );
$$;

create table if not exists public.company_finance_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null,
  title text not null,
  amount numeric(12,2) not null,
  transaction_date date not null default current_date,
  category text not null,
  status text not null,
  vendor_customer text,
  payment_method text,
  owner text,
  notes text,
  related_client_id uuid references public.company_clients(id) on delete set null,
  related_document_id uuid references public.company_documents(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamp with time zone,
  review_status text not null default 'unreviewed',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint company_finance_transactions_type_check check (transaction_type in ('income', 'expense')),
  constraint company_finance_transactions_amount_check check (amount > 0),
  constraint company_finance_transactions_review_status_check check (review_status in ('unreviewed', 'reviewed', 'needs_follow_up')),
  constraint company_finance_transactions_status_check check (
    (transaction_type = 'income' and status in ('expected', 'invoiced', 'received', 'cancelled'))
    or
    (transaction_type = 'expense' and status in ('planned', 'due', 'paid', 'cancelled'))
  )
);

create table if not exists public.company_finance_budgets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  budget_type text not null,
  category text not null,
  period text not null default 'monthly',
  period_start date not null,
  amount numeric(12,2) not null,
  owner text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint company_finance_budgets_type_check check (budget_type in ('income', 'expense')),
  constraint company_finance_budgets_period_check check (period in ('monthly', 'yearly')),
  constraint company_finance_budgets_amount_check check (amount >= 0)
);

create table if not exists public.company_finance_recurring_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,
  title text not null,
  amount numeric(12,2) not null,
  category text not null,
  cadence text not null default 'monthly',
  next_due_date date,
  status text not null default 'active',
  vendor_customer text,
  payment_method text,
  owner text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint company_finance_recurring_items_type_check check (item_type in ('income', 'expense')),
  constraint company_finance_recurring_items_amount_check check (amount > 0),
  constraint company_finance_recurring_items_cadence_check check (cadence in ('weekly', 'monthly', 'quarterly', 'yearly')),
  constraint company_finance_recurring_items_status_check check (status in ('active', 'paused', 'ended'))
);

create table if not exists public.company_finance_receipts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.company_finance_transactions(id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  file_type text,
  file_size bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now()
);

create index if not exists company_finance_transactions_type_date_idx
on public.company_finance_transactions(transaction_type, transaction_date desc);

create index if not exists company_finance_transactions_status_idx
on public.company_finance_transactions(status);

create index if not exists company_finance_budgets_period_idx
on public.company_finance_budgets(period_start desc, budget_type, category);

create index if not exists company_finance_recurring_items_status_idx
on public.company_finance_recurring_items(status, next_due_date);

create index if not exists company_finance_receipts_transaction_idx
on public.company_finance_receipts(transaction_id);

drop trigger if exists set_company_finance_authorized_users_updated_at on public.company_finance_authorized_users;
create trigger set_company_finance_authorized_users_updated_at
before update on public.company_finance_authorized_users
for each row execute function public.set_updated_at();

drop trigger if exists set_company_finance_transactions_updated_at on public.company_finance_transactions;
create trigger set_company_finance_transactions_updated_at
before update on public.company_finance_transactions
for each row execute function public.set_updated_at();

drop trigger if exists set_company_finance_budgets_updated_at on public.company_finance_budgets;
create trigger set_company_finance_budgets_updated_at
before update on public.company_finance_budgets
for each row execute function public.set_updated_at();

drop trigger if exists set_company_finance_recurring_items_updated_at on public.company_finance_recurring_items;
create trigger set_company_finance_recurring_items_updated_at
before update on public.company_finance_recurring_items
for each row execute function public.set_updated_at();

alter table public.company_finance_authorized_users enable row level security;
alter table public.company_finance_transactions enable row level security;
alter table public.company_finance_budgets enable row level security;
alter table public.company_finance_recurring_items enable row level security;
alter table public.company_finance_receipts enable row level security;

drop policy if exists "Finance users and admins can read authorized finance users" on public.company_finance_authorized_users;
create policy "Finance users and admins can read authorized finance users"
on public.company_finance_authorized_users for select
to authenticated
using (public.is_company_finance_user() or public.is_company_portal_admin());

drop policy if exists "Admins can create authorized finance users" on public.company_finance_authorized_users;
create policy "Admins can create authorized finance users"
on public.company_finance_authorized_users for insert
to authenticated
with check (public.is_company_portal_admin());

drop policy if exists "Admins can update authorized finance users" on public.company_finance_authorized_users;
create policy "Admins can update authorized finance users"
on public.company_finance_authorized_users for update
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Admins can delete authorized finance users" on public.company_finance_authorized_users;
create policy "Admins can delete authorized finance users"
on public.company_finance_authorized_users for delete
to authenticated
using (public.is_company_portal_admin());

drop policy if exists "Finance users can manage finance transactions" on public.company_finance_transactions;
create policy "Finance users can manage finance transactions"
on public.company_finance_transactions for all
to authenticated
using (public.is_company_finance_user())
with check (public.is_company_finance_user());

drop policy if exists "Finance users can manage finance budgets" on public.company_finance_budgets;
create policy "Finance users can manage finance budgets"
on public.company_finance_budgets for all
to authenticated
using (public.is_company_finance_user())
with check (public.is_company_finance_user());

drop policy if exists "Finance users can manage finance recurring items" on public.company_finance_recurring_items;
create policy "Finance users can manage finance recurring items"
on public.company_finance_recurring_items for all
to authenticated
using (public.is_company_finance_user())
with check (public.is_company_finance_user());

drop policy if exists "Finance users can read finance receipts" on public.company_finance_receipts;
create policy "Finance users can read finance receipts"
on public.company_finance_receipts for select
to authenticated
using (public.is_company_finance_user());

drop policy if exists "Finance users can create finance receipts" on public.company_finance_receipts;
create policy "Finance users can create finance receipts"
on public.company_finance_receipts for insert
to authenticated
with check (uploaded_by = (select auth.uid()) and public.is_company_finance_user());

drop policy if exists "Finance users can delete finance receipts" on public.company_finance_receipts;
create policy "Finance users can delete finance receipts"
on public.company_finance_receipts for delete
to authenticated
using (public.is_company_finance_user());

insert into storage.buckets (id, name, public)
values ('finance-receipts', 'finance-receipts', false)
on conflict (id) do update set public = false;

drop policy if exists "Finance users can view receipt files" on storage.objects;
create policy "Finance users can view receipt files"
on storage.objects
for select
to authenticated
using (bucket_id = 'finance-receipts' and public.is_company_finance_user());

drop policy if exists "Finance users can upload receipt files" on storage.objects;
create policy "Finance users can upload receipt files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'finance-receipts'
  and owner = (select auth.uid())
  and public.is_company_finance_user()
);

drop policy if exists "Finance users can replace receipt files" on storage.objects;
create policy "Finance users can replace receipt files"
on storage.objects
for update
to authenticated
using (bucket_id = 'finance-receipts' and public.is_company_finance_user())
with check (bucket_id = 'finance-receipts' and public.is_company_finance_user());

drop policy if exists "Finance users can delete receipt files" on storage.objects;
create policy "Finance users can delete receipt files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'finance-receipts' and public.is_company_finance_user());
