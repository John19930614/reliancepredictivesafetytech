"use server";

// Server Actions for a seller's own proposal bio and saved signature
// (MODULE_ID: client_proposals — the table contract lives in
// supabase/migrations/20260806120000_proposal_team_bios.sql).
//
// SELF-SERVICE ONLY. Every write here is scoped to `auth.uid()` in the query as
// well as in RLS. The user id is never taken from the form: a Server Action is
// a public POST endpoint, and accepting a target user id would let any employee
// rewrite a colleague's bio — or replace the signature that goes on a signed
// commercial document.

import { revalidatePath } from "next/cache";
import { getProposalAccess } from "@/lib/proposals/access";
import { isAllowedSignatureType, maxSignatureBytes } from "@/lib/proposals/team-server";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";
import { bioLimits } from "./limits";

export interface BioActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const SIGNATURE_BUCKET = "employee-signatures";

function revalidateBio() {
  revalidatePath("/employee/proposals/bio");
  revalidatePath("/employee/proposals");
}

function readText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Saves the signed-in employee's bio. Creates the row on first save. */
export async function saveOwnBio(form: FormData): Promise<BioActionResult> {
  const { supabase, userId, canRead } = await getProposalAccess();
  if (!supabase || !userId || !canRead) {
    return { ok: false, error: "You must be signed in as an employee to edit your bio." };
  }

  const displayName = readText(form, "display_name");
  const title = readText(form, "title");
  const bio = readText(form, "bio");
  const isPublishable = form.get("is_publishable") === "on";

  const fieldErrors: Record<string, string> = {};
  if (displayName.length > bioLimits.displayName) {
    fieldErrors.display_name = `Keep your name to ${bioLimits.displayName} characters or fewer.`;
  }
  if (title.length > bioLimits.title) {
    fieldErrors.title = `Keep your title to ${bioLimits.title} characters or fewer.`;
  }
  if (bio.length > bioLimits.bio) {
    fieldErrors.bio = `Keep your bio to ${bioLimits.bio} characters or fewer.`;
  }
  // Publishing an empty bio would put a nameless, wordless box on a client
  // document. Saving one as a draft is fine.
  if (isPublishable && displayName === "" && bio === "") {
    fieldErrors.bio = "Add your name and a bio before making it available to proposals.";
  }
  const first = Object.values(fieldErrors)[0];
  if (first) return { ok: false, error: first, fieldErrors };

  const { error } = await supabase
    .from("proposal_team_bios")
    .upsert(
      {
        user_id: userId,
        display_name: displayName,
        title,
        bio,
        is_publishable: isPublishable,
      },
      { onConflict: "user_id" },
    )
    .select("user_id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidateBio();
  return { ok: true };
}

/**
 * Replaces the signed-in employee's signature image.
 *
 * The object key is `<user_id>/signature.<ext>` — the leading segment is what
 * the storage policy matches on, so a user can only ever write inside their own
 * folder. A fixed filename means a re-upload overwrites rather than
 * accumulating orphaned images of someone's signature in the bucket.
 */
export async function saveOwnSignature(form: FormData): Promise<BioActionResult> {
  const { supabase, userId, canRead } = await getProposalAccess();
  if (!supabase || !userId || !canRead) {
    return { ok: false, error: "You must be signed in as an employee to save a signature." };
  }

  const file = form.get("signature");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a signature image to upload." };
  }
  if (!isAllowedSignatureType(file.type)) {
    // PNG or JPEG only — see the note on allowedSignatureTypes: the PDF export
    // cannot embed anything else, and a signature that renders on screen but
    // not in the client's copy is worse than a rejected upload.
    return { ok: false, error: "Upload a PNG or JPEG image." };
  }
  if (file.size > maxSignatureBytes) {
    return {
      ok: false,
      error: `That image is ${Math.round(file.size / 1024)} KB. Keep it under ${Math.round(maxSignatureBytes / 1024)} KB — it is embedded in every copy of the proposal.`,
    };
  }

  const extension = file.type === "image/jpeg" ? "jpg" : "png";
  const path = `${userId}/signature.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const { error } = await supabase
    .from("proposal_team_bios")
    .upsert(
      {
        user_id: userId,
        signature_bucket: SIGNATURE_BUCKET,
        signature_path: path,
        signature_updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("user_id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  // A signature is applied to executed commercial documents, so both storing
  // and clearing one are recorded.
  await recordAuditEvent(
    buildDataAuditEvent(
      "update",
      "proposal_team_bios",
      userId,
      userId,
      "Saved a proposal signature image",
      null,
      { signature_path: path, content_type: file.type, bytes: file.size },
    ),
  );

  revalidateBio();
  return { ok: true };
}

/** Removes the stored signature, so proposals fall back to a blank line. */
export async function clearOwnSignature(): Promise<BioActionResult> {
  const { supabase, userId, canRead } = await getProposalAccess();
  if (!supabase || !userId || !canRead) {
    return { ok: false, error: "You must be signed in as an employee to change your signature." };
  }

  const { data: existing } = await supabase
    .from("proposal_team_bios")
    .select("signature_bucket, signature_path")
    .eq("user_id", userId)
    .maybeSingle();

  const path = (existing?.signature_path ?? null) as string | null;
  const bucket = (existing?.signature_bucket ?? SIGNATURE_BUCKET) as string;

  const { error } = await supabase
    .from("proposal_team_bios")
    .update({ signature_bucket: null, signature_path: null, signature_updated_at: null })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  // The row is cleared first: an orphaned object nobody points at is harmless,
  // a row pointing at a deleted object would render a broken signature block.
  if (path) {
    await supabase.storage.from(bucket).remove([path]);
  }

  await recordAuditEvent(
    buildDataAuditEvent(
      "delete",
      "proposal_team_bios",
      userId,
      userId,
      "Cleared the stored proposal signature image",
      { signature_path: path },
      null,
    ),
  );

  revalidateBio();
  return { ok: true };
}
