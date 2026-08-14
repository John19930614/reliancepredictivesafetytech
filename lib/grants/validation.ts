/**
 * Grant Tracker input validation.
 *
 * Pure, and deliberately a mirror of the CHECK constraints in
 * supabase/migrations/20260816090000_grant_tracker.sql. Anything the database
 * would reject with a 23514 is rejected here first with a field-level message,
 * so a user sees "Website must start with http:// or https://" rather than a
 * raw constraint name.
 */

import { firstGrantStatusKey, isGrantStatusKey, isGrantTerminalStatus, type GrantStatusKey } from "./statuses";

export const maxGrantNameLength = 200;
export const maxGrantTextLength = 200;
export const maxRequirementsLength = 4000;
export const maxNotesLength = 8000;
export const maxNextActionLength = 500;
export const maxWebsiteLabelLength = 300;

/**
 * A one-word reason is indistinguishable from no reason, and the whole point of
 * the constraint is that a closed row explains itself. Same floor the lifecycle
 * exit validator uses.
 */
export const minOutcomeReasonLength = 10;
export const maxOutcomeReasonLength = 1000;

export const grantFeeKinds = ["application", "membership", "other"] as const;
export type GrantFeeKind = (typeof grantFeeKinds)[number];

export interface GrantFieldErrors {
  [field: string]: string;
}

export interface GrantCheckResult<T> {
  ok: boolean;
  error?: string;
  fieldErrors?: GrantFieldErrors;
  value?: T;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shape alone is not enough: "2026-13-45" matches ISO_DATE and would reach a
 * `date` column, so the value is round-tripped through Date and compared back.
 */
export function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function optionalText(value: unknown): string | null {
  const trimmed = text(value);
  return trimmed.length > 0 ? trimmed : null;
}

/** Returns undefined for "not supplied", null for "explicitly cleared". */
function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : NaN;
}

export interface GrantInput {
  name?: unknown;
  agency?: unknown;
  subAgency?: unknown;
  contact?: unknown;
  status?: unknown;
  requirements?: unknown;
  feeAmount?: unknown;
  feeKind?: unknown;
  feePaid?: unknown;
  awardAmount?: unknown;
  websiteUrl?: unknown;
  websiteLabel?: unknown;
  opensOn?: unknown;
  deadline?: unknown;
  nextAction?: unknown;
  nextActionDue?: unknown;
  ownerUserId?: unknown;
  notes?: unknown;
}

export interface GrantRecordValues {
  name: string;
  agency: string | null;
  sub_agency: string | null;
  contact: string | null;
  status: GrantStatusKey;
  requirements: string | null;
  fee_amount: number | null;
  fee_kind: GrantFeeKind | null;
  fee_paid: boolean;
  award_amount: number | null;
  website_url: string | null;
  website_label: string | null;
  opens_on: string | null;
  deadline: string | null;
  next_action: string | null;
  next_action_due: string | null;
  owner_user_id: string | null;
  notes: string | null;
}

/**
 * Validates a complete new grant. `status` may not be terminal: reaching an
 * outcome goes through checkGrantStatusChange so the transition is audited, and
 * the RLS insert policy enforces the same rule.
 */
