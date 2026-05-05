create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists public.time_card_roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  description text,
  sort_order integer not null default 100,
  created_at timestamp with time zone default now()
);

create table if not exists public.employee_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  profile_status text not null default 'active',
  time_card_role_id uuid references public.time_card_roles(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.employee_profiles
  add column if not exists display_name text,
  add column if not exists email text,
  add column if not exists profile_status text not null default 'active',
  add column if not exists time_card_role_id uuid references public.time_card_roles(id) on delete set null;

create table if not exists public.time_card_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  sort_order integer not null default 100,
  created_at timestamp with time zone default now()
);

create table if not exists public.time_card_tasks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_id uuid not null references public.time_card_categories(id) on delete cascade,
  title text not null,
  sort_order integer not null default 100,
  is_review_task boolean not null default false,
  created_at timestamp with time zone default now(),
  unique (category_id, title)
);

create table if not exists public.time_card_role_categories (
  role_id uuid not null references public.time_card_roles(id) on delete cascade,
  category_id uuid not null references public.time_card_categories(id) on delete cascade,
  created_at timestamp with time zone default now(),
  primary key (role_id, category_id)
);

create table if not exists public.time_card_role_tasks (
  role_id uuid not null references public.time_card_roles(id) on delete cascade,
  task_id uuid not null references public.time_card_tasks(id) on delete cascade,
  created_at timestamp with time zone default now(),
  primary key (role_id, task_id)
);

create table if not exists public.employee_pay_rates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hourly_rate numeric(10,2) not null default 75,
  effective_date date not null default current_date,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.employee_time_cards (
  id uuid primary key default gen_random_uuid(),
  employee_user_id uuid references auth.users(id) on delete set null,
  week_start date not null,
  week_end date not null,
  status text not null default 'draft',
  source text not null default 'portal',
  import_key text unique,
  submitted_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint employee_time_cards_status_check check (status in ('draft', 'submitted', 'approved', 'rejected')),
  constraint employee_time_cards_week_check check (week_end = week_start + 6),
  unique (employee_user_id, week_start)
);

create table if not exists public.employee_time_entries (
  id uuid primary key default gen_random_uuid(),
  time_card_id uuid not null references public.employee_time_cards(id) on delete cascade,
  work_date date not null,
  category_id uuid not null references public.time_card_categories(id) on delete restrict,
  task_id uuid not null references public.time_card_tasks(id) on delete restrict,
  hours numeric(5,2) not null,
  notes text,
  source_status text,
  import_key text unique,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint employee_time_entries_hours_check check (hours > 0 and hours <= 24)
);

