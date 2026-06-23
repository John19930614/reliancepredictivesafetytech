-- Legal Register Intelligence Center
-- Expands the single-page Legal Register into a full compliance intelligence center:
-- structured research runs, gap analysis, audit checklists, module recommendations,
-- a human review queue, a change log, source management, and editable prompt templates.
--
-- TENANT MODEL: platform-wide, mirroring legal_register_items
--   (20260622040000_legal_register.sql) — admins have full CRUD, all active portal
--   users may read. company_id / project_id are nullable LABEL/FILTER columns only;
--   there is NO tenant-isolation RLS, so no cross-tenant exposure surface.
--
-- ROLLBACK:
--   drop table if exists public.legal_prompt_templates, public.legal_register_change_log,
--     public.module_recommendations, public.audit_checklist_items,
--     public.gap_analysis_results, public.legal_register_sources,
--     public.research_runs cascade;
--   alter table public.legal_register_items
--     drop column if exists company_id, drop column if exists project_id,
--     drop column if exists research_run_id, drop column if exists program,
--     drop column if exists requirement_type, drop column if exists applicability_status,
--     drop column if exists required_action, drop column if exists documentation_required,
--     drop column if exists training_required, drop column if exists inspection_required,
--     drop column if exists permit_required, drop column if exists record_retention,
--     drop column if exists responsible_role, drop column if exists risk_level,
--     drop column if exists review_status, drop column if exists human_review_required,
--     drop column if exists confidence_level, drop column if exists module_assignment,
--     drop column if exists source_notes, drop column if exists review_role_needed,
--     drop column if exists reviewed_by, drop column if exists last_reviewed_at,
--     drop column if exists archived;

-- ============================================================================
-- 1. Extend legal_register_items (additive only — existing columns/RLS untouched)
-- ============================================================================
alter table public.legal_register_items
  add column if not exists company_id uuid,
  add column if not exists project_id uuid,
  add column if not exists research_run_id uuid,
  add column if not exists program text,
  add column if not exists requirement_type text,
  add column if not exists applicability_status text,
  add column if not exists required_action text,
  add column if not exists documentation_required text,
  add column if not exists training_required text,
  add column if not exists inspection_required text,
  add column if not exists permit_required text,
  add column if not exists record_retention text,
  add column if not exists responsible_role text,
  add column if not exists risk_level text,
  add column if not exists review_status text default 'draft',
  add column if not exists human_review_required boolean default false,
  add column if not exists confidence_level text,
  add column if not exists module_assignment text,
  add column if not exists source_notes text,
  add column if not exists review_role_needed text,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists archived boolean default false;

-- Items already in the register pre-dated the review workflow; treat them as approved
-- so they keep showing in the register table rather than landing in the review queue.
update public.legal_register_items
  set review_status = 'approved'
  where review_status is null or review_status = 'draft';

create index if not exists idx_legal_register_review_status on public.legal_register_items(review_status);
create index if not exists idx_legal_register_risk_level on public.legal_register_items(risk_level);
create index if not exists idx_legal_register_program on public.legal_register_items(program);
create index if not exists idx_legal_register_archived on public.legal_register_items(archived);
create index if not exists idx_legal_register_research_run on public.legal_register_items(research_run_id);
create index if not exists idx_legal_register_human_review on public.legal_register_items(human_review_required);

