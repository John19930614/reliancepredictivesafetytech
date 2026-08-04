// Pure view-model for the client-facing proposal document.
//
// Ported from the `update()` renderer in assets/proposal-generator-v15.html: the
// asset builds the whole document by writing strings into `innerHTML` on every
// keystroke. Everything that document derives — party blocks, package pills,
// scope headings, deliverables, the fee table, the schedule sentence, and the
// 28 commercial/legal terms — is derived HERE instead, so:
//
//   * <ProposalDocument> stays declarative JSX (React escapes every value; the
//     module keeps no raw-HTML sink after its stored-XSS fix), and
//   * this logic is unit-testable under the repo's node-environment vitest
//     setup, which has no DOM/component test harness.
//
// Every number comes from computeProposalTotals(). Nothing here recomputes
// pricing, and nothing trusts a persisted numeric value directly.

import { lookupPackage, lookupService, packageData, defaultPackageKey } from "@/lib/proposals/catalog";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import {
  computeProposalTotals,
  formatMoney,
  type ProposalLineItem,
  type ProposalTotals,
} from "@/lib/proposals/pricing";
import { proposalStatusLabels, type ProposalStatus } from "@/lib/proposals/types";

/* -------------------------------------------------------------------------- */
/* Field access — a persisted state is untrusted input                         */
/* -------------------------------------------------------------------------- */

/** Rendered wherever a value is genuinely missing. Never a fabricated default. */
export const missingValue = "—";

function readField(state: GeneratorState | null | undefined, id: string): unknown {
  if (!state || typeof state !== "object") return undefined;
  const fields = (state as { fields?: unknown }).fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return undefined;
  return (fields as Record<string, unknown>)[id];
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return String(value);
  return "";
}

/**
 * Trimmed field text, or `fallback` when the field is absent/blank.
 *
 * Fallbacks are used for the SELECT-backed commercial terms (payment terms,
 * liability cap, governing law, …) where the asset's markup carries a `selected`
 * option and a blank would leave a contractual sentence dangling. Free-text
 * identity fields deliberately fall back to `missingValue` instead of the
 * asset's placeholder copy ("Client Company Name") — inventing a party name on a
 * document a client may sign is worse than an honest dash.
 */
export function fieldText(state: GeneratorState | null | undefined, id: string, fallback = ""): string {
  const text = asText(readField(state, id)).trim();
  return text === "" ? fallback : text;
}

/** Multi-line textarea field split into lines (the asset's `nl()` -> <br>). */
export function fieldLines(state: GeneratorState | null | undefined, id: string): string[] {
  return asText(readField(state, id))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** Whole-number count (users/sites), clamped to >= 0. Never NaN. */
export function fieldCount(state: GeneratorState | null | undefined, id: string, fallback: number): number {
  const raw = readField(state, id);
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) return Math.max(0, Math.floor(fallback));
  return Math.max(0, Math.floor(parsed));
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Formats a `YYYY-MM-DD` calendar date for the document.
 *
 * Deliberately NOT `new Date(...).toLocaleDateString()`: the document is
 * server-rendered, so a Date-based format would shift the day across the server
 * timezone boundary and vary with the server locale. Parsing the string parts
 * keeps the printed date identical to the date the seller typed. Anything that
 * is not a calendar date is echoed back verbatim rather than guessed at.
 */
export function formatDocumentDate(value: string | null | undefined): string {
  if (typeof value !== "string") return missingValue;
  const trimmed = value.trim();
  if (trimmed === "") return missingValue;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) return trimmed;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return trimmed;
  return `${monthNames[month - 1]} ${day}, ${year}`;
}

/* -------------------------------------------------------------------------- */
/* Asset defaults for the SELECT-backed commercial terms                       */
/* -------------------------------------------------------------------------- */

/**
 * The `selected` option of each `<select>` in the asset's control panel. A saved
 * state normally carries all of them; an older or partial state does not, and a
 * legal term reading "…limited to , and Seller is not liable…" would be worse
 * than the default the generator itself would have shown.
 */
