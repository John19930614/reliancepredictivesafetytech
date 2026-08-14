"use server";

import { revalidatePath } from "next/cache";
import { buildDataAuditEvent, recordAuditEvent } from "@/lib/audit/events";
import { friendlyError } from "@/lib/friendly-error";
import { getGrantTrackerAccess } from "@/lib/grants/access";
import { isGrantTerminalStatus } from "@/lib/grants/statuses";
import {
  checkGrantInput,
  checkGrantStatusChange,
  isUuid,
  type GrantInput,
  type GrantStatusChangeInput,
} from "@/lib/grants/validation";

// No createAdminClient() anywhere in this module. The RLS policies on
// company_grant_opportunities are the enforcement path, so the user's own
// client must be the one that hits them — the newer posture of the lifecycle
// and file-center modules, rather than the admin-client shortcut in expenses.

export interface GrantActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  grantId?: string;
}

const TABLE = "company_grant_opportunities";

function revalidateGrants() {
  revalidatePath("/employee/grants");
}

/** Every column the audit trail and the outcome guards need to read first. */
const ROW_COLUMNS =
  "id, name, agency, sub_agency, contact, status, requirements, fee_amount, fee_kind, fee_paid, award_amount, website_url, website_label, opens_on, deadline, next_action, next_action_due, owner_user_id, notes, outcome_reason";

export async function createGrantOpportunity(input: GrantInput): Promise<GrantActionResult> {
  const { supabase, userId, role, canManage } = await getGrantTrackerAccess();

  // Returns before any query is issued — the RBAC tests assert that a signed-out
  // caller never reaches the database.
  if (!supabase || !userId) {
    return { ok: false, error: "You must be signed in." };
  }
  if (!canManage) {
    return { ok: false, error: "You do not have permission to add grants." };
  }

  const checked = checkGrantInput(input);
  if (!checked.ok || !checked.value) {
    return { ok: false, error: checked.error, fieldErrors: checked.fieldErrors };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...checked.value, created_by: userId })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: friendlyError(error, "Could not add this grant.") };
  }

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "create",
      "grant_opportunity",
      data?.id ?? "",
      userId,
      `Added grant "${checked.value.name}"`,
      null,
      {
        name: checked.value.name,
        agency: checked.value.agency,
        sub_agency: checked.value.sub_agency,
        status: checked.value.status,
        fee_amount: checked.value.fee_amount,
        award_amount: checked.value.award_amount,
      },
    ),
    actor_role: role,
  });

  revalidateGrants();
  return { ok: true, grantId: data?.id };
}

/**
 * Field facts only. `status`, `outcome_reason`, `decided_at`, `submitted_at`,
 * `status_changed_at` and `created_by` are never patched here — the first two
 * belong to changeGrantStatus so the transition is audited, and the rest belong
 * to the database trigger.
 */
