// Typed proposal templates — one per transaction type the practice actually
// sells. "Label the templates by proposal type: Pilot, Time and Materials,
// Fixed Price, Enterprise" (John, 2026-08-11); Steve's brief adds the pilot's
// emphasis (setup, testing, sharing information), the tier-ladder proposal, and
// that every proposal carries a bio and the legal requirements.
//
// The legal requirements need no template content: buildDocumentTerms() in
// components/proposals/proposal-document-model.ts renders the full commercial &
// legal terms, the legal notice and the acceptance block on EVERY document,
// from SELECT-backed fields with defaults. Bios are a per-proposal selection
// (who is doing THIS work), so templates cannot pre-pick people — instead the
// readiness checks in lib/proposals/review-checks.ts flag a proposal that
// still has no team selected.
//
// These are CODE, not rows in client_proposal_templates, on purpose:
//   * they version with the price book (lib/proposals/catalog.ts) instead of
//     drifting from it in a jsonb column,
//   * they cannot be deleted or edited into a client leak, and
//   * the unit tests can prove every one of them is scrub-clean and passes the
//     consistency scanner before it ever seeds a proposal.
// A seller who wants a customised variant still saves one through the existing
// Proposal Templates module; these are the starting points.
//
// COPY RULE (same as the catalog's): no user counts, no site counts, no
// durations and no dollar figures in any frozen string. Every count and price
// the client reads is composed at render time from the proposal's own fields —
// lib/proposals/consistency.ts flags prose that contradicts them, and a
// template that ships pre-flagged would be the old default-pilot defect again.
//
// Applying one goes through buildStateFromTemplate() exactly like a saved
// template: scrubbed first (defence in depth), the assigned company's identity
// layered second. Nothing here may set a client field, proposalNo,
// proposalDate or preparedBy — the tests assert templateLeakFieldIds() = [].

import { packageData, phaseOptions, serviceOptions, type PackageKey, type PhaseKey, type ServiceKey } from "./catalog";
import type { GeneratorFieldValue, GeneratorItem, GeneratorState } from "./generator-state";

/**
 * Generator field id carrying which transaction type seeded the proposal.
 *
 * Backed by a hidden input in assets/proposal-generator-v15.html: the bridge
 * only collects fields that have an element, so a value written here without
 * one would be dropped on the seller's next save. Same mechanism as the team
 * picker's two hidden inputs.
 */
export const proposalTypeFieldId = "proposalType";

/**
 * The Billing Term options, transcribed verbatim from the `billingTerm`
 * <select> in assets/proposal-generator-v15.html. The options carry no value
 * attribute, so the state stores the visible text — a template writing any
 * other string would print in the document but silently fail to select in the
 * editor. The parity test keeps this list honest against the asset.
 */
export const proposalBillingTermOptions = Object.freeze([
  "One-time (pilot)",
  "Annual upfront",
  "Quarterly",
  "Monthly",
  "Milestone-based",
] as const);

export type ProposalBillingTerm = (typeof proposalBillingTermOptions)[number];

export const transactionTemplateKeys = Object.freeze([
  "pilot",
  "time_and_materials",
  "fixed_price",
  "enterprise",
  "retainer",
  "training",
] as const);

export type TransactionTemplateKey = (typeof transactionTemplateKeys)[number];

export function isTransactionTemplateKey(value: string): value is TransactionTemplateKey {
  return (transactionTemplateKeys as readonly string[]).includes(value);
}

/** What the picker shows for one proposal type. */
export interface TransactionTemplateSummary {
  key: TransactionTemplateKey;
  label: string;
  description: string;
}

interface PhaseSeed {
  key: PhaseKey;
  /** Unit fee override; omitted = the catalog price. */
  price?: number;
  /** Scope copy override; omitted = "" so the catalog sentence rides along. */
  desc?: string;
}

interface ServiceSeed {
  key: ServiceKey;
  /** Estimated quantity; the seller sets the real one per deal. */
  qty?: number;
}

