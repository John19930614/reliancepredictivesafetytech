create table if not exists public.hr_form_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null default 'People / HR',
  description text,
  jurisdiction_type text not null default 'company',
  jurisdiction_code text not null default 'company',
  applies_to_state text,
  form_source_url text,
  official_form_name text,
  official_form_edition text,
  official_form_expiration_date date,
  field_schema jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  required boolean not null default true,
  sensitive boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.hr_document_templates
  add column if not exists form_definition_id uuid references public.hr_form_definitions(id) on delete set null;

create table if not exists public.employee_form_responses (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.employee_document_assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.hr_document_templates(id) on delete restrict,
  form_definition_id uuid not null references public.hr_form_definitions(id) on delete restrict,
  status text not null default 'draft',
  answers jsonb not null default '{}'::jsonb,
  form_version integer not null,
  form_snapshot jsonb not null,
  signed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (assignment_id)
);

create table if not exists public.employee_signed_documents (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.employee_document_assignments(id) on delete cascade,
  response_id uuid not null references public.employee_form_responses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.hr_document_templates(id) on delete restrict,
  form_definition_id uuid not null references public.hr_form_definitions(id) on delete restrict,
  file_bucket text not null default 'employee-onboarding-documents',
  file_path text not null,
  file_name text not null,
  file_type text not null default 'application/pdf',
  file_sha256 text not null,
  form_snapshot jsonb not null,
  answer_snapshot jsonb not null,
  typed_legal_name text not null,
  signer_email text,
  signer_ip text,
  signer_user_agent text,
  signed_at timestamp with time zone not null default now(),
  created_at timestamp with time zone default now(),
  unique (assignment_id),
  unique (file_path)
);

create table if not exists public.employee_onboarding_audit_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.employee_document_assignments(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_details jsonb not null default '{}'::jsonb,
  signer_ip text,
  signer_user_agent text,
  created_at timestamp with time zone default now()
);

drop trigger if exists set_hr_form_definitions_updated_at on public.hr_form_definitions;
create trigger set_hr_form_definitions_updated_at
before update on public.hr_form_definitions
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_form_responses_updated_at on public.employee_form_responses;
create trigger set_employee_form_responses_updated_at
before update on public.employee_form_responses
for each row execute function public.set_updated_at();

alter table public.hr_form_definitions enable row level security;
alter table public.employee_form_responses enable row level security;
alter table public.employee_signed_documents enable row level security;
alter table public.employee_onboarding_audit_events enable row level security;

drop policy if exists "Employees can read active assigned HR form definitions" on public.hr_form_definitions;
create policy "Employees can read active assigned HR form definitions"
on public.hr_form_definitions
for select
to authenticated
using (
  public.is_company_portal_admin()
  or (
    active
    and exists (
      select 1
      from public.hr_document_templates template
      join public.employee_document_assignments assignment
        on assignment.template_id = template.id
      where template.form_definition_id = hr_form_definitions.id
        and assignment.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "Admins can manage HR form definitions" on public.hr_form_definitions;
create policy "Admins can manage HR form definitions"
on public.hr_form_definitions
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read own HR form responses" on public.employee_form_responses;
create policy "Employees can read own HR form responses"
on public.employee_form_responses
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Employees can create own pending HR form responses" on public.employee_form_responses;
create policy "Employees can create own pending HR form responses"
on public.employee_form_responses
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.employee_document_assignments assignment
    where assignment.id = employee_form_responses.assignment_id
      and assignment.user_id = (select auth.uid())
      and assignment.template_id = employee_form_responses.template_id
      and assignment.status = 'pending'
  )
);

drop policy if exists "Employees can update own draft HR form responses" on public.employee_form_responses;
create policy "Employees can update own draft HR form responses"
on public.employee_form_responses
for update
to authenticated
using (
  public.is_company_portal_admin()
  or (
    user_id = (select auth.uid())
    and status = 'draft'
    and exists (
      select 1
      from public.employee_document_assignments assignment
      where assignment.id = employee_form_responses.assignment_id
        and assignment.status = 'pending'
    )
  )
)
with check (
  public.is_company_portal_admin()
  or (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.employee_document_assignments assignment
      where assignment.id = employee_form_responses.assignment_id
        and assignment.status = 'pending'
    )
  )
);