create table if not exists public.employee_time_card_payroll (
  time_card_id uuid primary key references public.employee_time_cards(id) on delete cascade,
  hourly_rate numeric(10,2) not null default 75,
  total_hours numeric(10,2) not null default 0,
  paid_value numeric(12,2) not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists employee_profiles_time_card_role_id_idx on public.employee_profiles(time_card_role_id);
create index if not exists time_card_tasks_category_id_idx on public.time_card_tasks(category_id);
create index if not exists employee_time_cards_employee_week_idx on public.employee_time_cards(employee_user_id, week_start desc);
create index if not exists employee_time_cards_status_idx on public.employee_time_cards(status);
create index if not exists employee_time_entries_card_idx on public.employee_time_entries(time_card_id);
create index if not exists employee_time_entries_category_task_idx on public.employee_time_entries(category_id, task_id);

drop trigger if exists set_employee_profiles_updated_at on public.employee_profiles;
create trigger set_employee_profiles_updated_at
before update on public.employee_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_pay_rates_updated_at on public.employee_pay_rates;
create trigger set_employee_pay_rates_updated_at
before update on public.employee_pay_rates
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_time_cards_updated_at on public.employee_time_cards;
create trigger set_employee_time_cards_updated_at
before update on public.employee_time_cards
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_time_entries_updated_at on public.employee_time_entries;
create trigger set_employee_time_entries_updated_at
before update on public.employee_time_entries
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_time_card_payroll_updated_at on public.employee_time_card_payroll;
create trigger set_employee_time_card_payroll_updated_at
before update on public.employee_time_card_payroll
for each row execute function public.set_updated_at();

create or replace function private.sync_time_card_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status = 'submitted' and coalesce(old.status, '') <> 'submitted' then
    new.submitted_at = coalesce(new.submitted_at, now());
  end if;

  if new.status in ('approved', 'rejected') and coalesce(old.status, '') <> new.status then
    new.reviewed_at = coalesce(new.reviewed_at, now());
    new.reviewed_by = coalesce(new.reviewed_by, (select auth.uid()));
  end if;

  return new;
end;
$$;

drop trigger if exists sync_employee_time_card_review_fields on public.employee_time_cards;
create trigger sync_employee_time_card_review_fields
before insert or update on public.employee_time_cards
for each row execute function private.sync_time_card_review_fields();

create or replace function private.protect_employee_profile_time_card_role()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if (select auth.uid()) is null or public.is_company_portal_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' and new.time_card_role_id is not null then
    raise exception 'Only admins can assign a time-card role.';
  end if;

  if tg_op = 'UPDATE' and (
    new.time_card_role_id is distinct from old.time_card_role_id
    or new.profile_status is distinct from old.profile_status
  ) then
    raise exception 'Only admins can update time-card role fields.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_employee_profile_time_card_role_fields on public.employee_profiles;
create trigger protect_employee_profile_time_card_role_fields
before insert or update on public.employee_profiles
for each row execute function private.protect_employee_profile_time_card_role();

create or replace function private.validate_time_card_entry()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  card_row public.employee_time_cards%rowtype;
begin
  select * into card_row
  from public.employee_time_cards
  where id = new.time_card_id;

  if not found then
    raise exception 'Time card was not found.';
  end if;

  if new.work_date < card_row.week_start or new.work_date > card_row.week_end then
    raise exception 'Entry date must fall inside the time card week.';
  end if;

  if not exists (
    select 1
    from public.time_card_tasks task
    where task.id = new.task_id
      and task.category_id = new.category_id
  ) then
    raise exception 'Task does not belong to the selected category.';
  end if;

  if (select auth.uid()) is null or public.is_company_portal_admin() then
    return new;
  end if;

  if card_row.employee_user_id is distinct from (select auth.uid()) then
    raise exception 'Employees can only enter time on their own time cards.';
  end if;

  if not exists (
    select 1
    from public.employee_profiles profile
    join public.time_card_role_categories role_category
      on role_category.role_id = profile.time_card_role_id
      and role_category.category_id = new.category_id
    join public.time_card_role_tasks role_task
      on role_task.role_id = profile.time_card_role_id
      and role_task.task_id = new.task_id
    where profile.user_id = card_row.employee_user_id
      and profile.profile_status = 'active'
  ) then
    raise exception 'This task is not available for the employee time-card role.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_employee_time_card_entry on public.employee_time_entries;
create trigger validate_employee_time_card_entry
before insert or update on public.employee_time_entries
for each row execute function private.validate_time_card_entry();

create or replace function private.refresh_time_card_payroll(target_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  card_row public.employee_time_cards%rowtype;
  rate numeric(10,2);
  total numeric(10,2);
begin
  select * into card_row
  from public.employee_time_cards
  where id = target_card_id;

  if not found then
    return;
  end if;

  select coalesce(sum(hours), 0)::numeric(10,2)
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
    paid_value = (public.employee_time_card_payroll.hourly_rate * excluded.total_hours)::numeric(12,2),
    updated_at = now();
end;
$$;

create or replace function private.refresh_time_card_payroll_from_entry()
returns trigger
language plpgsql
security definer
set search_path = public, private
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

create or replace function private.refresh_time_card_payroll_from_card()
returns trigger
language plpgsql
security definer
set search_path = public, private
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

insert into public.time_card_roles (slug, name, description, sort_order)
values
  ('platform-build', 'Platform Build', 'Platform, product builder, export, content, and debugging work.', 10),
  ('safety-content', 'Safety Content', 'Safety plan, JSA, training, observation, and content-library work.', 20),
  ('data-admin', 'Data/Admin', 'Database, admin workflow, forecasting, and support debugging work.', 30),
  ('sales-billing', 'Sales/Billing', 'Marketplace, billing, and customer-facing dashboard work.', 40),
  ('qa-review', 'QA/Review', 'Testing, review, export review, and admin review workflow work.', 50)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.time_card_categories (slug, name, sort_order)
values
  ('pshsep-builder', 'PSHSEP Builder', 10),
  ('injury-forecasting', 'Injury Forecasting', 11),
  ('dashboard-ui', 'Dashboard / UI', 12),
  ('docx-export', 'DOCX Export', 13),
  ('training-matrix', 'Training Matrix', 14),
  ('supabase-database', 'Supabase / Database', 15),
  ('csep-builder', 'CSEP Builder', 16),
  ('sor-analytics', 'SOR / Analytics', 17),
  ('testing-debugging', 'Testing / Debugging', 18),
  ('marketplace-billing', 'Marketplace / Billing', 19),
  ('admin-review-workflow', 'Admin Review Workflow', 20),
  ('content-library', 'Content Library', 21),
  ('jsa-permits', 'JSA / Permits', 22)
on conflict (slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order;

with task_seed(slug, category_slug, title, sort_order, is_review_task) as (
  values
    ('pshsep-builder-reviewed-master-plan-modules-for-hazards-programs-and-project-rules', 'pshsep-builder', 'Reviewed master plan modules for hazards, programs, and project rules.', 10, true),
    ('injury-forecasting-outlined-baseline-data-sources-and-future-historical-data-buckets', 'injury-forecasting', 'Outlined baseline data sources and future historical-data buckets.', 11, false),
    ('dashboard-ui-tested-dropdown-based-navigation-for-the-main-platform-page', 'dashboard-ui', 'Tested dropdown-based navigation for the main platform page.', 12, true),
    ('docx-export-cleaned-up-docx-spacing-section-breaks-and-table-of-contents-behavior', 'docx-export', 'Cleaned up DOCX spacing, section breaks, and table of contents behavior.', 13, false),
    ('training-matrix-tested-training-section-wording-for-user-friendly-navigation', 'training-matrix', 'Tested training section wording for user-friendly navigation.', 14, true),
    ('dashboard-ui-improved-interface-wording-so-the-platform-feels-less-technical', 'dashboard-ui', 'Improved interface wording so the platform feels less technical.', 15, false),
    ('supabase-database-mapped-document-metadata-needed-for-review-preview-and-download', 'supabase-database', 'Mapped document metadata needed for review, preview, and download.', 16, true),
    ('docx-export-worked-on-docx-export-formatting-for-headings-paragraphs-and-page-order', 'docx-export', 'Worked on DOCX export formatting for headings, paragraphs, and page order.', 17, false),
    ('csep-builder-mapped-permit-requirements-into-the-csep-build-flow', 'csep-builder', 'Mapped permit requirements into the CSEP build flow.', 18, false),
    ('sor-analytics-tested-categories-for-positive-and-negative-safety-observations', 'sor-analytics', 'Tested categories for positive and negative safety observations.', 19, true),
    ('csep-builder-reviewed-csep-output-for-automation-wording-and-professional-tone', 'csep-builder', 'Reviewed CSEP output for automation wording and professional tone.', 20, true),
    ('testing-debugging-reviewed-generated-output-for-broken-formatting-or-duplicate-sections', 'testing-debugging', 'Reviewed generated output for broken formatting or duplicate sections.', 21, true),
    ('sor-analytics-created-notes-for-central-safety-observation-hub-design', 'sor-analytics', 'Created notes for central safety observation hub design.', 22, false),
    ('csep-builder-tested-steel-erection-csep-generation-against-formatting-notes', 'csep-builder', 'Tested steel erection CSEP generation against formatting notes.', 23, true),
    ('pshsep-builder-tested-pshsep-export-order-from-title-page-through-appendices', 'pshsep-builder', 'Tested PSHSEP export order from title page through appendices.', 24, true),
    ('injury-forecasting-refined-injury-forecaster-concept-using-observations-incidents-and-weat', 'injury-forecasting', 'Refined injury forecaster concept using observations, incidents, and weather.', 25, false),
    ('testing-debugging-reviewed-error-messages-from-deployment-and-planned-code-fixes', 'testing-debugging', 'Reviewed error messages from deployment and planned code fixes.', 26, true),
    ('marketplace-billing-reviewed-document-marketplace-wording-and-access-levels', 'marketplace-billing', 'Reviewed document marketplace wording and access levels.', 27, true),
    ('supabase-database-reviewed-database-fields-for-document-status-notes-and-review-tracking', 'supabase-database', 'Reviewed database fields for document status, notes, and review tracking.', 28, true),
    ('csep-builder-updated-hazard-task-module-fallback-language-for-trade-specific-builds', 'csep-builder', 'Updated hazard/task module fallback language for trade-specific builds.', 29, false),
    ('sor-analytics-outlined-analytics-views-for-observations-by-trade-and-hazard-type', 'sor-analytics', 'Outlined analytics views for observations by trade and hazard type.', 30, false),
    ('pshsep-builder-worked-on-master-project-safety-plan-builder-structure-and-front-matter', 'pshsep-builder', 'Worked on master project safety plan builder structure and front matter.', 31, false),
    ('dashboard-ui-worked-on-role-based-dashboard-visibility-for-field-users-and-admins', 'dashboard-ui', 'Worked on role-based dashboard visibility for field users and admins.', 32, false),
    ('testing-debugging-tested-platform-pages-and-noted-layout-routing-or-build-issues', 'testing-debugging', 'Tested platform pages and noted layout, routing, or build issues.', 33, true),
    ('docx-export-tested-document-generation-output-for-csep-and-pshsep-builders', 'docx-export', 'Tested document generation output for CSEP and PSHSEP builders.', 34, true),
    ('admin-review-workflow-wrote-process-notes-for-admin-review-and-customer-handoff', 'admin-review-workflow', 'Wrote process notes for admin review and customer handoff.', 35, true),
    ('pshsep-builder-drafted-owner-safety-message-and-sign-off-section-logic', 'pshsep-builder', 'Drafted owner safety message and sign-off section logic.', 36, false),
    ('marketplace-billing-outlined-marketplace-flow-for-templates-purchases-and-preview-approval', 'marketplace-billing', 'Outlined marketplace flow for templates, purchases, and preview approvals.', 37, true),
    ('supabase-database-worked-through-row-level-security-issues-affecting-user-submissions', 'supabase-database', 'Worked through row-level security issues affecting user submissions.', 38, false),
    ('injury-forecasting-mapped-predictive-risk-categories-for-trade-and-month-by-month-forecast', 'injury-forecasting', 'Mapped predictive risk categories for trade and month-by-month forecasting.', 39, false),
    ('injury-forecasting-reviewed-dashboard-concept-for-likely-next-injury-exposure-areas', 'injury-forecasting', 'Reviewed dashboard concept for likely next injury exposure areas.', 40, true),
    ('csep-builder-cleaned-up-csep-section-ordering-and-removed-duplicate-safety-language', 'csep-builder', 'Cleaned up CSEP section ordering and removed duplicate safety language.', 41, false),
    ('content-library-organized-reusable-safety-plan-modules-for-hazards-tasks-and-programs', 'content-library', 'Organized reusable safety plan modules for hazards, tasks, and programs.', 42, false),
    ('marketplace-billing-mapped-billing-and-invoice-areas-for-customer-facing-navigation', 'marketplace-billing', 'Mapped billing and invoice areas for customer-facing navigation.', 43, false),
    ('content-library-drafted-reusable-wording-for-site-setup-access-housekeeping-and-permits', 'content-library', 'Drafted reusable wording for site setup, access, housekeeping, and permits.', 44, false),
    ('pshsep-builder-refined-pshsep-table-of-contents-and-site-wide-policy-sections', 'pshsep-builder', 'Refined PSHSEP table of contents and site-wide policy sections.', 45, false),
    ('testing-debugging-tested-user-navigation-across-dashboard-jobsites-and-documents', 'testing-debugging', 'Tested user navigation across dashboard, jobsites, and documents.', 46, true),
    ('dashboard-ui-designed-dashboard-blocks-for-documents-jobsites-marketplace-and-billing', 'dashboard-ui', 'Designed dashboard blocks for documents, jobsites, marketplace, and billing.', 47, false),
    ('jsa-permits-built-logic-for-ai-assisted-jsa-task-and-hazard-prompts', 'jsa-permits', 'Built logic for AI-assisted JSA task and hazard prompts.', 48, false),
    ('marketplace-billing-estimated-platform-value-by-feature-labor-savings-and-review-workflow', 'marketplace-billing', 'Estimated platform value by feature, labor savings, and review workflow.', 49, true),
    ('csep-builder-refined-contractor-site-specific-plan-module-layout-and-wording', 'csep-builder', 'Refined contractor site-specific plan module layout and wording.', 50, false),
    ('dashboard-ui-refined-platform-home-page-layout-with-larger-user-friendly-sections', 'dashboard-ui', 'Refined platform home page layout with larger user-friendly sections.', 51, false),
    ('testing-debugging-debugged-ui-sections-that-were-not-rendering-or-saving-correctly', 'testing-debugging', 'Debugged UI sections that were not rendering or saving correctly.', 52, false),
    ('marketplace-billing-worked-on-subscription-tier-ideas-setup-costs-and-credit-based-pricing', 'marketplace-billing', 'Worked on subscription tier ideas, setup costs, and credit-based pricing.', 53, false),
    ('supabase-database-troubleshot-supabase-storage-bucket-and-document-upload-logic', 'supabase-database', 'Troubleshot Supabase storage bucket and document upload logic.', 54, false),
    ('training-matrix-mapped-missing-or-expiring-training-alerts-for-supervisor-dashboards', 'training-matrix', 'Mapped missing or expiring training alerts for supervisor dashboards.', 55, false),
    ('content-library-cleaned-up-module-naming-from-elements-to-modules', 'content-library', 'Cleaned up module naming from elements to modules.', 56, false),
    ('jsa-permits-connected-permit-triggers-to-selected-jsa-tasks-and-work-conditions', 'jsa-permits', 'Connected permit triggers to selected JSA tasks and work conditions.', 57, false),
    ('admin-review-workflow-designed-admin-review-process-for-submitted-safety-documents', 'admin-review-workflow', 'Designed admin review process for submitted safety documents.', 58, true),
    ('sor-analytics-worked-on-safety-observation-report-trend-categories-and-dashboard-use', 'sor-analytics', 'Worked on safety observation report trend categories and dashboard use.', 59, false)
)
insert into public.time_card_tasks (slug, category_id, title, sort_order, is_review_task)
select task_seed.slug, category.id, task_seed.title, task_seed.sort_order, task_seed.is_review_task
from task_seed
join public.time_card_categories category on category.slug = task_seed.category_slug
on conflict (slug) do update set
  category_id = excluded.category_id,
  title = excluded.title,
  sort_order = excluded.sort_order,
  is_review_task = excluded.is_review_task;

with role_category_seed(role_slug, category_slug) as (
  values
    ('platform-build', 'csep-builder'),
    ('platform-build', 'pshsep-builder'),
    ('platform-build', 'jsa-permits'),
    ('platform-build', 'dashboard-ui'),
    ('platform-build', 'docx-export'),
    ('platform-build', 'content-library'),
    ('platform-build', 'testing-debugging'),
    ('safety-content', 'csep-builder'),
    ('safety-content', 'pshsep-builder'),
    ('safety-content', 'jsa-permits'),
    ('safety-content', 'training-matrix'),
    ('safety-content', 'sor-analytics'),
    ('safety-content', 'content-library'),
    ('data-admin', 'supabase-database'),
    ('data-admin', 'admin-review-workflow'),
    ('data-admin', 'injury-forecasting'),
    ('data-admin', 'testing-debugging'),
    ('sales-billing', 'marketplace-billing'),
    ('sales-billing', 'dashboard-ui'),
    ('qa-review', 'testing-debugging'),
    ('qa-review', 'admin-review-workflow'),
    ('qa-review', 'docx-export')
),
qa_review_categories as (
  select distinct role.id as role_id, task.category_id
  from public.time_card_roles role
  cross join public.time_card_tasks task
  where role.slug = 'qa-review'
    and task.is_review_task
)
insert into public.time_card_role_categories (role_id, category_id)
select role.id, category.id
from role_category_seed seed
join public.time_card_roles role on role.slug = seed.role_slug
join public.time_card_categories category on category.slug = seed.category_slug
union
select role_id, category_id from qa_review_categories
on conflict (role_id, category_id) do nothing;

with role_category_seed(role_slug, category_slug) as (
  values
    ('platform-build', 'csep-builder'),
    ('platform-build', 'pshsep-builder'),
    ('platform-build', 'jsa-permits'),
    ('platform-build', 'dashboard-ui'),
    ('platform-build', 'docx-export'),
    ('platform-build', 'content-library'),
    ('platform-build', 'testing-debugging'),
    ('safety-content', 'csep-builder'),
    ('safety-content', 'pshsep-builder'),
    ('safety-content', 'jsa-permits'),
    ('safety-content', 'training-matrix'),
    ('safety-content', 'sor-analytics'),
    ('safety-content', 'content-library'),
    ('data-admin', 'supabase-database'),
    ('data-admin', 'admin-review-workflow'),
    ('data-admin', 'injury-forecasting'),
    ('data-admin', 'testing-debugging'),
    ('sales-billing', 'marketplace-billing'),
    ('sales-billing', 'dashboard-ui')
)
insert into public.time_card_role_tasks (role_id, task_id)
select role.id, task.id
from role_category_seed seed
join public.time_card_roles role on role.slug = seed.role_slug
join public.time_card_categories category on category.slug = seed.category_slug
join public.time_card_tasks task on task.category_id = category.id
union
select role.id, task.id
from public.time_card_roles role
join public.time_card_tasks task on task.is_review_task or task.category_id in (
  select id from public.time_card_categories where slug in ('testing-debugging', 'admin-review-workflow', 'docx-export')
)
where role.slug = 'qa-review'
on conflict (role_id, task_id) do nothing;

insert into public.employee_profiles (user_id, profile_status)
select user_id, account_status
from public.user_roles
on conflict (user_id) do nothing;

with weekly_seed(import_key, week_start, week_end) as (
  values
    ('excel-2026-02-01', '2026-02-01'::date, '2026-02-07'::date),
    ('excel-2026-02-08', '2026-02-08'::date, '2026-02-14'::date),
    ('excel-2026-02-15', '2026-02-15'::date, '2026-02-21'::date),
    ('excel-2026-02-22', '2026-02-22'::date, '2026-02-28'::date),
    ('excel-2026-03-01', '2026-03-01'::date, '2026-03-07'::date),
    ('excel-2026-03-08', '2026-03-08'::date, '2026-03-14'::date),
    ('excel-2026-03-15', '2026-03-15'::date, '2026-03-21'::date),
    ('excel-2026-03-22', '2026-03-22'::date, '2026-03-28'::date),
    ('excel-2026-03-29', '2026-03-29'::date, '2026-04-04'::date),
    ('excel-2026-04-05', '2026-04-05'::date, '2026-04-11'::date),
    ('excel-2026-04-12', '2026-04-12'::date, '2026-04-18'::date),
    ('excel-2026-04-19', '2026-04-19'::date, '2026-04-25'::date)
)
insert into public.employee_time_cards (
  employee_user_id,
  week_start,
  week_end,
  status,
  source,
  import_key,
  submitted_at,
  reviewed_at,
  review_notes
)
select
  null,
  week_start,
  week_end,
  'approved',
  'excel_import',
  import_key,
  now(),
  now(),
  'Imported from Safety_App_Build_Hours_Log workbook as unassigned historical approved time.'
from weekly_seed
on conflict (import_key) do update set
  week_start = excluded.week_start,
  week_end = excluded.week_end,
  status = excluded.status,
  source = excluded.source,
  review_notes = excluded.review_notes;

with entry_seed(import_key, card_import_key, work_date, category_slug, task_slug, hours, source_status, notes) as (
  values
    ('excel-row-001', 'excel-2026-02-01', '2026-02-01'::date, 'pshsep-builder', 'pshsep-builder-reviewed-master-plan-modules-for-hazards-programs-and-project-rules', 2.75, 'Logged', 'SafetyDocs360 development activity.'),
    ('excel-row-002', 'excel-2026-02-01', '2026-02-02'::date, 'injury-forecasting', 'injury-forecasting-outlined-baseline-data-sources-and-future-historical-data-buckets', 2, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-003', 'excel-2026-02-01', '2026-02-03'::date, 'dashboard-ui', 'dashboard-ui-tested-dropdown-based-navigation-for-the-main-platform-page', 4, 'Logged', 'App build / review time.'),
    ('excel-row-004', 'excel-2026-02-01', '2026-02-04'::date, 'docx-export', 'docx-export-cleaned-up-docx-spacing-section-breaks-and-table-of-contents-behavior', 2.75, 'Logged', 'SafetyDocs360 development activity.'),
    ('excel-row-005', 'excel-2026-02-01', '2026-02-05'::date, 'training-matrix', 'training-matrix-tested-training-section-wording-for-user-friendly-navigation', 4, 'Logged', 'SafetyDocs360 development activity.'),
    ('excel-row-006', 'excel-2026-02-01', '2026-02-06'::date, 'dashboard-ui', 'dashboard-ui-improved-interface-wording-so-the-platform-feels-less-technical', 4, 'Logged', 'App build / review time.'),
    ('excel-row-007', 'excel-2026-02-01', '2026-02-07'::date, 'supabase-database', 'supabase-database-mapped-document-metadata-needed-for-review-preview-and-download', 2.75, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-008', 'excel-2026-02-08', '2026-02-08'::date, 'docx-export', 'docx-export-cleaned-up-docx-spacing-section-breaks-and-table-of-contents-behavior', 3, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-009', 'excel-2026-02-08', '2026-02-09'::date, 'docx-export', 'docx-export-worked-on-docx-export-formatting-for-headings-paragraphs-and-page-order', 3.25, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-010', 'excel-2026-02-08', '2026-02-10'::date, 'csep-builder', 'csep-builder-mapped-permit-requirements-into-the-csep-build-flow', 2, 'Logged', 'Platform build support work.'),
    ('excel-row-011', 'excel-2026-02-08', '2026-02-11'::date, 'sor-analytics', 'sor-analytics-tested-categories-for-positive-and-negative-safety-observations', 3, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-012', 'excel-2026-02-08', '2026-02-12'::date, 'csep-builder', 'csep-builder-reviewed-csep-output-for-automation-wording-and-professional-tone', 2.75, 'Logged', 'Platform build support work.'),
    ('excel-row-013', 'excel-2026-02-08', '2026-02-13'::date, 'testing-debugging', 'testing-debugging-reviewed-generated-output-for-broken-formatting-or-duplicate-sections', 4, 'Logged', 'App build / review time.'),
    ('excel-row-014', 'excel-2026-02-08', '2026-02-14'::date, 'docx-export', 'docx-export-worked-on-docx-export-formatting-for-headings-paragraphs-and-page-order', 2, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-015', 'excel-2026-02-15', '2026-02-15'::date, 'sor-analytics', 'sor-analytics-created-notes-for-central-safety-observation-hub-design', 2, 'Logged', 'Platform build support work.'),
    ('excel-row-016', 'excel-2026-02-15', '2026-02-16'::date, 'csep-builder', 'csep-builder-tested-steel-erection-csep-generation-against-formatting-notes', 2.25, 'Logged', 'Platform build support work.'),
    ('excel-row-017', 'excel-2026-02-15', '2026-02-17'::date, 'pshsep-builder', 'pshsep-builder-tested-pshsep-export-order-from-title-page-through-appendices', 2.75, 'Logged', 'Platform build support work.'),
    ('excel-row-018', 'excel-2026-02-15', '2026-02-18'::date, 'injury-forecasting', 'injury-forecasting-refined-injury-forecaster-concept-using-observations-incidents-and-weat', 3.25, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-019', 'excel-2026-02-15', '2026-02-19'::date, 'testing-debugging', 'testing-debugging-reviewed-error-messages-from-deployment-and-planned-code-fixes', 2, 'Logged', 'Platform build support work.'),
    ('excel-row-020', 'excel-2026-02-15', '2026-02-20'::date, 'csep-builder', 'csep-builder-tested-steel-erection-csep-generation-against-formatting-notes', 2.5, 'Logged', 'Platform build support work.'),
    ('excel-row-021', 'excel-2026-02-15', '2026-02-21'::date, 'csep-builder', 'csep-builder-reviewed-csep-output-for-automation-wording-and-professional-tone', 2.75, 'Logged', 'SafetyDocs360 development activity.'),
    ('excel-row-022', 'excel-2026-02-22', '2026-02-22'::date, 'marketplace-billing', 'marketplace-billing-reviewed-document-marketplace-wording-and-access-levels', 2.75, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-023', 'excel-2026-02-22', '2026-02-23'::date, 'supabase-database', 'supabase-database-reviewed-database-fields-for-document-status-notes-and-review-tracking', 3.5, 'Logged', 'Platform build support work.'),
    ('excel-row-024', 'excel-2026-02-22', '2026-02-24'::date, 'csep-builder', 'csep-builder-updated-hazard-task-module-fallback-language-for-trade-specific-builds', 3.25, 'Logged', 'Platform build support work.'),
    ('excel-row-025', 'excel-2026-02-22', '2026-02-25'::date, 'dashboard-ui', 'dashboard-ui-improved-interface-wording-so-the-platform-feels-less-technical', 3.5, 'Logged', 'SafetyDocs360 development activity.'),
    ('excel-row-026', 'excel-2026-02-22', '2026-02-26'::date, 'sor-analytics', 'sor-analytics-outlined-analytics-views-for-observations-by-trade-and-hazard-type', 4, 'Logged', 'SafetyDocs360 development activity.'),
    ('excel-row-027', 'excel-2026-02-22', '2026-02-27'::date, 'pshsep-builder', 'pshsep-builder-worked-on-master-project-safety-plan-builder-structure-and-front-matter', 3.75, 'Logged', 'SafetyDocs360 development activity.'),
    ('excel-row-028', 'excel-2026-02-22', '2026-02-28'::date, 'dashboard-ui', 'dashboard-ui-worked-on-role-based-dashboard-visibility-for-field-users-and-admins', 2, 'Logged', 'Platform build support work.'),
    ('excel-row-029', 'excel-2026-03-01', '2026-03-01'::date, 'csep-builder', 'csep-builder-mapped-permit-requirements-into-the-csep-build-flow', 2.75, 'Logged', 'SafetyDocs360 development activity.'),
    ('excel-row-030', 'excel-2026-03-01', '2026-03-02'::date, 'testing-debugging', 'testing-debugging-tested-platform-pages-and-noted-layout-routing-or-build-issues', 3.5, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-031', 'excel-2026-03-01', '2026-03-03'::date, 'docx-export', 'docx-export-tested-document-generation-output-for-csep-and-pshsep-builders', 3.25, 'Logged', 'Platform build support work.'),
    ('excel-row-032', 'excel-2026-03-01', '2026-03-04'::date, 'admin-review-workflow', 'admin-review-workflow-wrote-process-notes-for-admin-review-and-customer-handoff', 3.5, 'Logged', 'Platform build support work.'),
    ('excel-row-033', 'excel-2026-03-01', '2026-03-05'::date, 'pshsep-builder', 'pshsep-builder-drafted-owner-safety-message-and-sign-off-section-logic', 3, 'Logged', 'Platform build support work.'),
    ('excel-row-034', 'excel-2026-03-01', '2026-03-06'::date, 'csep-builder', 'csep-builder-updated-hazard-task-module-fallback-language-for-trade-specific-builds', 3.75, 'Logged', 'SafetyDocs360 development activity.'),
    ('excel-row-035', 'excel-2026-03-01', '2026-03-07'::date, 'marketplace-billing', 'marketplace-billing-outlined-marketplace-flow-for-templates-purchases-and-preview-approval', 2.5, 'Logged', 'App build / review time.'),
    ('excel-row-036', 'excel-2026-03-08', '2026-03-08'::date, 'supabase-database', 'supabase-database-worked-through-row-level-security-issues-affecting-user-submissions', 2, 'Logged', 'Platform build support work.'),
    ('excel-row-037', 'excel-2026-03-08', '2026-03-09'::date, 'pshsep-builder', 'pshsep-builder-reviewed-master-plan-modules-for-hazards-programs-and-project-rules', 4, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-038', 'excel-2026-03-08', '2026-03-10'::date, 'docx-export', 'docx-export-tested-document-generation-output-for-csep-and-pshsep-builders', 2.5, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-039', 'excel-2026-03-08', '2026-03-11'::date, 'docx-export', 'docx-export-cleaned-up-docx-spacing-section-breaks-and-table-of-contents-behavior', 2.75, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-040', 'excel-2026-03-08', '2026-03-12'::date, 'injury-forecasting', 'injury-forecasting-mapped-predictive-risk-categories-for-trade-and-month-by-month-forecast', 3.25, 'Logged', 'Platform build support work.'),
    ('excel-row-041', 'excel-2026-03-08', '2026-03-13'::date, 'injury-forecasting', 'injury-forecasting-reviewed-dashboard-concept-for-likely-next-injury-exposure-areas', 2, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-042', 'excel-2026-03-08', '2026-03-14'::date, 'supabase-database', 'supabase-database-reviewed-database-fields-for-document-status-notes-and-review-tracking', 3, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-043', 'excel-2026-03-15', '2026-03-15'::date, 'csep-builder', 'csep-builder-cleaned-up-csep-section-ordering-and-removed-duplicate-safety-language', 3, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-044', 'excel-2026-03-15', '2026-03-16'::date, 'content-library', 'content-library-organized-reusable-safety-plan-modules-for-hazards-tasks-and-programs', 3.25, 'Logged', 'App build / review time.'),
    ('excel-row-045', 'excel-2026-03-15', '2026-03-17'::date, 'dashboard-ui', 'dashboard-ui-worked-on-role-based-dashboard-visibility-for-field-users-and-admins', 3.25, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-046', 'excel-2026-03-15', '2026-03-18'::date, 'marketplace-billing', 'marketplace-billing-mapped-billing-and-invoice-areas-for-customer-facing-navigation', 3, 'Logged', 'Platform build support work.'),
    ('excel-row-047', 'excel-2026-03-15', '2026-03-19'::date, 'content-library', 'content-library-drafted-reusable-wording-for-site-setup-access-housekeeping-and-permits', 4, 'Logged', 'Platform build support work.'),
    ('excel-row-048', 'excel-2026-03-15', '2026-03-20'::date, 'csep-builder', 'csep-builder-updated-hazard-task-module-fallback-language-for-trade-specific-builds', 2.75, 'Logged', 'SafetyDocs360 development activity.'),
    ('excel-row-049', 'excel-2026-03-15', '2026-03-21'::date, 'csep-builder', 'csep-builder-reviewed-csep-output-for-automation-wording-and-professional-tone', 3, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-050', 'excel-2026-03-22', '2026-03-22'::date, 'pshsep-builder', 'pshsep-builder-tested-pshsep-export-order-from-title-page-through-appendices', 2, 'Logged', 'Platform build support work.'),
    ('excel-row-051', 'excel-2026-03-22', '2026-03-23'::date, 'pshsep-builder', 'pshsep-builder-refined-pshsep-table-of-contents-and-site-wide-policy-sections', 2.75, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-052', 'excel-2026-03-22', '2026-03-24'::date, 'testing-debugging', 'testing-debugging-tested-user-navigation-across-dashboard-jobsites-and-documents', 3.25, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-053', 'excel-2026-03-22', '2026-03-25'::date, 'pshsep-builder', 'pshsep-builder-reviewed-master-plan-modules-for-hazards-programs-and-project-rules', 2.5, 'Logged', 'Platform build support work.'),
    ('excel-row-054', 'excel-2026-03-22', '2026-03-26'::date, 'docx-export', 'docx-export-cleaned-up-docx-spacing-section-breaks-and-table-of-contents-behavior', 3.25, 'Logged', 'Platform build support work.'),
    ('excel-row-055', 'excel-2026-03-22', '2026-03-27'::date, 'supabase-database', 'supabase-database-worked-through-row-level-security-issues-affecting-user-submissions', 3.25, 'Logged', 'App build / review time.'),
    ('excel-row-056', 'excel-2026-03-22', '2026-03-28'::date, 'marketplace-billing', 'marketplace-billing-reviewed-document-marketplace-wording-and-access-levels', 3, 'Logged', 'App build / review time.'),
    ('excel-row-057', 'excel-2026-03-29', '2026-03-29'::date, 'dashboard-ui', 'dashboard-ui-designed-dashboard-blocks-for-documents-jobsites-marketplace-and-billing', 2, 'Logged', 'Platform build support work.'),
    ('excel-row-058', 'excel-2026-03-29', '2026-03-30'::date, 'csep-builder', 'csep-builder-cleaned-up-csep-section-ordering-and-removed-duplicate-safety-language', 2.75, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-059', 'excel-2026-03-29', '2026-03-31'::date, 'jsa-permits', 'jsa-permits-built-logic-for-ai-assisted-jsa-task-and-hazard-prompts', 3.75, 'Logged', 'App build / review time.'),
    ('excel-row-060', 'excel-2026-03-29', '2026-04-01'::date, 'pshsep-builder', 'pshsep-builder-tested-pshsep-export-order-from-title-page-through-appendices', 2.75, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-061', 'excel-2026-03-29', '2026-04-02'::date, 'marketplace-billing', 'marketplace-billing-outlined-marketplace-flow-for-templates-purchases-and-preview-approval', 2.75, 'Logged', 'Platform build support work.'),
    ('excel-row-062', 'excel-2026-03-29', '2026-04-03'::date, 'csep-builder', 'csep-builder-reviewed-csep-output-for-automation-wording-and-professional-tone', 2, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-063', 'excel-2026-03-29', '2026-04-04'::date, 'csep-builder', 'csep-builder-cleaned-up-csep-section-ordering-and-removed-duplicate-safety-language', 3, 'Logged', 'SafetyDocs360 development activity.'),
    ('excel-row-064', 'excel-2026-04-05', '2026-04-05'::date, 'pshsep-builder', 'pshsep-builder-reviewed-master-plan-modules-for-hazards-programs-and-project-rules', 2.25, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-065', 'excel-2026-04-05', '2026-04-06'::date, 'dashboard-ui', 'dashboard-ui-tested-dropdown-based-navigation-for-the-main-platform-page', 2.25, 'Logged', 'Platform build support work.'),
    ('excel-row-066', 'excel-2026-04-05', '2026-04-07'::date, 'marketplace-billing', 'marketplace-billing-estimated-platform-value-by-feature-labor-savings-and-review-workflow', 2.75, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-067', 'excel-2026-04-05', '2026-04-08'::date, 'csep-builder', 'csep-builder-refined-contractor-site-specific-plan-module-layout-and-wording', 3.5, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-068', 'excel-2026-04-05', '2026-04-09'::date, 'dashboard-ui', 'dashboard-ui-refined-platform-home-page-layout-with-larger-user-friendly-sections', 2, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-069', 'excel-2026-04-05', '2026-04-10'::date, 'testing-debugging', 'testing-debugging-debugged-ui-sections-that-were-not-rendering-or-saving-correctly', 3.25, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-070', 'excel-2026-04-05', '2026-04-11'::date, 'supabase-database', 'supabase-database-worked-through-row-level-security-issues-affecting-user-submissions', 2, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-071', 'excel-2026-04-12', '2026-04-12'::date, 'pshsep-builder', 'pshsep-builder-drafted-owner-safety-message-and-sign-off-section-logic', 2, 'Logged', 'SafetyDocs360 development activity.'),
    ('excel-row-072', 'excel-2026-04-12', '2026-04-13'::date, 'docx-export', 'docx-export-worked-on-docx-export-formatting-for-headings-paragraphs-and-page-order', 2.5, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-073', 'excel-2026-04-12', '2026-04-14'::date, 'marketplace-billing', 'marketplace-billing-worked-on-subscription-tier-ideas-setup-costs-and-credit-based-pricing', 3.75, 'Logged', 'App build / review time.'),
    ('excel-row-074', 'excel-2026-04-12', '2026-04-15'::date, 'dashboard-ui', 'dashboard-ui-tested-dropdown-based-navigation-for-the-main-platform-page', 4, 'Logged', 'Platform build support work.'),
    ('excel-row-075', 'excel-2026-04-12', '2026-04-16'::date, 'sor-analytics', 'sor-analytics-created-notes-for-central-safety-observation-hub-design', 2.75, 'Logged', 'App build / review time.'),
    ('excel-row-076', 'excel-2026-04-12', '2026-04-17'::date, 'supabase-database', 'supabase-database-troubleshot-supabase-storage-bucket-and-document-upload-logic', 3.25, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-077', 'excel-2026-04-12', '2026-04-18'::date, 'training-matrix', 'training-matrix-mapped-missing-or-expiring-training-alerts-for-supervisor-dashboards', 3, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-078', 'excel-2026-04-19', '2026-04-19'::date, 'pshsep-builder', 'pshsep-builder-refined-pshsep-table-of-contents-and-site-wide-policy-sections', 2.5, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-079', 'excel-2026-04-19', '2026-04-20'::date, 'content-library', 'content-library-cleaned-up-module-naming-from-elements-to-modules', 3, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-080', 'excel-2026-04-19', '2026-04-21'::date, 'jsa-permits', 'jsa-permits-connected-permit-triggers-to-selected-jsa-tasks-and-work-conditions', 3.75, 'Logged', 'Platform build support work.'),
    ('excel-row-081', 'excel-2026-04-19', '2026-04-22'::date, 'admin-review-workflow', 'admin-review-workflow-designed-admin-review-process-for-submitted-safety-documents', 2, 'Logged', 'Reconstructed estimate; verify before official use.'),
    ('excel-row-082', 'excel-2026-04-19', '2026-04-23'::date, 'sor-analytics', 'sor-analytics-worked-on-safety-observation-report-trend-categories-and-dashboard-use', 2, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-083', 'excel-2026-04-19', '2026-04-24'::date, 'jsa-permits', 'jsa-permits-built-logic-for-ai-assisted-jsa-task-and-hazard-prompts', 3.75, 'Logged', 'Follow-up refinement completed.'),
    ('excel-row-084', 'excel-2026-04-19', '2026-04-25'::date, 'jsa-permits', 'jsa-permits-connected-permit-triggers-to-selected-jsa-tasks-and-work-conditions', 3, 'Logged', 'SafetyDocs360 development activity.')
)
insert into public.employee_time_entries (
  time_card_id,
  work_date,
  category_id,
  task_id,
  hours,
  source_status,
  notes,
  import_key
)
select card.id, seed.work_date, category.id, task.id, seed.hours, seed.source_status, seed.notes, seed.import_key
from entry_seed seed
join public.employee_time_cards card on card.import_key = seed.card_import_key
join public.time_card_categories category on category.slug = seed.category_slug
join public.time_card_tasks task on task.slug = seed.task_slug
on conflict (import_key) do update set
  time_card_id = excluded.time_card_id,
  work_date = excluded.work_date,
  category_id = excluded.category_id,
  task_id = excluded.task_id,
  hours = excluded.hours,
  source_status = excluded.source_status,
  notes = excluded.notes;

update public.employee_time_card_payroll
set hourly_rate = 75,
    total_hours = totals.total_hours,
    paid_value = (75 * totals.total_hours)::numeric(12,2),
    updated_at = now()
from (
  select card.id as time_card_id, coalesce(sum(entry.hours), 0)::numeric(10,2) as total_hours
  from public.employee_time_cards card
  left join public.employee_time_entries entry on entry.time_card_id = card.id
  where card.source = 'excel_import'
  group by card.id
) totals
where employee_time_card_payroll.time_card_id = totals.time_card_id;

alter table public.time_card_roles enable row level security;
alter table public.employee_profiles enable row level security;
alter table public.time_card_categories enable row level security;
alter table public.time_card_tasks enable row level security;
alter table public.time_card_role_categories enable row level security;
alter table public.time_card_role_tasks enable row level security;
alter table public.employee_pay_rates enable row level security;
alter table public.employee_time_cards enable row level security;
alter table public.employee_time_entries enable row level security;
alter table public.employee_time_card_payroll enable row level security;

drop policy if exists "Employees can read time card roles" on public.time_card_roles;
create policy "Employees can read time card roles"
on public.time_card_roles for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Admins can manage time card roles" on public.time_card_roles;
create policy "Admins can manage time card roles"
on public.time_card_roles for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read own profile" on public.employee_profiles;
create policy "Employees can read own profile"
on public.employee_profiles for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Admins can manage employee profiles" on public.employee_profiles;
create policy "Admins can manage employee profiles"
on public.employee_profiles for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read time card categories" on public.time_card_categories;
create policy "Employees can read time card categories"
on public.time_card_categories for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Admins can manage time card categories" on public.time_card_categories;
create policy "Admins can manage time card categories"
on public.time_card_categories for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read time card tasks" on public.time_card_tasks;
create policy "Employees can read time card tasks"
on public.time_card_tasks for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Admins can manage time card tasks" on public.time_card_tasks;
create policy "Admins can manage time card tasks"
on public.time_card_tasks for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read time card role categories" on public.time_card_role_categories;
create policy "Employees can read time card role categories"
on public.time_card_role_categories for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Admins can manage time card role categories" on public.time_card_role_categories;
create policy "Admins can manage time card role categories"
on public.time_card_role_categories for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read time card role tasks" on public.time_card_role_tasks;
create policy "Employees can read time card role tasks"
on public.time_card_role_tasks for select
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Admins can manage time card role tasks" on public.time_card_role_tasks;
create policy "Admins can manage time card role tasks"
on public.time_card_role_tasks for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Admins can manage employee pay rates" on public.employee_pay_rates;
create policy "Admins can manage employee pay rates"
on public.employee_pay_rates for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read own time cards" on public.employee_time_cards;
create policy "Employees can read own time cards"
on public.employee_time_cards for select
to authenticated
using (employee_user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Employees can create own draft time cards" on public.employee_time_cards;
create policy "Employees can create own draft time cards"
on public.employee_time_cards for insert
to authenticated
with check (
  employee_user_id = (select auth.uid())
  and created_by = (select auth.uid())
  and status = 'draft'
  and exists (
    select 1
    from public.employee_profiles profile
    where profile.user_id = (select auth.uid())
      and profile.profile_status = 'active'
      and profile.time_card_role_id is not null
  )
);

drop policy if exists "Employees can update own editable time cards" on public.employee_time_cards;
create policy "Employees can update own editable time cards"
on public.employee_time_cards for update
to authenticated
using (
  employee_user_id = (select auth.uid())
  and status in ('draft', 'rejected')
)
with check (
  employee_user_id = (select auth.uid())
  and status in ('draft', 'submitted', 'rejected')
);

drop policy if exists "Admins can manage all time cards" on public.employee_time_cards;
create policy "Admins can manage all time cards"
on public.employee_time_cards for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read own time entries" on public.employee_time_entries;
create policy "Employees can read own time entries"
on public.employee_time_entries for select
to authenticated
using (
  public.is_company_portal_admin()
  or exists (
    select 1
    from public.employee_time_cards card
    where card.id = time_card_id
      and card.employee_user_id = (select auth.uid())
  )
);

drop policy if exists "Employees can create own editable time entries" on public.employee_time_entries;
create policy "Employees can create own editable time entries"
on public.employee_time_entries for insert
to authenticated
with check (
  exists (
    select 1
    from public.employee_time_cards card
    where card.id = time_card_id
      and card.employee_user_id = (select auth.uid())
      and card.status in ('draft', 'rejected')
  )
);

drop policy if exists "Employees can update own editable time entries" on public.employee_time_entries;
create policy "Employees can update own editable time entries"
on public.employee_time_entries for update
to authenticated
using (
  exists (
    select 1
    from public.employee_time_cards card
    where card.id = time_card_id
      and card.employee_user_id = (select auth.uid())
      and card.status in ('draft', 'rejected')
  )
)
with check (
  exists (
    select 1
    from public.employee_time_cards card
    where card.id = time_card_id
      and card.employee_user_id = (select auth.uid())
      and card.status in ('draft', 'rejected')
  )
);

drop policy if exists "Employees can delete own editable time entries" on public.employee_time_entries;
create policy "Employees can delete own editable time entries"
on public.employee_time_entries for delete
to authenticated
using (
  exists (
    select 1
    from public.employee_time_cards card
    where card.id = time_card_id
      and card.employee_user_id = (select auth.uid())
      and card.status in ('draft', 'rejected')
  )
);

drop policy if exists "Admins can manage all time entries" on public.employee_time_entries;
create policy "Admins can manage all time entries"
on public.employee_time_entries for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Admins can manage time card payroll" on public.employee_time_card_payroll;
create policy "Admins can manage time card payroll"
on public.employee_time_card_payroll for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());