interface TransactionTemplateDefinition {
  key: TransactionTemplateKey;
  /** Picker label, e.g. "Time & Materials". */
  label: string;
  /**
   * How the CLIENT'S DOCUMENT names the engagement, e.g. "Training Services".
   * Separate from `label` because a dropdown entry and a line printed under a
   * company wordmark are not the same register — "Training" picks a template;
   * "Training Services Proposal" is what the client reads.
   */
  documentLabel: string;
  description: string;
  /**
   * The base subscription this type sells, or `none` for a services-only
   * engagement.
   *
   * ONLY the platform types carry a subscription. Training, fixed-price
   * deliverables, time-and-materials tasks and an advisory retainer are not
   * platform purchases, and seeding them with a package made the document open
   * on "Selected Platform Package", print a "Platform Services" fee row at $0,
   * and show Included Users / Included Jobsites pills for seats nobody bought.
   * A services deal that DOES include platform access gets a real package
   * chosen in the editor — deliberately, rather than by default.
   */
  packageKey: PackageKey;
  billingTerm: ProposalBillingTerm;
  /** Extra structured fields (counts etc. — fields, never prose). */
  fields?: Readonly<Record<string, GeneratorFieldValue>>;
  customSummary: string;
  customExclusions: string;
  phases: readonly PhaseSeed[];
  services: readonly ServiceSeed[];
}

/**
 * Line items are seeded with name/desc/unit = "" wherever the catalog copy
 * should apply: pricing.buildItemLine() and the generator both fall back to the
 * catalog entry on a falsy value, and consistency.ts marks the resolved text as
 * catalog boilerplate (exempt from figure flags). Storing the catalog sentence
 * would freeze it instead.
 */
function phaseItem(seed: PhaseSeed): GeneratorItem {
  return {
    type: "phase",
    key: seed.key,
    name: "",
    qty: 1,
    price: seed.price ?? phaseOptions[seed.key].price,
    desc: seed.desc ?? "",
    unit: "",
  };
}

function serviceItem(seed: ServiceSeed): GeneratorItem {
  return {
    type: "service",
    key: seed.key,
    name: "",
    qty: seed.qty ?? 1,
    price: serviceOptions[seed.key].price,
    desc: "",
    unit: "",
  };
}