drop policy if exists "Employees can read own signed onboarding documents" on public.employee_signed_documents;
create policy "Employees can read own signed onboarding documents"
on public.employee_signed_documents
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Admins can manage signed onboarding documents" on public.employee_signed_documents;
create policy "Admins can manage signed onboarding documents"
on public.employee_signed_documents
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read own onboarding audit events" on public.employee_onboarding_audit_events;
create policy "Employees can read own onboarding audit events"
on public.employee_onboarding_audit_events
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Admins can manage onboarding audit events" on public.employee_onboarding_audit_events;
create policy "Admins can manage onboarding audit events"
on public.employee_onboarding_audit_events
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

insert into storage.buckets (id, name, public)
values ('employee-onboarding-documents', 'employee-onboarding-documents', false)
on conflict (id) do update set public = false;

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
  )
);

drop policy if exists "Admins can manage onboarding files" on storage.objects;
create policy "Admins can manage onboarding files"
on storage.objects
for all
to authenticated
using (bucket_id = 'employee-onboarding-documents' and public.is_company_portal_admin())
with check (bucket_id = 'employee-onboarding-documents' and public.is_company_portal_admin());

insert into public.hr_form_definitions (
  slug,
  title,
  category,
  description,
  jurisdiction_type,
  jurisdiction_code,
  applies_to_state,
  form_source_url,
  official_form_name,
  official_form_edition,
  official_form_expiration_date,
  field_schema,
  active,
  required,
  sensitive,
  sort_order
)
values
  (
    'federal-i9-section-1',
    'Federal Form I-9 Section 1',
    'Federal Compliance',
    'Employee information and attestation for Form I-9. Employer Section 2 must still be completed after document review.',
    'federal',
    'US',
    null,
    'https://www.uscis.gov/i-9',
    'Form I-9 Employment Eligibility Verification',
    '01/20/25',
    '2027-05-31',
    $$[
      {"name":"last_name","label":"Last name","type":"text","required":true,"section":"Employee information"},
      {"name":"first_name","label":"First name","type":"text","required":true,"section":"Employee information"},
      {"name":"middle_initial","label":"Middle initial","type":"text","section":"Employee information"},
      {"name":"other_last_names","label":"Other last names used","type":"text","section":"Employee information"},
      {"name":"address","label":"Current home address","type":"address","required":true,"section":"Employee information"},
      {"name":"date_of_birth","label":"Date of birth","type":"date","required":true,"section":"Employee information","sensitive":true},
      {"name":"ssn","label":"Social Security number","type":"ssn","section":"Employee information","sensitive":true},
      {"name":"email","label":"Email address","type":"email","section":"Employee information"},
      {"name":"phone","label":"Phone number","type":"phone","section":"Employee information"},
      {"name":"citizenship_status","label":"Citizenship or immigration status attestation","type":"radio","required":true,"section":"Attestation","options":["A citizen of the United States","A noncitizen national of the United States","A lawful permanent resident","An alien authorized to work"]},
      {"name":"uscis_or_a_number","label":"USCIS or A-number, if applicable","type":"text","section":"Attestation","sensitive":true},
      {"name":"work_authorization_expiration","label":"Work authorization expiration, if applicable","type":"date","section":"Attestation"},
      {"name":"used_preparer","label":"A preparer or translator helped me complete this form","type":"checkbox","section":"Preparer/translator"}
    ]$$::jsonb,
    true,
    true,
    true,
    10
  ),
  (
    'federal-w4-employee-withholding',
    'Federal Form W-4 Employee Withholding',
    'Payroll / Tax',
    'Employee withholding certificate information used by payroll to calculate federal income tax withholding.',
    'federal',
    'US',
    null,
    'https://www.irs.gov/forms-pubs/about-form-w-4',
    'Form W-4 Employee Withholding Certificate',
    '2026 current revision',
    null,
    $$[
      {"name":"filing_status","label":"Filing status","type":"radio","required":true,"section":"Step 1","options":["Single or married filing separately","Married filing jointly or qualifying surviving spouse","Head of household"]},
      {"name":"multiple_jobs_or_spouse_works","label":"Multiple jobs or spouse works","type":"checkbox","section":"Step 2"},
      {"name":"dependents_under_17_amount","label":"Credit for children under age 17","type":"currency","section":"Step 3"},
      {"name":"other_dependents_amount","label":"Credit for other dependents","type":"currency","section":"Step 3"},
      {"name":"other_income","label":"Other income, not from jobs","type":"currency","section":"Step 4"},
      {"name":"deductions","label":"Deductions","type":"currency","section":"Step 4"},
      {"name":"extra_withholding","label":"Extra withholding per pay period","type":"currency","section":"Step 4"}
    ]$$::jsonb,
    true,
    true,
    true,
    20
  ),
  (
    'texas-new-hire-reporting',
    'Texas New Hire Reporting Worksheet',
    'State Compliance',
    'Texas employer new hire reporting worksheet. Texas employers generally report required new hire details within 20 calendar days.',
    'state',
    'TX',
    'TX',
    'https://www.twc.texas.gov/employer-resources/new-hire-reporting',
    'Texas New Hire Reporting',
    '2026 current guidance',
    null,
    $$[
      {"name":"employee_legal_name","label":"Employee legal name","type":"text","required":true,"section":"Employee"},
      {"name":"employee_ssn","label":"Employee Social Security number","type":"ssn","required":true,"section":"Employee","sensitive":true},
      {"name":"employee_address","label":"Employee home address","type":"address","required":true,"section":"Employee"},
      {"name":"first_day_of_paid_work","label":"First day of paid work","type":"date","required":true,"section":"Employment"},
      {"name":"work_state","label":"Work state","type":"select","required":true,"section":"Employment","options":["TX","Other"]},
      {"name":"employer_fein","label":"Employer FEIN","type":"text","section":"Employer"},
      {"name":"employer_address","label":"Employer address","type":"address","section":"Employer"}
    ]$$::jsonb,
    true,
    true,
    true,
    30
  ),
  (
    'employee-profile-emergency-contact',
    'Employee Personal Information and Emergency Contact Form',
    'People / HR',
    'Employee contact, work location, and emergency contact record.',
    'company',
    'company',
    null,
    null,
    null,
    '1',
    null,
    $$[
      {"name":"legal_name","label":"Legal name","type":"text","required":true,"section":"Employee"},
      {"name":"preferred_name","label":"Preferred display name","type":"text","section":"Employee"},
      {"name":"personal_email","label":"Personal email","type":"email","section":"Employee"},
      {"name":"phone","label":"Phone number","type":"phone","required":true,"section":"Employee"},
      {"name":"mailing_address","label":"Mailing address","type":"address","required":true,"section":"Employee"},
      {"name":"work_location","label":"Expected work location","type":"text","section":"Employee"},
      {"name":"emergency_contact_name","label":"Emergency contact name","type":"text","required":true,"section":"Emergency contact"},
      {"name":"emergency_contact_phone","label":"Emergency contact phone","type":"phone","required":true,"section":"Emergency contact"},
      {"name":"emergency_contact_relationship","label":"Relationship","type":"text","required":true,"section":"Emergency contact"},
      {"name":"alternate_emergency_contact","label":"Alternate emergency contact","type":"text","section":"Emergency contact"}
    ]$$::jsonb,
    true,
    true,
    true,
    40
  ),
  (
    'offer-role-acknowledgment',
    'Offer and Role Acknowledgment',
    'People / HR',
    'Role, classification, work expectations, at-will acknowledgment, and timekeeping expectations.',
    'company',
    'company',
    null,
    null,
    null,
    '1',
    null,
    $$[
      {"name":"position_title","label":"Position title","type":"text","required":true,"section":"Role"},
      {"name":"department","label":"Department or team","type":"text","section":"Role"},
      {"name":"manager_or_reporting_contact","label":"Manager or reporting contact","type":"text","section":"Role"},
      {"name":"employment_classification","label":"Employment classification","type":"select","required":true,"section":"Role","options":["Full-time","Part-time","Contract","Internship","Temporary"]},
      {"name":"pay_basis","label":"Pay basis","type":"select","required":true,"section":"Compensation","options":["Hourly","Salary","Contract","Unpaid"]},
      {"name":"start_date","label":"Start date","type":"date","required":true,"section":"Role"},
      {"name":"acknowledge_at_will","label":"I understand employment is at will unless a separate signed agreement says otherwise.","type":"checkbox","required":true,"section":"Acknowledgment"},
      {"name":"acknowledge_timekeeping","label":"I understand and agree to follow company timekeeping expectations.","type":"checkbox","required":true,"section":"Acknowledgment"}
    ]$$::jsonb,
    true,
    true,
    true,
    50
  ),
  (
    'direct-deposit-authorization',
    'Direct Deposit Authorization',
    'Payroll / Tax',
    'Authorization for payroll deposits and corrections to the account provided by the employee.',
    'company',
    'company',
    null,
    null,
    null,
    '1',
    null,
    $$[
      {"name":"account_holder_name","label":"Account holder name","type":"text","required":true,"section":"Account","sensitive":true},
      {"name":"bank_name","label":"Bank or credit union name","type":"text","required":true,"section":"Account","sensitive":true},
      {"name":"routing_number","label":"Routing number","type":"text","required":true,"section":"Account","sensitive":true},
      {"name":"account_number","label":"Account number","type":"text","required":true,"section":"Account","sensitive":true},
      {"name":"account_type","label":"Account type","type":"radio","required":true,"section":"Account","options":["Checking","Savings"]},
      {"name":"deposit_instruction","label":"Deposit instruction","type":"select","required":true,"section":"Account","options":["Deposit full net pay","Deposit fixed amount","Deposit percentage"]},
      {"name":"authorization_confirmed","label":"I authorize Reliance and its payroll provider to initiate payroll deposits and correct deposit errors if necessary.","type":"checkbox","required":true,"section":"Authorization"}
    ]$$::jsonb,
    true,
    true,
    true,
    60
  ),
  (
    'employee-handbook-acknowledgment',
    'Employee Handbook Acknowledgment',
    'People / HR',
    'Acknowledgment of handbook or policy packet access and responsibility to follow current policies.',
    'company',
    'company',
    null,
    null,
    null,
    '1',
    null,
    $$[
      {"name":"received_handbook","label":"I have received access to the employee handbook or current policy packet.","type":"checkbox","required":true,"section":"Acknowledgment"},
      {"name":"understand_responsibility","label":"I understand I am responsible for reading and following company policies.","type":"checkbox","required":true,"section":"Acknowledgment"},
      {"name":"understand_no_contract","label":"I understand the handbook does not create a contract of employment.","type":"checkbox","required":true,"section":"Acknowledgment"}
    ]$$::jsonb,
    true,
    true,
    false,
    70
  ),
  (
    'confidentiality-ip-assignment',
    'Confidentiality and IP Assignment Agreement',
    'Legal / People',
    'Confidentiality, return of company materials, and work product ownership acknowledgment.',
    'company',
    'company',
    null,
    null,
    null,
    '1',
    null,
    $$[
      {"name":"protect_confidential_information","label":"I agree to protect company, client, employee, technical, business, and safety information.","type":"checkbox","required":true,"section":"Confidentiality"},
      {"name":"authorized_use_only","label":"I agree to use confidential information only for authorized company work.","type":"checkbox","required":true,"section":"Confidentiality"},
      {"name":"return_materials","label":"I agree to return company materials when requested or when my work ends.","type":"checkbox","required":true,"section":"Confidentiality"},
      {"name":"assign_work_product","label":"To the extent permitted by law, I agree company work product created in the scope of work belongs to Reliance.","type":"checkbox","required":true,"section":"Work product"}
    ]$$::jsonb,
    true,
    true,
    false,
    80
  ),
  (
    'acceptable-use-information-security',
    'Acceptable Use and Information Security Policy',
    'Technology / Security',
    'Technology, account, password, MFA, AI tool, and data handling responsibilities.',
    'company',
    'company',
    null,
    null,
    null,
    '1',
    null,
    $$[
      {"name":"authorized_system_use","label":"I will use company systems only for authorized work.","type":"checkbox","required":true,"section":"Systems"},
      {"name":"protect_credentials","label":"I will protect passwords, MFA factors, devices, and accounts.","type":"checkbox","required":true,"section":"Systems"},
      {"name":"no_account_sharing","label":"I will not share company accounts or credentials.","type":"checkbox","required":true,"section":"Systems"},
      {"name":"report_security_incidents","label":"I will report suspicious activity or suspected security incidents promptly.","type":"checkbox","required":true,"section":"Reporting"}
    ]$$::jsonb,
    true,
    true,
    false,
    90
  ),
  (
    'safety-ai-output-acknowledgment',
    'Safety-Critical Data and AI Output Acknowledgment',
    'Safety / Data',
    'Acknowledgment that safety-critical data and AI-assisted outputs require qualified human review.',
    'company',
    'company',
    null,
    null,
    null,
    '1',
    null,
    $$[
      {"name":"accurate_safety_records","label":"I understand safety-critical records must be accurate and protected.","type":"checkbox","required":true,"section":"Safety data"},
      {"name":"human_review_required","label":"I understand AI-assisted outputs are drafts or decision-support materials requiring qualified human review.","type":"checkbox","required":true,"section":"AI output"},
      {"name":"no_unreviewed_final_advice","label":"I will not present AI-assisted output as final safety, legal, compliance, or operational advice without required review.","type":"checkbox","required":true,"section":"AI output"}
    ]$$::jsonb,
    true,
    true,
    false,
    100
  ),
  (
    'employee-privacy-data-handling',
    'Employee Privacy and Data Handling Acknowledgment',
    'Privacy',
    'Personal information, client data, business record, retention, and incident reporting responsibilities.',
    'company',
    'company',
    null,
    null,
    null,
    '1',
    null,
    $$[
      {"name":"access_minimum_needed","label":"I will access only the information needed for assigned work.","type":"checkbox","required":true,"section":"Access"},
      {"name":"avoid_unapproved_exports","label":"I will avoid unnecessary copying, downloads, or exports of employee, client, or company data.","type":"checkbox","required":true,"section":"Access"},
      {"name":"follow_retention","label":"I will follow company retention and deletion instructions.","type":"checkbox","required":true,"section":"Retention"},
      {"name":"report_privacy_incidents","label":"I will report suspected privacy or data incidents promptly.","type":"checkbox","required":true,"section":"Reporting"}
    ]$$::jsonb,
    true,
    true,
    false,
    110
  ),
  (
    'electronic-records-esign-consent',
    'Electronic Records and E-Sign Consent',
    'Legal / People',
    'Consent to use electronic records and electronic signatures for employee onboarding and internal acknowledgments.',
    'company',
    'company',
    null,
    null,
    null,
    '1',
    null,
    $$[
      {"name":"can_access_records","label":"I can access electronic records through the Reliance website and approved company systems.","type":"checkbox","required":true,"section":"Consent"},
      {"name":"agree_electronic_records","label":"I agree to receive applicable onboarding records, notices, and acknowledgments electronically.","type":"checkbox","required":true,"section":"Consent"},
      {"name":"agree_electronic_signature","label":"I agree that typing my legal name, checking consent boxes, or using the approved e-sign process may create an electronic signature.","type":"checkbox","required":true,"section":"Consent"},
      {"name":"paper_copy_notice","label":"I will notify the company if I need a paper copy or cannot access an electronic document.","type":"checkbox","required":true,"section":"Consent"}
    ]$$::jsonb,
    true,
    true,
    false,
    120
  )
