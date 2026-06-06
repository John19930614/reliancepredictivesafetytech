-- Vector Solutions LMS integration
-- Adds completion tracking and certification management to the training system.

-- Step 1: link existing modules to Vector courses
alter table training_modules
  add column if not exists external_lms_course_id text unique;

create index if not exists training_modules_external_lms_course_id_idx
  on training_modules (external_lms_course_id)
  where external_lms_course_id is not null;

-- Step 2: learner completion records received via webhook
create table if not exists training_completions (
  id                      uuid primary key default gen_random_uuid(),
  module_id               uuid references training_modules(id) on delete set null,
  client_id               uuid references company_clients(id) on delete set null,
  external_lms_user_id    text not null,
  external_lms_course_id  text not null,
  learner_name            text not null,
  learner_email           text,
  score                   numeric(5, 2),
  passed                  boolean,
  completed_at            timestamptz not null,
  time_spent_seconds      integer,
  raw_payload             jsonb,
  created_at              timestamptz not null default now()
);

create index if not exists training_completions_module_id_idx  on training_completions (module_id);
create index if not exists training_completions_client_id_idx  on training_completions (client_id);
create index if not exists training_completions_completed_at_idx on training_completions (completed_at desc);
create index if not exists training_completions_lms_user_idx   on training_completions (external_lms_user_id);

alter table training_completions enable row level security;

create policy "Employees can view training completions"
  on training_completions for select
  using (public.is_company_portal_employee());

-- Step 3: certification records derived from completions
create table if not exists training_certifications (
  id                 uuid primary key default gen_random_uuid(),
  completion_id      uuid references training_completions(id) on delete set null,
  client_id          uuid references company_clients(id) on delete set null,
  learner_name       text not null,
  learner_email      text,
  certification_name text not null,
  issued_at          timestamptz not null,
  expires_at         timestamptz,
  cert_document_url  text,
  status             text not null default 'Active'
                       check (status in ('Active', 'Expiring', 'Expired')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists training_certifications_client_id_idx  on training_certifications (client_id);
create index if not exists training_certifications_expires_at_idx on training_certifications (expires_at);
create index if not exists training_certifications_status_idx     on training_certifications (status);
create index if not exists training_certifications_completion_id_idx on training_certifications (completion_id);

alter table training_certifications enable row level security;

create policy "Employees can view training certifications"
  on training_certifications for select
  using (public.is_company_portal_employee());
