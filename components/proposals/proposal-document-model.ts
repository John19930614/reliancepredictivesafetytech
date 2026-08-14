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

import {
  isNoPlatformPackageKey,
  isPilotPackageKey,
  lookupPackage,
  lookupService,
  packageData,
  defaultPackageKey,
  stripPhaseOrdinal,
} from "@/lib/proposals/catalog";
import { proposalTypeLabelFromState } from "@/lib/proposals/transaction-templates";
import {
  buildTermsForProfile,
  resolveLexicon,
  resolveProposalTypeProfile,
  resolveTypeCopy,
} from "@/lib/proposals/type-profiles";
import type { ProposalTypeCopy } from "@/lib/proposals/type-profiles";
import {
  formatClientContactLine,
  parseClientContacts,
  type ProposalClientContact,
} from "@/lib/proposals/client-contacts";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import {
  computeProposalTotals,
  formatMoney,
  type ProposalLineItem,
  type ProposalTotals,
} from "@/lib/proposals/pricing";
import { parseProposalTerm, type ProposalTerm } from "@/lib/proposals/term";
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
  /**
   * The asset's `selected` Billing Term option — and the ONLY member of this
   * object that names a specific deal.
   *
   * It is kept because it is what a proposal written before proposal types
   * existed printed when its state carried no billingTerm, and those documents
   * must keep rendering what they were sent as. It is NOT a safe default for a
   * typed proposal: "Billing: One-time (pilot)" on a training or retainer
   * document announces a pilot nobody is buying. buildProposalDocumentModel
   * therefore applies it only when no type is stamped; a typed proposal with no
   * billing term chosen prints no billing term at all rather than a borrowed
   * one. Same rule in collectProposalFacts (lib/proposals/consistency.ts),
   * which feeds the AI reviewer.
   */
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
  /**
   * The PILOT's docline when no term dates were entered.
   *
   * Reachable only from buildDocline's `isPilot` branch — i.e. only when the
   * seller actually selected the pilot package. It is not a general fallback
   * and must never become one: a training proposal with no dates headlined
   * "Pilot & Platform Access Proposal" is the first line the client reads.
   */
  doclineFallback: "Pilot & Platform Access Proposal",
  purposeCallout:
    "This document establishes the proposed scope, pricing, payment structure, deliverables, assumptions, and commercial terms for platform billing and related safety technology support.",
  scopeIntro:
    "The selected services are organized into practical work phases and service lines so the proposal can be scaled for a small pilot, a single jobsite, a multi-site deployment, or a full enterprise platform rollout.",
  acceptance:
    "By signing below, the client authorizes the seller to proceed with the services described in this proposal, subject to the scope, fees, assumptions, and terms stated herein or as otherwise modified by a mutually executed agreement.",
  /**
   * Section 03's empty-state notes — for a SUBSCRIPTION document only.
   *
   * Both sentences describe something missing. On a platform proposal that is
   * true: a rollout with no implementation phases and no add-ons is an
   * unfinished scope. On a services engagement it is false. A training proposal
   * has no implementation phases BY DESIGN, and its courses are not "added
   * service lines" bolted onto a subscription — they are the entire deal. The
   * document was printing two italic notes telling a training client what its
   * proposal lacked, when it lacked nothing.
   *
   * Reach for `model.phaseEmptyNote` / `model.serviceEmptyNote` rather than
   * these constants: the model blanks them for a services-only engagement, and
   * a renderer that reads documentCopy directly cannot see that.
   */
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
  /**
   * Deliverables that apply to every engagement.
   *
   * The per-phase and per-service deliverables that used to be appended here —
   * one "<line name> deliverable package" bullet for every row — were a
   * restatement of section 03, which already prints each line's name AND its
   * full scope paragraph. On a proposal with a dozen lines that redundancy cost
   * most of a page and told the client nothing new. Section 04 now names the
   * covered lines in a single sentence instead; see buildProposalDocumentModel.
   */
  baseDeliverables: Object.freeze([
    "Configured platform subscription and client account setup",
    "Billing package selection and proposal pricing schedule",
    "User and jobsite structure based on the selected package",
    "Management-ready scope, assumptions, and acceptance documentation",
  ]),
});

/**
 * The prose a proposal with NO type stamped still prints.
 *
 * Assembled from documentCopy above rather than rewritten, because that is the
 * exact wording every proposal sent before per-type copy existed carries. A
 * document already in a client's hands must not acquire new prose because a
 * feature shipped after it went out — the same rule the clause set follows.
 */
export const legacyDocumentCopy: ProposalTypeCopy = Object.freeze({
  subtitle: documentCopy.subtitle,
  purposeCallout: documentCopy.purposeCallout,
  scopeIntro: documentCopy.scopeIntro,
  deliverables: documentCopy.baseDeliverables,
  scheduleSteps: documentCopy.scheduleSteps,
  clientResponsibilities: documentCopy.clientResponsibilities,
});

