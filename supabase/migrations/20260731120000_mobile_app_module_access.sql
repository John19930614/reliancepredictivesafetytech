-- Mobile App module access
--
-- Adds the `mobile_app` module key that gates the installable phone app at /m.
--
-- portal_user_module_access_module_key_check has drifted behind
-- lib/user-management.ts: employee_expenses, reports, payroll_tracker,
-- client_proposals, employee_mail, performance_reviews, ai_document_builder,
-- legal_register and every platform_* key are already in the catalog but were
-- never added to the constraint, so super admins currently cannot grant them.
-- This migration regenerates the constraint from the full catalog, which fixes
-- that drift as well as adding mobile_app.
--
-- ROLLBACK
--   1. delete from public.portal_user_module_access where module_key = 'mobile_app';
--   2. Re-apply the constraint from 20260519120000_portal_user_module_access.sql.
-- Both steps are safe to run at any time; no data outside this table is touched.

alter table public.portal_user_module_access
  drop constraint if exists portal_user_module_access_module_key_check;

alter table public.portal_user_module_access
  add constraint portal_user_module_access_module_key_check
  check (
    module_key in (
      'dashboard',
      'mobile_app',
      'ai_command',
      'website_operations',
      'work_management',
      'parking_lots',
      'employee_expenses',
      'reports',
      'finance',
      'payroll_tracker',
      'operations_database',
      'startup_checklist',
      'demo_showcase',
      'request_inbox',
      'sales_pipeline',
      'client_proposals',
      'active_companies',
      'employee_mail',
      'company_tree',
      'hr_onboarding',
      'training',
      'performance_reviews',
      'hr_documents',
      'time_cards',
      'employee_calendar',
      'master_document_library',
      'ai_document_builder',
      'legal_issues',
      'legal_register',
      'required_documents',
      'launch_gate',
      'users',
      'settings',
      'platform_sprint',
      'platform_releases',
      'platform_qa',
      'platform_metrics',
      'platform_docs',
      'platform_packages',
      'platform_billing',
      'platform_audit',
      'platform_ai_services',
      'platform_infrastructure',
      'platform_dev_command'
    )
  );

-- Backfill: anyone who already holds at least one portal module grant gets the
-- phone version of that same access. This widens nothing on its own — each tab
-- inside /m re-checks the desktop module that owns its data (parking_lots for
-- Ideas, sales_pipeline for Leads). Owner roles bypass grants entirely.
insert into public.portal_user_module_access (user_id, module_key)
select distinct access.user_id, 'mobile_app'
from public.portal_user_module_access access
on conflict (user_id, module_key) do nothing;
