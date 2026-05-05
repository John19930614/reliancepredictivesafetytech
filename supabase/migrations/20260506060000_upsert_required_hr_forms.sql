insert into public.hr_document_templates
  (title, category, body_text, version, active, required, sort_order)
values
  (
    'Federal Form I-9 Employment Eligibility Checklist',
    'Federal Compliance',
    $$Purpose
Federal Form I-9 verifies the identity and employment authorization of each person hired to work in the United States.

Employee requirement
Complete Section 1 of the current USCIS Form I-9 no later than the first day of employment. The official form, instructions, and acceptable document list must be provided to the employee.

Employer requirement
Reliance Predictive Safety Technologies LLC, or its authorized representative, must examine acceptable identity and work authorization documents and complete Section 2 within three business days of the employee's first day of employment.

Official source
Use the current USCIS Form I-9 and instructions from https://www.uscis.gov/i-9.

Employee acknowledgment
I understand that Form I-9 is required for U.S. employment, that I must provide accurate information, and that I must present acceptable documentation when requested.$$,
    1,
    true,
    true,
    10
  ),
  (
    'Federal Form W-4 Employee Withholding Checklist',
    'Payroll / Tax',
    $$Purpose
Federal Form W-4 tells the company how to withhold federal income tax from employee pay.

Employee requirement
Complete the current IRS Form W-4 before payroll is processed. If a properly completed W-4 is not provided, federal income tax must be withheld using the default IRS withholding treatment.

Official source
Use the current IRS Form W-4 from https://www.irs.gov/forms-pubs/about-form-w-4.

Employee acknowledgment
I understand that I am responsible for completing and updating Form W-4 when my personal or financial situation changes, and that Reliance Predictive Safety Technologies LLC will use my W-4 to calculate federal withholding.$$,
    1,
    true,
    true,
    20
  ),
  (
    'Texas New Hire Reporting Worksheet',
    'State Compliance',
    $$Purpose
Texas employers must report newly hired and rehired employees to the Texas New Hire Program.

Information to confirm
Employee legal name, home address, Social Security number, and first day of paid work must be collected accurately for reporting. Employer FEIN, employer name, and employer address are also required for the report.

Timing
New hires and rehires must be reported within 20 calendar days of the hire date.

Official source
Texas Workforce Commission new hire reporting guidance: https://www.twc.texas.gov/employer-resources/new-hire-reporting.

Employee acknowledgment
I understand that Reliance Predictive Safety Technologies LLC may use my employee information to complete required new hire reporting.$$,
    1,
    true,
    true,
    30
  ),
  (
    'Employee Personal Information and Emergency Contact Form',
    'People / HR',
    $$Purpose
This form records current employee contact information and emergency contact details.

Employee information
Legal name, preferred display name, personal phone number, current mailing address, personal email if different from work email, and work location.

Emergency contact
Emergency contact name, phone number, relationship, and alternate contact information if available.

Employee acknowledgment
I confirm that my employee profile and emergency contact information are accurate to the best of my knowledge. I agree to update the company promptly if this information changes.$$,
    1,
    true,
    true,
    40
  ),
  (
    'Offer and Role Acknowledgment',
    'People / HR',
    $$Purpose
This acknowledgment confirms the employee has reviewed the role, reporting expectations, compensation basis, work schedule expectations, and any written offer or role terms provided by Reliance Predictive Safety Technologies LLC.

Role details to confirm
Position title, department or team, manager or reporting contact, employment classification, expected work location, pay basis, timekeeping expectations, start date, and any approved special arrangements.

At-will employment
Unless a separate signed agreement says otherwise, employment is at will and may be ended by either the employee or the company as permitted by applicable law.

Employee acknowledgment
I acknowledge that I have reviewed my role information and understand my initial work expectations. I understand that company policies and work assignments may change over time.$$,
    1,
    true,
    true,
    50
  ),
  (
    'Direct Deposit Authorization',
    'Payroll / Tax',
    $$Purpose
This authorization allows payroll wages or reimbursements to be deposited into the employee's designated account.

Employee information to collect securely
Account holder name, bank or credit union name, routing number, account number, account type, and any split-deposit instructions.

Authorization
I authorize Reliance Predictive Safety Technologies LLC and its payroll provider to initiate payroll deposits to the account I provide and to correct deposit errors if necessary. I understand that I must submit changes in time for payroll processing and that banking information must be handled through approved secure channels.$$,
    1,
    true,
    true,
    60
  ),
  (
    'Employee Handbook Acknowledgment',
    'People / HR',
    $$Purpose
This acknowledgment confirms the employee has received access to the company handbook or current policy packet.

Topics covered
Workplace conduct, anti-harassment and reporting channels, equal employment opportunity, attendance, timekeeping, expense practices, information security, safety expectations, conflicts of interest, disciplinary process, and policy-change notices.

Employee acknowledgment
I acknowledge that I have received access to the handbook or policy packet and understand that I am responsible for reading and following company policies. I understand that policies may be updated and that the handbook does not create a contract of employment.$$,
    1,
    true,
    true,
    70
  ),
  (
    'Confidentiality and IP Assignment Agreement',
    'Legal / People',
    $$Purpose
This agreement protects company confidential information, client information, safety data, product designs, source code, workflows, sales materials, and work product created for company business.

Confidential information
Confidential information includes non-public technical, business, financial, client, safety, operational, product, pricing, strategy, and employee information.

Work product
To the extent permitted by law, work product created within the scope of company work or using company resources belongs to Reliance Predictive Safety Technologies LLC.

Employee acknowledgment
I agree to protect confidential information, use it only for authorized company work, return company materials when requested, and cooperate with reasonable steps needed to document company ownership of work product created for company business.$$,
    1,
    true,
    true,
    80
  ),
  (
    'Acceptable Use and Information Security Policy',
    'Technology / Security',
    $$Purpose
This policy sets expectations for responsible use of company systems, devices, accounts, software, AI tools, client information, and business records.

Employee responsibilities
Use company systems only for authorized work, protect passwords and MFA factors, do not share accounts, report suspicious activity promptly, store documents in approved locations, avoid unauthorized downloads or exports, and follow access-control decisions.

Employee acknowledgment
I agree to use company technology and data responsibly, follow access and security instructions, report suspected security incidents, and avoid actions that could expose company, employee, or client information.$$,
    1,
    true,
    true,
    90
  ),
  (
    'Safety-Critical Data and AI Output Acknowledgment',
    'Safety / Data',
    $$Purpose
Reliance Predictive Safety Technologies LLC works with safety documents, observations, incident information, near-miss records, corrective actions, and AI-assisted safety outputs. These materials must be handled carefully.

Human review requirement
AI-assisted outputs are drafts or decision-support materials. They must be reviewed by qualified humans before use as final safety, legal, compliance, or operational guidance.

Employee acknowledgment
I understand that safety-critical records must be accurate, protected, and reviewed appropriately. I will not present AI-assisted output as final professional advice unless it has gone through the company's required review process.$$,
    1,
    true,
    true,
    100
  ),
  (
    'Employee Privacy and Data Handling Acknowledgment',
    'Privacy',
    $$Purpose
This acknowledgment describes employee responsibilities for personal information, client data, business records, and operational data handled through company systems.

Employee responsibilities
Access only the information needed for assigned work, avoid unnecessary copying or exporting, store documents in approved systems, follow retention and deletion instructions, and report suspected privacy or data incidents promptly.

Employee acknowledgment
I understand that Reliance Predictive Safety Technologies LLC may collect and use employee information for employment, payroll, compliance, security, and business operations. I agree to protect personal, client, and company information according to company instructions.$$,
    1,
    true,
    true,
    110
  ),
  (
    'Electronic Records and E-Sign Consent',
    'Legal / People',
    $$Purpose
This consent allows onboarding documents, acknowledgments, policy notices, and signatures to be handled electronically through the Reliance website and approved company systems.

Consent
I agree that electronic records and electronic signatures may be used for employee onboarding documents and internal acknowledgments. I understand that typing my legal name, checking consent boxes, or using an approved e-sign process may create an electronic signature.

Employee acknowledgment
I can access electronic records, I agree to receive and sign applicable records electronically, and I will notify the company if I need a paper copy or cannot access an electronic document.$$,
    1,
    true,
    true,
    120
  ),
  (
    'Payroll, Benefits, and Required Document Upload Checklist',
    'Payroll / Tax',
    $$Purpose
This checklist helps HR confirm that payroll and employment setup documents have been requested and collected through approved secure channels.

Checklist
Current Form W-4, Form I-9 completion, direct deposit authorization if used, emergency contact information, work classification details, payroll profile setup, benefit enrollment or waiver if applicable, and any state or local payroll documents required for the employee's work location.

Employee acknowledgment
I understand that payroll, tax, identity, eligibility, and banking documents may contain sensitive information and should only be submitted through approved secure processes.$$,
    1,
    true,
    true,
    130
  )
on conflict (title, version) do update set
  category = excluded.category,
  body_text = excluded.body_text,
  active = excluded.active,
  required = excluded.required,
  sort_order = excluded.sort_order,
  updated_at = now();