const definitions: Readonly<Record<TransactionTemplateKey, TransactionTemplateDefinition>> = Object.freeze({
  /* ------------------------------------------------------------------------ */
  /* Pilot — heavier setup, testing and information sharing (Steve's brief).   */
  /* The four phases price at 0 because the pilot package fee IS the price of  */
  /* the pilot; they print as scope, not as separate fees.                     */
  /* ------------------------------------------------------------------------ */
  pilot: {
    key: "pilot",
    label: "Pilot",
    documentLabel: "Pilot & Platform Access",
    description:
      "Fixed-price platform pilot — heavier setup, testing, and shared reporting, with any broader rollout scoped as its own decision.",
    packageKey: "custom",
    billingTerm: "One-time (pilot)",
    // The pilot package's own included counts, so the fields agree with the
    // package paragraph from the first render (matches the asset's defaults).
    fields: { includedUsers: 50, includedSites: 2 },
    customSummary:
      "This proposal establishes a fixed-price pilot of the platform. The pilot places deliberate weight on the parts of an evaluation that decide it: hands-on setup and configuration of the jobsites and user accounts in scope, structured testing of the workflows your team will actually run, and a shared reporting cadence so both organizations review the same results as they land. The included users, jobsites, pilot fee, and term dates are stated in the schedule below. At the close of the pilot term, findings are reviewed together and any broader rollout is scoped as its own decision — nothing converts automatically.",
    customExclusions:
      "The pilot fee covers the setup, configuration, testing, and training activities listed in the scope, for the included users and jobsites shown in the schedule. Client will make the relevant personnel, documents, and jobsite information available in a timely manner; pilot timelines assume that access. Production rollout, additional modules, and continued platform access after the pilot term are quoted separately. Pricing and terms remain open for the acceptance window stated in the terms.",
    phases: [
      {
        key: "discovery",
        price: 0,
        desc: "Kickoff, pilot success criteria, platform access, and configuration of the jobsites and user accounts in scope for the pilot.",
      },
      {
        key: "build",
        price: 0,
        desc: "Configure the modules, templates, dashboards, and workflows the pilot will exercise in day-to-day use.",
      },
      {
        key: "validation",
        price: 0,
        desc: "Hands-on testing with your team, review of sample outputs against expectations, and correction of gaps before results are relied on.",
      },
      {
        key: "launch",
        price: 0,
        desc: "User training, a shared reporting cadence, and progress reviews so both teams are looking at the same results throughout the pilot.",
      },
    ],
    services: [],
  },

  /* ------------------------------------------------------------------------ */
  /* Time & Materials — individual task lines at unit rates.                   */
  /* ------------------------------------------------------------------------ */
  time_and_materials: {
    key: "time_and_materials",
    label: "Time & Materials",
    documentLabel: "Time & Materials Services",
    description: "Task-by-task line items billed at unit rates for the quantities actually delivered — estimates, not a fixed price.",
    packageKey: "none",
    billingTerm: "Monthly",
    customSummary:
      "This engagement is billed on a time-and-materials basis. The schedule of fees lists each task as its own line item with a unit rate and an estimated quantity; invoices reflect the quantities actually delivered, at the rates shown. Estimated quantities are planning figures, not a fixed price — where scope grows or shrinks, billing follows the work performed. Rates hold for the validity period of this proposal, and new task types are added by written approval before the work begins.",
    customExclusions:
      "Quantities shown in the schedule are estimates provided for planning. Actual invoicing follows delivered time, sessions, and units at the listed rates. Travel and related expenses, where applicable, are billed as incurred under the expense lines shown. Work requested outside the listed task lines is confirmed in writing before it is performed.",
    phases: [],
    services: [{ key: "reviewHour" }, { key: "fieldDay" }],
  },

  /* ------------------------------------------------------------------------ */
  /* Fixed Price — named deliverables for one total (Steve's example: "write   */
  /* three programs and conduct two audits for a fixed price").                */
  /* ------------------------------------------------------------------------ */
  fixed_price: {
    key: "fixed_price",
    label: "Fixed Price",
    documentLabel: "Fixed-Price Services",
    description: "Named deliverables for a fixed total — anything outside the list goes through a written change order.",
    packageKey: "none",
    billingTerm: "Milestone-based",
    customSummary:
      "This proposal offers the deliverables enumerated in the schedule of fees for a fixed price. Each line describes a deliverable and the scope it covers; the total stated in the schedule is the full professional fee for that combined scope. Requests that fall outside the listed deliverables are handled through a written change order with its own pricing, so the fixed price stays fixed. Delivery sequence and dates are coordinated at kickoff, and billing follows the milestone structure shown in the terms.",
    customExclusions:
      "The fixed price covers the deliverables listed in the schedule and only those deliverables. Client will provide the operational information, documents, and review feedback each deliverable depends on; turnaround assumes timely responses. Revisions are included within the review cycle described for each deliverable; additional rounds or new scope proceed by change order.",
    phases: [],
    services: [{ key: "docMedium" }, { key: "complianceAudit" }],
  },

  /* ------------------------------------------------------------------------ */
  /* Enterprise — the tier ladder, smallest to Enterprise (Steve's brief),     */
  /* proposing the Enterprise package. Tier names interpolate from the catalog */
  /* so a price-book rename cannot strand the prose.                           */
  /* ------------------------------------------------------------------------ */
  enterprise: {
    key: "enterprise",
    label: "Enterprise",
    documentLabel: "Enterprise Platform Subscription",
    description: "Platform subscription presenting the tier ladder from smallest to Enterprise, proposing the Enterprise tier.",
    packageKey: "enterprise",
    billingTerm: "Annual upfront",
    // The Enterprise package's included counts, so the fields agree with the
    // package paragraph instead of inheriting the editor's pilot-sized defaults.
    fields: { includedUsers: packageData.enterprise.users, includedSites: packageData.enterprise.sites },
    customSummary:
      "The platform is offered as a tiered subscription, and this proposal recommends the tier we believe fits your operation. " +
      `${packageData.starter.name} covers core compliance support for a smaller operation or an early-stage rollout. ` +
      `${packageData.professional.name} expands into active jobsite operations: document control, audits and inspections, and leadership reporting. ` +
      `${packageData.enterprise.name} — the tier proposed here — adds the full multi-site safety intelligence package: predictive risk capability, AI-supported review, and executive visibility across the jobsites in scope. ` +
      "The included users, jobsites, subscription fee, and term dates for the proposed tier are stated in the schedule below, and the tier can be adjusted before signature if your needs change.",
    customExclusions:
      "The subscription covers the platform capabilities of the selected tier for the included users and jobsites shown in the schedule. Implementation phases listed in the scope are professional services and are billed as shown. Integrations, custom development, and on-site services beyond the listed scope are quoted separately. Renewal pricing is confirmed in writing before each renewal term.",
    phases: [{ key: "discovery" }, { key: "build" }, { key: "launch" }],
    services: [],
  },

  /* ------------------------------------------------------------------------ */
  /* Retainer — recurring advisory and platform support.                       */
  /* ------------------------------------------------------------------------ */
  retainer: {
    key: "retainer",
    label: "Retainer",
    documentLabel: "Safety Advisory Retainer",
    description: "Recurring advisory and safety support on a monthly billing term, with project work quoted separately.",
    packageKey: "none",
    billingTerm: "Monthly",
    customSummary:
      "This proposal establishes an ongoing safety advisory retainer. The recurring scope in the schedule covers standing support: advisory access for safety questions as they arise, review of your safety reporting, and management-ready summaries on a regular cadence. The retainer is billed on the recurring term shown in the schedule and continues until adjusted or ended under the terms below — support is in place before issues become incidents, not after.",
    customExclusions:
      "The retainer covers the recurring services listed in the schedule. Project work — new safety programs, audits beyond the recurring cadence, incident response support, or training engagements — is scoped and quoted separately as it arises. Either party may adjust or end the retainer under the termination terms in this proposal.",
    phases: [{ key: "ongoing" }],
    services: [],
  },

  /* ------------------------------------------------------------------------ */
  /* Training — instructor-led course lines from the training catalog.         */
  /* ------------------------------------------------------------------------ */
  training: {
    key: "training",
    label: "Training",
    documentLabel: "Training Services",
    description: "Instructor-led courses from the training catalog — including First Aid / CPR / AED — billed per session or attendee.",
    packageKey: "none",
    // "Milestone-based" reads correctly for sessions invoiced as delivered; the
    // only one-time option carries "(pilot)" in its label, which a training
    // document must not print.
    billingTerm: "Milestone-based",
    customSummary:
      "This proposal covers instructor-led safety training delivered to your team. Each course in the schedule of fees is listed as its own line with its rate and billing unit, and its description states what the course covers and whether certification cards are issued. Session counts, dates, and locations are coordinated with your scheduling contact after acceptance, and courses can be added or removed before signature to match your training plan.",
    customExclusions:
      "Pricing assumes training is delivered at Client-provided facilities with a suitable training space; venue, projection, and attendee availability are Client's responsibility. Attendance rosters are confirmed before each session, and certification cards are issued only for attendees who complete the applicable course requirements. Travel, where applicable, is billed under the expense lines shown in the schedule.",
    phases: [],
    services: [{ key: "firstAid" }, { key: "genTraining" }],
  },
} as const satisfies Record<TransactionTemplateKey, TransactionTemplateDefinition>);

