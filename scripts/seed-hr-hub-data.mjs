import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !secretKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false },
});

const companyPositions = [
  {
    id: "00000000-0000-0000-0000-000000000101",
    title: "Founder / Managing Member",
    department: "Leadership",
    parent_position_id: null,
    status: "Filled",
    employee_name: "John",
    salary_period: "Annual",
    employment_type: "Full-time",
    hiring_priority: "High",
    sort_order: 10,
    notes: "Seeded founder role. Add email and phone when ready.",
  },
  {
    id: "00000000-0000-0000-0000-000000000102",
    title: "Product / Technology Lead",
    department: "Technology / Product",
    parent_position_id: "00000000-0000-0000-0000-000000000101",
    status: "Filled",
    employee_name: "Steven",
    salary_period: "Annual",
    employment_type: "Full-time",
    hiring_priority: "High",
    sort_order: 20,
    notes: "Seeded filled role. Add email and phone when ready.",
  },
  {
    id: "00000000-0000-0000-0000-000000000103",
    title: "Sales / Marketing Lead",
    department: "Sales / Marketing",
    parent_position_id: "00000000-0000-0000-0000-000000000101",
    status: "Filled",
    employee_name: "Ryan",
    salary_period: "Annual",
    employment_type: "Full-time",
    hiring_priority: "High",
    sort_order: 30,
    notes: "Seeded filled role. Add email and phone when ready.",
  },
  {
    id: "00000000-0000-0000-0000-000000000104",
    title: "Safety Product SME",
    department: "Safety",
    parent_position_id: "00000000-0000-0000-0000-000000000102",
    status: "Open",
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
  },
  {
    id: "00000000-0000-0000-0000-000000000105",
    title: "Customer Success / Onboarding Manager",
    department: "Customer Success",
    parent_position_id: "00000000-0000-0000-0000-000000000101",
    status: "Open",
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
  },
  {
    id: "00000000-0000-0000-0000-000000000110",
    title: "Safety Trainer",
    department: "Safety",
    parent_position_id: "00000000-0000-0000-0000-000000000104",
    status: "Needed",
    job_description:
      "Prepare and deliver safety training content, onboarding training, refresher modules, toolbox talks, and role-based safety learning materials.",
    salary_period: "Annual",
    employment_type: "Full-time",
    location: "Remote / Hybrid",
    hiring_priority: "Medium",
    sort_order: 72,
    notes: "Future trainer role for safety content, onboarding, and customer education.",
  },
  {
    id: "00000000-0000-0000-0000-000000000111",
    title: "PHSEP / CSEP Review Specialist",
    department: "Safety",
    parent_position_id: "00000000-0000-0000-0000-000000000104",
    status: "Needed",
    job_description:
      "Review PHSEP and CSEP drafts for safety accuracy, completeness, field usability, project alignment, and readiness for admin or owner approval.",
    salary_period: "Annual",
    employment_type: "Full-time",
    location: "Remote / Hybrid",
    hiring_priority: "High",
    sort_order: 74,
    notes: "Dedicated review spot for PHSEP and CSEP document quality control.",
  },
  {
    id: "00000000-0000-0000-0000-000000000106",
    title: "Sales Development Representative",
    department: "Sales / Marketing",
    parent_position_id: "00000000-0000-0000-0000-000000000103",
    status: "Needed",
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
  },
  {
    id: "00000000-0000-0000-0000-000000000107",
    title: "Compliance / Legal Operations Coordinator",
    department: "Legal / Compliance",
    parent_position_id: "00000000-0000-0000-0000-000000000101",
    status: "Needed",
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
  },
  {
    id: "00000000-0000-0000-0000-000000000108",
    title: "Finance / Accounting Support",
    department: "Finance",
    parent_position_id: "00000000-0000-0000-0000-000000000101",
    status: "Needed",
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
  },
  {
    id: "00000000-0000-0000-0000-000000000109",
    title: "Software Engineer / Platform Support",
    department: "Technology / Product",
    parent_position_id: "00000000-0000-0000-0000-000000000102",
    status: "Needed",
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
  },
];

