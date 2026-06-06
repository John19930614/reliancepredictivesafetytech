-- Performance review cycles and employee reviews

create table performance_review_cycles (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null,
  review_type            text not null default 'Annual',
  period_label           text,
  period_start           date,
  period_end             date,
  self_assessment_due    date,
  manager_review_due     date,
  status                 text not null default 'Draft'
                           check (status in ('Draft', 'Open', 'Closed')),
  created_by             uuid references auth.users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index performance_review_cycles_status_idx on performance_review_cycles (status);

alter table performance_review_cycles enable row level security;

create policy "Employees can view review cycles"
  on performance_review_cycles for select
  using (public.is_company_portal_employee());

create policy "Employees can create review cycles"
  on performance_review_cycles for insert
  with check (public.is_company_portal_employee());

create policy "Employees can update review cycles"
  on performance_review_cycles for update
  using (public.is_company_portal_employee());

-- One review record per employee per cycle
create table performance_reviews (
  id                        uuid primary key default gen_random_uuid(),
  cycle_id                  uuid not null references performance_review_cycles(id) on delete cascade,
  employee_user_id          uuid not null references auth.users(id),
  reviewer_user_id          uuid references auth.users(id),
  self_assessment_status    text not null default 'not_started'
                              check (self_assessment_status in ('not_started', 'in_progress', 'submitted')),
  manager_review_status     text not null default 'not_started'
                              check (manager_review_status in ('not_started', 'in_progress', 'submitted')),
  overall_self_rating       integer check (overall_self_rating between 1 and 5),
  overall_manager_rating    integer check (overall_manager_rating between 1 and 5),
  self_highlights           text,
  self_improvements         text,
  self_goals                text,
  manager_highlights        text,
  manager_improvements      text,
  manager_goals             text,
  manager_notes             text,
  self_submitted_at         timestamptz,
  manager_submitted_at      timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (cycle_id, employee_user_id)
);

create index performance_reviews_cycle_id_idx        on performance_reviews (cycle_id);
create index performance_reviews_employee_user_id_idx on performance_reviews (employee_user_id);

alter table performance_reviews enable row level security;

create policy "Employees can view their own reviews and admins can view all"
  on performance_reviews for select
  using (public.is_company_portal_employee());

create policy "Employees can create reviews"
  on performance_reviews for insert
  with check (public.is_company_portal_employee());

create policy "Employees can update reviews"
  on performance_reviews for update
  using (public.is_company_portal_employee());
