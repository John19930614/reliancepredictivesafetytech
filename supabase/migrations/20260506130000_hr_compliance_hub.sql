create table if not exists public.hr_compliance_requirements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  jurisdiction_level text not null default 'company',
  jurisdiction_state text,
  employee_type text not null default 'all',
  category text not null default 'People / HR',
  document_mode text not null default 'acknowledgment',
  official_source_url text,
  due_rule text,
  retention_rule text,
  review_status text not null default 'needs_review',
  active boolean not null default false,
  required boolean not null default true,
  sort_order integer not null default 100,
  last_reviewed_at timestamp with time zone,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.hr_document_templates
  add column if not exists compliance_requirement_id uuid references public.hr_compliance_requirements(id) on delete set null;

alter table public.hr_form_definitions
  add column if not exists compliance_requirement_id uuid references public.hr_compliance_requirements(id) on delete set null;

alter table public.employee_document_assignments
  add column if not exists compliance_requirement_id uuid references public.hr_compliance_requirements(id) on delete set null,
  add column if not exists verification_status text not null default 'not_required',
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamp with time zone,
  add column if not exists rejection_reason text,
  add column if not exists retention_until date,
  add column if not exists legal_hold boolean not null default false;

create table if not exists public.employee_onboarding_uploads (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.employee_document_assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.hr_document_templates(id) on delete restrict,
  compliance_requirement_id uuid references public.hr_compliance_requirements(id) on delete set null,
  file_bucket text not null default 'employee-onboarding-documents',
  file_path text not null unique,
  file_name text not null,
  file_type text not null,
  file_size integer not null,
  file_sha256 text not null,
  upload_status text not null default 'pending_review',
  review_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamp with time zone,
  superseded_by uuid references public.employee_onboarding_uploads(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists idx_hr_compliance_requirements_scope
  on public.hr_compliance_requirements (jurisdiction_level, jurisdiction_state, active, review_status);

create index if not exists idx_employee_assignments_requirement
  on public.employee_document_assignments (compliance_requirement_id);

create index if not exists idx_employee_assignments_verification
  on public.employee_document_assignments (user_id, status, verification_status);

create index if not exists idx_employee_onboarding_uploads_assignment
  on public.employee_onboarding_uploads (assignment_id, upload_status);

drop trigger if exists set_hr_compliance_requirements_updated_at on public.hr_compliance_requirements;
create trigger set_hr_compliance_requirements_updated_at
before update on public.hr_compliance_requirements
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_onboarding_uploads_updated_at on public.employee_onboarding_uploads;
create trigger set_employee_onboarding_uploads_updated_at
before update on public.employee_onboarding_uploads
for each row execute function public.set_updated_at();

alter table public.hr_compliance_requirements enable row level security;
alter table public.employee_onboarding_uploads enable row level security;

drop policy if exists "Employees can read assigned active compliance requirements" on public.hr_compliance_requirements;
create policy "Employees can read assigned active compliance requirements"
on public.hr_compliance_requirements
for select
to authenticated
using (
  public.is_company_portal_admin()
  or (
    active
    and exists (
      select 1
      from public.employee_document_assignments assignment
      join public.hr_document_templates template
        on template.id = assignment.template_id
      where assignment.user_id = (select auth.uid())
        and (
          assignment.compliance_requirement_id = hr_compliance_requirements.id
          or template.compliance_requirement_id = hr_compliance_requirements.id
        )
    )
  )
);

drop policy if exists "Admins can manage compliance requirements" on public.hr_compliance_requirements;
create policy "Admins can manage compliance requirements"
on public.hr_compliance_requirements
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read own onboarding uploads" on public.employee_onboarding_uploads;
create policy "Employees can read own onboarding uploads"
on public.employee_onboarding_uploads
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Employees can create own onboarding uploads" on public.employee_onboarding_uploads;
create policy "Employees can create own onboarding uploads"
on public.employee_onboarding_uploads
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.employee_document_assignments assignment
    where assignment.id = employee_onboarding_uploads.assignment_id
      and assignment.user_id = (select auth.uid())
      and assignment.status = 'pending'
  )
);

drop policy if exists "Admins can manage onboarding uploads" on public.employee_onboarding_uploads;
create policy "Admins can manage onboarding uploads"
on public.employee_onboarding_uploads
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can view own onboarding files" on storage.objects;
create policy "Employees can view own onboarding files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-onboarding-documents'
  and (
    public.is_company_portal_admin()
    or exists (
      select 1
      from public.employee_signed_documents document
      where document.file_bucket = storage.objects.bucket_id
        and document.file_path = storage.objects.name
        and document.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.employee_onboarding_uploads upload
      where upload.file_bucket = storage.objects.bucket_id
        and upload.file_path = storage.objects.name
        and upload.user_id = (select auth.uid())
    )
  )
);

