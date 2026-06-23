"use server";

import { revalidatePath } from "next/cache";
import { getLegalAccess } from "@/lib/legal/access";
import { recordRegisterChange } from "@/lib/legal/change-log";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";
import type { ReviewStatus } from "@/lib/legal/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const REVALIDATE = [
  "/employee/legal-register/review-queue",
  "/employee/legal-register/register",
  "/employee/legal-register/change-log",
  "/employee/legal-register/dashboard",
];

function revalidateAll() {
  for (const p of REVALIDATE) revalidatePath(p);
}

/**
 * Shared review/edit mutation. `requireAdmin` gates admin-only actions
 * (archive, send-to-review); otherwise a reviewer (internal_reviewer or admin)
 * is sufficient.
 */
async function mutateEntry(
  entryId: string,
  patch: Record<string, unknown>,
  opts: {
    changeType: string;
    changeReason?: string;
    requireAdmin?: boolean;
    auditAction?: "update" | "delete";
    auditSummary: string;
  },
): Promise<ActionResult> {
  const { supabase, userId, role, isAdmin, isReviewer } = await getLegalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (opts.requireAdmin ? !isAdmin : !isReviewer) {
    return { ok: false, error: "You do not have permission to perform this action." };
  }
  if (!entryId) return { ok: false, error: "Missing entry id." };

  const { data: before } = await supabase
    .from("legal_register_items")
    .select("review_status, compliance_status, archived")
    .eq("id", entryId)
    .maybeSingle();

  const { error } = await supabase.from("legal_register_items").update(patch).eq("id", entryId);
  if (error) return { ok: false, error: error.message };

  await recordRegisterChange(supabase, {
    entryId,
    changeType: opts.changeType,
    oldValue: before?.review_status ?? null,
    newValue: (patch.review_status as string) ?? opts.changeType,
    changedBy: userId,
    changeReason: opts.changeReason ?? null,
  });

  await recordAuditEvent(
    buildDataAuditEvent(
      opts.auditAction ?? "update",
      "legal_register_entry",
      entryId,
      userId,
      opts.auditSummary,
      before ?? null,
      patch,
    ),
  );

  // actor_role is carried for completeness on the audit record
  void role;

  revalidateAll();
  return { ok: true };
}

function reviewedPatch(status: ReviewStatus, userId: string, extra: Record<string, unknown> = {}) {
  return { review_status: status, reviewed_by: userId, last_reviewed_at: new Date().toISOString(), ...extra };
}

export async function approveEntry(entryId: string, reason?: string): Promise<ActionResult> {
  const { userId } = await getLegalAccess();
  return mutateEntry(entryId, reviewedPatch("approved", userId ?? "", { human_review_required: false }), {
    changeType: "Approved",
    changeReason: reason,
    auditSummary: `Legal register entry approved`,
  });
}

export async function rejectEntry(entryId: string, reason?: string): Promise<ActionResult> {
  const { userId } = await getLegalAccess();
  return mutateEntry(entryId, reviewedPatch("rejected", userId ?? ""), {
    changeType: "Rejected",
    changeReason: reason,
    auditSummary: `Legal register entry rejected`,
  });
}

export async function requestChangesEntry(entryId: string, reason?: string): Promise<ActionResult> {
  const { userId } = await getLegalAccess();
  return mutateEntry(entryId, reviewedPatch("changes_requested", userId ?? ""), {
    changeType: "Changes Requested",
    changeReason: reason,
    auditSummary: `Changes requested on legal register entry`,
  });
}

export async function markNotApplicableEntry(entryId: string, reason?: string): Promise<ActionResult> {
  const { userId } = await getLegalAccess();
  return mutateEntry(
    entryId,
    reviewedPatch("not_applicable", userId ?? "", { compliance_status: "not_applicable" }),
    { changeType: "Marked Not Applicable", changeReason: reason, auditSummary: `Legal register entry marked not applicable` },
  );
}

export async function archiveEntry(entryId: string, reason?: string): Promise<ActionResult> {
  return mutateEntry(entryId, { archived: true, review_status: "archived" }, {
    changeType: "Archived",
    changeReason: reason,
    requireAdmin: true,
    auditAction: "delete",
    auditSummary: `Legal register entry archived`,
  });
}

