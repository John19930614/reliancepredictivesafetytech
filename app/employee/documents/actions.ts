"use server";

import { revalidatePath } from "next/cache";
import { getDocumentAccess } from "@/lib/documents/access";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Internal document sharing. company_documents read is already granted to every
 * active employee (is_company_portal_employee), so a share is an explicit handoff
 * — it surfaces the document in the recipient's "Shared with me" inbox and is
 * fully audited. It is NOT an access gate.
 */
export async function shareDocument(
  documentId: string,
  recipientUserId: string,
  note?: string,
): Promise<ActionResult> {
  const { supabase, userId } = await getDocumentAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!documentId || !recipientUserId) return { ok: false, error: "Pick a document and a recipient." };
  if (recipientUserId === userId) return { ok: false, error: "You already have access to this document." };

  // Upsert so re-sharing a previously revoked document re-activates the share.
  const { error } = await supabase.from("document_shares").upsert(
    {
      document_id: documentId,
      shared_with_user_id: recipientUserId,
      shared_by: userId,
      note: note ?? null,
      revoked: false,
      revoked_at: null,
    },
    { onConflict: "document_id,shared_with_user_id" },
  );

  if (error) return { ok: false, error: error.message };

  await recordAuditEvent(
    buildDataAuditEvent("create", "document_share", documentId, userId, `Shared document with user ${recipientUserId}`, null, {
      recipient: recipientUserId,
    }),
  );

  revalidatePath("/employee/documents");
  return { ok: true };
}

export async function revokeShare(shareId: string): Promise<ActionResult> {
  const { supabase, userId } = await getDocumentAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!shareId) return { ok: false, error: "Missing share id." };

  const { error } = await supabase
    .from("document_shares")
    .update({ revoked: true, revoked_at: new Date().toISOString() })
    .eq("id", shareId);

  if (error) return { ok: false, error: error.message };

  await recordAuditEvent(
    buildDataAuditEvent("update", "document_share", shareId, userId, "Revoked a document share", null, { revoked: true }),
  );

  revalidatePath("/employee/documents");
  return { ok: true };
}

/**
 * Returns a short-lived signed URL for a document the current user may access
 * (an active share addressed to them, or one they shared/uploaded). Verifies the
 * relationship server-side before minting the URL and audits the access.
 */
export async function getSharedDownloadUrl(
  documentId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { supabase, userId, isAdmin } = await getDocumentAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!documentId) return { ok: false, error: "Missing document id." };

  const { data: doc } = await supabase
    .from("company_documents")
    .select("file_path, uploaded_by, title")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc || !doc.file_path) return { ok: false, error: "Document not found." };

  let allowed = isAdmin || doc.uploaded_by === userId;
  if (!allowed) {
    const { data: share } = await supabase
      .from("document_shares")
      .select("id")
      .eq("document_id", documentId)
      .eq("shared_with_user_id", userId)
      .eq("revoked", false)
      .maybeSingle();
    allowed = Boolean(share);
  }

  if (!allowed) return { ok: false, error: "You do not have access to this document." };

  const { data: signed, error } = await supabase.storage
    .from("company-documents")
    .createSignedUrl(doc.file_path, 60);

  if (error || !signed?.signedUrl) return { ok: false, error: "Could not generate a download link." };

  await recordAuditEvent({
    event_type: "data.read",
    event_category: "data",
    severity: "info",
    actor_id: userId,
    resource_type: "company_document",
    resource_id: documentId,
    summary: `Accessed shared document "${doc.title}"`,
  });

  return { ok: true, url: signed.signedUrl };
}
