insert into public.hr_document_templates
  (title, category, body_text, version, active, required, sort_order)
values
  (
    'Employee Handbook',
    'People / HR',
    $$Purpose
This handbook introduces the core workplace expectations for Reliance Predictive Safety Technologies LLC. It is intended to support onboarding, consistent communication, and responsible day-to-day work. This starter handbook should be reviewed by company leadership, HR, payroll, and legal counsel before it is treated as the final official policy manual.

At-will employment
Unless a separate written agreement signed by an authorized company representative says otherwise, employment is at will. This means either the employee or the company may end the employment relationship at any time, with or without cause or advance notice, as permitted by applicable law. This handbook is not a contract of employment and does not guarantee employment for any specific period.

Equal employment opportunity and respectful workplace
The company expects employment decisions to be based on business needs, qualifications, performance, conduct, and applicable law. Employees are expected to help maintain a respectful workplace free from unlawful discrimination, harassment, retaliation, bullying, intimidation, or abusive conduct.

Anti-harassment and reporting
Harassment, discrimination, and retaliation are not acceptable. Employees should promptly report concerns to their manager, company leadership, HR contact, or another authorized reporting channel. Reports should be made in good faith and with as much useful detail as possible. The company will review concerns and take appropriate action based on the facts.

Professional conduct and communication
Employees are expected to act honestly, communicate professionally, follow lawful and reasonable instructions, protect company and client interests, and use sound judgment when representing the company. Employees should raise questions early when priorities, responsibilities, safety requirements, or client expectations are unclear.

Attendance, availability, and work expectations
Employees are expected to follow their assigned schedule, be available for required work, attend meetings and training when scheduled, and notify the appropriate company contact as soon as practical if they will be late, absent, unavailable, or unable to complete assigned work. Work assignments, schedules, locations, and reporting relationships may change as business needs change.

Timekeeping and payroll basics
Nonexempt employees must accurately record all time worked and must not work off the clock. Employees must promptly report timekeeping errors, missed punches, payroll concerns, or unauthorized work time. Pay, deductions, reimbursements, and direct deposit information must be handled through approved payroll and secure company channels.

Safety and incident reporting
Safety is a shared responsibility. Employees must follow applicable safety rules, complete required training, use appropriate protective equipment when required, and stop or escalate work that appears unsafe. Employees should promptly report injuries, incidents, near misses, hazards, damaged equipment, and safety concerns so the company can respond and improve.

Company systems, acceptable use, and AI output review
Company systems, devices, accounts, software, communication tools, and AI tools must be used for authorized business purposes. Employees must protect passwords and MFA factors, avoid sharing accounts, store work in approved locations, and report suspicious activity. AI-assisted outputs are drafts or decision-support materials and must be reviewed by qualified humans before use as final safety, legal, compliance, client, or operational guidance.

Confidentiality, privacy, client data, and records
Employees may access confidential company, client, employee, safety, financial, product, technical, or operational information. Employees must access only the information needed for assigned work, avoid unnecessary copying or exporting, protect personal and client information, store records in approved systems, and follow company instructions for retention, deletion, and return of company materials.

Conflicts of interest, company property, and expenses
Employees should avoid personal, financial, outside work, vendor, client, or family situations that could interfere with company responsibilities or create the appearance of divided loyalty. Company property and funds must be used responsibly and returned when requested. Expenses must be reasonable, business-related, documented, and submitted through approved channels.

Policy updates
Company policies may be updated, replaced, or withdrawn as business needs and legal requirements change. Employees are responsible for reviewing current policies, asking questions when expectations are unclear, and following the most current company instructions.

Employee acknowledgment
I acknowledge that I have received access to this Employee Handbook, that I am responsible for reading and following current company policies, and that I should ask questions if I do not understand an expectation. I understand that this handbook does not create a contract of employment and that policies may change over time.$$,
    1,
    true,
    true,
    65
  )
on conflict (title, version) do update set
  category = excluded.category,
  body_text = excluded.body_text,
  active = excluded.active,
  required = excluded.required,
  sort_order = excluded.sort_order,
  updated_at = now();

with duplicate_templates as (
  select id
  from public.hr_document_templates
  where title in (
    'Offer / Role Acknowledgment',
    'Employee Handbook Acknowledgment',
    'Confidentiality / IP Assignment',
    'Acceptable Use Policy',
    'Safety / Data Policy Acknowledgment',
    'AI Output Disclaimer',
    'Privacy Acknowledgment',
    'E-Sign Consent',
    'Emergency Contact Form',
    'Tax / Payroll Upload Checklist'
  )
),
removed_pending_assignments as (
  delete from public.employee_document_assignments assignment
  using duplicate_templates template
  where assignment.template_id = template.id
    and assignment.status = 'pending'
  returning assignment.user_id
),
deactivated_templates as (
  update public.hr_document_templates template
  set active = false,
      required = false,
      updated_at = now()
  from duplicate_templates duplicate
  where template.id = duplicate.id
  returning template.id
),
affected_users as (
  select distinct user_id
  from removed_pending_assignments
)
update public.employee_profiles profile
set onboarding_status = case
      when exists (
        select 1
        from public.employee_document_assignments assignment
        join public.hr_document_templates template on template.id = assignment.template_id
        where assignment.user_id = profile.user_id
          and assignment.status = 'pending'
          and template.active = true
          and template.required = true
      ) then 'in_progress'
      else 'complete'
    end,
    onboarding_completed_at = case
      when exists (
        select 1
        from public.employee_document_assignments assignment
        join public.hr_document_templates template on template.id = assignment.template_id
        where assignment.user_id = profile.user_id
          and assignment.status = 'pending'
          and template.active = true
          and template.required = true
      ) then null
      else coalesce(profile.onboarding_completed_at, now())
    end
from affected_users
where profile.user_id = affected_users.user_id;