export function checkGrantInput(input: GrantInput): GrantCheckResult<GrantRecordValues> {
  const fieldErrors: GrantFieldErrors = {};

  const name = text(input.name);
  if (!name) {
    fieldErrors.name = "Program name is required.";
  } else if (name.length > maxGrantNameLength) {
    fieldErrors.name = `Program name must be ${maxGrantNameLength} characters or fewer.`;
  }

  const agency = optionalText(input.agency);
  if (agency && agency.length > maxGrantTextLength) {
    fieldErrors.agency = `Agency must be ${maxGrantTextLength} characters or fewer.`;
  }

  const subAgency = optionalText(input.subAgency);
  if (subAgency && subAgency.length > maxGrantTextLength) {
    fieldErrors.subAgency = `Sub-agency must be ${maxGrantTextLength} characters or fewer.`;
  }

  const contact = optionalText(input.contact);
  if (contact && contact.length > maxGrantTextLength) {
    fieldErrors.contact = `Contact must be ${maxGrantTextLength} characters or fewer.`;
  }

  const statusRaw = text(input.status) || firstGrantStatusKey;
  if (!isGrantStatusKey(statusRaw)) {
    fieldErrors.status = "Choose a valid status.";
  } else if (isGrantTerminalStatus(statusRaw)) {
    fieldErrors.status = "Record an outcome from the grant itself, so the decision is logged.";
  }

  const requirements = optionalText(input.requirements);
  if (requirements && requirements.length > maxRequirementsLength) {
    fieldErrors.requirements = `What is needed must be ${maxRequirementsLength} characters or fewer.`;
  }

  const feeAmount = optionalNumber(input.feeAmount);
  if (Number.isNaN(feeAmount)) {
    fieldErrors.feeAmount = "Fee must be a number.";
  } else if (typeof feeAmount === "number" && feeAmount < 0) {
    fieldErrors.feeAmount = "Fee cannot be negative.";
  }

  const feeKindRaw = optionalText(input.feeKind);
  let feeKind: GrantFeeKind | null = null;
  if (feeKindRaw) {
    if (!grantFeeKinds.includes(feeKindRaw as GrantFeeKind)) {
      fieldErrors.feeKind = "Choose a valid fee type.";
    } else {
      feeKind = feeKindRaw as GrantFeeKind;
    }
  }

  const resolvedFee = typeof feeAmount === "number" ? feeAmount : null;
  if (feeKind && resolvedFee === null) {
    fieldErrors.feeKind = "Enter the fee amount before choosing a fee type.";
  }

  const feePaid = input.feePaid === true || input.feePaid === "true" || input.feePaid === "on";
  if (feePaid && resolvedFee === null) {
    fieldErrors.feePaid = "Enter the fee amount before marking it paid.";
  }

  const awardAmount = optionalNumber(input.awardAmount);
  if (Number.isNaN(awardAmount)) {
    fieldErrors.awardAmount = "Award amount must be a number.";
  } else if (typeof awardAmount === "number" && awardAmount < 0) {
    fieldErrors.awardAmount = "Award amount cannot be negative.";
  }

  const websiteUrl = optionalText(input.websiteUrl);
  if (websiteUrl && !/^https?:\/\//.test(websiteUrl)) {
    fieldErrors.websiteUrl = "Website must start with http:// or https://.";
  }

  const websiteLabel = optionalText(input.websiteLabel);
  if (websiteLabel && websiteLabel.length > maxWebsiteLabelLength) {
    fieldErrors.websiteLabel = `Website label must be ${maxWebsiteLabelLength} characters or fewer.`;
  }

  const opensOn = optionalText(input.opensOn);
  if (opensOn && !isRealDate(opensOn)) {
    fieldErrors.opensOn = "Choose a valid opening date.";
  }

  const deadline = optionalText(input.deadline);
  if (deadline && !isRealDate(deadline)) {
    fieldErrors.deadline = "Choose a valid deadline.";
  }

  if (opensOn && deadline && isRealDate(opensOn) && isRealDate(deadline) && opensOn > deadline) {
    fieldErrors.deadline = "The deadline cannot fall before the opening date.";
  }

  const nextAction = optionalText(input.nextAction);
  if (nextAction && nextAction.length > maxNextActionLength) {
    fieldErrors.nextAction = `Next action must be ${maxNextActionLength} characters or fewer.`;
  }

  const nextActionDue = optionalText(input.nextActionDue);
  if (nextActionDue && !isRealDate(nextActionDue)) {
    fieldErrors.nextActionDue = "Choose a valid next-action date.";
  }

  const ownerUserId = optionalText(input.ownerUserId);
  if (ownerUserId && !isUuid(ownerUserId)) {
    fieldErrors.ownerUserId = "Choose a valid owner.";
  }

  const notes = optionalText(input.notes);
  if (notes && notes.length > maxNotesLength) {
    fieldErrors.notes = `Notes must be ${maxNotesLength} characters or fewer.`;
  }

  const first = Object.values(fieldErrors)[0];
  if (first) return { ok: false, error: first, fieldErrors };

  return {
    ok: true,
    value: {
      name,
      agency,
      sub_agency: subAgency,
      contact,
      status: statusRaw as GrantStatusKey,
      requirements,
      fee_amount: resolvedFee,
      fee_kind: feeKind,
      fee_paid: feePaid,
      award_amount: typeof awardAmount === "number" ? awardAmount : null,
      website_url: websiteUrl,
      website_label: websiteLabel,
      opens_on: opensOn,
      deadline,
      next_action: nextAction,
      next_action_due: nextActionDue,
      owner_user_id: ownerUserId,
      notes,
    },
  };
}

export interface GrantStatusChangeInput {
  status?: unknown;
  outcomeReason?: unknown;
  awardAmount?: unknown;
}

export interface GrantStatusChangeValues {
  status: GrantStatusKey;
  outcome_reason: string | null;
  award_amount?: number | null;
}

/**
 * Validates a status transition against the row's current status.
 *
 * A no-op transition is rejected rather than quietly audited: an audit trail
 * full of "moved from submitted to submitted" is worse than none.
 */
export function checkGrantStatusChange(
  currentStatus: string | null | undefined,
  input: GrantStatusChangeInput,
): GrantCheckResult<GrantStatusChangeValues> {
  const fieldErrors: GrantFieldErrors = {};

  const status = text(input.status);
  if (!isGrantStatusKey(status)) {
    return { ok: false, error: "Choose a valid status.", fieldErrors: { status: "Choose a valid status." } };
  }

  if (status === currentStatus) {
    return { ok: false, error: "That grant is already in this status.", fieldErrors: { status: "That grant is already in this status." } };
  }

  const terminal = isGrantTerminalStatus(status);
  const outcomeReason = optionalText(input.outcomeReason);

  if (terminal) {
    if (!outcomeReason) {
      fieldErrors.outcomeReason = "Say why this grant is closing — that note is the only reason to keep the row.";
    } else if (outcomeReason.length < minOutcomeReasonLength) {
      fieldErrors.outcomeReason = `Give at least ${minOutcomeReasonLength} characters of reason.`;
    } else if (outcomeReason.length > maxOutcomeReasonLength) {
      fieldErrors.outcomeReason = `Reason must be ${maxOutcomeReasonLength} characters or fewer.`;
    }
  }

  const awardAmount = optionalNumber(input.awardAmount);
  if (Number.isNaN(awardAmount)) {
    fieldErrors.awardAmount = "Award amount must be a number.";
  } else if (typeof awardAmount === "number" && awardAmount < 0) {
    fieldErrors.awardAmount = "Award amount cannot be negative.";
  }

  if (status === "awarded" && !(typeof awardAmount === "number" && awardAmount > 0)) {
    fieldErrors.awardAmount = "Record what the award is worth.";
  }

  const first = Object.values(fieldErrors)[0];
  if (first) return { ok: false, error: first, fieldErrors };

  const value: GrantStatusChangeValues = {
    status,
    // Leaving a terminal status clears the reason, so a re-opened row does not
    // keep claiming it was declined.
    outcome_reason: terminal ? outcomeReason : null,
  };

  if (awardAmount !== undefined) {
    value.award_amount = awardAmount;
  }

  return { ok: true, value };
}