const roles = [
  ["platform-build", "Platform Build", "Platform, product builder, export, content, and debugging work.", 10],
  ["safety-content", "Safety Content", "Safety plan, JSA, training, observation, and content-library work.", 20],
  ["data-admin", "Data/Admin", "Database, admin workflow, forecasting, and support debugging work.", 30],
  ["sales-billing", "Sales/Billing", "Marketplace, billing, and customer-facing dashboard work.", 40],
  ["qa-review", "QA/Review", "Testing, review, export review, and admin review workflow work.", 50],
];

const categories = [
  ["pshsep-builder", "PSHSEP Builder", 10],
  ["injury-forecasting", "Injury Forecasting", 11],
  ["dashboard-ui", "Dashboard / UI", 12],
  ["docx-export", "DOCX Export", 13],
  ["training-matrix", "Training Matrix", 14],
  ["supabase-database", "Supabase / Database", 15],
  ["csep-builder", "CSEP Builder", 16],
  ["sor-analytics", "SOR / Analytics", 17],
  ["testing-debugging", "Testing / Debugging", 18],
  ["marketplace-billing", "Marketplace / Billing", 19],
  ["admin-review-workflow", "Admin Review Workflow", 20],
  ["content-library", "Content Library", 21],
  ["jsa-permits", "JSA / Permits", 22],
];

