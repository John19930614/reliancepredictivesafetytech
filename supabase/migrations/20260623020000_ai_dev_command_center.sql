-- AI Dev Command Center: governed, human-approved workflow for assigning software
-- development tasks to a fixed roster of AI agents. Platform group — platform_admin
-- and super_admin only. Every dangerous action (db/file/github/deploy/auth change)
-- must pass through dev_approvals before anything is applied; dev_audit_log is
-- append-only (insert + select policies only, no update/delete).

-- Core task record
create table if not exists public.dev_tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  target_area text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  status text not null default 'queued' check (status in ('queued', 'planning', 'in_progress', 'awaiting_approval', 'in_review', 'blocked', 'done', 'rejected', 'cancelled', 'failed')),
  stage text not null default 'intake' check (stage in (
    'intake', 'requirements_review', 'architecture_review', 'ui_ux_review', 'experience_review',
    'code_plan', 'file_change_plan', 'approval_required', 'approved_for_drafting', 'code_draft',
    'qa_review', 'security_review', 'experience_final_review', 'documentation', 'release_plan',
    'human_final_approval', 'complete', 'rejected', 'blocked'
  )),
  database_changes_allowed boolean not null default false,
  file_changes_allowed boolean not null default false,
  github_branch_allowed boolean not null default false,
  deployment_allowed boolean not null default false,
  human_approval_required boolean not null default true,
  metadata jsonb not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Fixed 19-agent roster