-- ============================================================================
-- 2. research_runs — richer successor to legal_research_sessions
-- ============================================================================
create table if not exists public.research_runs (
  id uuid default gen_random_uuid() primary key,
  company_id uuid,
  project_id uuid,
  user_id uuid references auth.users(id),
  title text,
  query text not null,
  industry text,
  jurisdiction text,
  state text,
  program text,
  scope text,
  work_activity text,
  equipment text,
  chemicals_materials text,
  vehicle_type text,
  contractor_type text,
  employee_type text,
  risk_level text,
  status text not null default 'draft' check (
    status in ('draft', 'running', 'completed', 'needs_review', 'approved', 'archived', 'error')
  ),
  result_summary text,
  total_findings integer default 0,
  high_risk_count integer default 0,
  critical_risk_count integer default 0,
  needs_review_count integer default 0,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists idx_research_runs_created_at on public.research_runs(created_at desc);
create index if not exists idx_research_runs_status on public.research_runs(status);
create index if not exists idx_research_runs_program on public.research_runs(program);

-- ============================================================================
-- 3. legal_register_sources — research source library
-- ============================================================================
create table if not exists public.legal_register_sources (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  agency text,
  source_type text,
  jurisdiction text,
  state text,
  url text,
  enabled boolean default true,
  notes text,
  confidence_default text,
  owner_role text,
  last_checked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_legal_sources_enabled on public.legal_register_sources(enabled);
create index if not exists idx_legal_sources_jurisdiction on public.legal_register_sources(jurisdiction);

-- ============================================================================
-- 4. gap_analysis_results
-- ============================================================================
create table if not exists public.gap_analysis_results (
  id uuid default gen_random_uuid() primary key,
  research_run_id uuid references public.research_runs(id) on delete cascade,
  company_id uuid,
  project_id uuid,
  existing_item text,
  finding text,
  status text,
  gap_description text,
  recommended_update text,
  module_assignment text,
  risk_level text,
  human_review_required boolean default false,
  source_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_gap_results_run on public.gap_analysis_results(research_run_id);
create index if not exists idx_gap_results_status on public.gap_analysis_results(status);

-- ============================================================================
-- 5. audit_checklist_items
-- ============================================================================
create table if not exists public.audit_checklist_items (
  id uuid default gen_random_uuid() primary key,
  company_id uuid,
  project_id uuid,
  legal_register_entry_id uuid references public.legal_register_items(id) on delete set null,
  research_run_id uuid references public.research_runs(id) on delete set null,
  program text,
  checklist_item text,
  question_text text,
  answer_type text default 'yes_no_na',
  citation text,
  source_url text,
  evidence_required text,
  risk_level text,
  corrective_action_trigger text,
  responsible_role text,
  frequency text,
  module_assignment text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_audit_items_run on public.audit_checklist_items(research_run_id);
create index if not exists idx_audit_items_entry on public.audit_checklist_items(legal_register_entry_id);
create index if not exists idx_audit_items_program on public.audit_checklist_items(program);

-- ============================================================================
-- 6. module_recommendations
-- ============================================================================
create table if not exists public.module_recommendations (
  id uuid default gen_random_uuid() primary key,
  company_id uuid,
  project_id uuid,
  research_run_id uuid references public.research_runs(id) on delete set null,
  module_name text not null,
  reason_needed text,
  related_register_entries jsonb default '[]'::jsonb,
  required_forms text,
  required_permits text,
  required_inspections text,
  required_training text,
  required_dashboards text,
  required_alerts text,
  required_reports text,
  required_corrective_actions text,
  required_document_control text,
  required_approval_workflow text,
  priority_level text,
  build_status text default 'not_started' check (
    build_status in ('not_started', 'planned', 'in_build', 'testing', 'live', 'needs_update', 'archived')
  ),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_module_recs_run on public.module_recommendations(research_run_id);
create index if not exists idx_module_recs_build_status on public.module_recommendations(build_status);

-- ============================================================================
-- 7. legal_register_change_log — append-only audit of register entry changes
-- ============================================================================
create table if not exists public.legal_register_change_log (
  id uuid default gen_random_uuid() primary key,
  entry_id uuid,
  company_id uuid,
  change_type text not null,
  old_value text,
  new_value text,
  changed_by uuid references auth.users(id),
  change_reason text,
  created_at timestamptz default now()
);

create index if not exists idx_change_log_entry on public.legal_register_change_log(entry_id);
create index if not exists idx_change_log_created_at on public.legal_register_change_log(created_at desc);

-- ============================================================================
-- 8. legal_prompt_templates — editable AI prompt templates (stored in UI)
-- ============================================================================
create table if not exists public.legal_prompt_templates (
  id uuid default gen_random_uuid() primary key,
  template_key text not null unique,
  name text not null,
  template_text text not null,
  requires_human_review boolean default false,
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- RLS — platform-wide pattern (admins full CRUD; all active users read)
-- ============================================================================
alter table public.research_runs enable row level security;
alter table public.legal_register_sources enable row level security;
alter table public.gap_analysis_results enable row level security;
alter table public.audit_checklist_items enable row level security;
alter table public.module_recommendations enable row level security;
alter table public.legal_register_change_log enable row level security;
alter table public.legal_prompt_templates enable row level security;

-- research_runs
create policy "research_runs_admin_all" on public.research_runs
  for all using (
    exists (select 1 from public.user_roles where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin') and account_status = 'active')
  );
create policy "research_runs_read_active" on public.research_runs
  for select using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and account_status = 'active')
  );

-- legal_register_sources
create policy "legal_sources_admin_all" on public.legal_register_sources
  for all using (
    exists (select 1 from public.user_roles where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin') and account_status = 'active')
  );
create policy "legal_sources_read_active" on public.legal_register_sources
  for select using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and account_status = 'active')
  );

-- gap_analysis_results
create policy "gap_results_admin_all" on public.gap_analysis_results
  for all using (
    exists (select 1 from public.user_roles where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin') and account_status = 'active')
  );
create policy "gap_results_read_active" on public.gap_analysis_results
  for select using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and account_status = 'active')
  );

-- audit_checklist_items
create policy "audit_items_admin_all" on public.audit_checklist_items
  for all using (
    exists (select 1 from public.user_roles where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin') and account_status = 'active')
  );
create policy "audit_items_read_active" on public.audit_checklist_items
  for select using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and account_status = 'active')
  );

-- module_recommendations
create policy "module_recs_admin_all" on public.module_recommendations
  for all using (
    exists (select 1 from public.user_roles where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin') and account_status = 'active')
  );
create policy "module_recs_read_active" on public.module_recommendations
  for select using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and account_status = 'active')
  );

-- legal_register_change_log — readable by active users; written by admins + reviewers
create policy "change_log_write" on public.legal_register_change_log
  for insert with check (
    exists (select 1 from public.user_roles where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin', 'internal_reviewer')
      and account_status = 'active')
  );
create policy "change_log_read_active" on public.legal_register_change_log
  for select using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and account_status = 'active')
  );

