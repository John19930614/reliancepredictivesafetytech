// Deterministic proposal readiness checks — pure, free, and always available.
//
// AI review has to be available at EVERY stage of the proposal workflow, which
// includes the days the OPENAI_API_KEY is missing, the daily AI budget is
// spent, or the model is down. These checks are the floor that makes that
// promise true: they run on every request, cost nothing, and never skip. The
// model (lib/proposals/review.ts) adds judgment on top; it never replaces them.
//
// Same philosophy as lib/proposals/consistency.ts, which these checks fold in:
// anything a pure function can decide is not the model's job. Findings are
// advisory — nothing here blocks a save, a submit, or a send. The maker–checker
// gates in lib/proposals/approval.ts stay the only enforcement.

import { isPilotPackageKey } from "./catalog";
import { parseClientContacts } from "./client-contacts";
import { scanProposalConsistency } from "./consistency";
import type { GeneratorState } from "./generator-state";
import { computeProposalTotals, formatMoney } from "./pricing";
import { parseSignerId, parseTeamMemberIds } from "./team-selection";
import { parseProposalTerm } from "./term";
import type { ProposalStatus } from "./types";
import { daysUntilProposalExpiry, expiringSoonDays, isProposalExpired } from "./validity";

export type ReviewSeverity = "error" | "warn" | "info";

export interface ReadinessFinding {
  /** Stable id, e.g. "client_missing" or "figures:phase:0:0". */
  id: string;
  severity: ReviewSeverity;
  /** Where the issue lives, e.g. "Prepared For" or "Executive summary". */
  area: string;
  message: string;
}

export interface ReadinessMeta {
  status: ProposalStatus;
  /** client_proposals.valid_until, or null when unset. */
  validUntil: string | null;
  /** Whether the proposal row is assigned to a company record. */
  clientAssigned: boolean;
  /**
   * Today as YYYY-MM-DD in company time. Passed in rather than read from
   * `new Date()` so this module stays pure and testable, matching
   * ProposalPrefill.today.
   */
  today: string;
}

function fieldText(state: GeneratorState, id: string): string {
  const value = state.fields[id];
  return typeof value === "string" ? value.trim() : "";
}

/** Statuses where an expired validity date still matters. */
const preAcceptanceStatuses: readonly ProposalStatus[] = ["draft", "in_review", "sent"];

const placeholderPattern = /\{\{[^}]+\}\}/;

/**
 * Every place stored text ends up printed: field strings, and each line item's
 * name/desc. Returns the labels of locations still carrying an unresolved
 * `{{placeholder}}`.
 */
function placeholderLocations(state: GeneratorState): string[] {
  const locations: string[] = [];
  for (const [id, value] of Object.entries(state.fields)) {
    if (typeof value === "string" && placeholderPattern.test(value)) locations.push(id);
  }
  state.phases.forEach((item, index) => {
    if (placeholderPattern.test(`${item.name} ${item.desc}`)) locations.push(`phase ${index + 1}`);
  });
  state.services.forEach((item, index) => {
    if (placeholderPattern.test(`${item.name} ${item.desc}`)) locations.push(`service line ${index + 1}`);
  });
  return locations;
}

/**
 * The full deterministic readiness scan, in document order.
 *
 * The panel sorts by severity; this function does not, so a finding's position
 * is stable and diffable in tests.
 */