const tasks = [
  ["pshsep-builder-reviewed-master-plan-modules-for-hazards-programs-and-project-rules", "pshsep-builder", "Reviewed master plan modules for hazards, programs, and project rules.", 10, true],
  ["injury-forecasting-outlined-baseline-data-sources-and-future-historical-data-buckets", "injury-forecasting", "Outlined baseline data sources and future historical-data buckets.", 11, false],
  ["dashboard-ui-tested-dropdown-based-navigation-for-the-main-platform-page", "dashboard-ui", "Tested dropdown-based navigation for the main platform page.", 12, true],
  ["docx-export-cleaned-up-docx-spacing-section-breaks-and-table-of-contents-behavior", "docx-export", "Cleaned up DOCX spacing, section breaks, and table of contents behavior.", 13, false],
  ["training-matrix-tested-training-section-wording-for-user-friendly-navigation", "training-matrix", "Tested training section wording for user-friendly navigation.", 14, true],
  ["dashboard-ui-improved-interface-wording-so-the-platform-feels-less-technical", "dashboard-ui", "Improved interface wording so the platform feels less technical.", 15, false],
  ["supabase-database-mapped-document-metadata-needed-for-review-preview-and-download", "supabase-database", "Mapped document metadata needed for review, preview, and download.", 16, true],
  ["docx-export-worked-on-docx-export-formatting-for-headings-paragraphs-and-page-order", "docx-export", "Worked on DOCX export formatting for headings, paragraphs, and page order.", 17, false],
  ["csep-builder-mapped-permit-requirements-into-the-csep-build-flow", "csep-builder", "Mapped permit requirements into the CSEP build flow.", 18, false],
  ["sor-analytics-tested-categories-for-positive-and-negative-safety-observations", "sor-analytics", "Tested categories for positive and negative safety observations.", 19, true],
  ["csep-builder-reviewed-csep-output-for-automation-wording-and-professional-tone", "csep-builder", "Reviewed CSEP output for automation wording and professional tone.", 20, true],
  ["testing-debugging-reviewed-generated-output-for-broken-formatting-or-duplicate-sections", "testing-debugging", "Reviewed generated output for broken formatting or duplicate sections.", 21, true],
  ["sor-analytics-created-notes-for-central-safety-observation-hub-design", "sor-analytics", "Created notes for central safety observation hub design.", 22, false],
  ["csep-builder-tested-steel-erection-csep-generation-against-formatting-notes", "csep-builder", "Tested steel erection CSEP generation against formatting notes.", 23, true],
  ["pshsep-builder-tested-pshsep-export-order-from-title-page-through-appendices", "pshsep-builder", "Tested PSHSEP export order from title page through appendices.", 24, true],
  ["injury-forecasting-refined-injury-forecaster-concept-using-observations-incidents-and-weat", "injury-forecasting", "Refined injury forecaster concept using observations, incidents, and weather.", 25, false],
  ["testing-debugging-reviewed-error-messages-from-deployment-and-planned-code-fixes", "testing-debugging", "Reviewed error messages from deployment and planned code fixes.", 26, true],
  ["marketplace-billing-reviewed-document-marketplace-wording-and-access-levels", "marketplace-billing", "Reviewed document marketplace wording and access levels.", 27, true],
  ["supabase-database-reviewed-database-fields-for-document-status-notes-and-review-tracking", "supabase-database", "Reviewed database fields for document status, notes, and review tracking.", 28, true],
  ["csep-builder-updated-hazard-task-module-fallback-language-for-trade-specific-builds", "csep-builder", "Updated hazard/task module fallback language for trade-specific builds.", 29, false],
  ["sor-analytics-outlined-analytics-views-for-observations-by-trade-and-hazard-type", "sor-analytics", "Outlined analytics views for observations by trade and hazard type.", 30, false],
  ["pshsep-builder-worked-on-master-project-safety-plan-builder-structure-and-front-matter", "pshsep-builder", "Worked on master project safety plan builder structure and front matter.", 31, false],
  ["dashboard-ui-worked-on-role-based-dashboard-visibility-for-field-users-and-admins", "dashboard-ui", "Worked on role-based dashboard visibility for field users and admins.", 32, false],
  ["testing-debugging-tested-platform-pages-and-noted-layout-routing-or-build-issues", "testing-debugging", "Tested platform pages and noted layout, routing, or build issues.", 33, true],
  ["docx-export-tested-document-generation-output-for-csep-and-pshsep-builders", "docx-export", "Tested document generation output for CSEP and PSHSEP builders.", 34, true],
  ["admin-review-workflow-wrote-process-notes-for-admin-review-and-customer-handoff", "admin-review-workflow", "Wrote process notes for admin review and customer handoff.", 35, true],
  ["pshsep-builder-drafted-owner-safety-message-and-sign-off-section-logic", "pshsep-builder", "Drafted owner safety message and sign-off section logic.", 36, false],
  ["marketplace-billing-outlined-marketplace-flow-for-templates-purchases-and-preview-approval", "marketplace-billing", "Outlined marketplace flow for templates, purchases, and preview approvals.", 37, true],
  ["supabase-database-worked-through-row-level-security-issues-affecting-user-submissions", "supabase-database", "Worked through row-level security issues affecting user submissions.", 38, false],
  ["injury-forecasting-mapped-predictive-risk-categories-for-trade-and-month-by-month-forecast", "injury-forecasting", "Mapped predictive risk categories for trade and month-by-month forecasting.", 39, false],
  ["injury-forecasting-reviewed-dashboard-concept-for-likely-next-injury-exposure-areas", "injury-forecasting", "Reviewed dashboard concept for likely next injury exposure areas.", 40, true],
  ["csep-builder-cleaned-up-csep-section-ordering-and-removed-duplicate-safety-language", "csep-builder", "Cleaned up CSEP section ordering and removed duplicate safety language.", 41, false],
  ["content-library-organized-reusable-safety-plan-modules-for-hazards-tasks-and-programs", "content-library", "Organized reusable safety plan modules for hazards, tasks, and programs.", 42, false],
  ["marketplace-billing-mapped-billing-and-invoice-areas-for-customer-facing-navigation", "marketplace-billing", "Mapped billing and invoice areas for customer-facing navigation.", 43, false],
  ["content-library-drafted-reusable-wording-for-site-setup-access-housekeeping-and-permits", "content-library", "Drafted reusable wording for site setup, access, housekeeping, and permits.", 44, false],
  ["pshsep-builder-refined-pshsep-table-of-contents-and-site-wide-policy-sections", "pshsep-builder", "Refined PSHSEP table of contents and site-wide policy sections.", 45, false],
  ["testing-debugging-tested-user-navigation-across-dashboard-jobsites-and-documents", "testing-debugging", "Tested user navigation across dashboard, jobsites, and documents.", 46, true],
  ["dashboard-ui-designed-dashboard-blocks-for-documents-jobsites-marketplace-and-billing", "dashboard-ui", "Designed dashboard blocks for documents, jobsites, marketplace, and billing.", 47, false],
  ["jsa-permits-built-logic-for-ai-assisted-jsa-task-and-hazard-prompts", "jsa-permits", "Built logic for AI-assisted JSA task and hazard prompts.", 48, false],
  ["marketplace-billing-estimated-platform-value-by-feature-labor-savings-and-review-workflow", "marketplace-billing", "Estimated platform value by feature, labor savings, and review workflow.", 49, true],
  ["csep-builder-refined-contractor-site-specific-plan-module-layout-and-wording", "csep-builder", "Refined contractor site-specific plan module layout and wording.", 50, false],
  ["dashboard-ui-refined-platform-home-page-layout-with-larger-user-friendly-sections", "dashboard-ui", "Refined platform home page layout with larger user-friendly sections.", 51, false],
  ["testing-debugging-debugged-ui-sections-that-were-not-rendering-or-saving-correctly", "testing-debugging", "Debugged UI sections that were not rendering or saving correctly.", 52, false],
  ["marketplace-billing-worked-on-subscription-tier-ideas-setup-costs-and-credit-based-pricing", "marketplace-billing", "Worked on subscription tier ideas, setup costs, and credit-based pricing.", 53, false],
  ["supabase-database-troubleshot-supabase-storage-bucket-and-document-upload-logic", "supabase-database", "Troubleshot Supabase storage bucket and document upload logic.", 54, false],
  ["training-matrix-mapped-missing-or-expiring-training-alerts-for-supervisor-dashboards", "training-matrix", "Mapped missing or expiring training alerts for supervisor dashboards.", 55, false],
  ["content-library-cleaned-up-module-naming-from-elements-to-modules", "content-library", "Cleaned up module naming from elements to modules.", 56, false],
  ["jsa-permits-connected-permit-triggers-to-selected-jsa-tasks-and-work-conditions", "jsa-permits", "Connected permit triggers to selected JSA tasks and work conditions.", 57, false],
  ["admin-review-workflow-designed-admin-review-process-for-submitted-safety-documents", "admin-review-workflow", "Designed admin review process for submitted safety documents.", 58, true],
  ["sor-analytics-worked-on-safety-observation-report-trend-categories-and-dashboard-use", "sor-analytics", "Worked on safety observation report trend categories and dashboard use.", 59, false],
];