export const documentTermDefaults = Object.freeze({
  sellerName: "Reliance Predictive Safety Technologies",
  validDays: "60",
  billingTerm: "One-time (pilot)",
  paymentTerms: "Net 30 from invoice date",
  lateFee: "1.5% per month on past-due undisputed balances",
  governingLaw: "Wisconsin (primary)",
  liabilityCap:
    "Fees paid under this proposal in the prior 12 months (excludes consequential, incidental, indirect, and punitive damages)",
  ipRights:
    "Seller retains all platform IP, methods, templates, AI workflows, source code, trade secrets, and pre-existing intellectual property. Client receives a limited, non-exclusive, non-transferable license to use purchased deliverables solely during the active paid term. All rights not expressly granted are reserved by Seller.",
  aiData:
    "Client data will be used only to deliver, configure, and support the client account. No client data will be used for cross-client model training, third-party sharing, or commercial resale without prior written authorization. Seller complies with applicable state data laws including CCPA/CPRA (Cal. Civ. Code sec.1798.100) and Wis. Stat. sec.134.98.",
});

/** Static document copy transcribed verbatim from the asset's markup. */
export const documentCopy = Object.freeze({
  subtitle: "Safety Intelligence, Compliance Support, and Predictive Risk Platform Services",
  docline: "6-Month Pilot & Platform Access Proposal",
  purposeCallout:
    "This document establishes the proposed scope, pricing, payment structure, deliverables, assumptions, and commercial terms for platform billing and related safety technology support.",
  scopeIntro:
    "The selected services are organized into practical work phases and service lines so the proposal can be scaled for a small pilot, a single jobsite, a multi-site deployment, or a full enterprise platform rollout.",
  acceptance:
    "By signing below, the client authorizes the seller to proceed with the services described in this proposal, subject to the scope, fees, assumptions, and terms stated herein or as otherwise modified by a mutually executed agreement.",
  noPhases: "No implementation phases selected.",
  noServices: "No added service lines selected.",
  noSummary: "No executive summary was recorded for this proposal.",
  noExclusions: "No additional assumptions or exclusions were recorded for this proposal.",
  scheduleSteps: Object.freeze([
    "Kickoff and access setup",
    "Client data intake and configuration",
    "Platform setup, modules, templates, workflows, and user roles",
    "Validation review with client leadership",
    "Launch support, user training, and final billing activation",
  ]),
  clientResponsibilities: Object.freeze([
    "Provide accurate company, jobsite, user, and billing information.",
    "Identify authorized reviewers and approvers for scope, pricing, security, and legal terms.",
    "Provide existing safety documents, templates, forms, training matrices, and site-specific requirements needed for configuration.",
    "Review draft outputs in a timely manner and consolidate feedback when possible.",
    "Maintain responsibility for final operational decisions, employee discipline, regulatory filings, and site execution.",
  ]),
  baseDeliverables: Object.freeze([
    "Configured platform subscription and client account setup",
    "Billing package selection and proposal fee schedule",
    "User/jobsite structure based on selected package",
    "Management-ready scope, assumptions, and acceptance documentation",
  ]),
});

/* -------------------------------------------------------------------------- */
/* Model types                                                                 */
/* -------------------------------------------------------------------------- */

export interface DocumentPartyBlock {
  /** Company / seller name. `missingValue` when unknown. */
  name: string;
  /** Additional address / contact lines, already trimmed and de-blanked. */
  lines: string[];
}

export interface DocumentPill {
  label: string;
  value: string;
}

export interface DocumentScopeEntry {
  heading: string;
  /** May be "" — the renderer omits the paragraph rather than printing a dash. */
  body: string;
}

export interface DocumentTerm {
  heading: string;
  body: string;
}

export interface DocumentFeeRow extends ProposalLineItem {
  /** Billing unit from the service catalog ("Session", "Day", …); "" when none. */
  unit: string;
  /** Pre-formatted so the renderer never does arithmetic. */
  qtyLabel: string;
  priceLabel: string;
  amountLabel: string;
}

export interface DocumentFeeGroup {
  label: string;
  rows: DocumentFeeRow[];
}

export interface DocumentTotalRow {
  label: string;
  value: string;
  emphasis?: "total" | "deposit";
}

/** Structurally identical to `ProposalDocumentProps["proposal"]`. */
export interface ProposalDocumentSubject {
  id: string;
  title: string;
  status: ProposalStatus;
  currentRevision: number;
  validUntil: string | null;
}