export function collectReadinessFindings(state: GeneratorState | null, meta: ReadinessMeta): ReadinessFinding[] {
  if (!state) {
    return [
      {
        id: "no_form_data",
        severity: "error",
        area: "Document",
        message: "This proposal has no saved document content yet, so there is nothing to review.",
      },
    ];
  }

  const findings: ReadinessFinding[] = [];

  // -- Prepared For block -----------------------------------------------------
  if (fieldText(state, "clientCompany") === "") {
    findings.push({
      id: "client_missing",
      severity: "error",
      area: "Prepared For",
      message: "The document names no client company. Assign a company or fill in the client block.",
    });
  }
  if (!meta.clientAssigned) {
    findings.push({
      id: "client_unassigned",
      severity: "warn",
      area: "Prepared For",
      message: "The proposal is not assigned to a company record, so it is numbered under the global scheme and appears on no client's list.",
    });
  }
  const contacts = parseClientContacts(state.fields);
  if (!contacts.some((contact) => contact.email)) {
    findings.push({
      id: "client_contact_email",
      severity: "warn",
      area: "Prepared For",
      message: "No client contact on the document has an email address — share links and DocuSign will have no default recipient.",
    });
  }

  // -- Narrative --------------------------------------------------------------
  if (fieldText(state, "customSummary") === "") {
    findings.push({
      id: "summary_empty",
      severity: "warn",
      area: "Executive summary",
      message: "The executive summary is empty, so the document opens straight into the fee schedule.",
    });
  }

  // -- Team & signature (every proposal names who will do the work) -----------
  if (parseTeamMemberIds(state.fields).length === 0) {
    findings.push({
      id: "team_bios",
      severity: "warn",
      area: "Proposal team",
      message: "No teammates are selected, so the document prints no bios. Pick who will do the work in the team section.",
    });
  }
  if (parseSignerId(state.fields) === null) {
    findings.push({
      id: "signer",
      severity: "info",
      area: "Signature",
      message: "No signer is selected; the seller signature line will print without a signature image.",
    });
  }

  // -- Content hygiene --------------------------------------------------------
  const placeholders = placeholderLocations(state);
  if (placeholders.length > 0) {
    const shown = placeholders.slice(0, 3).join(", ");
    const rest = placeholders.length > 3 ? ` and ${placeholders.length - 3} more` : "";
    findings.push({
      id: "placeholders",
      severity: "error",
      area: "Content",
      message: `Unresolved {{placeholders}} remain in: ${shown}${rest}. A client must never see one.`,
    });
  }

  // -- Pricing ----------------------------------------------------------------
  const totals = computeProposalTotals(state);
  if (totals.total <= 0) {
    findings.push({
      id: "total_zero",
      severity: "warn",
      area: "Pricing",
      message: `The proposal total is ${formatMoney(totals.total)}. If that is deliberate, the summary should say why; otherwise the fee schedule is not finished.`,
    });
  }

  // -- Figures drift (the consistency scanner, folded in) ---------------------
  scanProposalConsistency(state).forEach((finding, index) => {
    findings.push({
      id: `figures:${finding.regionId}:${index}`,
      severity: "warn",
      area: finding.regionLabel,
      message: finding.message,
    });
  });

  // -- Validity ---------------------------------------------------------------
  if (preAcceptanceStatuses.includes(meta.status)) {
    if (isProposalExpired(meta.validUntil, meta.today)) {
      findings.push({
        id: "valid_until_past",
        severity: "error",
        area: "Validity",
        message: `The validity date (${meta.validUntil}) has passed, so the share page now refuses acceptance. Extend the acceptance window or reissue the proposal.`,
      });
    } else {
      const daysLeft = daysUntilProposalExpiry(meta.validUntil, meta.today);
      if (daysLeft !== null && daysLeft <= expiringSoonDays && meta.status === "sent") {
        findings.push({
          id: "valid_until_soon",
          severity: "warn",
          area: "Validity",
          message:
            daysLeft === 0
              ? `Today is the last day this proposal can be accepted (${meta.validUntil}).`
              : `This proposal stops being acceptable in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${meta.validUntil}).`,
        });
      }
    }
  }

  findings.push(...collectTermsFindings(state, meta));
  return findings;
}

/* -------------------------------------------------------------------------- */
/* Commercial terms                                                            */
/*                                                                             */
/* collectProposalFacts() has always gathered validDays, paymentTerms and      */
/* billingTerm and handed them to the AI reviewer as ground truth — and no     */
/* deterministic rule ever read them. So the free checks caught "20 users vs   */
/* 50 users" while waving through a deposit due at acceptance sitting under a  */
/* Net-30-from-invoice clause, a validity date that contradicts the sentence   */
/* printed beside it, and an engagement term that runs backwards.              */
/*                                                                             */
/* These are the terms a signer actually argues about. All deterministic.      */
/* -------------------------------------------------------------------------- */

