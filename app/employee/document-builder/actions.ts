"use server";

import { revalidatePath } from "next/cache";
import { getDocumentAccess } from "@/lib/documents/access";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";
import { renderPdf, renderDocx, slugifyTitle } from "@/lib/documents/render";
import { canPublishDraft } from "@/lib/documents/policy";
import { DEFAULT_DOCUMENT_DISCLAIMER, type DocReviewStatus, type DocType, type DocumentSection, type GeneratedDocument } from "@/lib/documents/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function revalidateBuilder(draftId?: string) {
  revalidatePath("/employee/document-builder");
  if (draftId) revalidatePath(`/employee/document-builder/${draftId}`);
}

// ---- review workflow ---------------------------------------------------------

async function setReviewStatus(
  draftId: string,
  status: DocReviewStatus,
  opts: { requireAdmin?: boolean; reason?: string; auditSummary: string },
): Promise<ActionResult> {
  const { supabase, userId, isAdmin, isReviewer } = await getDocumentAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (opts.requireAdmin ? !isAdmin : !isReviewer) {
    return { ok: false, error: "You do not have permission to perform this action." };
  }
  if (!draftId) return { ok: false, error: "Missing draft id." };

  const { data: before } = await supabase
    .from("document_builder_drafts")
    .select("review_status, title")
    .eq("id", draftId)
    .maybeSingle();

  const { error } = await supabase
    .from("document_builder_drafts")
    .update({
      review_status: status,
      review_reason: opts.reason ?? null,
      reviewed_by: userId,
      last_reviewed_at: new Date().toISOString(),
    })
    .eq("id", draftId);

  if (error) return { ok: false, error: error.message };

  await recordAuditEvent(
    buildDataAuditEvent("update", "document_builder_draft", draftId, userId, opts.auditSummary, before ?? null, {
      review_status: status,
    }),
  );

  revalidateBuilder(draftId);
  return { ok: true };
}

export async function approveDraft(draftId: string, reason?: string): Promise<ActionResult> {
  return setReviewStatus(draftId, "approved", { reason, auditSummary: "Approved document draft" });
}

export async function rejectDraft(draftId: string, reason?: string): Promise<ActionResult> {
  return setReviewStatus(draftId, "rejected", { reason, auditSummary: "Rejected document draft" });
}

export async function requestChanges(draftId: string, reason?: string): Promise<ActionResult> {
  return setReviewStatus(draftId, "changes_requested", { reason, auditSummary: "Requested changes on document draft" });
}

/** Save edits to the draft's title/sections. Approving is reset to needs_review on edit. */
export async function updateDraftContent(
  draftId: string,
  patch: { title?: string; sections?: DocumentSection[] },
): Promise<ActionResult> {
  const { supabase, userId, isReviewer } = await getDocumentAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isReviewer) return { ok: false, error: "You do not have permission to edit this draft." };
  if (!draftId) return { ok: false, error: "Missing draft id." };

  const update: Record<string, unknown> = { review_status: "needs_review" };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.sections !== undefined) update.sections = patch.sections;

  const { error } = await supabase.from("document_builder_drafts").update(update).eq("id", draftId);
  if (error) return { ok: false, error: error.message };

  await recordAuditEvent(
    buildDataAuditEvent("update", "document_builder_draft", draftId, userId, "Edited document draft content"),
  );
  revalidateBuilder(draftId);
  return { ok: true };
}

// ---- publish -----------------------------------------------------------------

const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Renders the approved draft to PDF + DOCX, stores both in the Master Document
 * Library, and links the PDF entry back to the draft. Enforces the Human
 * Authority Rule: a draft flagged human_review_required cannot publish until a
 * human reviewer/admin has approved it.
 */