/* -------------------------------------------------------------------------- */
/* Page budget                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Character ceilings on the EDITORIAL regions of the document.
 *
 * The proposal is held to eight sheets (asserted in lib/proposals/pdf.test.ts
 * against the real paginator, not eyeballed). Measured against that fixture, a
 * loaded proposal renders in six pages — but two seller-controlled regions can
 * push it past the ceiling on their own:
 *
 *   six maximum-length bios (6 × 4,000 chars)  ->  9 pages
 *   a 10,000-character executive summary       ->  8 pages and climbing
 *
 * Both are narrative copy, so they are budgeted here, in the one view-model all
 * three renderers share. Doing it in the renderers instead would mean the HTML
 * document, the print view and the PDF could each trim differently.
 *
 * DELIBERATELY NOT BUDGETED: the assumptions/exclusions block, the per-line
 * scope paragraphs, and the fee table. Those are the offer — the text a client
 * signs and the numbers they pay — and silently dropping the tail of an
 * exclusion or a priced line to save a sheet would be a far worse defect than a
 * nine-page document. A proposal carrying dozens of line items is genuinely a
 * long proposal and is allowed to run long.
 */
export const documentLimits = Object.freeze({
  /** Section 01. Roughly 400 words — it is the opener, not the whole scope. */
  summaryChars: 2500,
  /**
   * TOTAL across section 09, shared evenly by the people selected: one bio may
   * run to the profile's own 4,000-character limit, six are held to ~1,000 each.
   * At that split the fully loaded fixture lands on seven pages.
   */
  teamBioChars: 6000,
});

/**
 * Trims to `maxChars` on a word boundary, marking the cut with an ellipsis.
 *
 * Returns the input untouched when it already fits, so the overwhelming
 * majority of proposals are unaffected and nothing is appended to them.
 */
export function truncateAtWord(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(" ");
  // A single unbroken token longer than the budget has no word boundary to cut
  // on; take the hard clip rather than returning nothing.
  const body = (lastSpace > maxChars * 0.5 ? clipped.slice(0, lastSpace) : clipped).trimEnd();
  return `${body.replace(/[,;:.\-–—]$/, "")}…`;
}

/**
 * Applies the team budget, splitting it evenly across the selected people.
 *
 * Trims each member's LAST surviving paragraph rather than dropping paragraphs
 * wholesale, so a bio always ends mid-thought with an ellipsis instead of
 * silently losing its closing credential line. A member whose bio fits is
 * returned by identity.
 */
export function fitTeamBios(
  team: readonly DocumentTeamMember[],
  totalChars: number = documentLimits.teamBioChars,
): DocumentTeamMember[] {
  if (team.length === 0) return [];
  const perMember = Math.floor(totalChars / team.length);

  return team.map((member) => {
    let remaining = perMember;
    const paragraphs: string[] = [];
    for (const paragraph of member.paragraphs) {
      if (remaining <= 0) break;
      if (paragraph.length <= remaining) {
        paragraphs.push(paragraph);
        remaining -= paragraph.length;
        continue;
      }
      paragraphs.push(truncateAtWord(paragraph, remaining));
      remaining = 0;
    }
    return paragraphs.length === member.paragraphs.length &&
      paragraphs.every((paragraph, index) => paragraph === member.paragraphs[index])
      ? member
      : { ...member, paragraphs };
  });
}

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

/** One person whose bio appears in the document's team section. */
export interface DocumentTeamMember {
  id: string;
  name: string;
  /** Job title / role line under the name. "" when the profile has none. */
  title: string;
  /** Bio paragraphs, already split and de-blanked. */
  paragraphs: string[];
}

/**
 * A stored seller signature, resolved by the page from the signing employee's
 * profile. `dataUrl` is a `data:image/...;base64,...` string so the document
 * renders identically in the browser, in print, and in the generated PDF
 * without a second authenticated fetch — the share route in particular is
 * unauthenticated and could not re-fetch a private storage object.
 */
