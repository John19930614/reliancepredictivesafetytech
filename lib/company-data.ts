import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FolderLock,
  Gauge,
  HardHat,
  Handshake,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  Users,
} from "lucide-react";

export const COMPANY_NAME = "Reliance Predictive Safety Technologies LLC";
export const TAGLINE = "Predict. Prevent. Protect.";
export const CONTACT_EMAIL = "contact@reliancepredictivesafety.com";

export const products = [
  {
    title: "AI Safety Document Builder",
    description:
      "Generate structured safety document drafts from project details, templates, hazards, and company standards.",
    icon: Sparkles,
  },
  {
    title: "CSEP / PSHSEP Generation",
    description:
      "Build contractor and project safety plan drafts with controlled sections, review checkpoints, and repeatable formatting.",
    icon: FileCheck2,
  },
  {
    title: "SOR Field Observation Tracking",
    description:
      "Capture AI-assisted safety observations in a consistent format so field data becomes searchable, scored, and useful for prevention.",
    icon: ClipboardCheck,
  },
  {
    title: "Incident and Near-Miss Tracking",
    description:
      "Record injuries, near misses, tasks, trades, conditions, and contributing factors in one operational view.",
    icon: AlertTriangle,
  },
  {
    title: "Corrective Action Management",
    description:
      "Assign actions, owners, due dates, verification notes, and closure status from finding to completion.",
    icon: Target,
  },
  {
    title: "Permit and JSA Workflow",
    description:
      "Guide teams through JSA planning and high-risk permit triggers for LOTO, hot work, trenching, MEWP, chemicals, and more.",
    icon: HardHat,
  },
  {
    title: "Training Matrix",
    description:
      "Track safety training needs by role, project, task, and document requirement.",
    icon: Users,
  },
  {
    title: "Predictive Injury Forecasting",
    description:
      "Use field signals, observations, near misses, and historical records to formulate trends and predict risk before injuries happen.",
    icon: BarChart3,
  },
  {
    title: "Company Document Library",
    description:
      "Store controlled safety, legal, operating, marketing, finance, and security documents with revision status.",
    icon: FolderLock,
  },
  {
    title: "Admin Review Workflow",
    description:
      "Keep human review in the loop with draft, review, approval, revision, and audit-ready status controls.",
    icon: ShieldCheck,
  },
];

export const whyReliance = [
  "Positions safety as prevention, not reaction",
  "Saves time creating safety documents",
  "Reduces manual safety admin work",
  "Improves consistency and compliance",
  "Uses AI-assisted data collection to identify trends",
  "Supports predictive risk visibility and risk reduction",
  "Helps companies prepare better safety plans",
  "Requires human review for safety-critical outputs",
];

export const documentCategories = [
  "Business Formation",
  "Legal / Customer",
  "People / HR",
  "Operations",
  "Product",
  "Safety Document Library",
  "Compliance / Certifications",
  "Finance",
  "Sales / Marketing",
  "Technology / Security",
  "Backups / Exports",
] as const;

export const documentStatuses = [
  "Not Started",
  "Draft",
  "Uploaded",
  "In Review",
  "Approved",
  "Signed / Executed",
  "Needs Revision",
  "Retired",
] as const;

export const checklistStatuses = [
  "Not Started",
  "Draft",
  "In Review",
  "Approved",
  "Blocked",
  "Complete",
] as const;

export const demoRequestStatuses = [
  "new",
  "contacted",
  "demo scheduled",
  "information sent",
  "closed",
] as const;

export const supportTicketStatuses = ["new", "reviewing", "waiting on customer", "resolved", "closed"] as const;
export const supportTicketPriorities = ["low", "normal", "high", "urgent"] as const;
export const supportTicketCategories = [
  "Login / account access",
  "Document builder",
  "Dashboard / reports",
  "Billing / subscription",
  "Bug report",
  "Feature request",
  "Other",
] as const;

export const lifecycleStages = [
  "Lead",
  "First Pitch",
  "Demo Scheduled",
  "Demo Completed",
  "Proposal Sent",
  "Legal Review",
  "Contract Sent",
  "Signed / Won",
  "Onboarding",
  "Pilot / Setup",
  "Active Company",
  "Renewal / Expansion",
] as const;

export const recordTypes = [
  "Master Template",
  "Company Record",
  "Client Record",
  "Employee Record",
] as const;

export const trainingModuleCategories = [
  "General Safety",
  "Onboarding",
  "Toolbox Talk",
  "Permit / JSA",
  "Equipment",
  "Emergency Response",
  "Compliance",
] as const;

export const trainingModuleStatuses = ["Draft", "Ready", "Archived"] as const;
export const clientTrainingDeliveryModes = ["In Person", "Virtual", "Hybrid"] as const;
export const clientTrainingEventStatuses = ["Planned", "Ready", "Presented", "Canceled"] as const;

export const hrOnboardingStatuses = ["not_started", "in_progress", "complete"] as const;
export const employeeDocumentStatuses = ["pending", "signed", "waived"] as const;
export const hrComplianceDocumentModes = ["fillable_form", "upload", "acknowledgment", "review_catalog"] as const;
export const hrComplianceReviewStatuses = ["needs_review", "reviewed", "approved", "rejected", "inactive"] as const;