insert into public.hr_compliance_requirements (
  slug,
  title,
  jurisdiction_level,
  jurisdiction_state,
  employee_type,
  category,
  document_mode,
  official_source_url,
  due_rule,
  retention_rule,
  review_status,
  active,
  required,
  sort_order,
  last_reviewed_at,
  review_notes
)
values
  ('federal-i9-section-1', 'Federal Form I-9 Section 1', 'federal', null, 'employee', 'Federal Compliance', 'fillable_form', 'https://www.uscis.gov/i-9', 'Employee Section 1 no later than first day of employment; employer Section 2 within three business days.', 'Retain Form I-9 for three years after hire or one year after employment ends, whichever is later.', 'reviewed', true, true, 10, now(), 'Rev. 08/01/2023 remains the valid I-9 revision; use the 05/31/2027 expiration version by August 1, 2026.'),
  ('federal-i9-identity-document-upload', 'I-9 Identity and Work Authorization Document Review Upload', 'federal', null, 'employee', 'Federal Compliance', 'upload', 'https://www.uscis.gov/i-9-central/form-i-9-acceptable-documents', 'Employee presents acceptable documents; HR/admin verifies and records review within the I-9 workflow.', 'Retain only if company policy requires copies; if retained, keep with the Form I-9 for the I-9 retention period.', 'reviewed', true, true, 15, now(), 'Upload is an internal evidence workflow and does not replace employer document inspection.'),
  ('federal-w4-employee-withholding', 'Federal Form W-4 Employee Withholding', 'federal', null, 'employee', 'Payroll / Tax', 'fillable_form', 'https://www.irs.gov/forms-pubs/about-form-w-4', 'Collect before payroll is processed; withhold using IRS default treatment if no valid W-4 is provided.', 'Keep employment tax records, including withholding certificates, for at least four years.', 'reviewed', true, true, 20, now(), 'Confirm current W-4 language with payroll provider before production use.'),
  ('texas-new-hire-reporting', 'Texas New Hire Reporting Worksheet', 'state', 'TX', 'employee', 'State Compliance', 'fillable_form', 'https://www.twc.texas.gov/employer-resources/new-hire-reporting', 'Texas new hires and rehires generally must be reported within 20 calendar days.', 'Retain as payroll/compliance support according to company retention schedule.', 'reviewed', true, true, 30, now(), 'State-specific active requirement for Texas starting operations.'),
  ('employee-profile-emergency-contact', 'Employee Personal Information and Emergency Contact Form', 'company', null, 'all', 'People / HR', 'fillable_form', null, 'Collect during onboarding and update when information changes.', 'Retain while active and according to personnel record retention policy after separation.', 'reviewed', true, true, 40, now(), 'Company-controlled onboarding record.'),
  ('offer-role-acknowledgment', 'Offer and Role Acknowledgment', 'company', null, 'all', 'People / HR', 'fillable_form', null, 'Collect before or at start of work.', 'Retain with personnel record.', 'reviewed', true, true, 50, now(), 'Attorney/payroll review recommended before relying on final language.'),
  ('direct-deposit-authorization', 'Direct Deposit Authorization', 'company', null, 'employee', 'Payroll / Tax', 'fillable_form', null, 'Collect only through secure onboarding or payroll channel before direct deposit setup.', 'Retain according to payroll and banking authorization policy.', 'reviewed', true, true, 60, now(), 'Sensitive banking record; restrict admin access.'),
  ('employee-handbook-acknowledgment', 'Employee Handbook Acknowledgment', 'company', null, 'all', 'People / HR', 'fillable_form', null, 'Collect when handbook/policy packet is issued or materially updated.', 'Retain with personnel record.', 'reviewed', true, true, 70, now(), 'Attorney review recommended for final handbook language.'),
  ('confidentiality-ip-assignment', 'Confidentiality and IP Assignment Agreement', 'company', null, 'all', 'Legal / People', 'fillable_form', null, 'Collect before access to company confidential information or work product creation.', 'Retain with personnel/legal record.', 'reviewed', true, true, 80, now(), 'Attorney review recommended before production reliance.'),
  ('acceptable-use-information-security', 'Acceptable Use and Information Security Policy', 'company', null, 'all', 'Technology / Security', 'fillable_form', null, 'Collect before account/device/data access.', 'Retain while access is active and according to security policy.', 'reviewed', true, true, 90, now(), 'Company security control acknowledgment.'),
  ('safety-ai-output-acknowledgment', 'Safety-Critical Data and AI Output Acknowledgment', 'company', null, 'all', 'Safety / Data', 'fillable_form', null, 'Collect before safety-critical document, AI output, or client data work.', 'Retain with training/policy acknowledgment record.', 'reviewed', true, true, 100, now(), 'Supports safety-critical human review control.'),
  ('employee-privacy-data-handling', 'Employee Privacy and Data Handling Acknowledgment', 'company', null, 'all', 'Privacy', 'fillable_form', null, 'Collect before access to employee, client, or company personal data.', 'Retain with privacy/security acknowledgment record.', 'reviewed', true, true, 110, now(), 'Company privacy acknowledgment.'),
  ('electronic-records-esign-consent', 'Electronic Records and E-Sign Consent', 'company', null, 'all', 'Legal / People', 'fillable_form', null, 'Collect before electronic onboarding signatures are accepted.', 'Retain with electronic records and signature evidence.', 'reviewed', true, true, 120, now(), 'Attorney review recommended for final e-sign consent language.'),
  ('payroll-benefits-required-upload-checklist', 'Payroll, Benefits, and Required Document Upload Checklist', 'company', null, 'employee', 'Payroll / Tax', 'upload', null, 'Use for payroll, benefits, or offline records that must be uploaded and reviewed.', 'Retain according to payroll, benefits, and personnel record retention policy.', 'reviewed', true, true, 130, now(), 'Use uploads for official PDFs or provider-generated forms that should not be re-created as website text.')