const roleCategorySeeds = [
  ["platform-build", "csep-builder"],
  ["platform-build", "pshsep-builder"],
  ["platform-build", "jsa-permits"],
  ["platform-build", "dashboard-ui"],
  ["platform-build", "docx-export"],
  ["platform-build", "content-library"],
  ["platform-build", "testing-debugging"],
  ["safety-content", "csep-builder"],
  ["safety-content", "pshsep-builder"],
  ["safety-content", "jsa-permits"],
  ["safety-content", "training-matrix"],
  ["safety-content", "sor-analytics"],
  ["safety-content", "content-library"],
  ["data-admin", "supabase-database"],
  ["data-admin", "admin-review-workflow"],
  ["data-admin", "injury-forecasting"],
  ["data-admin", "testing-debugging"],
  ["sales-billing", "marketplace-billing"],
  ["sales-billing", "dashboard-ui"],
  ["qa-review", "testing-debugging"],
  ["qa-review", "admin-review-workflow"],
  ["qa-review", "docx-export"],
];

function indexBySlug(rows) {
  return new Map(rows.map((row) => [row.slug, row]));
}

async function checked(label, query) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

await checked(
  "company positions",
  supabase.from("company_positions").upsert(companyPositions, { onConflict: "id" }),
);

await checked(
  "time card roles",
  supabase.from("time_card_roles").upsert(
    roles.map(([slug, name, description, sort_order]) => ({ slug, name, description, sort_order })),
    { onConflict: "slug" },
  ),
);