export async function updateGrantOpportunity(grantId: string, input: GrantInput): Promise<GrantActionResult> {
  const { supabase, userId, role, canManage, canEditClosed } = await getGrantTrackerAccess();

  if (!supabase || !userId) {
    return { ok: false, error: "You must be signed in." };
  }
  if (!canManage) {
    return { ok: false, error: "You do not have permission to edit grants." };
  }
  if (!isUuid(String(grantId ?? ""))) {
    return { ok: false, error: "That grant was not found." };
  }

  const { data: before, error: beforeError } = await supabase
    .from(TABLE)
    .select(ROW_COLUMNS)
    .eq("id", grantId)
    .maybeSingle();

  if (beforeError) {
    return { ok: false, error: friendlyError(beforeError, "Could not load this grant.") };
  }
  if (!before) {
    return { ok: false, error: "That grant was not found." };
  }

  if (isGrantTerminalStatus(before.status) && !canEditClosed) {
    return { ok: false, error: "Admin role required to edit a grant that has already been decided." };
  }

  // Validated as the row would look AFTER the patch, not as the patch alone —
  // otherwise editing one field fails on "Program name is required" because the
  // caller never sent a name. Cross-field rules (fee_paid needs an amount, the
  // deadline cannot precede the opening date) need the merged record to be
  // checked against the same constraints the database will apply.
  const checked = checkGrantInput({
    name: input.name ?? before.name,
    agency: input.agency ?? before.agency,
    subAgency: input.subAgency ?? before.sub_agency,
    contact: input.contact ?? before.contact,
    // Status is deliberately left at the validator's default rather than the
    // row's own: checkGrantInput rejects terminal statuses (an outcome must be
    // recorded through changeGrantStatus), which would make every admin edit of
    // a decided grant fail. The resulting value.status is never patched here.
    requirements: input.requirements ?? before.requirements,
    feeAmount: input.feeAmount ?? before.fee_amount,
    feeKind: input.feeKind ?? before.fee_kind,
    feePaid: input.feePaid ?? before.fee_paid,
    awardAmount: input.awardAmount ?? before.award_amount,
    websiteUrl: input.websiteUrl ?? before.website_url,
    websiteLabel: input.websiteLabel ?? before.website_label,
    opensOn: input.opensOn ?? before.opens_on,
    deadline: input.deadline ?? before.deadline,
    nextAction: input.nextAction ?? before.next_action,
    nextActionDue: input.nextActionDue ?? before.next_action_due,
    ownerUserId: input.ownerUserId ?? before.owner_user_id,
    notes: input.notes ?? before.notes,
  });
  if (!checked.ok || !checked.value) {
    return { ok: false, error: checked.error, fieldErrors: checked.fieldErrors };
  }

  // Built key by key from what the caller actually supplied, so an edit to one
  // field cannot blank a field the form never rendered.
  const patch: Record<string, unknown> = {};
  const values = checked.value;
  const map: Array<[keyof GrantInput, string, unknown]> = [
    ["name", "name", values.name],
    ["agency", "agency", values.agency],
    ["subAgency", "sub_agency", values.sub_agency],
    ["contact", "contact", values.contact],
    ["requirements", "requirements", values.requirements],
    ["feeAmount", "fee_amount", values.fee_amount],
    ["feeKind", "fee_kind", values.fee_kind],
    ["feePaid", "fee_paid", values.fee_paid],
    ["awardAmount", "award_amount", values.award_amount],
    ["websiteUrl", "website_url", values.website_url],
    ["websiteLabel", "website_label", values.website_label],
    ["opensOn", "opens_on", values.opens_on],
    ["deadline", "deadline", values.deadline],
    ["nextAction", "next_action", values.next_action],
    ["nextActionDue", "next_action_due", values.next_action_due],
    ["ownerUserId", "owner_user_id", values.owner_user_id],
    ["notes", "notes", values.notes],
  ];

  for (const [inputKey, column, value] of map) {
    if (input[inputKey] !== undefined) {
      patch[column] = value;
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, grantId };
  }

  const { data, error } = await supabase.from(TABLE).update(patch).eq("id", grantId).select("id");

  if (error) {
    return { ok: false, error: friendlyError(error, "Could not save this grant.") };
  }
  // PostgREST reports no error for an UPDATE that matched zero rows, so an
  // empty array is the RLS denial or the row disappearing, not a success.
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: "That grant was not found, or you do not have permission to edit it." };
  }

  const touchesMoney = "fee_amount" in patch || "fee_paid" in patch || "award_amount" in patch;

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "grant_opportunity",
      grantId,
      userId,
      `Updated ${Object.keys(patch).join(", ")} on "${before.name}"`,
      before,
      patch,
    ),
    actor_role: role,
    severity: touchesMoney ? "warn" : "info",
  });

  revalidateGrants();
  return { ok: true, grantId };
}

export async function changeGrantStatus(grantId: string, input: GrantStatusChangeInput): Promise<GrantActionResult> {
  const { supabase, userId, role, canChangeStatus, canRecordOutcome, canEditClosed } = await getGrantTrackerAccess();

  if (!supabase || !userId) {
    return { ok: false, error: "You must be signed in." };
  }
  if (!canChangeStatus) {
    return { ok: false, error: "You do not have permission to change a grant's status." };
  }
  if (!isUuid(String(grantId ?? ""))) {
    return { ok: false, error: "That grant was not found." };
  }

  const { data: before, error: beforeError } = await supabase
    .from(TABLE)
    .select("id, name, status, award_amount")
    .eq("id", grantId)
    .maybeSingle();

  if (beforeError) {
    return { ok: false, error: friendlyError(beforeError, "Could not load this grant.") };
  }
  if (!before) {
    return { ok: false, error: "That grant was not found." };
  }

  const checked = checkGrantStatusChange(before.status, input);
  if (!checked.ok || !checked.value) {
    return { ok: false, error: checked.error, fieldErrors: checked.fieldErrors };
  }

  if (isGrantTerminalStatus(checked.value.status) && !canRecordOutcome) {
    return { ok: false, error: "You do not have permission to close a grant." };
  }

  // Moving a decided row back into the pipeline un-reports an outcome somebody
  // may already have acted on.
  if (isGrantTerminalStatus(before.status) && !canEditClosed) {
    return { ok: false, error: "Admin role required to reopen a grant that has already been decided." };
  }

  // status_changed_at, decided_at and submitted_at are absent on purpose — the
  // set_grant_status_changed_at trigger owns them.
  const patch: Record<string, unknown> = {
    status: checked.value.status,
    outcome_reason: checked.value.outcome_reason,
  };
  if (checked.value.award_amount !== undefined) {
    patch.award_amount = checked.value.award_amount;
  }

  // Compare-and-set on the status we validated against, so two people closing
  // the same grant at once cannot both believe they won.
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", grantId)
    .eq("status", before.status)
    .select("id");

  if (error) {
    return { ok: false, error: friendlyError(error, "Could not update this grant's status.") };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: "This grant changed while you were looking at it. Reload and try again." };
  }

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "grant_opportunity",
      grantId,
      userId,
      `Moved "${before.name}" from ${before.status} to ${checked.value.status}`,
      { status: before.status, award_amount: before.award_amount },
      patch,
    ),
    actor_role: role,
    severity: isGrantTerminalStatus(checked.value.status) ? "warn" : "info",
  });

  revalidateGrants();
  return { ok: true, grantId };
}

