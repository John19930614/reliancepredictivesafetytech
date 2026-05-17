create table if not exists public.brainstorming_parking_lot_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  sort_order integer not null default 100,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.brainstorming_parking_lot_cards (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.brainstorming_parking_lot_categories(id) on delete cascade,
  title text not null,
  description text not null default '',
  lane text not null default 'parking_lot' check (lane in ('do_now', 'build_next', 'parking_lot')),
  sort_order integer not null default 100,
  owner text,
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Critical')),
  notes text not null default '',
  is_placeholder boolean not null default false,
  placeholder_slot integer,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  archived_by_user_id uuid references auth.users(id) on delete set null,
  archived_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists brainstorming_parking_lot_categories_sort_order_idx
on public.brainstorming_parking_lot_categories(sort_order);

create index if not exists brainstorming_parking_lot_cards_category_lane_sort_idx
on public.brainstorming_parking_lot_cards(category_id, lane, sort_order)
where archived_at is null;

create index if not exists brainstorming_parking_lot_cards_archived_at_idx
on public.brainstorming_parking_lot_cards(archived_at);

drop trigger if exists set_brainstorming_parking_lot_categories_updated_at on public.brainstorming_parking_lot_categories;
create trigger set_brainstorming_parking_lot_categories_updated_at
before update on public.brainstorming_parking_lot_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_brainstorming_parking_lot_cards_updated_at on public.brainstorming_parking_lot_cards;
create trigger set_brainstorming_parking_lot_cards_updated_at
before update on public.brainstorming_parking_lot_cards
for each row execute function public.set_updated_at();

alter table public.brainstorming_parking_lot_categories enable row level security;
alter table public.brainstorming_parking_lot_cards enable row level security;

grant select, insert, update on public.brainstorming_parking_lot_categories to authenticated;
grant select, insert, update on public.brainstorming_parking_lot_cards to authenticated;

drop policy if exists "Employees can read brainstorming parking lot categories" on public.brainstorming_parking_lot_categories;
create policy "Employees can read brainstorming parking lot categories"
on public.brainstorming_parking_lot_categories
for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Employees can create brainstorming parking lot categories" on public.brainstorming_parking_lot_categories;
create policy "Employees can create brainstorming parking lot categories"
on public.brainstorming_parking_lot_categories
for insert
to authenticated
with check (public.is_company_portal_employee());

drop policy if exists "Employees can update brainstorming parking lot categories" on public.brainstorming_parking_lot_categories;
create policy "Employees can update brainstorming parking lot categories"
on public.brainstorming_parking_lot_categories
for update
to authenticated
using (public.is_company_portal_employee())
with check (public.is_company_portal_employee());

drop policy if exists "Employees can read brainstorming parking lot cards" on public.brainstorming_parking_lot_cards;
create policy "Employees can read brainstorming parking lot cards"
on public.brainstorming_parking_lot_cards
for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Employees can create brainstorming parking lot cards" on public.brainstorming_parking_lot_cards;
create policy "Employees can create brainstorming parking lot cards"
on public.brainstorming_parking_lot_cards
for insert
to authenticated
with check (
  public.is_company_portal_employee()
  and archived_at is null
  and (created_by_user_id is null or created_by_user_id = (select auth.uid()))
);

drop policy if exists "Employees can update brainstorming parking lot cards" on public.brainstorming_parking_lot_cards;
create policy "Employees can update brainstorming parking lot cards"
on public.brainstorming_parking_lot_cards
for update
to authenticated
using (public.is_company_portal_employee())
with check (
  public.is_company_portal_employee()
  and (updated_by_user_id is null or updated_by_user_id = (select auth.uid()))
  and (archived_by_user_id is null or archived_by_user_id = (select auth.uid()))
);

insert into public.brainstorming_parking_lot_categories (slug, title, description, sort_order)
values
  ('brainstorming-parking-lots', 'Brainstorming Parking Lots', 'Movable car stickers for safety platform ideas', 0),
  ('data-management', 'Data Management', 'Recordkeeping, certs, data structure, and multi-location organization', 10),
  ('ai-system-management', 'AI System Management', 'Predictive risk, scoring, alerts, summaries, and trend intelligence', 20),
  ('document-control', 'Document Control', 'Document generation, review workflow, versioning, and client portals', 30),
  ('hse-management-system', 'HSE Management System', 'Inspections, incidents, corrective actions, meetings, permits, and programs', 40),
  ('training-and-certs', 'Training and Certs', 'Training documents, certificate dates, expiration tracking, and compliance reports', 50),
  ('high-risk-and-alerts', 'High Risk and Alerts', 'Serious event alerts, SIFp / IDLH escalation, and cross-location sorting', 60),
  ('inspection-and-forms', 'Inspection and Forms', 'Inspection card variants, custom forms, checklists, and field cards', 70),
  ('integrations', 'Integrations', 'Microsoft, Procore, document storage, calendar, and task connections', 80),
  ('client-setup-options', 'Client Setup Options', 'Account setup choices, module packages, permissions, and onboarding', 90),
  ('pricing-and-model', 'Pricing and Model', 'First-year packages, CSEP reviews, add-ons, tiers, and portal access', 100),
  ('1910-expansion', '1910 Expansion', 'General industry roadmap, written programs, checklists, and future modules', 110),
  ('blank-category-parking-lot', 'Blank Category Parking Lot', 'Use this board to collect future ideas and drag blank cars into the right lane', 120)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  sort_order = excluded.sort_order;

with lanes as (
  select *
  from (values
    ('do_now'::text, 'Do Now'::text, 1),
    ('build_next'::text, 'Build Next'::text, 2),
    ('parking_lot'::text, 'Parking Lot'::text, 3)
  ) as lane(lane, label, lane_order)
),
slots as (
  select generate_series(1, 6) as slot
),
seed_cards as (
  select
    category.id as category_id,
    lane.lane,
    slot.slot,
    lane.lane_order,
    category.sort_order as category_order
  from public.brainstorming_parking_lot_categories category
  cross join lanes lane
  cross join slots slot
)
insert into public.brainstorming_parking_lot_cards (
  category_id,
  title,
  description,
  lane,
  sort_order,
  priority,
  notes,
  is_placeholder,
  placeholder_slot
)
select
  category_id,
  'Car ' || slot::text,
  '',
  lane,
  slot * 100,
  'Medium',
  '',
  true,
  slot
from seed_cards
where not exists (
  select 1
  from public.brainstorming_parking_lot_cards existing_card
);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'brainstorming_parking_lot_cards'
  ) then
    alter publication supabase_realtime add table public.brainstorming_parking_lot_cards;
  end if;
end $$;