export interface ProposalDocumentModel {
  headline: string;
  subtitle: string;
  docline: string;
  wordmark: string;
  statusLabel: string;
  preparedFor: DocumentPartyBlock;
  preparedByBlock: DocumentPartyBlock;
  proposalDate: string;
  proposalNumber: string;
  validity: string;
  summary: string;
  packageIntro: string;
  packagePills: DocumentPill[];
  phaseScope: DocumentScopeEntry[];
  serviceScope: DocumentScopeEntry[];
  deliverables: string[];
  feeGroups: DocumentFeeGroup[];
  totalRows: DocumentTotalRow[];
  totals: ProposalTotals;
  schedule: string;
  exclusions: string;
  terms: DocumentTerm[];
  sellerSignature: string;
  legalNotice: string;
  /** "Revision 3" when a historical revision is being rendered, else null. */
  revisionLabel: string | null;
  /** True only when the rendered revision is NOT the proposal's current one. */
  isHistoricalRevision: boolean;
  currentRevisionLabel: string;
}

export interface ProposalDocumentModelInput {
  state: GeneratorState;
  totals?: ProposalTotals;
  proposal: ProposalDocumentSubject;
  revisionNumber?: number;
}

/* -------------------------------------------------------------------------- */
/* Builder                                                                     */
/* -------------------------------------------------------------------------- */

const feeGroupLabels: Record<ProposalLineItem["source"], string> = {
  package: "Base Subscription",
  phase: "Implementation Phases",
  service: "Service Lines & Add-Ons",
};

function toFeeRow(row: ProposalLineItem): DocumentFeeRow {
  const unit = row.source === "service" ? (lookupService(row.key)?.unit ?? "") : "";
  return {
    ...row,
    unit,
    qtyLabel: unit ? `${row.qty} ${unit}` : String(row.qty),
    priceLabel: formatMoney(row.price),
    amountLabel: formatMoney(row.amount),
  };
}

function groupFeeRows(lineItems: ProposalLineItem[]): DocumentFeeGroup[] {
  const order: ProposalLineItem["source"][] = ["package", "phase", "service"];
  return order
    .map((source) => ({
      label: feeGroupLabels[source],
      rows: lineItems.filter((row) => row.source === source).map(toFeeRow),
    }))
    .filter((group) => group.rows.length > 0);
}

/** A line item's display name, never blank — an unnamed row still needs a label. */
function displayName(row: ProposalLineItem, index: number): string {
  const name = row.name.trim();
  if (name) return name;
  return row.source === "phase" ? `Untitled phase ${index + 1}` : `Untitled service line ${index + 1}`;
}

function buildParty(name: string, lines: string[]): DocumentPartyBlock {
  return { name: name.trim() === "" ? missingValue : name.trim(), lines };
}

/**
 * Builds the whole document view-model.
 *
 * Degrades honestly rather than crashing: a state with no fields, no phases and
 * no services still produces a complete document — the base subscription row the
 * generator itself would render, empty-state sentences for scope, and dashes for
 * the party details that were never filled in. No value can reach the renderer
 * as NaN because every number is routed through computeProposalTotals().
 */