export async function publishDraft(draftId: string): Promise<ActionResult & { documentId?: string }> {
  const { supabase, userId, isAdmin } = await getDocumentAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isAdmin) return { ok: false, error: "Admin role required to publish documents." };
  if (!draftId) return { ok: false, error: "Missing draft id." };

  const { data: draft, error: fetchError } = await supabase
    .from("document_builder_drafts")
    .select("id, doc_type, title, sections, confidence_level, review_status, human_review_required, company_document_id")
    .eq("id", draftId)
    .maybeSingle();

  if (fetchError || !draft) return { ok: false, error: "Draft not found." };

  // Human Authority Rule + double-publish guard (pure, unit-tested in policy.test.ts)
  const gate = canPublishDraft({
    humanReviewRequired: Boolean(draft.human_review_required),
    reviewStatus: draft.review_status,
    alreadyPublished: Boolean(draft.company_document_id),
  });
  if (!gate.ok) return { ok: false, error: gate.reason };

  const sections = (Array.isArray(draft.sections) ? draft.sections : []) as DocumentSection[];
  const generated: GeneratedDocument = {
    doc_type: draft.doc_type as DocType,
    title: draft.title,
    summary: "",
    sections,
    review_notes: [],
    confidence_level: draft.confidence_level ?? "needs_review",
    disclaimer: DEFAULT_DOCUMENT_DISCLAIMER,
  };

  let pdfBytes: Uint8Array;
  let docxBuffer: Buffer;
  try {
    [pdfBytes, docxBuffer] = await Promise.all([renderPdf(generated), renderDocx(generated)]);
  } catch (err) {
    return { ok: false, error: `Failed to render document: ${err instanceof Error ? err.message : "unknown error"}` };
  }

  const slug = slugifyTitle(draft.title);
  const ts = Date.now();
  const pdfPath = `${userId}/document-builder/${ts}-${slug}.pdf`;
  const docxPath = `${userId}/document-builder/${ts}-${slug}.docx`;

  const pdfUpload = await supabase.storage.from("company-documents").upload(pdfPath, Buffer.from(pdfBytes), {
    contentType: "application/pdf",
  });
  if (pdfUpload.error) return { ok: false, error: `PDF upload failed: ${pdfUpload.error.message}` };

  const docxUpload = await supabase.storage.from("company-documents").upload(docxPath, docxBuffer, {
    contentType: DOCX_CONTENT_TYPE,
  });
  if (docxUpload.error) return { ok: false, error: `DOCX upload failed: ${docxUpload.error.message}` };

  const baseRow = {
    category: "Safety Document Library",
    record_type: "Master Template",
    status: "Approved",
    owner: null as string | null,
    revision: "1.0",
    notes: `Generated by the AI Document Builder (${draft.doc_type.toUpperCase()}). Draft ${draft.id}.`,
    uploaded_by: userId,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("company_documents")
    .insert([
      { ...baseRow, title: draft.title, file_path: pdfPath, file_name: `${slug}.pdf`, file_type: "application/pdf" },
      { ...baseRow, title: `${draft.title} (editable)`, file_path: docxPath, file_name: `${slug}.docx`, file_type: DOCX_CONTENT_TYPE },
    ])
    .select("id, file_type");

  if (insertError || !inserted) return { ok: false, error: `Failed to register documents: ${insertError?.message}` };

  const pdfDoc = inserted.find((d: { file_type: string | null }) => d.file_type === "application/pdf") ?? inserted[0];

  await supabase
    .from("document_builder_drafts")
    .update({ company_document_id: pdfDoc.id })
    .eq("id", draftId);

  await recordAuditEvent({
    event_type: "data.create",
    event_category: "data",
    severity: "info",
    actor_id: userId,
    resource_type: "company_document",
    resource_id: pdfDoc.id,
    summary: `Published ${draft.doc_type.toUpperCase()} "${draft.title}" to the Document Library (PDF + DOCX)`,
    after_state: { draftId: draft.id, pdfPath, docxPath },
  });

  revalidateBuilder(draftId);
  revalidatePath("/employee/documents");
  return { ok: true, documentId: pdfDoc.id };
}