-- legal_prompt_templates
create policy "prompt_templates_admin_all" on public.legal_prompt_templates
  for all using (
    exists (select 1 from public.user_roles where user_id = auth.uid()
      and role in ('platform_admin', 'super_admin', 'company_admin', 'admin') and account_status = 'active')
  );
create policy "prompt_templates_read_active" on public.legal_prompt_templates
  for select using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and account_status = 'active')
  );

-- ============================================================================
-- updated_at triggers (reuse set_legal_register_updated_at from 20260622040000)
-- ============================================================================
create trigger research_runs_updated_at
  before update on public.research_runs
  for each row execute function public.set_legal_register_updated_at();
create trigger legal_sources_updated_at
  before update on public.legal_register_sources
  for each row execute function public.set_legal_register_updated_at();
create trigger gap_results_updated_at
  before update on public.gap_analysis_results
  for each row execute function public.set_legal_register_updated_at();
create trigger audit_items_updated_at
  before update on public.audit_checklist_items
  for each row execute function public.set_legal_register_updated_at();
create trigger module_recs_updated_at
  before update on public.module_recommendations
  for each row execute function public.set_legal_register_updated_at();
create trigger prompt_templates_updated_at
  before update on public.legal_prompt_templates
  for each row execute function public.set_legal_register_updated_at();

-- ============================================================================
-- Seed: editable AI prompt templates (doc §13)
-- ============================================================================
insert into public.legal_prompt_templates (template_key, name, template_text, requires_human_review) values
  ('build_legal_register', 'Build Legal Register',
   'Act as a senior safety compliance researcher. Build a legal register for [industry] in [state/jurisdiction] for [program/work activity]. Identify federal, state, and local requirements. Separate laws/regulations from agency guidance, standards, and best practices. Include citations, source links, applicability, required actions, documentation, training, inspections, recordkeeping, risk level, confidence level, and human review flags.',
   true),
  ('gap_analysis', 'Gap Analysis',
   'Compare this existing safety program against current regulatory requirements and recognized guidance. Identify what is covered, missing, outdated, unclear, or needs review. Recommend legal register updates, module updates, checklist items, training requirements, permit requirements, and corrective actions.',
   true),
  ('module_builder', 'Module Builder',
   'Using the legal register findings, recommend the platform module structure needed to manage compliance. Include dashboards, forms, workflows, alerts, permits, inspections, training, document control, corrective actions, review queues, and reports.',
   false),
  ('audit_checklist_builder', 'Audit Checklist Builder',
   'Convert these legal register requirements into a practical audit checklist. Each checklist item should include the regulation/guidance source, yes/no/NA answer type, evidence required, risk level, corrective action trigger, responsible role, frequency, and module assignment.',
   false),
  ('change_tracker', 'Change Tracker',
   'Review the new findings against the existing register and clearly identify what was added, changed, removed, or needs review. Highlight all updates for the user.',
   false)
on conflict (template_key) do nothing;

-- ============================================================================
-- Seed: default research sources (doc §5.8 required default categories)
-- ============================================================================
insert into public.legal_register_sources (name, agency, source_type, jurisdiction, enabled, confidence_default) values
  ('OSHA Regulations (29 CFR)', 'OSHA', 'Federal Regulation', 'federal', true, 'high'),
  ('FMCSA Regulations (49 CFR)', 'FMCSA', 'Federal Regulation', 'federal', true, 'high'),
  ('PHMSA Hazardous Materials Regulations', 'PHMSA', 'Federal Regulation', 'federal', true, 'high'),
  ('EPA Regulations (40 CFR)', 'EPA', 'Federal Regulation', 'federal', true, 'high'),
  ('DOT Regulations', 'DOT', 'Federal Regulation', 'federal', true, 'high'),
  ('NIOSH Recommendations', 'NIOSH', 'Agency Guidance', 'federal', true, 'medium'),
  ('CDC / NIOSH Guidance', 'CDC/NIOSH', 'Agency Guidance', 'federal', true, 'medium'),
  ('FDA Regulations', 'FDA', 'Federal Regulation', 'federal', true, 'high'),
  ('CMS Regulations', 'CMS', 'Federal Regulation', 'federal', true, 'high'),
  ('NFPA Codes & Standards', 'NFPA', 'Consensus Standard', 'multi', true, 'low'),
  ('ANSI / ASSP Standards', 'ANSI/ASSP', 'Consensus Standard', 'multi', true, 'low'),
  ('ASTM Standards', 'ASTM', 'Consensus Standard', 'multi', true, 'low'),
  ('ISO Standards', 'ISO', 'Consensus Standard', 'international', true, 'low'),
  ('ACGIH TLVs/BEIs', 'ACGIH', 'Consensus Standard', 'multi', true, 'low'),
  ('ASHRAE Standards', 'ASHRAE', 'Consensus Standard', 'multi', true, 'low')
on conflict do nothing;