on conflict (slug) do update set
  title = excluded.title,
  jurisdiction_level = excluded.jurisdiction_level,
  jurisdiction_state = excluded.jurisdiction_state,
  employee_type = excluded.employee_type,
  category = excluded.category,
  document_mode = excluded.document_mode,
  official_source_url = excluded.official_source_url,
  due_rule = excluded.due_rule,
  retention_rule = excluded.retention_rule,
  review_status = excluded.review_status,
  active = excluded.active,
  required = excluded.required,
  sort_order = excluded.sort_order,
  last_reviewed_at = excluded.last_reviewed_at,
  review_notes = excluded.review_notes,
  updated_at = now();

insert into public.hr_compliance_requirements (
  slug,
  title,
  jurisdiction_level,
  jurisdiction_state,
  employee_type,
  category,
  document_mode,
  due_rule,
  retention_rule,
  review_status,
  active,
  required,
  sort_order,
  review_notes
)
select
  'state-' || lower(state_code) || '-onboarding-compliance-review',
  'State onboarding compliance review - ' || state_name,
  'state',
  state_code,
  'all',
  'State Compliance',
  'review_catalog',
  'Admin, legal, or payroll review required before activation for employees working in ' || state_name || '.',
  'Set retention after reviewing state-specific payroll, tax, personnel, and notice requirements.',
  'needs_review',
  false,
  true,
  500 + ordinal,
  'Inactive state placeholder. Add official source URL, due rule, retention rule, and reviewed date before activation.'
from (
  values
    ('AL', 'Alabama', 1), ('AK', 'Alaska', 2), ('AZ', 'Arizona', 3), ('AR', 'Arkansas', 4),
    ('CA', 'California', 5), ('CO', 'Colorado', 6), ('CT', 'Connecticut', 7), ('DE', 'Delaware', 8),
    ('DC', 'District of Columbia', 9), ('FL', 'Florida', 10), ('GA', 'Georgia', 11), ('HI', 'Hawaii', 12),
    ('ID', 'Idaho', 13), ('IL', 'Illinois', 14), ('IN', 'Indiana', 15), ('IA', 'Iowa', 16),
    ('KS', 'Kansas', 17), ('KY', 'Kentucky', 18), ('LA', 'Louisiana', 19), ('ME', 'Maine', 20),
    ('MD', 'Maryland', 21), ('MA', 'Massachusetts', 22), ('MI', 'Michigan', 23), ('MN', 'Minnesota', 24),
    ('MS', 'Mississippi', 25), ('MO', 'Missouri', 26), ('MT', 'Montana', 27), ('NE', 'Nebraska', 28),
    ('NV', 'Nevada', 29), ('NH', 'New Hampshire', 30), ('NJ', 'New Jersey', 31), ('NM', 'New Mexico', 32),
    ('NY', 'New York', 33), ('NC', 'North Carolina', 34), ('ND', 'North Dakota', 35), ('OH', 'Ohio', 36),
    ('OK', 'Oklahoma', 37), ('OR', 'Oregon', 38), ('PA', 'Pennsylvania', 39), ('RI', 'Rhode Island', 40),
    ('SC', 'South Carolina', 41), ('SD', 'South Dakota', 42), ('TN', 'Tennessee', 43), ('TX', 'Texas', 44),
    ('UT', 'Utah', 45), ('VT', 'Vermont', 46), ('VA', 'Virginia', 47), ('WA', 'Washington', 48),
    ('WV', 'West Virginia', 49), ('WI', 'Wisconsin', 50), ('WY', 'Wyoming', 51)
) as states(state_code, state_name, ordinal)
on conflict (slug) do nothing;

