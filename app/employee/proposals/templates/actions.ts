"use server";

// Server Actions for the Client Proposal Templates module
// (MODULE_ID: client_proposal_templates — the full specification contract lives
// in supabase/migrations/20260804200000_client_proposal_templates.sql).
//
// These are deliberately SEPARATE from app/employee/proposals/actions.ts:
// createProposal() seeds its own default pilot form_data and takes no template,
// and its signature is relied on by the plain "New proposal" path. The template
// path therefore gets its own create action rather than a new parameter there.
//
// Every mutation below follows the module's established rules:
//   * auth + role via getProposalAccess()
//   * validated input (a Server Action is a public POST endpoint)
//   * `.select("id")` on every UPDATE/DELETE so a zero-row write is a failure,
//     not a silent success
//   * revalidatePath() after the write
//   * recordAuditEvent() on anything destructive or cross-record

import { revalidatePath } from "next/cache";
import { getProposalAccess } from "@/lib/proposals/access";
import { isProposalUuid, validateProposalFields } from "@/lib/proposals/policy";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import {
  buildStateFromTemplate,
  sanitizeTemplateState,
  templateDescriptionMaxLength,
  validateTemplateFields,
} from "@/lib/proposals/templates";
import {
  loadClientCompanyDetail,
  loadCompanyProfile,
  loadPreparedByName,
} from "@/lib/proposals/company-server";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";

/**
 * Today's calendar date in the company's own timezone, as `YYYY-MM-DD`.
 *
 * NOT `toISOString().slice(0, 10)`: UTC runs ahead of US Central, so a proposal
 * created after 6pm would be dated tomorrow.
 */
function todayInCompanyTimezone(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

export interface TemplateActionResult {
  ok: boolean;
  error?: string;
  /** Field-level messages keyed by input field name, when validation failed. */
  fieldErrors?: Record<string, string>;
}

/** A template as the picker and the management table need it. */
export interface ProposalTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * PostgREST reports no error for an UPDATE/DELETE that matched zero rows —
 * whether the id does not exist or RLS filtered it out. Treat an empty result
 * as a failure so we never report success (or write an audit event) for a no-op.
 */
const NO_ROWS_MESSAGE = "Template not found or you do not have permission to change it.";
const BAD_ID_MESSAGE = "That template reference is not valid.";
/** Bounds the picker/list query. Templates are curated collateral, not a feed. */
const templateListLimit = 200;

function revalidateTemplates(proposalId?: string) {
  revalidatePath("/employee/proposals/templates");
  revalidatePath("/employee/proposals");
  if (proposalId) revalidatePath(`/employee/proposals/${proposalId}`);
}

async function recordTemplateAudit(
  role: string | null,
  action: "create" | "update" | "delete",
  templateId: string,
  userId: string,
  summary: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
) {
  await recordAuditEvent({
    ...buildDataAuditEvent(action, "client_proposal_template", templateId, userId, summary, before, after),
    actor_role: role,
  });
}

/* -------------------------------------------------------------------------- */
/* Read                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Lists templates for the picker. Exposed as a Server Action so the client-side
 * picker never talks to Supabase directly (CLAUDE.md: no client-side data
 * access) and so the same auth gate applies to the read as to the writes.
 */
export async function listProposalTemplates(
  options: { includeArchived?: boolean } = {},
): Promise<{ ok: boolean; error?: string; templates: ProposalTemplateSummary[] }> {
  const { supabase, canRead } = await getProposalAccess();
  if (!supabase) return { ok: false, error: "You must be signed in.", templates: [] };
  if (!canRead) return { ok: false, error: "You do not have permission to view proposals.", templates: [] };

  let query = supabase
    .from("client_proposal_templates")
    .select("id, name, description, is_archived, created_at, updated_at")
    .order("name")
    .limit(templateListLimit);
  if (!options.includeArchived) query = query.eq("is_archived", false);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message, templates: [] };

  return { ok: true, templates: (data ?? []) as ProposalTemplateSummary[] };
}

/* -------------------------------------------------------------------------- */
/* Capture                                                                     */
/* -------------------------------------------------------------------------- */

export interface CreateTemplateInput {
  /** The proposal whose saved generator state becomes the template body. */
  proposalId: string;
  name: string;
  description?: string | null;
}

/**
 * Captures an existing proposal's form state as a reusable template.
 *
 * The state is scrubbed with sanitizeTemplateState() BEFORE the insert, so the
 * source client's company, contact, title, email and address are never written
 * to the templates table at all — the apply path scrubs again, but a template
 * row that never held the data cannot leak it through some future reader.
 */