create table if not exists public.dev_agents (
  id uuid default gen_random_uuid() primary key,
  key text not null unique,
  name text not null,
  role text not null,
  description text,
  system_prompt text,
  allowed_tools text[] not null default '{}',
  restrictions text[] not null default '{}',
  model text,
  is_manager boolean not null default false,
  sort_order int not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One execution of an agent against a task stage
create table if not exists public.dev_agent_runs (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.dev_tasks(id) on delete cascade,
  agent_id uuid references public.dev_agents(id),
  phase text check (phase in ('plan', 'design', 'recommend', 'draft', 'test', 'review', 'document', 'other')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  model text,
  tokens_used int,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Agent thoughts / outputs within a run
create table if not exists public.dev_agent_messages (
  id uuid default gen_random_uuid() primary key,
  run_id uuid references public.dev_agent_runs(id) on delete cascade,
  task_id uuid references public.dev_tasks(id) on delete cascade,
  agent_id uuid references public.dev_agents(id),
  role text check (role in ('system', 'user', 'assistant', 'tool', 'thought')),
  content text,
  structured jsonb not null default '{}',
  seq int not null default 0,
  created_at timestamptz default now()
);

-- Draft plans, SQL, code, docs proposed by agents
create table if not exists public.dev_artifacts (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.dev_tasks(id) on delete cascade,
  run_id uuid references public.dev_agent_runs(id),
  kind text check (kind in ('plan', 'design', 'sql_draft', 'code_draft', 'doc', 'summary', 'test_plan', 'other')),
  artifact_type text check (artifact_type in ('react_component', 'nextjs_route', 'server_action', 'api_route', 'supabase_sql', 'rls_policy', 'test_file', 'documentation', 'config_change', 'release_notes')),
  title text,
  path text,
  content text,
  status text not null default 'draft' check (status in ('draft', 'proposed', 'approved', 'rejected', 'applied', 'superseded')),
  version int not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Proposed file changes before anything is ever applied
create table if not exists public.dev_file_change_plans (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.dev_tasks(id) on delete cascade,
  artifact_id uuid references public.dev_artifacts(id),
  file_path text not null,
  change_type text not null check (change_type in ('create', 'modify', 'delete', 'rename')),
  language text,
  diff text,
  rationale text,
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'applied')),
  applied_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- AI code-review results
create table if not exists public.dev_code_reviews (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.dev_tasks(id) on delete cascade,
  run_id uuid references public.dev_agent_runs(id),
  artifact_id uuid references public.dev_artifacts(id),
  reviewer_agent_id uuid references public.dev_agents(id),
  summary text,
  findings jsonb not null default '[]',
  verdict text not null default 'pending' check (verdict in ('approved', 'changes_requested', 'rejected', 'pending')),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Test/lint/typecheck/QA results
create table if not exists public.dev_test_results (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.dev_tasks(id) on delete cascade,
  run_id uuid references public.dev_agent_runs(id),
  kind text check (kind in ('unit', 'integration', 'system', 'lint', 'typecheck', 'qa', 'other')),
  status text not null default 'pending' check (status in ('passed', 'failed', 'error', 'skipped', 'pending')),
  summary text,
  passed int not null default 0,
  failed int not null default 0,
  skipped int not null default 0,
  details jsonb not null default '{}',
  log text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Security review findings
create table if not exists public.dev_security_reviews (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.dev_tasks(id) on delete cascade,
  run_id uuid references public.dev_agent_runs(id),
  reviewer_agent_id uuid references public.dev_agents(id),
  summary text,
  findings jsonb not null default '[]',
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  verdict text not null default 'pending' check (verdict in ('pass', 'fail', 'needs_changes', 'pending')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- UX / plain-english / accessibility review results
create table if not exists public.dev_experience_reviews (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.dev_tasks(id) on delete cascade,
  run_id uuid references public.dev_agent_runs(id),
  reviewer_agent_id uuid references public.dev_agents(id),
  perspective text check (perspective in ('ux', 'plain_english', 'accessibility', 'onboarding', 'simplification', 'other')),
  summary text,
  findings jsonb not null default '[]',
  score int,
  verdict text not null default 'pending' check (verdict in ('pass', 'fail', 'needs_changes', 'pending')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- THE SAFETY GATE: human approval required before any dangerous action executes
create table if not exists public.dev_approvals (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.dev_tasks(id) on delete cascade,
  approval_type text not null check (approval_type in (
    'database_change', 'auth_permission_change', 'rls_policy_change', 'file_write', 'file_delete',
    'github_branch', 'pull_request', 'deployment', 'production_release', 'environment_variable_change',
    'ai_tool_permission_change', 'delete_action'
  )),
  target_type text,
  target_id uuid,
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high', 'critical')),
  summary text,
  plain_english_summary text,
  technical_summary text,
  experience_impact text,
  affected_files jsonb not null default '[]',
  affected_tables jsonb not null default '[]',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'needs_revision', 'expired', 'cancelled')),
  requested_by uuid references auth.users(id),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Branch / PR / preview / release plan info (planning only, no automated pushes)
create table if not exists public.dev_deployments (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.dev_tasks(id) on delete cascade,
  approval_id uuid references public.dev_approvals(id),
  branch text,
  pull_request_url text,
  pr_number int,
  preview_url text,
  release_tag text,
  commit_sha text,
  environment text not null default 'preview' check (environment in ('preview', 'staging', 'production')),
  status text not null default 'planned' check (status in ('planned', 'branch_created', 'pr_open', 'preview_ready', 'merged', 'released', 'failed', 'rolled_back')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Append-only audit trail — no update/delete policy is ever defined below
create table if not exists public.dev_audit_log (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.dev_tasks(id),
  actor_type text not null check (actor_type in ('agent', 'human', 'system')),
  actor_id uuid,
  agent_id uuid references public.dev_agents(id),
  action text not null,
  entity text,
  entity_id uuid,
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  detail jsonb not null default '{}',
  created_at timestamptz default now()
);

-- Approved/rejected patterns and lessons learned, feeding future runs
create table if not exists public.dev_agent_memory (
  id uuid default gen_random_uuid() primary key,
  agent_id uuid references public.dev_agents(id),
  task_id uuid references public.dev_tasks(id),
  kind text check (kind in (
    'approved_pattern', 'rejected_pattern', 'user_preference', 'lesson_learned', 'preferred_label',
    'workflow_rule', 'security_rule', 'ux_rule', 'performance_rule', 'admin_support_rule', 'platform_standard'
  )),
  title text,
  content text,
  structured jsonb not null default '{}',
  tags text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Per-agent tool allow-list
create table if not exists public.dev_tool_permissions (
  id uuid default gen_random_uuid() primary key,
  agent_id uuid references public.dev_agents(id) on delete cascade,
  tool text not null,
  allowed boolean not null default false,
  requires_approval boolean not null default true,
  scope jsonb not null default '{}',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Operator feedback on the Command Center itself
create table if not exists public.dev_feedback (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.dev_tasks(id),
  screen text,
  category text check (category in ('confusing_screen', 'wrong_recommendation', 'improvement', 'bug', 'other')),
  risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
  message text not null,
  status text not null default 'open' check (status in ('open', 'triaged', 'in_progress', 'resolved', 'wontfix')),
  created_by uuid references auth.users(id),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for the main query patterns
create index if not exists idx_dev_agent_runs_task_id on public.dev_agent_runs(task_id);
create index if not exists idx_dev_agent_messages_run_id on public.dev_agent_messages(run_id);
create index if not exists idx_dev_artifacts_task_id on public.dev_artifacts(task_id);
create index if not exists idx_dev_approvals_status on public.dev_approvals(status);
create index if not exists idx_dev_approvals_task_id on public.dev_approvals(task_id);
create index if not exists idx_dev_audit_log_task_id on public.dev_audit_log(task_id);
create index if not exists idx_dev_audit_log_created_at on public.dev_audit_log(created_at desc);

-- Auto-update triggers (reuses the shared Platform trigger function; audit log is append-only, no trigger needed)
create trigger trg_dev_tasks_updated_at before update on public.dev_tasks for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_agents_updated_at before update on public.dev_agents for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_agent_runs_updated_at before update on public.dev_agent_runs for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_artifacts_updated_at before update on public.dev_artifacts for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_file_change_plans_updated_at before update on public.dev_file_change_plans for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_code_reviews_updated_at before update on public.dev_code_reviews for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_test_results_updated_at before update on public.dev_test_results for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_security_reviews_updated_at before update on public.dev_security_reviews for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_experience_reviews_updated_at before update on public.dev_experience_reviews for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_approvals_updated_at before update on public.dev_approvals for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_deployments_updated_at before update on public.dev_deployments for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_agent_memory_updated_at before update on public.dev_agent_memory for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_tool_permissions_updated_at before update on public.dev_tool_permissions for each row execute procedure public.update_platform_updated_at();
create trigger trg_dev_feedback_updated_at before update on public.dev_feedback for each row execute procedure public.update_platform_updated_at();

-- RLS: platform_admin and super_admin only, everywhere
alter table public.dev_tasks enable row level security;
alter table public.dev_agents enable row level security;
alter table public.dev_agent_runs enable row level security;
alter table public.dev_agent_messages enable row level security;
alter table public.dev_artifacts enable row level security;
alter table public.dev_file_change_plans enable row level security;
alter table public.dev_code_reviews enable row level security;
alter table public.dev_test_results enable row level security;
alter table public.dev_security_reviews enable row level security;
alter table public.dev_experience_reviews enable row level security;
alter table public.dev_approvals enable row level security;
alter table public.dev_deployments enable row level security;
alter table public.dev_audit_log enable row level security;
alter table public.dev_agent_memory enable row level security;
alter table public.dev_tool_permissions enable row level security;
alter table public.dev_feedback enable row level security;

create policy "dev_tasks_platform" on public.dev_tasks for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_agents_platform" on public.dev_agents for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_agent_runs_platform" on public.dev_agent_runs for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_agent_messages_platform" on public.dev_agent_messages for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_artifacts_platform" on public.dev_artifacts for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_file_change_plans_platform" on public.dev_file_change_plans for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_code_reviews_platform" on public.dev_code_reviews for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_test_results_platform" on public.dev_test_results for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_security_reviews_platform" on public.dev_security_reviews for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_experience_reviews_platform" on public.dev_experience_reviews for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_approvals_platform" on public.dev_approvals for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_deployments_platform" on public.dev_deployments for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_agent_memory_platform" on public.dev_agent_memory for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_tool_permissions_platform" on public.dev_tool_permissions for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_feedback_platform" on public.dev_feedback for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);

-- dev_audit_log: append-only. Select + insert policies only — no update/delete
-- policy is ever defined, so RLS denies those actions outright for every role.
create policy "dev_audit_log_platform_read" on public.dev_audit_log for select using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "dev_audit_log_platform_insert" on public.dev_audit_log for insert with check (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);

-- Seed: fixed 19-agent roster
insert into public.dev_agents (key, name, role, description, system_prompt, allowed_tools, restrictions, model, is_manager, sort_order)
values
  ('dev-manager', 'Dev Manager', 'Team Lead', 'Orchestrates the workflow, assigns work to the right specialist agents, and decides when a stage needs human approval.', 'You are the Dev Manager. Coordinate the agent team through each workflow stage and flag any dangerous action for human approval before it proceeds.', '{"assign_agent","advance_stage","request_approval"}', '{"cannot_apply_changes","cannot_skip_approval_gates"}', 'stub', true, 0),

  ('product-requirements', 'Product Requirements', 'Planning & Build', 'Turns a rough idea into clear requirements and acceptance criteria.', 'You are the Product Requirements agent. Turn the task description into clear requirements and testable acceptance criteria.', '{"draft_requirements"}', '{"cannot_write_code","cannot_apply_changes"}', 'stub', false, 1),
  ('platform-architect', 'Platform Architect', 'Planning & Build', 'Recommends technical design, impacted files, and risk areas.', 'You are the Platform Architect. Recommend an implementation approach, list impacted files, and flag risk areas.', '{"draft_design","list_impacted_files"}', '{"cannot_write_code","cannot_apply_changes"}', 'stub', false, 2),
  ('ui-ux', 'UI/UX', 'Planning & Build', 'Proposes UI layouts, flows, and component structure.', 'You are the UI/UX agent. Propose the screen layout, user flow, and component structure for this task.', '{"draft_ui_plan"}', '{"cannot_write_code","cannot_apply_changes"}', 'stub', false, 3),
  ('frontend', 'Frontend', 'Planning & Build', 'Generates React/Next.js/Tailwind code drafts (never applied automatically).', 'You are the Frontend agent. Draft the React/Next.js component and page code needed for this task as a proposal only.', '{"draft_code"}', '{"cannot_apply_changes","cannot_push_to_github"}', 'stub', false, 4),
  ('backend-api', 'Backend/API', 'Planning & Build', 'Generates server-side code drafts (routes, server actions, lib functions).', 'You are the Backend/API agent. Draft server actions, API routes, and lib functions needed for this task as a proposal only.', '{"draft_code","draft_file_change_plan"}', '{"cannot_apply_changes","cannot_push_to_github"}', 'stub', false, 5),

  ('database-supabase', 'Database/Supabase', 'Quality, Security, Performance', 'Drafts SQL migrations — never runs them.', 'You are the Database/Supabase agent. Draft the SQL migration (tables, RLS, triggers) needed for this task. Never execute it.', '{"draft_sql"}', '{"cannot_run_migrations","cannot_apply_changes"}', 'stub', false, 6),
  ('qa-test', 'QA/Test', 'Quality, Security, Performance', 'Writes test plans and records test results.', 'You are the QA/Test agent. Write a test plan and record pass/fail results for the drafted change.', '{"draft_test_plan","record_test_results"}', '{"cannot_apply_changes"}', 'stub', false, 7),
  ('security-permissions', 'Security/Permissions', 'Quality, Security, Performance', 'Reviews for auth, RLS, secrets, and injection risks.', 'You are the Security/Permissions agent. Review the drafted change for auth gaps, missing RLS, exposed secrets, and injection risk.', '{"draft_security_review"}', '{"cannot_apply_changes","cannot_waive_own_findings"}', 'stub', false, 8),

  ('human-experience', 'Human Experience', 'Experience & Clarity', 'Reviews the change from a real user''s perspective.', 'You are the Human Experience agent. Review the drafted change from a real end-user''s perspective and note friction points.', '{"draft_experience_review"}', '{"cannot_apply_changes"}', 'stub', false, 9),
  ('plain-english', 'Plain English', 'Experience & Clarity', 'Rewrites copy into plain, non-technical language.', 'You are the Plain English agent. Rewrite any user-facing copy in this task into clear, plain language.', '{"rewrite_copy"}', '{"cannot_apply_changes"}', 'stub', false, 10),
  ('workflow-simplification', 'Workflow Simplification', 'Experience & Clarity', 'Finds ways to reduce steps in a workflow.', 'You are the Workflow Simplification agent. Look for ways to reduce the number of steps or clicks in this workflow.', '{"draft_simplification_notes"}', '{"cannot_apply_changes"}', 'stub', false, 11),
  ('onboarding', 'Onboarding', 'Experience & Clarity', 'Designs onboarding, empty states, and first-run guidance.', 'You are the Onboarding agent. Design the empty state and first-run guidance for this feature.', '{"draft_onboarding_copy"}', '{"cannot_apply_changes"}', 'stub', false, 12),
  ('accessibility', 'Accessibility', 'Experience & Clarity', 'Reviews for WCAG/accessibility compliance.', 'You are the Accessibility agent. Review the drafted change for WCAG compliance (contrast, labels, keyboard nav).', '{"draft_accessibility_review"}', '{"cannot_apply_changes"}', 'stub', false, 13),

  ('devops-release', 'DevOps/Release', 'Ship & Support', 'Prepares branch/PR/preview/release plans — everything gated by approval.', 'You are the DevOps/Release agent. Prepare a branch, PR, and release plan for this task. Never execute it without an approved gate.', '{"draft_release_plan"}', '{"cannot_push_to_github","cannot_deploy","cannot_apply_changes"}', 'stub', false, 14),
  ('documentation', 'Documentation', 'Ship & Support', 'Drafts documentation and SOP updates.', 'You are the Documentation agent. Draft documentation or SOP updates describing this change.', '{"draft_documentation"}', '{"cannot_apply_changes"}', 'stub', false, 15),
  ('ai-integration', 'AI Integration', 'Ship & Support', 'Designs how a feature uses the AI engine/gateway.', 'You are the AI Integration agent. Design how this feature should call the AI gateway, including validation and human-review gating.', '{"draft_ai_integration_plan"}', '{"cannot_apply_changes"}', 'stub', false, 16),
  ('admin-support', 'Admin Support', 'Ship & Support', 'Helps operators use the Command Center itself.', 'You are the Admin Support agent. Answer operator questions about how to use the Command Center for this task.', '{"answer_operator_question"}', '{"cannot_apply_changes"}', 'stub', false, 17),
  ('performance', 'Performance', 'Ship & Support', 'Reviews for query, bundle size, and render-cost risk.', 'You are the Performance agent. Review the drafted change for slow queries, bundle size growth, and render cost.', '{"draft_performance_review"}', '{"cannot_apply_changes"}', 'stub', false, 18)
on conflict (key) do nothing;

-- Seed: CLAUDE.md Platform-group release gate — 5 test scenarios recorded before this module ships
insert into public.platform_test_plans (title, status, total_scenarios)
values ('AI Dev Command Center — Core Loop', 'draft', 5)
on conflict do nothing;

insert into public.platform_test_results (test_plan_id, scenario, acceptance_criteria, result)
select id, scenario, acceptance_criteria, 'pending'
from public.platform_test_plans, (values
  ('Owner creates and advances a task', 'platform_admin/super_admin can create a dev_tasks row and advance it stage by stage via runNextStage'),
  ('Non-owner is denied at the RLS layer', 'A company_admin/employee session returns zero rows from dev_tasks and dev_approvals regardless of UI state'),
  ('Dangerous stage halts on an approval gate', 'Reaching approval_required or human_final_approval inserts a dev_approvals row and the task does not advance further until decided'),
  ('Rejecting an approval blocks the task', 'Rejecting a pending dev_approvals row sets the task status to rejected/blocked and is recorded in dev_audit_log'),
  ('Audit log is append-only', 'No update or delete policy exists on dev_audit_log; attempting to update or delete a row is denied by RLS for every role')
) as scenarios(scenario, acceptance_criteria)
where platform_test_plans.title = 'AI Dev Command Center — Core Loop'
on conflict do nothing;