insert into public.hr_document_templates
  (title, category, body_text, version, active, required, sort_order, compliance_requirement_id)
select
  'I-9 Identity and Work Authorization Document Review Upload',
  'Federal Compliance',
  $$Purpose
This upload slot captures restricted evidence that HR/admin requested for the Form I-9 document review process.

Employee requirement
Upload only the identity and employment authorization document copies requested by the company representative, or complete this item in person if HR instructs you not to upload copies.

Admin requirement
Review the upload, confirm it belongs to the employee and the I-9 workflow, then approve or reject it. This upload does not replace required employer inspection and Section 2 completion.$$,
  1,
  true,
  true,
  15,
  requirement.id
from public.hr_compliance_requirements requirement
where requirement.slug = 'federal-i9-identity-document-upload'
on conflict (title, version) do update set
  category = excluded.category,
  body_text = excluded.body_text,
  active = excluded.active,
  required = excluded.required,
  sort_order = excluded.sort_order,
  compliance_requirement_id = excluded.compliance_requirement_id,
  updated_at = now();

update public.hr_document_templates template
set compliance_requirement_id = requirement.id
from public.hr_compliance_requirements requirement
where (
  (template.title = 'Federal Form I-9 Employment Eligibility Checklist' and requirement.slug = 'federal-i9-section-1')
  or (template.title = 'Federal Form W-4 Employee Withholding Checklist' and requirement.slug = 'federal-w4-employee-withholding')
  or (template.title = 'Texas New Hire Reporting Worksheet' and requirement.slug = 'texas-new-hire-reporting')
  or (template.title = 'Employee Personal Information and Emergency Contact Form' and requirement.slug = 'employee-profile-emergency-contact')
  or (template.title = 'Offer and Role Acknowledgment' and requirement.slug = 'offer-role-acknowledgment')
  or (template.title = 'Direct Deposit Authorization' and requirement.slug = 'direct-deposit-authorization')
  or (template.title = 'Employee Handbook Acknowledgment' and requirement.slug = 'employee-handbook-acknowledgment')
  or (template.title = 'Confidentiality and IP Assignment Agreement' and requirement.slug = 'confidentiality-ip-assignment')
  or (template.title = 'Acceptable Use and Information Security Policy' and requirement.slug = 'acceptable-use-information-security')
  or (template.title = 'Safety-Critical Data and AI Output Acknowledgment' and requirement.slug = 'safety-ai-output-acknowledgment')
  or (template.title = 'Employee Privacy and Data Handling Acknowledgment' and requirement.slug = 'employee-privacy-data-handling')
  or (template.title = 'Electronic Records and E-Sign Consent' and requirement.slug = 'electronic-records-esign-consent')
  or (template.title = 'Payroll, Benefits, and Required Document Upload Checklist' and requirement.slug = 'payroll-benefits-required-upload-checklist')
);

update public.hr_form_definitions definition
set compliance_requirement_id = requirement.id
from public.hr_compliance_requirements requirement
where definition.slug = requirement.slug;

update public.hr_document_templates template
set compliance_requirement_id = requirement.id
from public.hr_compliance_requirements requirement
where template.title = 'Payroll, Benefits, and Required Document Upload Checklist'
  and requirement.slug = 'payroll-benefits-required-upload-checklist';

update public.employee_document_assignments assignment
set
  compliance_requirement_id = template.compliance_requirement_id,
  verification_status = case
    when assignment.status = 'waived' then 'waived'
    when assignment.status = 'signed' then 'approved'
    when requirement.document_mode = 'upload' then 'not_submitted'
    else 'not_required'
  end
from public.hr_document_templates template
left join public.hr_compliance_requirements requirement
  on requirement.id = template.compliance_requirement_id
where assignment.template_id = template.id
  and assignment.compliance_requirement_id is null;
