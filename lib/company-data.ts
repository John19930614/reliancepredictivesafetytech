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
      "Capture safety observations in a consistent format so field data becomes searchable, scored, and useful.",
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
      "Use field signals and historical records to surface risk trends before they become injuries.",
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
  "Saves time creating safety documents",
  "Reduces manual safety admin work",
  "Improves consistency and compliance",
  "Uses field data to identify trends",
  "Supports predictive risk visibility",
  "Helps companies prepare better safety plans",
  "Requires human review for safety-critical outputs",
];

export const documentCategories = [
  "Business Formation",
  "Legal / Customer",
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
  checklist_item_id: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  status: string;
  owner: string | null;
  revision: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

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
