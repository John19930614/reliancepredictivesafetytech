create table if not exists public.company_operations_records (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Operations',
  record_type text not null default 'General',
  status text not null default 'Open',
  priority text not null default 'Medium',
  owner text,
  due_date date,
  description text,
  notes text,
  related_client_id uuid references public.company_clients(id) on delete set null,
  related_document_id uuid references public.company_documents(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

drop trigger if exists set_company_operations_records_updated_at on public.company_operations_records;
create trigger set_company_operations_records_updated_at
before update on public.company_operations_records
for each row execute function public.set_updated_at();

alter table public.company_operations_records enable row level security;

drop policy if exists "Employees can read operations records" on public.company_operations_records;
create policy "Employees can read operations records"
on public.company_operations_records
for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Employees can create operations records" on public.company_operations_records;
create policy "Employees can create operations records"
on public.company_operations_records
for insert
to authenticated
with check (public.is_company_portal_employee());

drop policy if exists "Employees can update operations records" on public.company_operations_records;
create policy "Employees can update operations records"
on public.company_operations_records
for update
to authenticated
using (public.is_company_portal_employee())
with check (public.is_company_portal_employee());

drop policy if exists "Employees can delete operations records" on public.company_operations_records;
create policy "Employees can delete operations records"
on public.company_operations_records
for delete
to authenticated
using (public.is_company_portal_employee());