export async function sendToReviewEntry(entryId: string, reviewRole?: string): Promise<ActionResult> {
  return mutateEntry(
    entryId,
    { review_status: "needs_review", human_review_required: true, review_role_needed: reviewRole || null },
    { changeType: "Sent to Review", requireAdmin: true, auditSummary: `Legal register entry sent to review` },
  );
}

export async function assignReviewerRole(entryId: string, reviewRole: string): Promise<ActionResult> {
  return mutateEntry(entryId, { review_role_needed: reviewRole }, {
    changeType: "Reviewer Assigned",
    changeReason: reviewRole,
    auditSummary: `Reviewer role assigned: ${reviewRole}`,
  });
}

export interface SourceInput {
  id?: string;
  name: string;
  agency?: string;
  source_type?: string;
  jurisdiction?: string;
  state?: string;
  url?: string;
  enabled?: boolean;
  notes?: string;
  confidence_default?: string;
  owner_role?: string;
}

export async function saveSource(input: SourceInput): Promise<ActionResult> {
  const { supabase, userId, isAdmin } = await getLegalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isAdmin) return { ok: false, error: "Admin role required." };
  if (!input.name?.trim()) return { ok: false, error: "Source name is required." };

  const row = {
    name: input.name.trim(),
    agency: input.agency || null,
    source_type: input.source_type || null,
    jurisdiction: input.jurisdiction || null,
    state: input.state || null,
    url: input.url || null,
    enabled: input.enabled ?? true,
    notes: input.notes || null,
    confidence_default: input.confidence_default || null,
    owner_role: input.owner_role || null,
  };

  const { error } = input.id
    ? await supabase.from("legal_register_sources").update(row).eq("id", input.id)
    : await supabase.from("legal_register_sources").insert(row);
  if (error) return { ok: false, error: error.message };

  await recordAuditEvent(
    buildDataAuditEvent(input.id ? "update" : "create", "legal_register_source", input.id ?? row.name, userId, `Research source ${input.id ? "updated" : "created"}: ${row.name}`),
  );
  revalidatePath("/employee/legal-register/sources");
  return { ok: true };
}

export async function toggleSource(id: string, enabled: boolean): Promise<ActionResult> {
  const { supabase, userId, isAdmin } = await getLegalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isAdmin) return { ok: false, error: "Admin role required." };
  const { error } = await supabase.from("legal_register_sources").update({ enabled }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/employee/legal-register/sources");
  return { ok: true };
}

export async function deleteSource(id: string): Promise<ActionResult> {
  const { supabase, userId, isAdmin } = await getLegalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isAdmin) return { ok: false, error: "Admin role required." };
  const { error } = await supabase.from("legal_register_sources").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAuditEvent(buildDataAuditEvent("delete", "legal_register_source", id, userId, "Research source deleted"));
  revalidatePath("/employee/legal-register/sources");
  return { ok: true };
}

export async function updatePromptTemplate(id: string, templateText: string): Promise<ActionResult> {
  const { supabase, userId, isAdmin } = await getLegalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isAdmin) return { ok: false, error: "Admin role required." };
  if (!templateText.trim()) return { ok: false, error: "Template text cannot be empty." };
  const { error } = await supabase
    .from("legal_prompt_templates")
    .update({ template_text: templateText, updated_by: userId })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAuditEvent(buildDataAuditEvent("update", "legal_prompt_template", id, userId, "AI prompt template updated"));
  revalidatePath("/employee/legal-register/sources");
  return { ok: true };
}

export async function updateModuleBuildStatus(id: string, buildStatus: string): Promise<ActionResult> {
  const { supabase, userId, isAdmin } = await getLegalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isAdmin) return { ok: false, error: "Admin role required." };
  if (!id) return { ok: false, error: "Missing recommendation id." };

  const { error } = await supabase.from("module_recommendations").update({ build_status: buildStatus }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAuditEvent(
    buildDataAuditEvent("update", "module_recommendation", id, userId, `Module recommendation build status → ${buildStatus}`),
  );
  revalidatePath("/employee/legal-register/module-recommendations");
  return { ok: true };
}