export async function createTemplateFromProposal(
  input: CreateTemplateInput,
): Promise<TemplateActionResult & { templateId?: string }> {
  const { supabase, userId, canManage, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to create templates." };
  if (!input.proposalId || !isProposalUuid(input.proposalId)) {
    return { ok: false, error: "That proposal reference is not valid." };
  }

  const validation = validateTemplateFields({ name: input.name, description: input.description });
  if (!validation.ok) return { ok: false, error: validation.error, fieldErrors: validation.errors };

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, title, form_data")
    .eq("id", input.proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: "Proposal not found or you do not have permission to read it." };

  const body = sanitizeTemplateState(proposal.form_data);
  if (!body) {
    return {
      ok: false,
      error: "That proposal has no usable saved form data yet — open it in the generator and save once first.",
    };
  }

  const name = input.name.trim();
  const description = input.description?.trim().slice(0, templateDescriptionMaxLength) || null;

  const { data: created, error } = await supabase
    .from("client_proposal_templates")
    .insert({ name, description, form_data: body, created_by: userId, is_archived: false })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Failed to save the template." };

  await recordTemplateAudit(role, "create", created.id, userId, `Saved proposal template "${name}"`, null, {
    captured_from_proposal: input.proposalId,
    phase_count: body.phases.length,
    service_count: body.services.length,
  });

  revalidateTemplates();
  return { ok: true, templateId: created.id };
}

/* -------------------------------------------------------------------------- */
/* Manage                                                                      */
/* -------------------------------------------------------------------------- */

export interface TemplatePatch {
  name?: string;
  description?: string | null;
}

/** Renames a template and/or edits its description. */
export async function updateProposalTemplate(
  templateId: string,
  patch: TemplatePatch,
): Promise<TemplateActionResult> {
  const { supabase, userId, canManage } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to edit templates." };
  if (!templateId || !isProposalUuid(templateId)) return { ok: false, error: BAD_ID_MESSAGE };

  const validated: Parameters<typeof validateTemplateFields>[0] = {};
  if (patch.name !== undefined) validated.name = patch.name;
  if (patch.description !== undefined) validated.description = patch.description;
  const validation = validateTemplateFields(validated);
  if (!validation.ok) return { ok: false, error: validation.error, fieldErrors: validation.errors };

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.description !== undefined) {
    update.description = patch.description?.trim().slice(0, templateDescriptionMaxLength) || null;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const { data: updated, error } = await supabase
    .from("client_proposal_templates")
    .update(update)
    .eq("id", templateId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  revalidateTemplates();
  return { ok: true };
}

/**
 * Archives (or restores) a template. Archiving hides it from the "start from
 * template" picker without destroying collateral someone spent time building,
 * and is the reversible alternative that should be reached for before delete.
 */
export async function setProposalTemplateArchived(
  templateId: string,
  archived: boolean,
): Promise<TemplateActionResult> {
  const { supabase, userId, canManage, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to edit templates." };
  if (!templateId || !isProposalUuid(templateId)) return { ok: false, error: BAD_ID_MESSAGE };
  if (typeof archived !== "boolean") return { ok: false, error: "Unknown archive state." };

  const { data: before } = await supabase
    .from("client_proposal_templates")
    .select("name, is_archived")
    .eq("id", templateId)
    .maybeSingle();
  if (!before) return { ok: false, error: NO_ROWS_MESSAGE };

  const { data: updated, error } = await supabase
    .from("client_proposal_templates")
    .update({ is_archived: archived })
    .eq("id", templateId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordTemplateAudit(
    role,
    "update",
    templateId,
    userId,
    `${archived ? "Archived" : "Restored"} proposal template "${before.name}"`,
    { is_archived: before.is_archived },
    { is_archived: archived },
  );

  revalidateTemplates();
  return { ok: true };
}

/** Permanently deletes a template. Admin-only, matching the table's RLS. */
export async function deleteProposalTemplate(templateId: string): Promise<TemplateActionResult> {
  const { supabase, userId, isAdmin, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isAdmin) return { ok: false, error: "Admin role required to delete templates." };
  if (!templateId || !isProposalUuid(templateId)) return { ok: false, error: BAD_ID_MESSAGE };

  const { data: before } = await supabase
    .from("client_proposal_templates")
    .select("name, description, is_archived")
    .eq("id", templateId)
    .maybeSingle();

  const { data: deleted, error } = await supabase
    .from("client_proposal_templates")
    .delete()
    .eq("id", templateId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!deleted || deleted.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordTemplateAudit(
    role,
    "delete",
    templateId,
    userId,
    `Deleted proposal template "${before?.name ?? templateId}"`,
    before ?? null,
  );

  revalidateTemplates();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Apply                                                                       */
/* -------------------------------------------------------------------------- */

export interface CreateProposalFromTemplateInput {
  templateId: string;
  title: string;
  clientId?: string | null;
  owner?: string | null;
  proposalValue?: number | null;
  validUntil?: string | null;
}

/**
 * Creates a proposal whose revision 1 is the template's state with the assigned
 * company's identity layered on top.
 *
 * This mirrors createProposal() in app/employee/proposals/actions.ts (same
 * columns, same revision-1 seeding, same audit shape) but sources form_data from
 * the template instead of the hardcoded default pilot state. createProposal()
 * itself is untouched — the plain "New proposal" path still calls it.
 */
export async function createProposalFromTemplate(
  input: CreateProposalFromTemplateInput,
): Promise<TemplateActionResult & { proposalId?: string }> {
  const { supabase, userId, canManage, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to create proposals." };
  if (!input.templateId || !isProposalUuid(input.templateId)) return { ok: false, error: BAD_ID_MESSAGE };

  const validation = validateProposalFields({
    title: input.title,
    clientId: input.clientId,
    proposalValue: input.proposalValue,
    validUntil: input.validUntil,
  });
  if (!validation.ok) return { ok: false, error: validation.error, fieldErrors: validation.errors };

  const { data: template } = await supabase
    .from("client_proposal_templates")
    .select("id, name, form_data, is_archived")
    .eq("id", input.templateId)
    .maybeSingle();
  if (!template) return { ok: false, error: NO_ROWS_MESSAGE };
  if (template.is_archived) {
    return { ok: false, error: "That template is archived. Restore it before starting a proposal from it." };
  }

  const title = input.title.trim();
  const clientId = input.clientId || null;

  // Look the company up BEFORE building the state: buildStateFromTemplate
  // scrubs the captured client's identity out and layers this company's in.
  // Since 20260809100000 that identity includes the address and every contact
  // on the record, so applying a template to an assigned company now produces a
  // complete Prepared For block rather than a company name over blank lines.
  const [clientCompany, companyProfile, preparedByName] = await Promise.all([
    loadClientCompanyDetail(supabase, clientId),
    loadCompanyProfile(supabase),
    loadPreparedByName(supabase, userId),
  ]);

  // proposalNumber is omitted here and patched in after the insert: the
  // reference is allocated by the column default, so it does not exist yet.
  const formData = buildStateFromTemplate(template.form_data, {
    company: clientCompany,
    companyProfile,
    preparedBy: preparedByName,
    today: todayInCompanyTimezone(),
  });
  if (!formData) {
    return { ok: false, error: "That template's saved form data is unusable, so it cannot start a proposal." };
  }

  // Price from the template's own line items unless the seller typed a value.
  const computed = computeProposalTotals(formData).total;
  const derivedValue = validateProposalFields({ proposalValue: computed }).ok ? computed : null;
  const proposalValue = input.proposalValue ?? derivedValue;
  const summary = `Started from template "${template.name}"`;

  const { data: proposal, error } = await supabase
    .from("client_proposals")
    .insert({
      title,
      client_id: clientId,
      owner: input.owner?.trim() || null,
      proposal_value: proposalValue,
      valid_until: input.validUntil || null,
      summary,
      body_markdown: null,
      status: "draft",
      current_revision: 1,
      form_data: formData,
      created_by: userId,
    })
    .select("id, proposal_number")
    .single();
  if (error || !proposal) return { ok: false, error: error?.message ?? "Failed to create the proposal." };

  // Stamp the reference the database just allocated onto the saved state, so
  // the document prints this proposal's number rather than the one the template
  // was captured under. Written before revision 1 so the checkpoint carries it.
  //
  // A NEW object rather than a mutation of `formData`: that object was already
  // handed to the insert above, and mutating it after the fact would make the
  // state that was written and the state in memory disagree.
  const allocatedNumber = (proposal.proposal_number ?? null) as string | null;
  const savedFormData: GeneratorState = allocatedNumber
    ? { ...formData, fields: { ...formData.fields, proposalNo: allocatedNumber } }
    : formData;

  if (allocatedNumber) {
    const { error: numberError } = await supabase
      .from("client_proposals")
      .update({ form_data: savedFormData })
      .eq("id", proposal.id);
    if (numberError) {
      return { ok: false, error: `Proposal created but its reference number failed to save: ${numberError.message}` };
    }
  }

  const { error: revisionError } = await supabase.from("client_proposal_revisions").insert({
    proposal_id: proposal.id,
    revision_number: 1,
    title,
    summary,
    body_markdown: null,
    change_note: `Created from template "${template.name}"`,
    status_at_save: "draft",
    // The numbered state, so restoring revision 1 cannot reinstate a proposal
    // with no reference — or worse, with the template's original one.
    form_data: savedFormData,
    created_by: userId,
  });
  if (revisionError) return { ok: false, error: `Proposal created but revision 1 failed: ${revisionError.message}` };

  await recordTemplateAudit(
    role,
    "create",
    input.templateId,
    userId,
    `Created proposal "${title}" from template "${template.name}"`,
    null,
    { proposal_id: proposal.id, client_id: clientId },
  );

  revalidateTemplates(proposal.id);
  return { ok: true, proposalId: proposal.id };
}