export interface DocumentSignature {
  dataUrl: string;
  /** Name printed under the signature line. */
  name: string;
  title: string;
  /** ISO date the signature was applied to this proposal, or null. */
  signedOn: string | null;
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
  /**
   * The addressees behind `preparedFor.lines`, still structured.
   *
   * Carried on the model so a renderer that needs the parts (a mail-merge, an
   * acceptance email's To: list) does not have to re-parse the formatted line.
   */
  clientContacts: ProposalClientContact[];
  preparedByBlock: DocumentPartyBlock;
  proposalDate: string;
  proposalNumber: string;
  validity: string;
  /** Parsed engagement term; every duration the document prints comes from here. */
  term: ProposalTerm;
  /** "March 2026 – August 2026 (6 months)", or null when no term was chosen. */
  termLabel: string | null;
  summary: string;
  /**
   * Section 02's heading. "Selected Platform Package" when the engagement
   * includes a subscription, "Engagement Summary" when it does not — a
   * training or fixed-price document has no platform package to select.
   */
  packageHeading: string;
  /**
   * Sections 03, 05 and 06, named for the proposal type.
   *
   * A document that calls every engagement "Detailed Scope of Work" and
   * "Pricing Schedule" reads as a template with the deal poured in. These come
   * from the type's lexicon and fall back to the original wording for a
   * proposal with no type stamped.
   */
  scopeHeading: string;
  feesHeading: string;
  termHeading: string;
  packageIntro: string;
  packagePills: DocumentPill[];
  /** False for a services-only engagement (no subscription row, no seat pills). */
  includesPlatformPackage: boolean;
  /** "Training Services", "Fixed-Price Services"… or null if the type is unstamped. */
  proposalTypeLabel: string | null;
  phaseScope: DocumentScopeEntry[];
  serviceScope: DocumentScopeEntry[];
  /**
   * What section 03 prints when `phaseScope` / `serviceScope` is empty. "" means
   * print nothing.
   *
   * Carried on the model because whether an absence is worth mentioning depends
   * on the deal: a platform rollout with no implementation phases is missing
   * something, a training proposal is not. All three renderers used to state the
   * absence unconditionally — ProposalDocument.tsx from documentCopy, pdf.ts and
   * docx.ts from their own hardcoded copies of the same sentences — so a
   * training document told the client it had "No implementation phases
   * selected." and "No added service lines selected." when the courses were
   * sitting in the fee table two sections down.
   */
  phaseEmptyNote: string;
  serviceEmptyNote: string;
  deliverables: string[];
  /** One sentence naming the phase/service lines section 04 also covers; "" when none. */
  deliverablesCoverage: string;
  feeGroups: DocumentFeeGroup[];
  totalRows: DocumentTotalRow[];
  totals: ProposalTotals;
  schedule: string;
  exclusions: string;
  terms: DocumentTerm[];
  team: DocumentTeamMember[];
  sellerSignature: string;
  signature: DocumentSignature | null;
  legalNotice: string;
  /**
   * Static copy, carried ON the model rather than imported from documentCopy by
   * each renderer. There are now three renderers — the React document, the print
   * stylesheet's view of it, and the PDF — and a renderer that reaches past the
   * model for its wording is exactly how the generator's preview drifted away
   * from the platform's document.
   */
  purposeCallout: string;
  scopeIntro: string;
  scheduleSteps: readonly string[];
  clientResponsibilities: readonly string[];
  acceptance: string;
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
  /**
   * Bios for the people the seller checked, already resolved from the database
   * and ordered by the page. The model does no I/O; it only decides how they
   * render. Omitted or empty means the team section is skipped entirely.
   */
  team?: DocumentTeamMember[];
  /** Resolved seller signature image, or null to print an empty signature line. */
  signature?: DocumentSignature | null;
}

/* -------------------------------------------------------------------------- */
/* Builder                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The headings above each block of fee rows.
 *
 * Two of the three were written for a subscription sale. "Implementation
 * Phases" is what a platform rollout has; a retainer's recurring advisory line
 * is not an implementation. "Service Lines & Add-Ons" says the rows are add-ons
 * to something — and on a training, fixed-price, T&M or retainer proposal there
 * is nothing to add them to: those rows ARE the deal. A training client read
 * their whole course schedule filed under "Add-Ons".
 *
 * "Base Subscription" needs no variant: buildPackageLine() omits the package row
 * entirely on a services engagement, so that group never renders there.
 */
const feeGroupLabels: Record<ProposalLineItem["source"], string> = {
  package: "Base Subscription",
  phase: "Implementation Phases",
  service: "Service Lines & Add-Ons",
};

const servicesFeeGroupLabels: Record<ProposalLineItem["source"], string> = {
  package: "Base Subscription",
  phase: "Engagement Phases",
  service: "Service Lines",
};

/**
 * Money as it appears in the pricing table, with zero rendered as "No cost".
 *
 * A line we are providing at no charge printed as "$0" reads like a pricing
 * mistake — or worse, like a placeholder the client should expect a number in
 * later. Saying so in words makes the concession explicit and deliberate, which
 * is the point of putting the line on the proposal at all.
 *
 * Only exact zero qualifies. A negative amount is a real (if unusual) figure —
 * a credit — and is printed as currency so it cannot be mistaken for free.
 */
export function formatLineAmount(value: number): string {
  return value === 0 ? "No cost" : formatMoney(value);
}

function toFeeRow(row: ProposalLineItem): DocumentFeeRow {
  // The unit now arrives on the row (stored first, catalog as fallback), so it
  // agrees with the stored price. Reading it from the live catalog here is what
  // made a sent proposal's $1,200 session start printing as "1 Person".
  const unit = row.unit;
  return {
    ...row,
    unit,
    // qtyLabel arrives on the row from pricing, already aware of the quantity
    // basis — "2 sessions", "10 attendees", "Flat fee". Recomputing it here as
    // `${qty} ${unit}` is what it used to do, and that is wrong for a flat fee:
    // a $2,500 retainer stored with a quantity of 4 would print "4 Site" beside
    // an amount that never multiplied. Taking the spread's value gives the
    // document, the PDF and the DOCX the same label from one place.
    priceLabel: formatLineAmount(row.price),
    amountLabel: formatLineAmount(row.amount),
  };
}