export function buildProposalDocumentModel({
  state,
  totals: providedTotals,
  proposal,
  revisionNumber,
}: ProposalDocumentModelInput): ProposalDocumentModel {
  const totals = providedTotals ?? computeProposalTotals(state);

  const sellerName = fieldText(state, "sellerName", documentTermDefaults.sellerName);
  const preparedBy = fieldText(state, "preparedBy");
  const clientCompany = fieldText(state, "clientCompany");
  const clientContact = fieldText(state, "clientContact");
  const clientTitle = fieldText(state, "clientTitle");
  const clientEmail = fieldText(state, "clientEmail");

  const validDays = fieldText(state, "validDays", documentTermDefaults.validDays);
  const billingTerm = fieldText(state, "billingTerm", documentTermDefaults.billingTerm);
  const paymentTerms = fieldText(state, "paymentTerms", documentTermDefaults.paymentTerms);
  const lateFee = fieldText(state, "lateFee", documentTermDefaults.lateFee);
  const governingLaw = fieldText(state, "governingLaw", documentTermDefaults.governingLaw);
  const liabilityCap = fieldText(state, "liabilityCap", documentTermDefaults.liabilityCap);
  const ipRights = fieldText(state, "ipRights", documentTermDefaults.ipRights);
  const aiData = fieldText(state, "aiData", documentTermDefaults.aiData);

  /* --- Parties ---------------------------------------------------------- */

  const clientLines: string[] = [];
  const contactLine = [clientContact, clientTitle].filter((part) => part !== "").join(" — ");
  if (contactLine) clientLines.push(contactLine);
  clientLines.push(...fieldLines(state, "clientAddress"));
  if (clientEmail) clientLines.push(clientEmail);

  const sellerLines: string[] = [];
  if (preparedBy) sellerLines.push(`Prepared by: ${preparedBy}`);
  sellerLines.push(...fieldLines(state, "sellerContact"));

  /* --- Package block ---------------------------------------------------- */

  // The package row's qty/price are already authoritative (computeProposalTotals
  // clamps them); name/desc come from the catalog so the intro paragraph reads
  // the same as the generator's.
  const packageRow = totals.lineItems.find((row) => row.source === "package") ?? null;
  const packageOption = lookupPackage(packageRow?.key ?? "") ?? packageData[defaultPackageKey];
  const includedUsers = fieldCount(state, "includedUsers", packageOption.users);
  const includedSites = fieldCount(state, "includedSites", packageOption.sites);

  /* --- Scope ------------------------------------------------------------ */

  const phaseRows = totals.lineItems.filter((row) => row.source === "phase");
  const serviceRows = totals.lineItems.filter((row) => row.source === "service");

  const phaseScope: DocumentScopeEntry[] = phaseRows.map((row, index) => ({
    heading: `${index + 1}. ${displayName(row, index)}`,
    body: row.desc.trim(),
  }));
  const serviceScope: DocumentScopeEntry[] = serviceRows.map((row, index) => ({
    heading: `Service Line ${index + 1}: ${displayName(row, index)}`,
    body: row.desc.trim(),
  }));

  const deliverables = [
    ...documentCopy.baseDeliverables,
    ...phaseRows.map((row, index) => `${displayName(row, index)} deliverable package`),
    ...serviceRows.map((row, index) => `${displayName(row, index)} deliverable package`),
  ];

  /* --- Fee schedule ----------------------------------------------------- */

  const totalRows: DocumentTotalRow[] = [
    { label: "Subtotal", value: formatMoney(totals.subtotal) },
    { label: "Discount", value: `-${formatMoney(totals.discount)}` },
    { label: "Tax", value: formatMoney(totals.tax) },
    { label: "Total Proposed Fee", value: formatMoney(totals.total), emphasis: "total" },
    { label: "Deposit Due at Acceptance", value: formatMoney(totals.deposit), emphasis: "deposit" },
  ];

  /* --- Validity --------------------------------------------------------- */

  let validity = `Open for acceptance for ${validDays} calendar days from proposal date.`;
  if (proposal.validUntil) {
    validity += ` Valid until ${formatDocumentDate(proposal.validUntil)}.`;
  }

  /* --- Revision markers ------------------------------------------------- */

  const hasRevision = typeof revisionNumber === "number" && Number.isFinite(revisionNumber);
  const currentRevision = Number.isFinite(proposal.currentRevision) ? proposal.currentRevision : 1;

  return {
    headline: clientCompany ? `Pilot Program Proposal for ${clientCompany}` : proposal.title,
    subtitle: documentCopy.subtitle,
    docline: documentCopy.docline,
    wordmark: sellerName,
    statusLabel: proposalStatusLabels[proposal.status] ?? String(proposal.status),
    preparedFor: buildParty(clientCompany, clientLines),
    preparedByBlock: buildParty(sellerName, sellerLines),
    proposalDate: formatDocumentDate(fieldText(state, "proposalDate")),
    proposalNumber: fieldText(state, "proposalNo", missingValue),
    validity,
    summary: fieldText(state, "customSummary", documentCopy.noSummary),
    packageIntro: `${packageOption.name} is the proposed base subscription. ${packageOption.desc} Included limits are shown below.`,
    packagePills: [
      { label: "Pilot Fee", value: formatMoney(packageRow?.price ?? 0) },
      { label: "Included Users", value: String(includedUsers) },
      { label: "Included Jobsites", value: String(includedSites) },
      { label: "Billing", value: billingTerm },
    ],
    phaseScope,
    serviceScope,
    deliverables,
    feeGroups: groupFeeRows(totals.lineItems),
    totalRows,
    totals,
    schedule:
      "The schedule is coordinated after acceptance. Unless otherwise agreed, implementation follows the order shown " +
      `in the scope. Billing follows the selected term (${billingTerm}), with ${paymentTerms}.`,
    exclusions: fieldText(state, "customExclusions", documentCopy.noExclusions),
    terms: buildDocumentTerms({ paymentTerms, lateFee, aiData, ipRights, liabilityCap, governingLaw, validDays }),
    sellerSignature: preparedBy ? `${preparedBy} / Authorized Representative` : "Authorized Representative",
    legalNotice:
      `LEGAL NOTICE: This proposal is produced by ${sellerName}. It is not legal advice. Terms referencing CCPA, ` +
      "Wisconsin trade secret law, OSHA, E-SIGN, and other statutes are for commercial purposes. All proposals must " +
      "be reviewed by qualified legal counsel in the governing jurisdiction before execution.",
    revisionLabel: hasRevision ? `Revision ${revisionNumber}` : null,
    isHistoricalRevision: hasRevision && revisionNumber !== currentRevision,
    currentRevisionLabel: `Revision ${currentRevision}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Commercial & legal terms                                                    */
/*                                                                             */
/* Transcribed verbatim from the asset's `terms` array (lines 440-468). This is */
/* contractual text: do not paraphrase, reorder, or "tidy" it. The seven        */
/* interpolated values are the same seven the asset interpolates.              */
/* -------------------------------------------------------------------------- */

export interface DocumentTermInputs {
  paymentTerms: string;
  lateFee: string;
  aiData: string;
  ipRights: string;
  liabilityCap: string;
  governingLaw: string;
  validDays: string;
}

export function buildDocumentTerms(input: DocumentTermInputs): DocumentTerm[] {
  return [
    {
      heading: "Payment Terms",
      body:
        `${input.paymentTerms}. ${input.lateFee}. Returned checks or failed ACH payments incur a $50 fee. ` +
        "Billing disputes must be raised within 10 business days of the invoice.",
    },
    {
      heading: "Scope Changes",
      body: "Any change to scope, sites, users, modules, or support requires a written change order signed by both parties. Verbal approvals are not binding. Seller may pause work if a scope dispute stays unresolved beyond 10 business days.",
    },
    {
      heading: "Confidentiality",
      body: "Each party protects the other's confidential business, pricing, and operational information with reasonable care; these obligations survive termination for 3 years. Client safety data, injury records, and incident reports are confidential and will not be shared with third parties without written authorization, except as required by law.",
    },
    {
      heading: "Data Privacy — CCPA/CPRA (California)",
      body: "For California clients, Seller acts as a Service Provider under the CCPA/CPRA (Cal. Civ. Code sec.1798.100 et seq.). Client data is not sold, shared for cross-context advertising, or used outside the scope of services without written authorization. A Data Processing Addendum (DPA) is available on request.",
    },
    {
      heading: "Data Privacy — Multi-State",
      body: "Seller follows applicable U.S. state privacy laws where services are delivered, including Wisconsin (Wis. Stat. sec.134.98), California, Virginia, Colorado, Connecticut, and Texas. Sensitive personal information is not retained beyond what the contracted services require.",
    },
    {
      heading: "Data Breach Notification",
      body: "If a security breach affecting client personal information is confirmed, Seller will notify Client within 72 hours and cooperate to satisfy applicable state breach-notification laws.",
    },
    { heading: "Data and AI Use", body: input.aiData },
    { heading: "Intellectual Property", body: input.ipRights },
    {
      heading: "Trade Secrets — Wisconsin & Federal",
      body: "Seller's platform, predictive risk logic, AI workflows, scoring models, and templates are protected trade secrets under the Wisconsin Uniform Trade Secrets Act (Wis. Stat. sec.134.90) and the federal Defend Trade Secrets Act (18 U.S.C. sec.1836). Client shall not reverse engineer, copy, or derive Seller's source code or proprietary workflows. Unauthorized disclosure may result in injunctive relief and damages.",
    },
    {
      heading: "Client Data Ownership",
      body: "Client owns all client-provided data, including safety records, personnel information, incident data, and site content. Seller processes it only to deliver contracted services. On termination, Seller provides the data in a standard exportable format within 30 days, then securely deletes it from active systems.",
    },
    {
      heading: "Limitation of Liability",
      body:
        `TO THE MAXIMUM EXTENT PERMITTED BY LAW, SELLER'S TOTAL LIABILITY IS LIMITED TO ${input.liabilityCap}, ` +
        "AND SELLER IS NOT LIABLE FOR INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES, INCLUDING " +
        "LOST PROFITS OR BUSINESS INTERRUPTION. Where a state does not allow these exclusions, they apply to the " +
        "fullest extent permitted.",
    },
    {
      heading: "Warranty Disclaimer",
      body: "THE PLATFORM AND SERVICES ARE PROVIDED AS IS AND AS AVAILABLE, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. Seller does not warrant the platform will be error-free or that all safety risks will be identified or prevented.",
    },
    {
      heading: "No Guarantee of Outcome",
      body: "The platform supports safety management, reporting, and risk visibility. It does not guarantee elimination of incidents, injuries, OSHA violations, or losses. Client retains full responsibility for jobsite safety and compliance with 29 C.F.R. Parts 1903, 1904, 1910, and 1926.",
    },
    {
      heading: "OSHA Compliance Disclaimer",
      body: "This platform is a safety management support tool, not legal advice, engineering services, or certified compliance review. OSHA compliance (29 U.S.C. sec.651 et seq.) and site-specific requirements remain the Client's responsibility, and the Client's designated Competent Person retains all field safety decisions.",
    },
    {
      heading: "Indemnification",
      body: "Client indemnifies Seller against third-party claims arising from Client's misuse of the platform, violation of law, inaccurate data, or jobsite conditions. Seller indemnifies Client against claims that the platform as provided infringes a valid U.S. patent, copyright, or trade secret, provided Seller is promptly notified and controls the defense.",
    },
    {
      heading: "Dispute Resolution & Arbitration",
      body: "Disputes not resolved by good-faith negotiation within 30 days go to binding arbitration under the AAA Commercial Arbitration Rules, held in Wisconsin unless otherwise agreed. Both parties waive jury trial and class actions. Emergency relief to protect trade secrets or confidential information may be sought in any court of competent jurisdiction.",
    },
    {
      heading: "California Auto-Renewal Law",
      body: "For California clients: if the term auto-renews, Seller gives clear notice before charging, notifies of any material change at least 30 days in advance, and allows cancellation of auto-renewal by written notice at any time (Cal. Bus. & Prof. Code sec.17600-17606).",
    },
    {
      heading: "Electronic Signatures (E-SIGN / UETA)",
      body: "Electronic signatures on this proposal and related agreements are legally binding under the federal E-SIGN Act (15 U.S.C. sec.7001 et seq.) and UETA. Client consents to receive disclosures and notices electronically.",
    },
    {
      heading: "Taxes & SaaS Fees",
      body: "Client is responsible for applicable taxes on the services, including sales and use tax on SaaS and digital services (e.g., Wis. Stat. sec.77.52; certain California SaaS transactions). Where applicable, Seller will collect and remit required taxes or provide a tax invoice for Client remittance.",
    },
    {
      heading: "Independent Contractor",
      body: "Seller acts as an independent contractor. This proposal creates no employment, partnership, joint venture, or agency relationship, and Seller does not direct or control Client personnel or daily jobsite operations unless separately agreed in writing.",
    },
    {
      heading: "Force Majeure",
      body: "Neither party is liable for delays caused by events beyond its reasonable control (natural disasters, government actions, cyberattacks, outages, or pandemic conditions). The affected party will notify the other promptly and use reasonable efforts to resume performance. If the event continues beyond 60 days, either party may terminate the affected services without penalty.",
    },
    {
      heading: "Governing Law & Venue",
      body:
        `This proposal is governed by the laws of ${input.governingLaw}, without regard to conflict-of-law ` +
        "principles, unless replaced by a signed master services agreement. California clients: Cal. Bus. & Prof. " +
        "Code sec.17200 applies. Wisconsin clients: Wis. Stat. Ch. 134 and Ch. 895 govern commercial and " +
        "trade-secret matters.",
    },
    {
      heading: "Non-Solicitation",
      body: "During the term and for 12 months after, neither party will solicit or hire the other's employees or key contractors directly involved in these services without written consent. General public job postings are excluded.",
    },
    {
      heading: "Severability",
      body: "If any provision is found invalid or unenforceable, it will be narrowed to the minimum extent needed to be enforceable, and the remaining provisions stay in full force and effect.",
    },
    {
      heading: "Entire Agreement",
      body: "This proposal, together with any executed Master Services Agreement, Statement of Work, and signed change orders, is the entire agreement and supersedes all prior negotiations and representations. No change is binding unless in a writing signed by both parties.",
    },
    {
      heading: "Termination",
      body: "Either party may terminate per the final executed agreement. Client remains responsible for fees earned through the termination date, plus approved expenses and non-cancelable third-party commitments. Confidentiality, IP, dispute-resolution, and data-privacy terms survive termination.",
    },
    {
      heading: "Proposal Validity",
      body: `Pricing and terms remain open for ${input.validDays} calendar days from the proposal date unless withdrawn or extended in writing. After that, Seller may revise pricing.`,
    },
  ];
}
