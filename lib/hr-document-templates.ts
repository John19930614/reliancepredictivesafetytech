export type RequiredHrDocumentTemplate = {
  title: string;
  category: string;
  bodyText: string;
  version: number;
  active: boolean;
  required: boolean;
  sortOrder: number;
};

export const requiredHrDocumentTemplates: RequiredHrDocumentTemplate[] = [
  {
    title: "Federal Form I-9 Employment Eligibility Checklist",
    category: "Federal Compliance",
    version: 1,
    active: true,
    required: true,
    sortOrder: 10,
    bodyText: `Purpose
Federal Form I-9 verifies the identity and employment authorization of each person hired to work in the United States.

Employee requirement
Complete Section 1 of the current USCIS Form I-9 no later than the first day of employment. The official form, instructions, and acceptable document list must be provided to the employee.

Employer requirement
Reliance Predictive Safety Technologies LLC, or its authorized representative, must examine acceptable identity and work authorization documents and complete Section 2 within three business days of the employee's first day of employment.

Official source
Use the current USCIS Form I-9 and instructions from https://www.uscis.gov/i-9.

Employee acknowledgment
I understand that Form I-9 is required for U.S. employment, that I must provide accurate information, and that I must present acceptable documentation when requested.`,
  },
  {
    title: "Federal Form W-4 Employee Withholding Checklist",
    category: "Payroll / Tax",
    version: 1,
    active: true,
    required: true,
    sortOrder: 20,
    bodyText: `Purpose
Federal Form W-4 tells the company how to withhold federal income tax from employee pay.

Employee requirement
Complete the current IRS Form W-4 before payroll is processed. If a properly completed W-4 is not provided, federal income tax must be withheld using the default IRS withholding treatment.

Official source
Use the current IRS Form W-4 from https://www.irs.gov/forms-pubs/about-form-w-4.

Employee acknowledgment
I understand that I am responsible for completing and updating Form W-4 when my personal or financial situation changes, and that Reliance Predictive Safety Technologies LLC will use my W-4 to calculate federal withholding.`,
  },
  {
    title: "Texas New Hire Reporting Worksheet",
    category: "State Compliance",
    version: 1,
    active: true,
    required: true,
    sortOrder: 30,
    bodyText: `Purpose
Texas employers must report newly hired and rehired employees to the Texas New Hire Program.

Information to confirm
Employee legal name, home address, Social Security number, and first day of paid work must be collected accurately for reporting. Employer FEIN, employer name, and employer address are also required for the report.

Timing
New hires and rehires must be reported within 20 calendar days of the hire date.

Official source
Texas Workforce Commission new hire reporting guidance: https://www.twc.texas.gov/employer-resources/new-hire-reporting.

Employee acknowledgment
I understand that Reliance Predictive Safety Technologies LLC may use my employee information to complete required new hire reporting.`,
  },
  {
    title: "Employee Personal Information and Emergency Contact Form",
    category: "People / HR",
    version: 1,
    active: true,
    required: true,
    sortOrder: 40,
    bodyText: `Purpose
This form records current employee contact information and emergency contact details.

Employee information
Legal name, preferred display name, personal phone number, current mailing address, personal email if different from work email, and work location.

Emergency contact
Emergency contact name, phone number, relationship, and alternate contact information if available.

Employee acknowledgment
I confirm that my employee profile and emergency contact information are accurate to the best of my knowledge. I agree to update the company promptly if this information changes.`,
  },
  {
    title: "Offer and Role Acknowledgment",
    category: "People / HR",
    version: 1,
    active: true,
    required: true,
    sortOrder: 50,
    bodyText: `Purpose
This acknowledgment confirms the employee has reviewed the role, reporting expectations, compensation basis, work schedule expectations, and any written offer or role terms provided by Reliance Predictive Safety Technologies LLC.

Role details to confirm
Position title, department or team, manager or reporting contact, employment classification, expected work location, pay basis, timekeeping expectations, start date, and any approved special arrangements.

At-will employment
Unless a separate signed agreement says otherwise, employment is at will and may be ended by either the employee or the company as permitted by applicable law.

Employee acknowledgment
I acknowledge that I have reviewed my role information and understand my initial work expectations. I understand that company policies and work assignments may change over time.`,
  },
  {
    title: "Direct Deposit Authorization",
    category: "Payroll / Tax",
    version: 1,
    active: true,
    required: true,
    sortOrder: 60,
    bodyText: `Purpose
This authorization allows payroll wages or reimbursements to be deposited into the employee's designated account.

Employee information to collect securely
Account holder name, bank or credit union name, routing number, account number, account type, and any split-deposit instructions.

Authorization
I authorize Reliance Predictive Safety Technologies LLC and its payroll provider to initiate payroll deposits to the account I provide and to correct deposit errors if necessary. I understand that I must submit changes in time for payroll processing and that banking information must be handled through approved secure channels.`,
  },
  {
    title: "Employee Handbook",
    category: "People / HR",
    version: 1,
    active: true,
    required: true,
    sortOrder: 65,
    bodyText: `Purpose
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
I acknowledge that I have received access to this Employee Handbook, that I am responsible for reading and following current company policies, and that I should ask questions if I do not understand an expectation. I understand that this handbook does not create a contract of employment and that policies may change over time.`,
  },
  {
    title: "Confidentiality and IP Assignment Agreement",
    category: "Legal / People",
    version: 1,
    active: true,
    required: true,
    sortOrder: 80,
    bodyText: `Purpose
This agreement protects company confidential information, client information, safety data, product designs, source code, workflows, sales materials, and work product created for company business.

Confidential information
Confidential information includes non-public technical, business, financial, client, safety, operational, product, pricing, strategy, and employee information.

Work product
To the extent permitted by law, work product created within the scope of company work or using company resources belongs to Reliance Predictive Safety Technologies LLC.

Employee acknowledgment
I agree to protect confidential information, use it only for authorized company work, return company materials when requested, and cooperate with reasonable steps needed to document company ownership of work product created for company business.`,
  },
  {
    title: "Acceptable Use and Information Security Policy",
    category: "Technology / Security",
    version: 1,
    active: true,
    required: true,
    sortOrder: 90,
    bodyText: `Purpose
This policy sets expectations for responsible use of company systems, devices, accounts, software, AI tools, client information, and business records.

Employee responsibilities
Use company systems only for authorized work, protect passwords and MFA factors, do not share accounts, report suspicious activity promptly, store documents in approved locations, avoid unauthorized downloads or exports, and follow access-control decisions.

Employee acknowledgment
I agree to use company technology and data responsibly, follow access and security instructions, report suspected security incidents, and avoid actions that could expose company, employee, or client information.`,
  },
  {
    title: "Safety-Critical Data and AI Output Acknowledgment",
    category: "Safety / Data",
    version: 1,
    active: true,
    required: true,
    sortOrder: 100,
    bodyText: `Purpose
Reliance Predictive Safety Technologies LLC works with safety documents, observations, incident information, near-miss records, corrective actions, and AI-assisted safety outputs. These materials must be handled carefully.

Human review requirement
AI-assisted outputs are drafts or decision-support materials. They must be reviewed by qualified humans before use as final safety, legal, compliance, or operational guidance.

Employee acknowledgment
I understand that safety-critical records must be accurate, protected, and reviewed appropriately. I will not present AI-assisted output as final professional advice unless it has gone through the company's required review process.`,
  },
  {
    title: "Employee Privacy and Data Handling Acknowledgment",
    category: "Privacy",
    version: 1,
    active: true,
    required: true,
    sortOrder: 110,
    bodyText: `Purpose
This acknowledgment describes employee responsibilities for personal information, client data, business records, and operational data handled through company systems.

Employee responsibilities
Access only the information needed for assigned work, avoid unnecessary copying or exporting, store documents in approved systems, follow retention and deletion instructions, and report suspected privacy or data incidents promptly.

Employee acknowledgment
I understand that Reliance Predictive Safety Technologies LLC may collect and use employee information for employment, payroll, compliance, security, and business operations. I agree to protect personal, client, and company information according to company instructions.`,
  },
  {
    title: "Electronic Records and E-Sign Consent",
    category: "Legal / People",
    version: 1,
    active: true,
    required: true,
    sortOrder: 120,
    bodyText: `Purpose
This consent allows onboarding documents, acknowledgments, policy notices, and signatures to be handled electronically through the Reliance website and approved company systems.

Consent
I agree that electronic records and electronic signatures may be used for employee onboarding documents and internal acknowledgments. I understand that typing my legal name, checking consent boxes, or using an approved e-sign process may create an electronic signature.

Employee acknowledgment
I can access electronic records, I agree to receive and sign applicable records electronically, and I will notify the company if I need a paper copy or cannot access an electronic document.`,
  },
  {
    title: "Payroll, Benefits, and Required Document Upload Checklist",
    category: "Payroll / Tax",
    version: 1,
    active: true,
    required: true,
    sortOrder: 130,
    bodyText: `Purpose
This checklist helps HR confirm that payroll and employment setup documents have been requested and collected through approved secure channels.

Checklist
Current Form W-4, Form I-9 completion, direct deposit authorization if used, emergency contact information, work classification details, payroll profile setup, benefit enrollment or waiver if applicable, and any state or local payroll documents required for the employee's work location.

Employee acknowledgment
I understand that payroll, tax, identity, eligibility, and banking documents may contain sensitive information and should only be submitted through approved secure processes.`,
  },
];