on conflict (slug) do update set
  title = excluded.title,
  category = excluded.category,
  description = excluded.description,
  jurisdiction_type = excluded.jurisdiction_type,
  jurisdiction_code = excluded.jurisdiction_code,
  applies_to_state = excluded.applies_to_state,
  form_source_url = excluded.form_source_url,
  official_form_name = excluded.official_form_name,
  official_form_edition = excluded.official_form_edition,
  official_form_expiration_date = excluded.official_form_expiration_date,
  field_schema = excluded.field_schema,
  active = excluded.active,
  required = excluded.required,
  sensitive = excluded.sensitive,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.hr_document_templates template
set form_definition_id = definition.id
from public.hr_form_definitions definition
where (
  (template.title = 'Federal Form I-9 Employment Eligibility Checklist' and definition.slug = 'federal-i9-section-1')
  or (template.title = 'Federal Form W-4 Employee Withholding Checklist' and definition.slug = 'federal-w4-employee-withholding')
  or (template.title = 'Texas New Hire Reporting Worksheet' and definition.slug = 'texas-new-hire-reporting')
  or (template.title = 'Employee Personal Information and Emergency Contact Form' and definition.slug = 'employee-profile-emergency-contact')
  or (template.title = 'Offer and Role Acknowledgment' and definition.slug = 'offer-role-acknowledgment')
  or (template.title = 'Employee Handbook Acknowledgment' and definition.slug = 'employee-handbook-acknowledgment')
  or (template.title = 'Confidentiality and IP Assignment Agreement' and definition.slug = 'confidentiality-ip-assignment')
  or (template.title = 'Acceptable Use and Information Security Policy' and definition.slug = 'acceptable-use-information-security')
  or (template.title = 'Safety-Critical Data and AI Output Acknowledgment' and definition.slug = 'safety-ai-output-acknowledgment')
  or (template.title = 'Employee Privacy and Data Handling Acknowledgment' and definition.slug = 'employee-privacy-data-handling')
  or (template.title = 'Electronic Records and E-Sign Consent' and definition.slug = 'electronic-records-esign-consent')
  or (template.title = 'Direct Deposit Authorization' and definition.slug = 'direct-deposit-authorization')
);