export type HrComplianceRequirement = {
  id: string;
  slug: string;
  title: string;
  jurisdiction_level: string;
  jurisdiction_state: string | null;
  employee_type: string;
  category: string;
  document_mode: string;
  official_source_url: string | null;
  due_rule: string | null;
  retention_rule: string | null;
  review_status: string;
  active: boolean;
  required: boolean;
  sort_order: number;
  last_reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type HrEmployeeProfile = {
  user_id: string;
  legal_name: string | null;
  display_name?: string | null;
  email?: string | null;
  profile_status?: string;
  time_card_role_id?: string | null;
  work_state: string | null;
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  onboarding_status: string;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HrCandidateIntake = {
  id: string;
  candidate_name: string;
  email: string;
  target_role: string;
  jurisdiction_state: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  human_decision: string;
  human_decision_notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  converted_user_id: string | null;
  invite_generated_at: string | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EmployeePayrollSetupTask = {
  id: string;
  user_id: string;
  source_candidate_id: string | null;
  status: string;
  jurisdiction_state: string | null;
  payroll_provider: string | null;
  due_date: string | null;
  w4_received: boolean;
  i9_reviewed: boolean;
  direct_deposit_ready: boolean;
  state_new_hire_reported: boolean;
  benefits_reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type HrAutomationEvent = {
  id: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  candidate_intake_id: string | null;
  notification_id: string | null;
  source_type: string;
  source_id: string | null;
  event_type: string;
  title: string;
  body: string | null;
  created_by_ai: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type HrDocumentTemplate = {
  id: string;
  title: string;
  category: string;
  body_text: string;
  version: number;
  active: boolean;
  required: boolean;
  sort_order: number;
  source_document_id: string | null;
  form_definition_id: string | null;
  compliance_requirement_id: string | null;
  created_at: string;
  updated_at: string;
};

export type HrFormFieldType =
  | "text"
  | "textarea"
  | "date"
  | "phone"
  | "email"
  | "ssn"
  | "number"
  | "currency"
  | "checkbox"
  | "radio"
  | "select"
  | "address";

export type HrFormField = {
  name: string;
  label: string;
  type: HrFormFieldType;
  required?: boolean;
  section?: string;
  helpText?: string;
  placeholder?: string;
  options?: string[];
  sensitive?: boolean;
};

export type HrFormAnswerValue = string | boolean | Record<string, string>;
export type HrFormAnswers = Record<string, HrFormAnswerValue>;

export type HrFormDefinition = {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string | null;
  jurisdiction_type: string;
  jurisdiction_code: string;
  applies_to_state: string | null;
  form_source_url: string | null;
  official_form_name: string | null;
  official_form_edition: string | null;
  official_form_expiration_date: string | null;
  field_schema: HrFormField[];
  compliance_requirement_id: string | null;
  active: boolean;
  required: boolean;
  sensitive: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type EmployeeFormResponse = {
  id: string;
  assignment_id: string;
  user_id: string;
  template_id: string;
  form_definition_id: string;
  status: string;
  answers: HrFormAnswers;
  form_version: number;
  form_snapshot: Record<string, unknown>;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeSignedDocument = {
  id: string;
  assignment_id: string;
  response_id: string;
  user_id: string;
  template_id: string;
  form_definition_id: string;
  file_bucket: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_sha256: string;
  form_snapshot: Record<string, unknown>;
  answer_snapshot: HrFormAnswers;
  typed_legal_name: string;
  signer_email: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  signed_at: string;
  created_at: string;
};

export type EmployeeOnboardingUpload = {
  id: string;
  assignment_id: string;
  user_id: string;
  template_id: string;
  compliance_requirement_id: string | null;
  file_bucket: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_sha256: string;
  upload_status: string;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeOnboardingAuditEvent = {
  id: string;
  assignment_id: string | null;
  user_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  event_details: Record<string, unknown>;
  signer_ip: string | null;
  signer_user_agent: string | null;
  created_at: string;
};

export type EmployeeDocumentAssignment = {
  id: string;
  user_id: string;
  template_id: string;
  status: string;
  due_date: string | null;
  assigned_by: string | null;
  existing_document_id: string | null;
  compliance_requirement_id: string | null;
  verification_status: string;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  retention_until: string | null;
  legal_hold: boolean;
  signed_at: string | null;
  waived_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeDocumentSignature = {
  id: string;
  assignment_id: string;
  user_id: string;
  template_id: string;
  template_version: number;
  document_title: string;
  document_body: string;
  source_document_id: string | null;
  source_file_path: string | null;
  typed_legal_name: string;
  consented: boolean;
  signer_email: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  signed_at: string;
  created_at: string;
};

export const legalIssueSeverities = ["Low", "Medium", "High", "Critical"] as const;
export const legalIssueStatuses = ["Open", "In Review", "Waiting", "Resolved", "Closed"] as const;

export const clientStatuses = ["Active", "Paused", "Lost", "Archived"] as const;
export const timeCardStatuses = ["draft", "submitted", "approved", "rejected"] as const;
export const payrollRunStatuses = ["draft", "ready", "paid", "held"] as const;
export const payrollRunItemStatuses = ["ready", "paid", "held"] as const;

export const financeTransactionTypes = ["income", "expense"] as const;
export const financeIncomeStatuses = ["expected", "invoiced", "received", "cancelled"] as const;
export const financeExpenseStatuses = ["planned", "due", "paid", "cancelled"] as const;
export const financeReviewStatuses = ["unreviewed", "reviewed", "needs_follow_up"] as const;
export const financeBudgetTypes = ["income", "expense"] as const;
export const financeBudgetPeriods = ["monthly", "yearly"] as const;
export const financeRecurringCadences = ["weekly", "monthly", "quarterly", "yearly"] as const;
export const financeRecurringStatuses = ["active", "paused", "ended"] as const;
export const employeeExpenseStatuses = ["submitted", "needs_info", "approved", "rejected", "reimbursed", "cancelled"] as const;
export const employeeExpenseCategories = [
  "Hotel",
  "Fuel",
  "Flight",
  "Meals",
  "Parking",
  "Rideshare / Taxi",
  "Supplies",
  "Training / Certifications",
  "Other",
] as const;
export const financeCategories = [
  "Sales / Revenue",
  "Software / Hosting",
  "Legal / Compliance",
  "Payroll / Labor",
  "Marketing / Sales",
  "Insurance",
  "Training / Certifications",
  "Office / Admin",
  "Travel",
  "Taxes / Fees",
  "Other",
] as const;

export const operationsRecordCategories = [
  "Operations",
  "People / HR",
  "Finance",
  "Legal / Compliance",
  "Technology / Security",
  "Product",
  "Safety",
  "Sales / Customer Success",
  "Vendor / Asset",
  "Leadership",
] as const;

export const operationsRecordTypes = [
  "General",
  "Task",
  "SOP",
  "Vendor",
  "Asset",
  "Risk",
  "Internal Decision",
  "Client Follow-up",
  "Document Control",
  "Compliance Item",
  "Workflow",
  "Other",
] as const;

export const operationsRecordStatuses = ["Open", "In Progress", "Waiting", "Complete", "Archived"] as const;
export const operationsRecordPriorities = ["Low", "Medium", "High", "Critical"] as const;

export const companyPositionStatuses = ["Filled", "Open", "Needed", "On Hold"] as const;
export const companyPositionSalaryPeriods = ["Annual", "Hourly", "Monthly", "Contract"] as const;
export const companyPositionEmploymentTypes = ["Full-time", "Part-time", "Contract", "Part-time / Full-time", "Internship"] as const;
export const companyPositionHiringPriorities = ["Low", "Medium", "High", "Critical"] as const;
export const companyPositionDepartments = [
  "Leadership",
  "Technology / Product",
  "Sales / Marketing",
  "Safety",
  "Customer Success",
  "Legal / Compliance",
  "Finance",
  "Operations",
] as const;

export type CompanyChecklistItem = {
  id?: string;
  section: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  owner: string;
  due_date: string | null;
  estimated_cost: string;
  notes: string;
  completed: boolean;
  linked_document_id: string | null;
  updated_at?: string;
};

export type CompanyDocument = {
  id: string;
  title: string;
  category: string;
  document_number?: string | null;
  checklist_item_id: string | null;
  requirement_id?: string | null;
  client_id?: string | null;
  record_type?: string | null;
  lifecycle_stage?: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  status: string;
  owner: string | null;
  revision: string | null;
  notes: string | null;
  effective_date?: string | null;
  executed_date?: string | null;
  expiration_date?: string | null;
  renewal_date?: string | null;
  legal_hold?: boolean;
  created_at: string;
  updated_at: string;
};

export type DemoRequest = {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  role: string | null;
  company_type: string | null;
  interested_products: string[] | null;
  message: string | null;
  status: string;
  created_at: string;
};

export type SupportTicket = {
  id: string;
  submitter_name: string;
  submitter_email: string;
  submitter_phone: string | null;
  company: string | null;
  subject: string;
  category: string;
  priority: string;
  issue_url: string | null;
  message: string;
  status: string;
  submitted_by_user_id: string | null;
  assigned_to_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CompanyClient = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  company_type: string | null;
  lifecycle_stage: string;
  status: string;
  owner: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanySalesActivity = {
  id: string;
  client_id: string;
  activity_type: string;
  title: string;
  notes: string | null;
  activity_date: string | null;
  owner: string | null;
  outcome: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyDocumentRequirement = {
  id: string;
  title: string;
  category: string;
  lifecycle_stage: string;
  required_for_active: boolean;
  description: string | null;
  sort_order: number;
  created_at: string;
};

export type ClientOnboardingItem = {
  id: string;
  client_id: string;
  title: string;
  section: string;
  lifecycle_stage: string;
  status: string;
  owner: string | null;
  due_date: string | null;
  completed: boolean;
  linked_document_id: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CompanyLegalIssue = {
  id: string;
  title: string;
  severity: string;
  status: string;
  owner: string | null;
  due_date: string | null;
  client_id: string | null;
  linked_document_id: string | null;
  description: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TrainingModule = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  audience: string;
  status: string;
  owner: string | null;
  estimated_duration_minutes: number | null;
  external_lms_course_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TrainingCompletion = {
  id: string;
  module_id: string | null;
  client_id: string | null;
  external_lms_user_id: string;
  external_lms_course_id: string;
  learner_name: string;
  learner_email: string | null;
  score: number | null;
  passed: boolean | null;
  completed_at: string;
  time_spent_seconds: number | null;
  created_at: string;
};

export type TrainingCertification = {
  id: string;
  completion_id: string | null;
  client_id: string | null;
  learner_name: string;
  learner_email: string | null;
  certification_name: string;
  issued_at: string;
  expires_at: string | null;
  cert_document_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type TrainingModuleFile = {
  id: string;
  module_id: string;
  file_bucket: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ClientTrainingEvent = {
  id: string;
  client_id: string;
  title: string;
  scheduled_start_at: string | null;
  delivery_mode: string;
  location: string | null;
  instructor: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientTrainingEventModule = {
  id: string;
  event_id: string;
  module_id: string;
  sort_order: number;
  presenter_notes: string | null;
  created_at: string;
  updated_at: string;
};

export const performanceReviewTypes = ["Annual", "Semi-Annual", "Quarterly", "90-Day"] as const;
export const performanceReviewCycleStatuses = ["Draft", "Open", "Closed"] as const;
export const performanceReviewStatuses = ["not_started", "in_progress", "submitted"] as const;

export type PerformanceReviewCycle = {
  id: string;
  title: string;
  review_type: string;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  self_assessment_due: string | null;
  manager_review_due: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PerformanceReview = {
  id: string;
  cycle_id: string;
  employee_user_id: string;
  reviewer_user_id: string | null;
  self_assessment_status: string;
  manager_review_status: string;
  overall_self_rating: number | null;
  overall_manager_rating: number | null;
  self_highlights: string | null;
  self_improvements: string | null;
  self_goals: string | null;
  manager_highlights: string | null;
  manager_improvements: string | null;
  manager_goals: string | null;
  manager_notes: string | null;
  self_submitted_at: string | null;
  manager_submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeCardRole = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
};

export type EmployeeProfile = {
  user_id: string;
  display_name?: string | null;
  email?: string | null;
  profile_status?: string;
  time_card_role_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeCardCategory = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type TimeCardTask = {
  id: string;
  slug: string;
  category_id: string;
  title: string;
  sort_order: number;
  is_review_task: boolean;
  created_at: string;
};

export type TimeCardRoleCategory = {
  role_id: string;
  category_id: string;
  created_at: string;
};

export type TimeCardRoleTask = {
  role_id: string;
  task_id: string;
  created_at: string;
};

export type EmployeeTimeCard = {
  id: string;
  employee_user_id: string | null;
  week_start: string;
  week_end: string;
  status: (typeof timeCardStatuses)[number];
  source: string;
  import_key: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeTimeEntry = {
  id: string;
  time_card_id: string;
  work_date: string;
  category_id: string;
  task_id: string;
  hours: number;
  notes: string | null;
  source_status: string | null;
  import_key: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeTimeCardPayroll = {
  time_card_id: string;
  hourly_rate: number;
  total_hours: number;
  paid_value: number;
  created_at: string;
  updated_at: string;
};

export type EmployeePayrollRun = {
  id: string;
  period_start: string;
  period_end: string;
  status: (typeof payrollRunStatuses)[number];
  notes: string | null;
  created_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeePayrollRunItem = {
  id: string;
  payroll_run_id: string;
  time_card_id: string;
  employee_user_id: string | null;
  total_hours: number;
  hourly_rate: number;
  gross_pay: number;
  federal_tax: number;
  state_tax: number;
  social_security: number;
  medicare: number;
  other_deductions: number;
  net_pay: number;
  item_status: (typeof payrollRunItemStatuses)[number];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeExpenseReport = {
  id: string;
  employee_user_id: string;
  title: string;
  category: (typeof employeeExpenseCategories)[number];
  amount: number;
  expense_date: string;
  merchant: string | null;
  payment_method: string | null;
  business_purpose: string;
  notes: string | null;
  status: (typeof employeeExpenseStatuses)[number];
  finance_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reimbursed_by: string | null;
  reimbursed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeeExpenseReceipt = {
  id: string;
  expense_report_id: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string | null;
};

export type CompanyFinanceAuthorizedUser = {
  user_id: string;
  access_label: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CompanyFinanceTransaction = {
  id: string;
  transaction_type: (typeof financeTransactionTypes)[number];
  title: string;
  amount: number;
  transaction_date: string;
  category: string;
  status: string;
  vendor_customer: string | null;
  payment_method: string | null;
  owner: string | null;
  notes: string | null;
  related_client_id: string | null;
  related_document_id: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_status: string;
  created_at: string;
  updated_at: string;
};

export type CompanyFinanceBudget = {
  id: string;
  name: string;
  budget_type: (typeof financeBudgetTypes)[number];
  category: string;
  period: (typeof financeBudgetPeriods)[number];
  period_start: string;
  amount: number;
  owner: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyFinanceRecurringItem = {
  id: string;
  item_type: (typeof financeTransactionTypes)[number];
  title: string;
  amount: number;
  category: string;
  cadence: (typeof financeRecurringCadences)[number];
  next_due_date: string | null;
  status: string;
  vendor_customer: string | null;
  payment_method: string | null;
  owner: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyFinanceReceipt = {
  id: string;
  transaction_id: string;
  file_path: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string | null;
};

export type CompanyOperationsRecord = {
  id: string;
  title: string;
  category: string;
  record_type: string;
  status: string;
  priority: string;
  owner: string | null;
  due_date: string | null;
  description: string | null;
  notes: string | null;
  related_client_id: string | null;
  related_document_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyPosition = {
  id: string;
  title: string;
  department: string;
  parent_position_id: string | null;
  status: string;
  portal_user_id: string | null;
  job_description: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  employment_type: string | null;
  location: string | null;
  hiring_priority: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PortalNotification = {
  id: string;
  recipient_user_id: string;
  title: string;
  body: string;
  priority: string;
  source_type: string | null;
  source_id: string | null;
  action_href: string | null;
  ai_summary: string | null;
  dedupe_key: string | null;
  status: string;
  created_by_ai: boolean;
  metadata: Record<string, unknown>;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationPreference = {
  user_id: string;
  in_app_enabled: boolean;
  email_digest_enabled: boolean;
  digest_time: string;
  digest_timezone: string;
  created_at: string;
  updated_at: string;
};

export type WorkflowActionProposal = {
  id: string;
  created_by_user_id: string | null;
  target_user_id: string | null;
  title: string;
  description: string;
  action_type: string;
  target_table: string;
  target_record_id: string | null;
  proposed_patch: Record<string, unknown>;
  risk_level: string;
  status: string;
  approval_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  applied_at: string | null;
  created_by_ai: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WebsiteContentItem = {
  id: string;
  content_key: string;
  route_path: string;
  content_type: string;
  title: string;
  fallback_value: string;
  draft_value: string | null;
  approved_value: string | null;
  status: string;
  risk_level: string;
  ai_notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by_ai: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WebsiteHealthCheck = {
  id: string;
  scan_id: string;
  route_path: string;
  target_url: string;
  status: string;
  status_code: number | null;
  response_ms: number | null;
  checked_at: string;
  error_message: string | null;
  seo_title: string | null;
  seo_description: string | null;
  h1: string | null;
  broken_links: unknown;
  content_gaps: string[];
  metadata: Record<string, unknown>;
  created_at: string;
};

export type WebsiteOperationsEvent = {
  id: string;
  actor_user_id: string | null;
  notification_id: string | null;
  health_check_id: string | null;
  proposal_id: string | null;
  source_type: string;
  source_id: string | null;
  event_type: string;
  title: string;
  body: string | null;
  risk_level: string;
  created_by_ai: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
};

export const companyPositionSeed: CompanyPosition[] = [
  {
    id: "00000000-0000-0000-0000-000000000101",
    title: "Founder / Managing Member",
    department: "Leadership",
    parent_position_id: null,
    status: "Filled",
    portal_user_id: null,
    job_description: null,
    salary_min: null,
    salary_max: null,
    salary_period: "Annual",
    employment_type: "Full-time",
    location: null,
    hiring_priority: "High",
    sort_order: 10,
    notes: "Seeded founder role. Add email and phone when ready.",
    created_at: "",
    updated_at: "",
  },
  {
    id: "00000000-0000-0000-0000-000000000102",
    title: "Product / Technology Lead",
    department: "Technology / Product",
    parent_position_id: "00000000-0000-0000-0000-000000000101",
    status: "Filled",
    portal_user_id: null,
    job_description: null,
    salary_min: null,
    salary_max: null,
    salary_period: "Annual",
    employment_type: "Full-time",
    location: null,
    hiring_priority: "High",
    sort_order: 20,
    notes: "Seeded filled role. Add email and phone when ready.",
    created_at: "",
    updated_at: "",
  },
  {
    id: "00000000-0000-0000-0000-000000000103",
    title: "Sales / Marketing Lead",
    department: "Sales / Marketing",
    parent_position_id: "00000000-0000-0000-0000-000000000101",
    status: "Filled",
    portal_user_id: null,
    job_description: null,
    salary_min: null,
    salary_max: null,
    salary_period: "Annual",
    employment_type: "Full-time",
    location: null,
    hiring_priority: "High",
    sort_order: 30,
    notes: "Seeded filled role. Add email and phone when ready.",
    created_at: "",
    updated_at: "",
  },
  {
    id: "00000000-0000-0000-0000-000000000104",
    title: "Safety Product SME",
    department: "Safety",
    parent_position_id: "00000000-0000-0000-0000-000000000102",
    status: "Open",
    portal_user_id: null,
    job_description:
      "Support safety product accuracy by reviewing CSEP, PSHSEP, JSA, permit, incident, SOR, and corrective action workflows for field realism and compliance readiness.",
    salary_min: 75000,
    salary_max: 110000,
    salary_period: "Annual",
    employment_type: "Full-time",
    location: "Remote / Hybrid",
    hiring_priority: "High",
    sort_order: 70,
    notes: "Use this role when preparing a safety subject matter expert job posting.",
    created_at: "",
    updated_at: "",
  },
  {
    id: "00000000-0000-0000-0000-000000000105",
    title: "Customer Success / Onboarding Manager",
    department: "Customer Success",
    parent_position_id: "00000000-0000-0000-0000-000000000101",
    status: "Open",
    portal_user_id: null,
    job_description:
      "Own customer onboarding from signed agreement through setup, training, documentation collection, feedback capture, and active company readiness.",
    salary_min: 65000,
    salary_max: 90000,
    salary_period: "Annual",
    employment_type: "Full-time",
    location: "Remote / Hybrid",
    hiring_priority: "High",
    sort_order: 40,
    notes: "Use this role for client onboarding and renewal support.",
    created_at: "",
    updated_at: "",
  },
  {
    id: "00000000-0000-0000-0000-000000000110",
    title: "Safety Trainer",
    department: "Safety",
    parent_position_id: "00000000-0000-0000-0000-000000000104",
    status: "Needed",
    portal_user_id: null,
    job_description:
      "Prepare and deliver safety training content, onboarding training, refresher modules, toolbox talks, and role-based safety learning materials.",
    salary_min: null,
    salary_max: null,
    salary_period: "Annual",
    employment_type: "Full-time",
    location: "Remote / Hybrid",
    hiring_priority: "Medium",
    sort_order: 72,
    notes: "Future trainer role for safety content, onboarding, and customer education.",
    created_at: "",
    updated_at: "",
  },
  {
    id: "00000000-0000-0000-0000-000000000111",
    title: "PHSEP / CSEP Review Specialist",
    department: "Safety",
    parent_position_id: "00000000-0000-0000-0000-000000000104",
    status: "Needed",
    portal_user_id: null,
    job_description:
      "Review PHSEP and CSEP drafts for safety accuracy, completeness, field usability, project alignment, and readiness for admin or owner approval.",
    salary_min: null,
    salary_max: null,
    salary_period: "Annual",
    employment_type: "Full-time",
    location: "Remote / Hybrid",
    hiring_priority: "High",
    sort_order: 74,
    notes: "Dedicated review spot for PHSEP and CSEP document quality control.",
    created_at: "",
    updated_at: "",
  },
  {
    id: "00000000-0000-0000-0000-000000000106",
    title: "Sales Development Representative",
    department: "Sales / Marketing",
    parent_position_id: "00000000-0000-0000-0000-000000000103",
    status: "Needed",
    portal_user_id: null,
    job_description:
      "Prospect contractor, safety, and operations buyers; qualify demo requests; prepare outreach lists; and keep early sales follow-up organized.",
    salary_min: 45000,
    salary_max: 65000,
    salary_period: "Annual",
    employment_type: "Full-time",
    location: "Remote",
    hiring_priority: "Medium",
    sort_order: 90,
    notes: "Future sales capacity role.",
    created_at: "",
    updated_at: "",
  },
  {
    id: "00000000-0000-0000-0000-000000000107",
    title: "Compliance / Legal Operations Coordinator",
    department: "Legal / Compliance",
    parent_position_id: "00000000-0000-0000-0000-000000000101",
    status: "Needed",
    portal_user_id: null,
    job_description:
      "Coordinate legal documents, compliance packets, review dates, renewal records, insurance updates, vendor forms, and audit-ready operating files.",
    salary_min: 55000,
    salary_max: 80000,
    salary_period: "Annual",
    employment_type: "Full-time",
    location: "Remote / Hybrid",
    hiring_priority: "Medium",
    sort_order: 50,
    notes: "Future compliance operations support role.",
    created_at: "",
    updated_at: "",
  },
  {
    id: "00000000-0000-0000-0000-000000000108",
    title: "Finance / Accounting Support",
    department: "Finance",
    parent_position_id: "00000000-0000-0000-0000-000000000101",
    status: "Needed",
    portal_user_id: null,
    job_description:
      "Support invoicing, billing records, cost tracking, bookkeeping coordination, budget reporting, and monthly close preparation.",
    salary_min: 45000,
    salary_max: 70000,
    salary_period: "Annual",
    employment_type: "Part-time / Full-time",
    location: "Remote",
    hiring_priority: "Medium",
    sort_order: 60,
    notes: "Future finance support role.",
    created_at: "",
    updated_at: "",
  },
  {
    id: "00000000-0000-0000-0000-000000000109",
    title: "Software Engineer / Platform Support",
    department: "Technology / Product",
    parent_position_id: "00000000-0000-0000-0000-000000000102",
    status: "Needed",
    portal_user_id: null,
    job_description:
      "Build and maintain the Reliance platform, Supabase-backed workflows, document generation tools, admin dashboards, quality checks, and customer-facing product improvements.",
    salary_min: 90000,
    salary_max: 130000,
    salary_period: "Annual",
    employment_type: "Full-time",
    location: "Remote",
    hiring_priority: "Medium",
    sort_order: 80,
    notes: "Future platform engineering role.",
    created_at: "",
    updated_at: "",
  },
];

export const defaultClientOnboardingItems = [
  { section: "Sales Pitch", lifecycle_stage: "First Pitch", title: "First pitch completed" },
  { section: "Demo", lifecycle_stage: "Demo Scheduled", title: "Demo scheduled" },
  { section: "Demo", lifecycle_stage: "Demo Completed", title: "Demo completed" },
  { section: "Legal / Contract", lifecycle_stage: "Legal Review", title: "NDA sent" },
  { section: "Legal / Contract", lifecycle_stage: "Legal Review", title: "NDA signed" },
  { section: "Proposal", lifecycle_stage: "Proposal Sent", title: "Pricing reviewed" },
  { section: "Proposal", lifecycle_stage: "Proposal Sent", title: "Proposal sent" },
  { section: "Legal / Contract", lifecycle_stage: "Contract Sent", title: "MSA/SOW prepared" },
  { section: "Legal / Contract", lifecycle_stage: "Signed / Won", title: "Contract signed" },
  { section: "Onboarding", lifecycle_stage: "Onboarding", title: "Billing setup confirmed" },
  { section: "Onboarding", lifecycle_stage: "Onboarding", title: "Client admin/contact assigned" },
  { section: "Onboarding", lifecycle_stage: "Onboarding", title: "Sample data received" },
  { section: "Onboarding", lifecycle_stage: "Onboarding", title: "Onboarding meeting completed" },
  { section: "Pilot / Setup", lifecycle_stage: "Pilot / Setup", title: "Platform access confirmed" },
  { section: "Active Company", lifecycle_stage: "Active Company", title: "Active company approval complete" },
] as const;

export const documentRequirementSeeds = [
  { category: "Sales / Marketing", lifecycle_stage: "First Pitch", title: "Marketing Deck", required_for_active: false },
  { category: "Sales / Marketing", lifecycle_stage: "First Pitch", title: "Product Flyer", required_for_active: false },
  { category: "Sales / Marketing", lifecycle_stage: "Demo Scheduled", title: "Demo Script", required_for_active: false },
  { category: "Sales / Marketing", lifecycle_stage: "Demo Completed", title: "Buyer FAQ", required_for_active: false },
  { category: "Sales / Marketing", lifecycle_stage: "Proposal Sent", title: "Proposal Template", required_for_active: true },
  { category: "Finance", lifecycle_stage: "Proposal Sent", title: "One-Page Pricing Sheet", required_for_active: true },
  { category: "Legal / Customer", lifecycle_stage: "Legal Review", title: "Mutual NDA", required_for_active: true },
  { category: "Legal / Customer", lifecycle_stage: "Contract Sent", title: "Master Services Agreement", required_for_active: true },
  { category: "Legal / Customer", lifecycle_stage: "Contract Sent", title: "Statement of Work Template", required_for_active: true },
  { category: "Legal / Customer", lifecycle_stage: "Legal Review", title: "Pilot / Beta Agreement", required_for_active: false },
  { category: "Legal / Customer", lifecycle_stage: "Legal Review", title: "Terms of Use", required_for_active: true },
  { category: "Legal / Customer", lifecycle_stage: "Legal Review", title: "Privacy Policy", required_for_active: true },
  { category: "Legal / Customer", lifecycle_stage: "Legal Review", title: "Data Processing Addendum", required_for_active: true },
  { category: "Legal / Customer", lifecycle_stage: "Legal Review", title: "E-Sign Consent", required_for_active: true },
  { category: "Legal / Customer", lifecycle_stage: "Legal Review", title: "AI Output Disclaimer", required_for_active: true },
  { category: "Operations", lifecycle_stage: "Onboarding", title: "Client Contact Sheet", required_for_active: true },
  { category: "Operations", lifecycle_stage: "Onboarding", title: "Admin Setup Record", required_for_active: true },
  { category: "Finance", lifecycle_stage: "Onboarding", title: "Billing Confirmation", required_for_active: true },
  { category: "Product", lifecycle_stage: "Onboarding", title: "Sample Data Request", required_for_active: false },
  { category: "Operations", lifecycle_stage: "Onboarding", title: "Onboarding Meeting Notes", required_for_active: true },
  { category: "Operations", lifecycle_stage: "Active Company", title: "Renewal Notes", required_for_active: false },
  { category: "Legal / Customer", lifecycle_stage: "Active Company", title: "Contract Expiration Record", required_for_active: true },
  { category: "Compliance / Certifications", lifecycle_stage: "Active Company", title: "Insurance / Legal Updates", required_for_active: false },
  { category: "Operations", lifecycle_stage: "Active Company", title: "Support Notes", required_for_active: false },
  { category: "Operations", lifecycle_stage: "Renewal / Expansion", title: "Account Review Record", required_for_active: false },
] as const;

export const startupChecklistSeed: CompanyChecklistItem[] = [
  {
    section: "Business Formation and Ownership",
    title: "Confirm legal name, LLC details, ownership roles, and revenue/equity split.",
    description: "Booklet priority 1: protect the business before selling or piloting.",
    priority: "High - required",
    status: "Not Started",
    owner: "John / Steven",
    due_date: null,
    estimated_cost: "State filing plus attorney review",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "Business Formation and Ownership",
    title: "File or confirm LLC, EIN, business bank account, accounting setup, and insurance review.",
    description: "Formation package foundation before paid customers or outside contributors.",
    priority: "High - required",
    status: "Not Started",
    owner: "John",
    due_date: null,
    estimated_cost: "Filing fees, CPA, insurance quotes",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "Legal Protection Package",
    title: "Create NDA, operating agreement, IP assignment, MSA/SOW, pilot agreement, terms, privacy policy, and e-sign consent.",
    description: "Draft internally where useful, then route final legal documents for attorney review.",
    priority: "High - required",
    status: "Not Started",
    owner: "Steven / John",
    due_date: null,
    estimated_cost: "$1,500-$7,500 legal planning range",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "Platform and Product Build Package",
    title: "Finalize demo platform with sample data and active quick-access demo link.",
    description: "Demo should work on laptop and phone using sample data only.",
    priority: "Required",
    status: "Not Started",
    owner: "Steven / John",
    due_date: null,
    estimated_cost: "Vercel/Supabase plus development time",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "Safety Document Product Package",
    title: "Finalize CSEP demo, review checklist, SOR template, SOR scoring guide, and safety document revision SOP.",
    description: "Controlled product library for CSEP/PSHSEP/JSA/permit/SOR/incident documents.",
    priority: "Required",
    status: "Not Started",
    owner: "John",
    due_date: null,
    estimated_cost: "Internal time; SME/legal review if needed",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "Data Governance and AI Integrity Package",
    title: "Document SOR quality, injury intake, data validation, AI review, confidence labels, retention, and audit log rules.",
    description: "Do not let low-quality observations influence predictive outputs equally.",
    priority: "Required",
    status: "Not Started",
    owner: "John / Steven",
    due_date: null,
    estimated_cost: "Internal time plus privacy review if needed",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "Pricing, Billing, and Accounting",
    title: "Approve pricing model, one-page pricing sheet, quote template, invoice items, payment terms, and discount rules.",
    description: "Separate software access, document generation, review, setup, customization, and forecasting value.",
    priority: "Required",
    status: "Not Started",
    owner: "John / Steven",
    due_date: null,
    estimated_cost: "QuickBooks/Stripe/CPA costs",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "Sales, Marketing, and Demo Package",
    title: "Prepare website copy, demo request path, marketing deck, flyer, demo script, buyer FAQ, proposal, and email templates.",
    description: "The buyer should understand the problem, solution, and risk-reduction value in five minutes.",
    priority: "Required",
    status: "Not Started",
    owner: "John / Ryan / Steven",
    due_date: null,
    estimated_cost: "Design, print, domain, CRM, email costs",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "Certifications and Compliance",
    title: "Build ISO 45001 capability matrix, WI DVB packet, CA DVBE packet, cybersecurity checklist, and privacy/data retention checklist.",
    description: "Use certifications to support credibility without distracting from launch readiness.",
    priority: "High",
    status: "Not Started",
    owner: "John / Steven",
    due_date: null,
    estimated_cost: "WI DVB $150 if applying; internal review",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "Technology, Security, and Backup",
    title: "Document server backup, access control, production/development separation, incident response, vendor register, and change log.",
    description: "Buyers will ask where data lives, who can access it, retention, and recovery expectations.",
    priority: "Required",
    status: "Not Started",
    owner: "John / Steven",
    due_date: null,
    estimated_cost: "Supabase backups/storage and internal time",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "Corporate Folder System and Document Control",
    title: "Create corporate folders, document numbering, owner, version, approval status, and review cycle.",
    description: "Recommended folders cover admin, legal, finance, product, safety library, clients, sales, personnel, compliance, and backups.",
    priority: "Required",
    status: "Not Started",
    owner: "John",
    due_date: null,
    estimated_cost: "Workspace storage cost varies",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "Team Roles and Meeting Cadence",
    title: "Set role map, weekly priority meeting, decision log, escalation rule, and no-new-task rule.",
    description: "Define who owns decisions, who recommends, who reviews, and who approves.",
    priority: "High",
    status: "Not Started",
    owner: "John / Steven / Ryan",
    due_date: null,
    estimated_cost: "$0 internal",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "30-60-90 Day Launch Plan",
    title: "Execute foundation, sales readiness, controlled pilot outreach, onboarding, feedback, and launch decision stages.",
    description: "Get protected and demo-ready without overbuilding the future platform first.",
    priority: "High",
    status: "Not Started",
    owner: "John / Steven",
    due_date: null,
    estimated_cost: "Track one-time costs, monthly burn, and budget cap",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
  {
    section: "Final Launch Gate Checklist",
    title: "Complete go/no-go checks before accepting a paying customer or launching a real-data pilot.",
    description: "Must confirm entity, legal package, demo, CSEP, pricing, backup, folders, data rules, website/legal links, and cost tracker.",
    priority: "Must be yes",
    status: "Not Started",
    owner: "John / Steven",
    due_date: null,
    estimated_cost: "Must be yes before launch",
    notes: "",
    completed: false,
    linked_document_id: null,
  },
];

export const requiredDocuments = [
  {
    section: "Business Formation",
    icon: FileText,
    items: [
      "Articles of Organization",
      "Operating Agreement",
      "Founder / Partner Agreement",
      "IP Assignment Agreement",
      "Contractor Agreement",
    ],
  },
  {
    section: "Legal / Customer",
    icon: ShieldCheck,
    items: [
      "Mutual NDA",
      "Master Services Agreement",
      "Statement of Work Template",
      "Pilot / Beta Agreement",
      "Terms of Use",
      "Privacy Policy",
      "Data Processing Addendum",
      "E-Sign Consent",
      "AI Output Disclaimer",
      "Acceptable Use Policy",
    ],
  },
  {
    section: "Operations",
    icon: ListChecks,
    items: [
      "Document Review SOP",
      "Data Retention Schedule",
      "Incident Response Plan",
      "Backup and Recovery Plan",
      "Access Control Policy",
      "Vendor / Subprocessor Register",
    ],
  },
  {
    section: "Product",
    icon: Gauge,
    items: [
      "Demo Platform Guide",
      "Sample Data Pack",
      "Final CSEP Demo",
      "CSEP Review Checklist",
      "SOR Import Template",
      "SOR Scoring Guide",
      "Injury / Near Miss Intake Template",
      "Corrective Action Tracker",
    ],
  },
  {
    section: "Compliance",
    icon: BookOpenCheck,
    items: [
      "ISO 45001 Capability Matrix",
      "WI DVB Packet",
      "CA DVBE Packet",
      "Cybersecurity Readiness Checklist",
      "Privacy / Data Retention Checklist",
    ],
  },
  {
    section: "Finance",
    icon: BarChart3,
    items: [
      "Pricing Model Worksheet",
      "One-Page Pricing Sheet",
      "QuickBooks Item List",
      "Discount Approval Policy",
    ],
  },
  {
    section: "Sales",
    icon: UploadCloud,
    items: [
      "Marketing Deck",
      "Product Flyer",
      "Demo Script",
      "Proposal Template",
      "Buyer FAQ",
      "Website Copy",
      "Email Templates",
      "Business Card Copy",
    ],
  },
  {
    section: "Technology / Security",
    icon: FolderLock,
    items: [
      "Server Backup Plan",
      "Access Control Policy",
      "Production / Development Separation SOP",
      "Incident Response Plan",
      "Vendor / Subprocessor Register",
      "Data Retention / Deletion SOP",
      "Change Management Log",
      "Admin Review Audit Trail",
    ],
  },
];

export const launchGateItems = [
  "Entity, ownership, EIN, bank, accounting, and insurance review are complete.",
  "NDA, MSA, SOW, pilot agreement, terms, privacy, e-sign consent, and AI disclaimer are attorney-reviewed or approved for controlled beta use.",
  "Demo platform link works on laptop and phone with sample data only.",
  "Final CSEP demo output is clean, professional, and buyer-ready.",
  "Pricing model and proposal template are approved.",
  "Backup/recovery plan and incident response plan are documented.",
  "Corporate folders and document numbers are created.",
  "Data validation rules are written before importing client SOR/injury data.",
  "Website or landing page includes contact path plus legal/privacy links.",
  "Cost tracker shows one-time costs, monthly burn, and budget cap.",
];

export type CalendarEvent = {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  event_type: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  visibility: string;
  status: string;
  location: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarEventAttendee = {
  id: string;
  event_id: string;
  user_id: string;
  status: string;
  created_at: string;
};
