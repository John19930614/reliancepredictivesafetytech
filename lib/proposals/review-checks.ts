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

import { parseClientContacts } from "./client-contacts";
import { scanProposalConsistency } from "./consistency";
import type { GeneratorState } from "./generator-state";
import { computeProposalTotals, formatMoney } from "./pricing";
import { parseSignerId, parseTeamMemberIds } from "./team-selection";
import type { ProposalStatus } from "./types";

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
  // Date-only strings compare correctly as strings; both sides are YYYY-MM-DD.
  if (meta.validUntil && preAcceptanceStatuses.includes(meta.status) && meta.validUntil < meta.today) {
    findings.push({
      id: "valid_until_past",
      severity: "error",
      area: "Validity",
      message: `The validity date (${meta.validUntil}) has passed — the client can no longer accept this proposal as written.`,
    });
  }

  return findings;
}
