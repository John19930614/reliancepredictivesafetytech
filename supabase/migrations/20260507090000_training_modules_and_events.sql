create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'General Safety',
  audience text not null default 'Client Workforce',
  status text not null default 'Draft',
  owner text,
  estimated_duration_minutes integer,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint training_modules_duration_check check (estimated_duration_minutes is null or estimated_duration_minutes >= 0)
);

create table if not exists public.training_module_files (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.training_modules(id) on delete cascade,
  file_bucket text not null default 'training-materials',
  file_path text not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  sort_order integer not null default 100,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (file_bucket, file_path)
);

create table if not exists public.client_training_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.company_clients(id) on delete cascade,
  title text not null,
  scheduled_start_at timestamp with time zone,
  delivery_mode text not null default 'In Person',
  location text,
  instructor text,
  status text not null default 'Planned',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.client_training_event_modules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.client_training_events(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  sort_order integer not null default 100,
  presenter_notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (event_id, module_id)
);

create index if not exists training_modules_status_idx on public.training_modules(status);
create index if not exists training_module_files_module_id_idx on public.training_module_files(module_id);
create index if not exists client_training_events_client_id_idx on public.client_training_events(client_id);
create index if not exists client_training_events_scheduled_start_idx on public.client_training_events(scheduled_start_at);
create index if not exists client_training_event_modules_event_id_idx on public.client_training_event_modules(event_id);
create index if not exists client_training_event_modules_module_id_idx on public.client_training_event_modules(module_id);

drop trigger if exists set_training_modules_updated_at on public.training_modules;
create trigger set_training_modules_updated_at
before update on public.training_modules
for each row execute function public.set_updated_at();

drop trigger if exists set_training_module_files_updated_at on public.training_module_files;
create trigger set_training_module_files_updated_at
before update on public.training_module_files
for each row execute function public.set_updated_at();

drop trigger if exists set_client_training_events_updated_at on public.client_training_events;
create trigger set_client_training_events_updated_at
before update on public.client_training_events
for each row execute function public.set_updated_at();

drop trigger if exists set_client_training_event_modules_updated_at on public.client_training_event_modules;
create trigger set_client_training_event_modules_updated_at
before update on public.client_training_event_modules
for each row execute function public.set_updated_at();

alter table public.training_modules enable row level security;
alter table public.training_module_files enable row level security;
alter table public.client_training_events enable row level security;
alter table public.client_training_event_modules enable row level security;

drop policy if exists "Employees can read training modules" on public.training_modules;
create policy "Employees can read training modules" on public.training_modules for select to authenticated using (public.is_company_portal_employee());
drop policy if exists "Employees can create training modules" on public.training_modules;
create policy "Employees can create training modules" on public.training_modules for insert to authenticated with check (public.is_company_portal_employee());
drop policy if exists "Employees can update training modules" on public.training_modules;
create policy "Employees can update training modules" on public.training_modules for update to authenticated using (public.is_company_portal_employee()) with check (public.is_company_portal_employee());
drop policy if exists "Employees can delete training modules" on public.training_modules;
create policy "Employees can delete training modules" on public.training_modules for delete to authenticated using (public.is_company_portal_employee());

drop policy if exists "Employees can read training module files" on public.training_module_files;
create policy "Employees can read training module files" on public.training_module_files for select to authenticated using (public.is_company_portal_employee());
drop policy if exists "Employees can create training module files" on public.training_module_files;
create policy "Employees can create training module files" on public.training_module_files for insert to authenticated with check (uploaded_by = (select auth.uid()) and public.is_company_portal_employee());
drop policy if exists "Employees can update training module files" on public.training_module_files;
create policy "Employees can update training module files" on public.training_module_files for update to authenticated using (public.is_company_portal_employee()) with check (public.is_company_portal_employee());
drop policy if exists "Employees can delete training module files" on public.training_module_files;
create policy "Employees can delete training module files" on public.training_module_files for delete to authenticated using (public.is_company_portal_employee());

drop policy if exists "Employees can read client training events" on public.client_training_events;
create policy "Employees can read client training events" on public.client_training_events for select to authenticated using (public.is_company_portal_employee());
drop policy if exists "Employees can create client training events" on public.client_training_events;
create policy "Employees can create client training events" on public.client_training_events for insert to authenticated with check (public.is_company_portal_employee());
drop policy if exists "Employees can update client training events" on public.client_training_events;
create policy "Employees can update client training events" on public.client_training_events for update to authenticated using (public.is_company_portal_employee()) with check (public.is_company_portal_employee());
drop policy if exists "Employees can delete client training events" on public.client_training_events;
create policy "Employees can delete client training events" on public.client_training_events for delete to authenticated using (public.is_company_portal_employee());

drop policy if exists "Employees can read client training event modules" on public.client_training_event_modules;
create policy "Employees can read client training event modules" on public.client_training_event_modules for select to authenticated using (public.is_company_portal_employee());
drop policy if exists "Employees can create client training event modules" on public.client_training_event_modules;
create policy "Employees can create client training event modules" on public.client_training_event_modules for insert to authenticated with check (public.is_company_portal_employee());
drop policy if exists "Employees can update client training event modules" on public.client_training_event_modules;
create policy "Employees can update client training event modules" on public.client_training_event_modules for update to authenticated using (public.is_company_portal_employee()) with check (public.is_company_portal_employee());
drop policy if exists "Employees can delete client training event modules" on public.client_training_event_modules;
create policy "Employees can delete client training event modules" on public.client_training_event_modules for delete to authenticated using (public.is_company_portal_employee());

insert into storage.buckets (id, name, public)
values ('training-materials', 'training-materials', false)
on conflict (id) do update set public = false;

drop policy if exists "Employees can view training material files" on storage.objects;
create policy "Employees can view training material files"
on storage.objects
for select
to authenticated
using (bucket_id = 'training-materials' and public.is_company_portal_employee());

drop policy if exists "Employees can upload training material files" on storage.objects;
create policy "Employees can upload training material files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'training-materials'
  and owner = (select auth.uid())
  and public.is_company_portal_employee()
);

drop policy if exists "Employees can replace training material files" on storage.objects;
create policy "Employees can replace training material files"
on storage.objects
for update
to authenticated
using (bucket_id = 'training-materials' and public.is_company_portal_employee())
with check (bucket_id = 'training-materials' and public.is_company_portal_employee());

drop policy if exists "Employees can delete training material files" on storage.objects;
create policy "Employees can delete training material files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'training-materials' and public.is_company_portal_employee());