await checked(
  "time card categories",
  supabase.from("time_card_categories").upsert(
    categories.map(([slug, name, sort_order]) => ({ slug, name, sort_order })),
    { onConflict: "slug" },
  ),
);

const categoryRows = await checked(
  "load categories",
  supabase.from("time_card_categories").select("id, slug"),
);
const categoriesBySlug = indexBySlug(categoryRows);

await checked(
  "time card tasks",
  supabase.from("time_card_tasks").upsert(
    tasks.map(([slug, categorySlug, title, sort_order, is_review_task]) => ({
      slug,
      category_id: categoriesBySlug.get(categorySlug).id,
      title,
      sort_order,
      is_review_task,
    })),
    { onConflict: "slug" },
  ),
);

const roleRows = await checked("load roles", supabase.from("time_card_roles").select("id, slug"));
const taskRows = await checked(
  "load tasks",
  supabase.from("time_card_tasks").select("id, slug, category_id, is_review_task"),
);
const rolesBySlug = indexBySlug(roleRows);

const roleCategoryPairs = new Map();
for (const [roleSlug, categorySlug] of roleCategorySeeds) {
  roleCategoryPairs.set(
    `${rolesBySlug.get(roleSlug).id}:${categoriesBySlug.get(categorySlug).id}`,
    {
      role_id: rolesBySlug.get(roleSlug).id,
      category_id: categoriesBySlug.get(categorySlug).id,
    },
  );
}

const qaRole = rolesBySlug.get("qa-review");
for (const task of taskRows.filter((task) => task.is_review_task)) {
  roleCategoryPairs.set(`${qaRole.id}:${task.category_id}`, {
    role_id: qaRole.id,
    category_id: task.category_id,
  });
}

await checked(
  "time card role categories",
  supabase.from("time_card_role_categories").upsert([...roleCategoryPairs.values()], {
    onConflict: "role_id,category_id",
    ignoreDuplicates: true,
  }),
);

const roleTaskPairs = new Map();
for (const [roleSlug, categorySlug] of roleCategorySeeds.filter(([roleSlug]) => roleSlug !== "qa-review")) {
  const roleId = rolesBySlug.get(roleSlug).id;
  const categoryId = categoriesBySlug.get(categorySlug).id;
  for (const task of taskRows.filter((task) => task.category_id === categoryId)) {
    roleTaskPairs.set(`${roleId}:${task.id}`, { role_id: roleId, task_id: task.id });
  }
}

const qaCategorySlugs = ["testing-debugging", "admin-review-workflow", "docx-export"];
const qaCategoryIds = new Set(qaCategorySlugs.map((slug) => categoriesBySlug.get(slug).id));
for (const task of taskRows.filter((task) => task.is_review_task || qaCategoryIds.has(task.category_id))) {
  roleTaskPairs.set(`${qaRole.id}:${task.id}`, { role_id: qaRole.id, task_id: task.id });
}

await checked(
  "time card role tasks",
  supabase.from("time_card_role_tasks").upsert([...roleTaskPairs.values()], {
    onConflict: "role_id,task_id",
    ignoreDuplicates: true,
  }),
);

const counts = {};
for (const table of [
  "company_positions",
  "time_card_roles",
  "time_card_categories",
  "time_card_tasks",
  "time_card_role_categories",
  "time_card_role_tasks",
]) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) {
    throw new Error(`${table} count: ${error.message}`);
  }
  counts[table] = count;
}

console.log(JSON.stringify(counts, null, 2));