/** Picker rows, in the order the keys are declared. */
export function listTransactionTemplates(): TransactionTemplateSummary[] {
  return transactionTemplateKeys.map((key) => {
    const { label, description } = definitions[key];
    return { key, label, description };
  });
}

export function getTransactionTemplateLabel(key: TransactionTemplateKey): string {
  return definitions[key].label;
}

/**
 * The engagement label the DOCUMENT prints, e.g. "Training Services" — read
 * from the state's stamped type. Returns null for a proposal built before the
 * stamp existed, or one started blank, so callers fall back to package-derived
 * wording rather than asserting a type nobody chose.
 */
export function proposalTypeLabelFromState(fields: Record<string, unknown> | null | undefined): string | null {
  const raw = fields?.[proposalTypeFieldId];
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!isTransactionTemplateKey(key)) return null;
  return definitions[key].documentLabel;
}

/**
 * A fresh GeneratorState for one proposal type. Freshly built on every call —
 * the caller (and buildStateFromTemplate after it) may mutate the result, and a
 * shared object would let one proposal's edits reprice the next.
 */
export function buildTransactionTemplateState(key: TransactionTemplateKey): GeneratorState {
  const def = definitions[key];
  const fields: Record<string, GeneratorFieldValue> = {
    packageSelect: def.packageKey,
    billingTerm: def.billingTerm,
    customSummary: def.customSummary,
    customExclusions: def.customExclusions,
    // Stamped so the DOCUMENT can describe the engagement the seller chose —
    // the docline and section 02 read from this rather than inferring the deal
    // from whichever package happens to be selected.
    [proposalTypeFieldId]: key,
    ...def.fields,
  };
  return {
    v: 1,
    fields,
    phases: def.phases.map(phaseItem),
    services: def.services.map(serviceItem),
  };
}
