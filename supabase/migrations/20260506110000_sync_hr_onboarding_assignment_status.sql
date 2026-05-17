with active_required_templates as (
  select id
  from public.hr_document_templates
  where active = true
    and required = true
),
active_profiles as (
  select user_id
  from public.employee_profiles
  where coalesce(profile_status, 'active') = 'active'
)
insert into public.employee_document_assignments (user_id, template_id, status)
select active_profiles.user_id, active_required_templates.id, 'pending'
from active_profiles
cross join active_required_templates
on conflict (user_id, template_id) do nothing;

with active_profiles as (
  select user_id
  from public.employee_profiles
  where coalesce(profile_status, 'active') = 'active'
),
pending_required as (
  select
    active_profiles.user_id,
    count(template.id) as pending_count
  from active_profiles
  left join public.employee_document_assignments assignment
    on assignment.user_id = active_profiles.user_id
    and assignment.status = 'pending'
  left join public.hr_document_templates template
    on template.id = assignment.template_id
    and template.active = true
    and template.required = true
  group by active_profiles.user_id
)
update public.employee_profiles profile
set
  onboarding_status = case when pending_required.pending_count > 0 then 'in_progress' else 'complete' end,
  onboarding_completed_at = case
    when pending_required.pending_count > 0 then null
    else coalesce(profile.onboarding_completed_at, now())
  end,
  updated_at = now()
from pending_required
where profile.user_id = pending_required.user_id;