/**
 * `fee_paid` is money leaving the company, so it gets its own audited action
 * rather than hiding inside a generic field update.
 */
export async function recordGrantFeePayment(grantId: string, paid: boolean): Promise<GrantActionResult> {
  const { supabase, userId, role, canManage } = await getGrantTrackerAccess();

  if (!supabase || !userId) {
    return { ok: false, error: "You must be signed in." };
  }
  if (!canManage) {
    return { ok: false, error: "You do not have permission to edit grants." };
  }
  if (!isUuid(String(grantId ?? ""))) {
    return { ok: false, error: "That grant was not found." };
  }

  const { data: before, error: beforeError } = await supabase
    .from(TABLE)
    .select("id, name, fee_amount, fee_paid")
    .eq("id", grantId)
    .maybeSingle();

  if (beforeError) {
    return { ok: false, error: friendlyError(beforeError, "Could not load this grant.") };
  }
  if (!before) {
    return { ok: false, error: "That grant was not found." };
  }

  // Checked before the write so the CHECK constraint never fires and the user
  // gets a sentence rather than a 23514.
  if (paid && before.fee_amount === null) {
    return { ok: false, error: "Record the fee amount before marking it paid." };
  }
  if (before.fee_paid === paid) {
    return { ok: true, grantId };
  }

  const { data, error } = await supabase.from(TABLE).update({ fee_paid: paid }).eq("id", grantId).select("id");

  if (error) {
    return { ok: false, error: friendlyError(error, "Could not update the fee.") };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: "That grant was not found, or you do not have permission to edit it." };
  }

  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "grant_opportunity",
      grantId,
      userId,
      `Marked the fee on "${before.name}" as ${paid ? "paid" : "unpaid"}`,
      { fee_paid: before.fee_paid },
      { fee_paid: paid },
    ),
    actor_role: role,
    severity: "warn",
  });

  revalidateGrants();
  return { ok: true, grantId };
}

/**
 * Hard delete, admin-only. Setting not_eligible with a reason is the supported
 * route for a dead grant; this exists for rows entered in error. The audit event
 * is the only remaining record of the row, so it carries the whole thing.
 */
export async function deleteGrantOpportunity(grantId: string): Promise<GrantActionResult> {
  const { supabase, userId, role, canDelete } = await getGrantTrackerAccess();

  if (!supabase || !userId) {
    return { ok: false, error: "You must be signed in." };
  }
  if (!canDelete) {
    return { ok: false, error: "Admin role required to permanently delete a grant." };
  }
  if (!isUuid(String(grantId ?? ""))) {
    return { ok: false, error: "That grant was not found." };
  }

  const { data: before, error: beforeError } = await supabase
    .from(TABLE)
    .select(ROW_COLUMNS)
    .eq("id", grantId)
    .maybeSingle();

  if (beforeError) {
    return { ok: false, error: friendlyError(beforeError, "Could not load this grant.") };
  }
  if (!before) {
    return { ok: false, error: "That grant was not found." };
  }

  const { data, error } = await supabase.from(TABLE).delete().eq("id", grantId).select("id");

  if (error) {
    return { ok: false, error: friendlyError(error, "Could not delete this grant.") };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: "That grant was not found, or you do not have permission to delete it." };
  }

  await recordAuditEvent({
    ...buildDataAuditEvent("delete", "grant_opportunity", grantId, userId, `Deleted grant "${before.name}"`, before, null),
    actor_role: role,
    severity: "warn",
  });

  revalidateGrants();
  return { ok: true, grantId };
}