/** Words that make a payment clause acknowledge money due before invoicing. */
const upfrontPaymentPattern = /\b(deposit|acceptance|signing|advance|upfront|up front|retainer|mobilization)\b/i;

function fieldNumber(state: GeneratorState, id: string): number {
  const raw = state.fields[id];
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function collectTermsFindings(state: GeneratorState, meta: ReadinessMeta): ReadinessFinding[] {
  const findings: ReadinessFinding[] = [];
  const totals = computeProposalTotals(state);
  const term = parseProposalTerm(state.fields);

  // A deposit is money due at acceptance. A payment clause that only describes
  // invoicing does not authorise collecting it, and the two print a page apart.
  const paymentTerms = fieldText(state, "paymentTerms");
  if (totals.deposit > 0 && paymentTerms !== "" && !upfrontPaymentPattern.test(paymentTerms)) {
    findings.push({
      id: "deposit_vs_payment_terms",
      severity: "warn",
      area: "Payment terms",
      message: `The schedule shows ${formatMoney(totals.deposit)} due at acceptance, but the payment terms only say "${paymentTerms}" — nothing there covers money due before an invoice.`,
    });
  }

  // Two independent sources for the same promise, printed in one sentence:
  // "Open for acceptance for N calendar days from proposal date. Valid until X."
  const validDaysRaw = fieldNumber(state, "validDays");
  const proposalDate = fieldText(state, "proposalDate");
  if (validDaysRaw > 0 && meta.validUntil && /^\d{4}-\d{2}-\d{2}$/.test(proposalDate)) {
    const impliedDays = daysUntilProposalExpiry(meta.validUntil, proposalDate);
    // A couple of days of slack: sellers round to "60 days" from a date that is
    // 58 or 61 days out, and flagging that is noise, not a finding.
    if (impliedDays !== null && Math.abs(impliedDays - validDaysRaw) > 2) {
      findings.push({
        id: "valid_days_vs_valid_until",
        severity: "warn",
        area: "Validity",
        message: `The document says it is open for ${validDaysRaw} days from ${proposalDate}, but the validity date is ${meta.validUntil} — ${impliedDays} days. One of the two is wrong.`,
      });
    }
  }

  // A range that cannot be measured. parseProposalTerm already refuses to state
  // a duration for it; nothing told the seller why the durations vanished.
  if (term.reversed) {
    findings.push({
      id: "term_reversed",
      severity: "error",
      area: "Engagement term",
      message: "The engagement term ends before it starts, so every duration the document would print has been suppressed.",
    });
  }

  // Selling work that starts after the offer dies.
  if (term.start && meta.validUntil && /^\d{4}-\d{2}-\d{2}$/.test(meta.validUntil)) {
    const [validYear, validMonth] = meta.validUntil.split("-").map(Number);
    const startsAfterValidity =
      term.start.year > validYear || (term.start.year === validYear && term.start.month > validMonth);
    if (startsAfterValidity) {
      findings.push({
        id: "term_starts_after_validity",
        severity: "warn",
        area: "Engagement term",
        message: `The engagement starts ${term.start.label}, after the proposal stops being acceptable (${meta.validUntil}). The client cannot accept it in time to begin as scheduled.`,
      });
    }
  }

  // "One-time (pilot)" billing on a proposal that is not a pilot: the billing
  // line and the package are describing two different deals.
  const billingTerm = fieldText(state, "billingTerm");
  const packageKey = fieldText(state, "packageSelect");
  if (/pilot/i.test(billingTerm) && !isPilotPackageKey(packageKey)) {
    findings.push({
      id: "billing_term_says_pilot",
      severity: "warn",
      area: "Billing",
      message: `The billing term reads "${billingTerm}" on a proposal that is not a pilot. Pick the billing term that matches what is being sold.`,
    });
  }

  return findings;
}
