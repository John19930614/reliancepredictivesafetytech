-- AI & Intelligence Services: Prompt Registry, Model Pipeline, Feedback Loop, AI Gateway Log

-- Prompt & Tool Registry
create table if not exists public.ai_prompt_templates (
  id uuid default gen_random_uuid() primary key,
  prompt_key text not null unique,
  name text not null,
  description text,
  category text not null default 'general' check (category in ('classification', 'extraction', 'generation', 'validation', 'routing', 'general')),
  template_text text not null,
  version text not null default '1.0',
  model_hint text,
  max_tokens int,
  temperature numeric(3,2),
  confidence_threshold numeric(3,2) default 0.70,
  requires_human_review boolean default false,
  is_active boolean default true,
  test_scenario_count int default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ai_prompt_versions (
  id uuid default gen_random_uuid() primary key,
  prompt_template_id uuid references public.ai_prompt_templates(id) on delete cascade,
  version text not null,
  template_text text not null,
  change_summary text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Predictive Model Registry
create table if not exists public.ai_model_registry (
  id uuid default gen_random_uuid() primary key,
  model_key text not null unique,
  name text not null,
  description text,
  model_type text not null default 'llm' check (model_type in ('llm', 'classifier', 'regressor', 'embedding', 'custom')),
  provider text not null default 'openai',
  model_id text not null,
  version text not null default '1.0',
  status text not null default 'development' check (status in ('development', 'staging', 'production', 'deprecated')),
  accuracy_score numeric(5,4),
  f1_score numeric(5,4),
  last_evaluated_at timestamptz,
  retrain_trigger_threshold numeric(5,4) default 0.85,
  fallback_model_key text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- AI Gateway Validation Log
create table if not exists public.ai_gateway_log (
  id uuid default gen_random_uuid() primary key,
  request_id text not null unique,
  prompt_key text,
  model_used text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  validation_status text not null default 'pending' check (validation_status in ('pending', 'pass', 'warn', 'fail', 'blocked')),
  validation_checks jsonb default '{}',
  confidence_score numeric(5,4),
  required_human_review boolean default false,
  human_reviewed_by uuid references auth.users(id),
  human_reviewed_at timestamptz,
  human_verdict text check (human_verdict in ('approved', 'rejected', 'modified')),
  output_summary text,
  created_at timestamptz default now()
);

create index if not exists idx_ai_gateway_log_created_at on public.ai_gateway_log(created_at desc);
create index if not exists idx_ai_gateway_log_validation_status on public.ai_gateway_log(validation_status);

-- AI Feedback & Improvement Loop
create table if not exists public.ai_feedback_entries (
  id uuid default gen_random_uuid() primary key,
  gateway_log_id uuid references public.ai_gateway_log(id),
  prompt_key text,
  feedback_type text not null check (feedback_type in ('false_positive', 'false_negative', 'override', 'rejection', 'correction', 'approval')),
  original_output text,
  corrected_output text,
  rejection_reason text,
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz default now(),
  included_in_retrain boolean default false,
  notes text
);

-- Auto-update triggers
create trigger trg_ai_prompt_templates_updated_at before update on public.ai_prompt_templates for each row execute procedure public.update_platform_updated_at();
create trigger trg_ai_model_registry_updated_at before update on public.ai_model_registry for each row execute procedure public.update_platform_updated_at();

-- RLS
alter table public.ai_prompt_templates enable row level security;
alter table public.ai_prompt_versions enable row level security;
alter table public.ai_model_registry enable row level security;
alter table public.ai_gateway_log enable row level security;
alter table public.ai_feedback_entries enable row level security;

create policy "ai_prompt_templates_platform" on public.ai_prompt_templates for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "ai_prompt_versions_platform" on public.ai_prompt_versions for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "ai_model_registry_platform" on public.ai_model_registry for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "ai_gateway_log_platform" on public.ai_gateway_log for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);
create policy "ai_feedback_entries_platform" on public.ai_feedback_entries for all using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('platform_admin', 'super_admin') and account_status = 'active')
);

-- Seed: core prompt templates
insert into public.ai_prompt_templates (prompt_key, name, description, category, template_text, version, confidence_threshold, requires_human_review)
values
  ('hazard_classification', 'Hazard Classification', 'Classifies a described incident or near-miss into OSHA hazard categories with severity scoring.', 'classification',
   'You are a certified safety expert. Classify the following incident description into OSHA hazard categories.\n\nIncident: {{incident_text}}\n\nRespond with:\n- Primary hazard category\n- Severity score (1-10)\n- Recommended corrective actions\n- Confidence level (0.0-1.0)',
   '1.0', 0.80, true),
  ('risk_score_narrative', 'Risk Score Narrative', 'Generates a plain-language narrative explaining a predictive risk score to site supervisors.', 'generation',
   'Explain the following safety risk score to a site supervisor in plain language.\n\nRisk score: {{risk_score}}/100\nTop risk factors: {{risk_factors}}\n\nWrite 2-3 sentences that are clear, actionable, and non-alarming.',
   '1.0', 0.70, false),
  ('ai_output_validation', 'AI Output Validation', 'Validates AI-generated content for structural completeness, referential integrity, and safety compliance before entering workflow.', 'validation',
   'Review the following AI-generated output for a safety platform workflow.\n\nOutput: {{ai_output}}\nExpected schema: {{expected_schema}}\n\nCheck for:\n1. Structural completeness\n2. Referential integrity\n3. Logic consistency\n4. Safety compliance\n5. Nothing missed\n\nReturn: pass/warn/fail with specific issues noted.',
   '1.0', 0.90, true)
on conflict (prompt_key) do nothing;

-- Seed: model registry
insert into public.ai_model_registry (model_key, name, description, model_type, provider, model_id, version, status)
values
  ('gpt4o_primary', 'GPT-4o Primary', 'Primary LLM for all AI commands, document generation, and hazard classification.', 'llm', 'openai', 'gpt-4o', '2024-08', 'production'),
  ('safepredict_v1', 'SafePredict v1', 'Predictive risk scoring model for near-miss forecasting. Trained on OSHA incident datasets.', 'classifier', 'internal', 'safepredict-classifier-v1', '1.0', 'development')
on conflict (model_key) do nothing;