function groupFeeRows(lineItems: ProposalLineItem[], includesPlatformPackage: boolean): DocumentFeeGroup[] {
  const labels = includesPlatformPackage ? feeGroupLabels : servicesFeeGroupLabels;
  const order: ProposalLineItem["source"][] = ["package", "phase", "service"];
  return order
    .map((source) => ({
      label: labels[source],
      rows: lineItems.filter((row) => row.source === source).map(toFeeRow),
    }))
    .filter((group) => group.rows.length > 0);
}

/**
 * A line item's display name, never blank — an unnamed row still needs a label.
 *
 * Phase names are run through stripPhaseOrdinal() because the document numbers
 * phases by position. Without it, a phase carrying the old catalog name printed
 * as "1. Phase 1 — Discovery & Intake", and a proposal that skipped a phase
 * printed a heading whose two numbers disagreed.
 */
export function displayName(row: ProposalLineItem, index: number): string {
  const name = row.name.trim();
  if (name) return row.source === "phase" ? stripPhaseOrdinal(name) : name;
  return row.source === "phase" ? `Untitled phase ${index + 1}` : `Untitled service line ${index + 1}`;
}

function buildParty(name: string, lines: string[]): DocumentPartyBlock {
  return { name: name.trim() === "" ? missingValue : name.trim(), lines };
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * The paragraph that opens section 02.
 *
 * Every number in it is an argument. The catalog description it wraps is
 * deliberately free of counts and durations (see the COPY RULE on packageData),
 * because a frozen sentence saying "up to 50 users across 2 jobsites" kept
 * printing the catalog's numbers no matter what the seller entered — the report
 * that the head count "is still there and I can't change it".
 */
export function buildPackageDescription(input: {
  packageName: string;
  packageDesc: string;
  users: number;
  sites: number;
  term: ProposalTerm;
  /** False for a services-only engagement — there is no subscription to describe. */
  includesPlatformPackage?: boolean;
  /** "Training Services" etc., used to open the engagement paragraph. */
  proposalTypeLabel?: string | null;
}): string {
  const termClause = input.term.rangeLabel ? ` for the term ${input.term.rangeLabel}` : "";
  const durationClause = input.term.durationLabel ? ` for the full ${input.term.durationLabel} term` : "";

  // Services-only: say what the engagement IS, and say plainly that no
  // subscription is included. Seat and site counts are skipped entirely —
  // they are a subscription's limits, and this proposal has no subscription.
  if (input.includesPlatformPackage === false) {
    const engagement = input.proposalTypeLabel
      ? `This is a ${input.proposalTypeLabel.toLowerCase()} engagement${termClause}.`
      : `This is a professional services engagement${termClause}.`;
    const scope = "The scope and fees are itemized in the schedule below, and no platform subscription is included.";
    return durationClause ? `${engagement} ${scope} The engagement runs${durationClause}.` : `${engagement} ${scope}`;
  }

  const opening = `${input.packageName} is the proposed base subscription${termClause}. ${input.packageDesc}`;

  // A blank proposal starts with no counts, and "Included limits are 0 users
  // across 0 jobsites" is worse than saying nothing — it reads as a quoted
  // limit of zero rather than a figure the seller has not set yet. The clause
  // appears as soon as either number does.
  if (input.users <= 0 && input.sites <= 0) {
    return durationClause ? `${opening} The engagement runs${durationClause}.` : opening;
  }

  return (
    `${opening} Included limits are ${plural(input.users, "user")} across ` +
    `${plural(input.sites, "jobsite")}${durationClause}.`
  );
}

/**
 * The line under the wordmark. Derived so a 3-month or 12-month engagement stops
 * being announced as a "6-Month Pilot".
 */
export function buildDocline(
  packageName: string,
  isPilot: boolean,
  term: ProposalTerm,
  /** Set for a services-only engagement, which has no package name to headline. */
  proposalTypeLabel?: string | null,
): string {
  const monthPrefix = term.months === null ? "" : `${term.months}-Month `;
  if (isPilot) return monthPrefix ? `${monthPrefix}Pilot & Platform Access Proposal` : documentCopy.doclineFallback;
  // A training or fixed-price document headlined "Platform Services Proposal"
  // announces the wrong deal on the first line the client reads.
  if (proposalTypeLabel) {
    return monthPrefix ? `${proposalTypeLabel} — ${monthPrefix}Term` : `${proposalTypeLabel} Proposal`;
  }
  return monthPrefix ? `${packageName} — ${monthPrefix}Term` : `${packageName} Proposal`;
}

/* -------------------------------------------------------------------------- */
/* Document identity — who the company is, and who prepared it                 */
/*                                                                             */
/* ONE stored field, `sellerName`, used to feed three things at once: the       */
/* header wordmark, the "Prepared By" party name, and the legal notice's        */
/* "produced by". So a preparer's name typed into that field did not just       */
/* misfile a contact — it replaced the company on the front page of a signed    */
/* client document and named a person as the entity that produced it. The two   */
/* identities are separated below: the wordmark and the notice are always the   */
/* COMPANY, and a person's name is routed to the Prepared By block, which is    */
/* the only place on the document a human being belongs.                       */
/* -------------------------------------------------------------------------- */

/**
 * Post-nominal credentials that only ever follow a PERSON'S name.
 *
 * Safety practice is full of them and they are how a preparer's name is
 * normally written on a proposal. No company name ends in one, which is what
 * makes them a safe signal.
 */
const personCredentials: readonly string[] = Object.freeze([
  "ASP", "CET", "CHMM", "CHST", "CIH", "CRSP", "CSHM", "CSP", "GSP", "OHST",
  "SMS", "STS", "STSC", "CHS", "JD", "MBA", "MS", "PE", "PHD", "RN", "EMT",
]);

/**
 * True when a value stored in `sellerName` is plainly a person's name.
 *
 * DELIBERATELY CONSERVATIVE. A false positive here replaces a real company name
 * with the default one, which is a worse document than the bug this guards
 * against. So only two signals count, and both are unambiguous:
 *
 *   1. the value is the same string as the preparer's own name — somebody typed
 *      the preparer into the company field;
 *   2. the value ends in a comma and a post-nominal credential ("Jane Roe, CSP"),
 *      which no company name does.
 *
 * Everything else is left alone. An unfamiliar company name is still a company
 * name, and this guard must never rewrite one.
 */
export function looksLikePersonName(sellerName: string, preparedBy: string): boolean {
  const value = sellerName.trim();
  if (value === "") return false;

  const preparer = preparedBy.trim();
  if (preparer !== "" && value.toLowerCase() === preparer.toLowerCase()) return true;

  const suffix = /,\s*([A-Za-z.]{2,5})\.?\s*$/.exec(value);
  if (!suffix) return false;
  return personCredentials.includes(suffix[1].replace(/\./g, "").toUpperCase());
}

export interface DocumentIdentity {
  /** The legal entity: header wordmark, Prepared By party name, legal notice. */
  companyName: string;
  /** The human who wrote it, for the Prepared By block. "" when none recorded. */
  preparerName: string;
}

/**
 * Splits the stored seller fields into the two identities the document needs.
 *
 * Nothing is thrown away: a person's name typed into the company field still
 * reaches the page, as the preparer. An explicit `preparedBy` always wins,
 * because that field was filled in on purpose.
 */
export function resolveDocumentIdentity(sellerName: string, preparedBy: string): DocumentIdentity {
  const seller = sellerName.trim();
  const preparer = preparedBy.trim();

  if (seller !== "" && !looksLikePersonName(seller, preparer)) {
    return { companyName: seller, preparerName: preparer };
  }

  return {
    companyName: documentTermDefaults.sellerName,
    preparerName: preparer !== "" ? preparer : seller,
  };
}

/**
 * The label over one row of section 03's schedule, e.g. "Service Line 1".
 *
 * Composed from the type's `unitNoun` rather than frozen, so a time-and-
 * materials proposal labels its rows with what it actually sells instead of
 * borrowing a subscription's word for them. An untyped proposal resolves to
 * "service" and prints exactly what it always printed.
 *
 * NOTE FOR WHOEVER CONFIRMS THE WORDING: this terminology is not signed off
 * yet, which is the whole reason no label is written here. Change a profile's
 * `unitNoun` and the screen, the PDF, the DOCX, the share page and the DocuSign
 * envelope all follow, because every one of them reads these headings off the
 * model.
 */
export function buildScopeLineLabel(unitNoun: string, index: number): string {
  const cleaned = unitNoun.trim();
  const noun = cleaned === "" ? "Service" : cleaned;
  const titled = noun
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return `${titled} Line ${index + 1}`;
}

/** Splits a stored bio into paragraphs on blank lines, dropping empties. */
export function splitBioParagraphs(bio: string): string[] {
  return bio
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.replace(/\s*\r?\n\s*/g, " ").trim())
    .filter((paragraph) => paragraph !== "");
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
  team = [],
  signature = null,
}: ProposalDocumentModelInput): ProposalDocumentModel {
  const totals = providedTotals ?? computeProposalTotals(state);
  const term = parseProposalTerm(state?.fields);

  /* --- Which deal is this? ---------------------------------------------- */
  //
  // Resolved before anything else is derived, because several defaults below
  // are only correct for one kind of sale. Null for a proposal written before
  // types existed, or started blank — those keep the shared clause set and the
  // platform-era prose they were sent under.
  const typeProfile = resolveProposalTypeProfile(state?.fields);
  const proposalTypeLabel = proposalTypeLabelFromState(state?.fields);
  // Sections 01, 03, 04, 06 and 07. Every one of these was a single hardcoded
  // string on all seven types, written for a subscription sale — which is how a
  // training proposal came to promise "Configured platform subscription and
  // client account setup" for a CPR class.
  const typeCopy = resolveTypeCopy(typeProfile, legacyDocumentCopy);
  // Section headings AND the noun section 03 uses for one line of the schedule.
  // Resolved once, here, so the scope block below and the return value below
  // that cannot disagree about which vocabulary this document speaks.
  const lexicon = resolveLexicon(typeProfile);
  // A services-only engagement produces NO package row at all (see
  // buildPackageLine), so the selected key is read from the state rather than
  // inferred from a row that was deliberately omitted.
  const selectedPackageKey = fieldText(state, "packageSelect", defaultPackageKey);
  const includesPlatformPackage = !isNoPlatformPackageKey(selectedPackageKey);

  // ONE field fed the wordmark, the Prepared By name and the legal notice, so
  // one wrong value wronged all three. See resolveDocumentIdentity.
  const { companyName, preparerName } = resolveDocumentIdentity(
    fieldText(state, "sellerName", documentTermDefaults.sellerName),
    fieldText(state, "preparedBy"),
  );
  const clientCompany = fieldText(state, "clientCompany");
  // Falls back to the legacy single-contact fields internally, so a proposal
  // saved before the multi-contact panel existed still names its addressee.
  const clientContacts = parseClientContacts(state?.fields);

  const validDays = fieldText(state, "validDays", documentTermDefaults.validDays);
  // The one commercial default that names a deal. A typed proposal that carries
  // no billing term prints none — "(pilot)" on a training or advisory document
  // is a sale nobody made. Only an untyped (pre-types) proposal still inherits
  // the asset's selected option, because that is what those documents printed.
  const billingTerm = typeProfile
    ? fieldText(state, "billingTerm")
    : fieldText(state, "billingTerm", documentTermDefaults.billingTerm);
  const paymentTerms = fieldText(state, "paymentTerms", documentTermDefaults.paymentTerms);
  const lateFee = fieldText(state, "lateFee", documentTermDefaults.lateFee);
  const governingLaw = fieldText(state, "governingLaw", documentTermDefaults.governingLaw);
  const liabilityCap = fieldText(state, "liabilityCap", documentTermDefaults.liabilityCap);
  const ipRights = fieldText(state, "ipRights", documentTermDefaults.ipRights);
  const aiData = fieldText(state, "aiData", documentTermDefaults.aiData);

  /* --- Parties ---------------------------------------------------------- */

  // Addressees first, then the company's postal address underneath them — the
  // order the block reads in. A proposal is routinely addressed to two or three
  // people at the same company (the safety director who asked for it, the
  // project executive who approves it), and the block used to have room for
  // exactly one.
  const clientLines: string[] = clientContacts.map(formatClientContactLine);
  clientLines.push(...fieldLines(state, "clientAddress"));

  // The party is the COMPANY; the preparer is a line inside its block. That
  // split is the whole point of resolveDocumentIdentity — a person's name
  // reaches the document here and nowhere else.
  const sellerLines: string[] = [];
  if (preparerName) sellerLines.push(`Prepared by: ${preparerName}`);
  sellerLines.push(...fieldLines(state, "sellerContact"));

  /* --- Package block ---------------------------------------------------- */

  // The package row's qty/price are already authoritative (computeProposalTotals
  // clamps them); name/desc come from the catalog so the intro paragraph reads
  // the same as the generator's.
  const packageRow = totals.lineItems.find((row) => row.source === "package") ?? null;
  const packageOption =
    lookupPackage(packageRow?.key ?? selectedPackageKey) ?? packageData[defaultPackageKey];
  // Seat and site counts belong to a subscription. On a services engagement
  // they are not "zero" — they do not apply, and printing them as limits would
  // quote the client a cap on something they are not buying.
  const includedUsers = includesPlatformPackage ? fieldCount(state, "includedUsers", packageOption.users) : 0;
  const includedSites = includesPlatformPackage ? fieldCount(state, "includedSites", packageOption.sites) : 0;

  /* --- Scope ------------------------------------------------------------ */

  const phaseRows = totals.lineItems.filter((row) => row.source === "phase");
  const serviceRows = totals.lineItems.filter((row) => row.source === "service");

  const phaseScope: DocumentScopeEntry[] = phaseRows.map((row, index) => ({
    heading: `${index + 1}. ${displayName(row, index)}`,
    body: row.desc.trim(),
  }));
  // "Service Line 1:" was frozen here for every type. The noun now comes from
  // the type's own lexicon, so a task-based engagement labels its rows with
  // what it sells rather than with a subscription's word for them.
  const serviceScope: DocumentScopeEntry[] = serviceRows.map((row, index) => ({
    heading: `${buildScopeLineLabel(lexicon.unitNoun, index)}: ${displayName(row, index)}`,
    body: row.desc.trim(),
  }));

  // Section 04 lists what every engagement includes, then names the selected
  // lines in ONE sentence. It used to append a "<name> deliverable package"
  // bullet per line, restating section 03 in full.
  const selectedLineNames = [
    ...phaseRows.map((row, index) => displayName(row, index)),
    ...serviceRows.map((row, index) => displayName(row, index)),
  ];
  // "A deliverable package is produced for each selected line" is a promise a
  // platform rollout makes. It is not one a training or time-and-materials
  // engagement makes: a course produces attendance and certification, and a
  // block of consulting hours produces the hours — the whole point of the T&M
  // terms is that no fixed deliverable is being bought. Stating it anyway put a
  // commitment on the page that the fee lines do not support, which is the first
  // thing the AI reviewer is asked to look for.
  const deliverablesCoverage =
    selectedLineNames.length === 0
      ? ""
      : includesPlatformPackage
        ? `A deliverable package is produced for each selected line: ${selectedLineNames.join(", ")}. ` +
          "Section 03 states the scope of each."
        : `Section 03 states the scope of each line in the schedule: ${selectedLineNames.join(", ")}.`;

  /* --- Pricing schedule -------------------------------------------------- */

  const totalRows: DocumentTotalRow[] = [
    { label: "Subtotal", value: formatLineAmount(totals.subtotal) },
    { label: "Discount", value: totals.discount === 0 ? formatMoney(0) : `-${formatMoney(totals.discount)}` },
    { label: "Tax", value: formatMoney(totals.tax) },
    { label: "Total", value: formatLineAmount(totals.total), emphasis: "total" },
    { label: "Deposit Due at Acceptance", value: formatLineAmount(totals.deposit), emphasis: "deposit" },
  ];

  /* --- Validity --------------------------------------------------------- */

  let validity = `Open for acceptance for ${validDays} calendar days from proposal date.`;
  if (proposal.validUntil) {
    validity += ` Valid until ${formatDocumentDate(proposal.validUntil)}.`;
  }

  /* --- Revision markers ------------------------------------------------- */

  const hasRevision = typeof revisionNumber === "number" && Number.isFinite(revisionNumber);
  const currentRevision = Number.isFinite(proposal.currentRevision) ? proposal.currentRevision : 1;

  // The pilot package is the only one whose document copy talks about a "pilot";
  // an Enterprise or Black Label proposal headlined "Pilot Program Proposal" was
  // simply wrong.
  const isPilotPackage = isPilotPackageKey(packageRow?.key ?? defaultPackageKey);

  const scheduleTermClause = term.rangeLabel
    ? ` The engagement term runs ${term.rangeLabel}.`
    : "";

  /* --- Section 06's paragraph ------------------------------------------- */
  //
  // One hardcoded sentence used to open section 06 on all seven types, and it
  // described a platform rollout: "implementation follows the order shown in the
  // scope". A training engagement has no implementation — sessions are
  // scheduled. A time-and-materials engagement performs tasks as they are
  // requested, in no fixed order. A retainer just recurs. The ordered steps
  // printed underneath this paragraph are already per-type (typeCopy.scheduleSteps),
  // so a typed document points at those instead, in its own lexicon's words.
  const scheduleLead = typeProfile
    ? "The schedule is coordinated after acceptance. Unless otherwise agreed, " +
      `${typeProfile.lexicon.engagementNoun} follows the sequence shown below.`
    : "The schedule is coordinated after acceptance. Unless otherwise agreed, implementation follows the order " +
      "shown in the scope.";
  // With no billing term chosen there is nothing to name, and the sentence used
  // to fill the gap with the pilot's. Payment terms always resolve, so the
  // clause states those alone rather than inventing a billing cadence.
  const scheduleBilling = billingTerm
    ? `Billing follows the selected term (${billingTerm}), with ${paymentTerms}.`
    : `Payment terms are ${paymentTerms}.`;

  return {
    headline: clientCompany ? `Proposal for ${clientCompany}` : proposal.title,
    subtitle: typeCopy.subtitle,
    docline: buildDocline(
      packageOption.name,
      isPilotPackage,
      term,
      includesPlatformPackage ? null : proposalTypeLabel ?? "Professional Services",
    ),
    // The COMPANY, never a person. A preparer typed into sellerName lands in
    // the Prepared By lines below instead of becoming the masthead.
    wordmark: companyName,
    statusLabel: proposalStatusLabels[proposal.status] ?? String(proposal.status),
    preparedFor: buildParty(clientCompany, clientLines),
    clientContacts,
    preparedByBlock: buildParty(companyName, sellerLines),
    proposalDate: formatDocumentDate(fieldText(state, "proposalDate")),
    proposalNumber: fieldText(state, "proposalNo", missingValue),
    validity,
    term,
    termLabel: term.rangeLabel
      ? term.months === null
        ? term.rangeLabel
        : `${term.rangeLabel} (${plural(term.months, "month")})`
      : null,
    summary: truncateAtWord(fieldText(state, "customSummary", documentCopy.noSummary), documentLimits.summaryChars),
    packageHeading: includesPlatformPackage ? "Selected Platform Package" : "Engagement Summary",
    includesPlatformPackage,
    proposalTypeLabel,
    packageIntro: buildPackageDescription({
      packageName: packageOption.name,
      packageDesc: packageOption.desc,
      users: includedUsers,
      sites: includedSites,
      term,
      includesPlatformPackage,
      proposalTypeLabel,
    }),
    // A count of zero is "not set yet", not a quoted limit — the pill is
    // dropped rather than printing "Included Users: 0" on a blank proposal.
    //
    // A services engagement gets a DIFFERENT set: no subscription price (there
    // is no subscription) and no seat/site limits (nothing is capped). What
    // matters there is what kind of engagement it is and what it costs.
    // The Billing pill is dropped when no billing term was chosen, for the same
    // reason the seat pills are dropped at zero: an unset field is not a quoted
    // value, and the pill used to fill in with the pilot's cadence.
    packagePills: includesPlatformPackage
      ? [
          { label: isPilotPackage ? "Pilot Price" : "Subscription Price", value: formatLineAmount(packageRow?.price ?? 0) },
          { label: "Term", value: term.rangeLabel ?? missingValue },
          ...(includedUsers > 0 ? [{ label: "Included Users", value: String(includedUsers) }] : []),
          ...(includedSites > 0 ? [{ label: "Included Jobsites", value: String(includedSites) }] : []),
          ...(billingTerm ? [{ label: "Billing", value: billingTerm }] : []),
        ]
      : [
          { label: "Engagement", value: proposalTypeLabel ?? "Professional Services" },
          { label: "Total", value: formatLineAmount(totals.total) },
          ...(term.rangeLabel ? [{ label: "Term", value: term.rangeLabel }] : []),
          ...(billingTerm ? [{ label: "Billing", value: billingTerm }] : []),
        ],
    phaseScope,
    serviceScope,
    phaseEmptyNote: includesPlatformPackage ? documentCopy.noPhases : "",
    serviceEmptyNote: includesPlatformPackage ? documentCopy.noServices : "",
    deliverables: [...typeCopy.deliverables],
    deliverablesCoverage,
    feeGroups: groupFeeRows(totals.lineItems, includesPlatformPackage),
    totalRows,
    totals,
    schedule: `${scheduleLead}${scheduleTermClause} ${scheduleBilling}`,
    exclusions: fieldText(state, "customExclusions", documentCopy.noExclusions),
    // Section 03/05/06 headings, named for the deal being proposed. A training
    // client reads "Courses & Delivery" and "Training Fees"; a T&M client reads
    // "Rates & Estimated Fees", which makes the estimate argument in the
    // heading over the money rather than only in the terms.
    //
    // Listed rather than spread: the lexicon also carries `unitNoun`, which is
    // consumed above to label the scope lines and is not itself a field of the
    // rendered model. A spread would put it on the model silently.
    scopeHeading: lexicon.scopeHeading,
    feesHeading: lexicon.feesHeading,
    termHeading: lexicon.termHeading,
    // The legal section, composed for this proposal's type. Before this, all
    // seven types printed one identical clause set, so a training proposal
    // carried "Taxes & SaaS Fees" and a SaaS warranty disclaimer for a class in
    // a trailer. An unstamped (pre-types) proposal still gets the shared set
    // verbatim — see buildTermsForProfile.
    terms: buildTermsForProfile(
      { paymentTerms, lateFee, aiData, ipRights, liabilityCap, governingLaw, validDays },
      typeProfile,
    ),
    // Budgeted HERE rather than at each call site: the detail view, the revision
    // view, the share route, the PDF and the editor preview all reach the
    // renderer through this builder, and a per-caller trim is how they would
    // start disagreeing about what section 09 says.
    team: fitTeamBios(team),
    sellerSignature: preparerName ? `${preparerName} / Authorized Representative` : "Authorized Representative",
    signature,
    // "produced by" names the COMPANY. A person's name here made the notice
    // assert that an individual, not the entity, issued the document.
    legalNotice:
      `LEGAL NOTICE: This proposal is produced by ${companyName}. It is not legal advice. Terms referencing CCPA, ` +
      "Wisconsin trade secret law, OSHA, E-SIGN, and other statutes are for commercial purposes. All proposals must " +
      "be reviewed by qualified legal counsel in the governing jurisdiction before execution.",
    purposeCallout: typeCopy.purposeCallout,
    scopeIntro: typeCopy.scopeIntro,
    scheduleSteps: typeCopy.scheduleSteps,
    clientResponsibilities: typeCopy.clientResponsibilities,
    acceptance: documentCopy.acceptance,
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
