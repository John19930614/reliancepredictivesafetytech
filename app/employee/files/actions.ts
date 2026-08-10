"use server";

import { revalidatePath } from "next/cache";
import { getFileCenterAccess } from "@/lib/files/access";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { fileCenterBucket, fileCenterPath, type FileScope } from "@/lib/files/types";
import {
  buildStoragePath,
  isAllowedMimeType,
  maxDescriptionLength,
  maxFileSizeBytes,
  sanitizeFileName,
  sanitizeFolderName,
  wouldCreateFolderCycle,
} from "@/lib/files/validation";

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Field-level messages keyed by input field name, when validation failed. */
  fieldErrors?: Record<string, string>;
}

/**
 * PostgREST returns no error for an UPDATE/DELETE that matched zero rows —
 * whether the id does not exist or RLS filtered it out. Every mutation in this
 * file therefore asks for the affected ids back and treats an empty result as a
 * failure, so we never report success (or write an audit event) for a no-op.
 */
const FOLDER_NO_ROWS = "Folder not found or you do not have permission to change it.";
const FILE_NO_ROWS = "File not found or you do not have permission to change it.";

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

const DUPLICATE_FOLDER = "A folder with that name already exists here.";
const DUPLICATE_FILE = "A file with that name already exists here.";

function revalidateFiles() {
  revalidatePath(fileCenterPath);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorCode(error: any): string | null {
  return typeof error?.code === "string" ? error.code : null;
}

/** scope crosses the wire from the browser, so it is re-checked server-side. */
function isFileScope(value: unknown): value is FileScope {
  return value === "company" || value === "client";
}

/** Shape of the ids minted by createUploadTicket. */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function recordFileAudit(
  role: string | null,
  action: "create" | "update" | "delete",
  resourceType: "company_file" | "company_file_folder",
  resourceId: string,
  userId: string,
  summary: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
) {
  await recordAuditEvent({
    ...buildDataAuditEvent(action, resourceType, resourceId, userId, summary, before, after),
    actor_role: role,
  });
}

type LocationResolution =
  | { ok: true; clientId: string | null }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Company-scope locations always carry a null client id; client-scope locations
 * must name a client that actually exists, because folder and file rows both
 * hang off this pair and a bad id would strand rows nobody can browse to.
 */
async function resolveLocation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  scope: FileScope,
  clientId: string | null,
): Promise<LocationResolution> {
  if (scope === "company") return { ok: true, clientId: null };
  if (!clientId) {
    return { ok: false, error: "Pick a client for client files.", fieldErrors: { clientId: "Pick a client." } };
  }

  const { data: client, error } = await supabase.from("company_clients").select("id").eq("id", clientId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!client) {
    return { ok: false, error: "That client does not exist.", fieldErrors: { clientId: "That client does not exist." } };
  }

  return { ok: true, clientId };
}

/** A folder reference is only usable from the location (scope + client) it lives in. */
async function loadFolderInLocation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  folderId: string,
  scope: FileScope,
  clientId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: folder, error } = await supabase
    .from("company_file_folders")
    .select("id, scope, client_id")
    .eq("id", folderId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!folder || folder.scope !== scope || (folder.client_id ?? null) !== clientId) {
    return { ok: false, error: "That folder is not in this file area." };
  }

  return { ok: true };
}

export async function createFolder(input: {
  scope: FileScope;
  clientId?: string | null;
  parentId?: string | null;
  name: string;
}): Promise<ActionResult & { folderId?: string }> {
  const { supabase, userId, flags } = await getFileCenterAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!flags.canManage) return { ok: false, error: "You do not have permission to manage files." };
  if (!isFileScope(input.scope)) return { ok: false, error: "Choose a valid file area." };

  const name = sanitizeFolderName(input.name);
  if (!name) {
    return { ok: false, error: "Enter a usable folder name.", fieldErrors: { name: "Enter a usable folder name." } };
  }

  const location = await resolveLocation(supabase, input.scope, input.clientId ?? null);
  if (!location.ok) return { ok: false, error: location.error, fieldErrors: location.fieldErrors };

  const parentId = input.parentId || null;
  if (parentId) {
    const parent = await loadFolderInLocation(supabase, parentId, input.scope, location.clientId);
    if (!parent.ok) return { ok: false, error: parent.error };
  }

  const { data: created, error } = await supabase
    .from("company_file_folders")
    .insert({
      scope: input.scope,
      client_id: location.clientId,
      parent_id: parentId,
      name,
      created_by: userId,
    })
    .select("id")
    .single();

  if (errorCode(error) === UNIQUE_VIOLATION) {
    return { ok: false, error: DUPLICATE_FOLDER, fieldErrors: { name: DUPLICATE_FOLDER } };
  }
  if (error || !created) return { ok: false, error: error?.message ?? "Could not create the folder." };

  revalidateFiles();
  return { ok: true, folderId: created.id };
}

export async function renameFolder(folderId: string, name: string): Promise<ActionResult> {
  const { supabase, userId, flags } = await getFileCenterAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!flags.canManage) return { ok: false, error: "You do not have permission to manage files." };
  if (!folderId) return { ok: false, error: "Missing folder id." };

  const safeName = sanitizeFolderName(name);
  if (!safeName) {
    return { ok: false, error: "Enter a usable folder name.", fieldErrors: { name: "Enter a usable folder name." } };
  }

  const { data: updated, error } = await supabase
    .from("company_file_folders")
    .update({ name: safeName })
    .eq("id", folderId)
    .select("id");

  if (errorCode(error) === UNIQUE_VIOLATION) {
    return { ok: false, error: DUPLICATE_FOLDER, fieldErrors: { name: DUPLICATE_FOLDER } };
  }
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: FOLDER_NO_ROWS };

  revalidateFiles();
  return { ok: true };
}

export async function moveFolder(folderId: string, newParentId: string | null): Promise<ActionResult> {
  const { supabase, userId, flags } = await getFileCenterAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!flags.canManage) return { ok: false, error: "You do not have permission to manage files." };
  if (!folderId) return { ok: false, error: "Missing folder id." };

  const { data: folder, error: folderError } = await supabase
    .from("company_file_folders")
    .select("id, scope, client_id")
    .eq("id", folderId)
    .maybeSingle();
  if (folderError) return { ok: false, error: folderError.message };
  if (!folder) return { ok: false, error: FOLDER_NO_ROWS };

  const targetParentId = newParentId || null;
  if (targetParentId) {
    // One query for the location's whole tree: it validates the destination
    // (same scope + client) and feeds the cycle check, which must see every
    // parent link to prove the destination is not a descendant of the folder.
    let treeQuery = supabase.from("company_file_folders").select("id, parent_id").eq("scope", folder.scope);
    treeQuery = folder.client_id ? treeQuery.eq("client_id", folder.client_id) : treeQuery.is("client_id", null);
    const { data: locationFolders, error: treeError } = await treeQuery;
    if (treeError) return { ok: false, error: treeError.message };

    const parents = new Map<string, string | null>(
      ((locationFolders ?? []) as { id: string; parent_id: string | null }[]).map((row) => [row.id, row.parent_id]),
    );
    if (!parents.has(targetParentId)) {
      return { ok: false, error: "That destination folder is not in this file area." };
    }
    if (wouldCreateFolderCycle(folderId, targetParentId, parents)) {
      return { ok: false, error: "A folder cannot be moved inside itself or one of its own subfolders." };
    }
  }

  const { data: moved, error } = await supabase
    .from("company_file_folders")
    .update({ parent_id: targetParentId })
    .eq("id", folderId)
    .select("id");

  if (errorCode(error) === UNIQUE_VIOLATION) {
    return { ok: false, error: "A folder with that name already exists in the destination folder." };
  }
  if (error) return { ok: false, error: error.message };
  if (!moved || moved.length === 0) return { ok: false, error: FOLDER_NO_ROWS };

  revalidateFiles();
  return { ok: true };
}

export async function deleteFolder(folderId: string): Promise<ActionResult> {
  const { supabase, userId, role, flags } = await getFileCenterAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!flags.canManage) return { ok: false, error: "You do not have permission to manage files." };
  if (!folderId) return { ok: false, error: "Missing folder id." };

  // Loaded before the delete so the audit record can name what was removed.
  const { data: folder, error: loadError } = await supabase
    .from("company_file_folders")
    .select("id, name, scope, client_id, parent_id")
    .eq("id", folderId)
    .maybeSingle();
  if (loadError) return { ok: false, error: loadError.message };
  if (!folder) return { ok: false, error: FOLDER_NO_ROWS };

  // Child folders cascade at the DB level; files in the deleted tree fall to
  // the location root (folder_id on delete set null), so nothing is orphaned.
  const { data: deleted, error } = await supabase
    .from("company_file_folders")
    .delete()
    .eq("id", folderId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!deleted || deleted.length === 0) return { ok: false, error: FOLDER_NO_ROWS };

  await recordFileAudit(
    role,
    "delete",
    "company_file_folder",
    folderId,
    userId,
    `Deleted folder "${folder.name}" (${folder.scope})`,
    { name: folder.name, scope: folder.scope, client_id: folder.client_id, parent_id: folder.parent_id },
  );

  revalidateFiles();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Uploads — ticket, direct PUT, finalize                                      */
/*                                                                             */
/* The file bytes deliberately never travel through a Server Action. Action    */
/* request bodies are capped far below the advertised 25 MB (1 MB by Next.js   */
/* default, ~4.5 MB hard on Vercel), which is why the previous design — the    */
/* whole File inside the action's FormData — died with a dead connection on    */
/* anything but small files. Instead:                                          */
/*   1. createUploadTicket() validates the request and returns a one-time      */
/*      signed upload URL for a server-chosen object key;                      */
/*   2. the browser PUTs the bytes straight to Supabase Storage;               */
/*   3. finalizeUpload() re-validates, confirms the object actually landed,    */
/*      and inserts the metadata row using the size and type STORAGE reports,  */
/*      never what the browser claimed.                                        */
/* An abandoned ticket leaves at worst an unreferenced object with no row —    */
/* invisible to every screen and safe to clear; a row is only ever written     */
/* for verified bytes.                                                        */
/* -------------------------------------------------------------------------- */

interface UploadRequest {
  scope: FileScope;
  clientId: string | null;
  folderId: string | null;
  name: string;
  description: string;
}

/**
 * The checks shared by the ticket and the finalize steps. Run TWICE per upload
 * on purpose: nothing the browser held between the two calls is trusted.
 */
async function validateUploadRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  input: {
    scope?: unknown;
    clientId?: unknown;
    folderId?: unknown;
    fileName?: unknown;
    mimeType?: unknown;
    description?: unknown;
  },
): Promise<{ ok: true; request: UploadRequest } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  if (!isFileScope(input.scope)) return { ok: false, error: "Choose a valid file area." };

  if (input.mimeType !== undefined && !isAllowedMimeType(typeof input.mimeType === "string" ? input.mimeType : "")) {
    return { ok: false, error: "This file type is not allowed.", fieldErrors: { file: "This file type is not allowed." } };
  }

  const name = sanitizeFileName(typeof input.fileName === "string" ? input.fileName : "");
  if (!name) {
    const message = "That file name has no usable characters. Rename the file and try again.";
    return { ok: false, error: message, fieldErrors: { file: message } };
  }

  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length > maxDescriptionLength) {
    const message = `Keep the description under ${maxDescriptionLength} characters.`;
    return { ok: false, error: message, fieldErrors: { description: message } };
  }

  const clientId = typeof input.clientId === "string" && input.clientId.trim() ? input.clientId.trim() : null;
  const location = await resolveLocation(supabase, input.scope, clientId);
  if (!location.ok) return { ok: false, error: location.error, fieldErrors: location.fieldErrors };

  const folderId = typeof input.folderId === "string" && input.folderId.trim() ? input.folderId.trim() : null;
  if (folderId) {
    const folder = await loadFolderInLocation(supabase, folderId, input.scope, location.clientId);
    if (!folder.ok) return { ok: false, error: folder.error };
  }

  return { ok: true, request: { scope: input.scope, clientId: location.clientId, folderId, name, description } };
}

export interface UploadTicketInput {
  scope: FileScope;
  clientId?: string | null;
  folderId?: string | null;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  description?: string;
}

export interface UploadTicket {
  fileId: string;
  storagePath: string;
  /** One-time signed URL the browser PUTs the raw file bytes to. */
  signedUrl: string;
}

export async function createUploadTicket(input: UploadTicketInput): Promise<ActionResult & { ticket?: UploadTicket }> {
  const { supabase, userId, flags } = await getFileCenterAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!flags.canManage) return { ok: false, error: "You do not have permission to manage files." };

  const sizeBytes = Number(input.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return { ok: false, error: "Could not read the file's size. Try again.", fieldErrors: { file: "Could not read the file's size." } };
  }
  if (sizeBytes > maxFileSizeBytes) {
    const message = `File is too large. Keep it under ${Math.round(maxFileSizeBytes / (1024 * 1024))} MB.`;
    return { ok: false, error: message, fieldErrors: { file: message } };
  }

  const validated = await validateUploadRequest(supabase, input);
  if (!validated.ok) return validated;

  // Minted here so the storage key and the eventual row agree on the id — the
  // key embeds it, which is also what keeps every upload attempt's key unique.
  const fileId = crypto.randomUUID();
  const storagePath = buildStoragePath(validated.request.scope, validated.request.clientId, fileId, validated.request.name);

  // Signed with the USER-scoped client, so the storage insert policy (owner =
  // this employee) is what authorises the URL — no service role involved.
  const { data: signed, error } = await supabase.storage.from(fileCenterBucket).createSignedUploadUrl(storagePath);
  if (error || !signed?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not prepare the upload." };
  }

  return { ok: true, ticket: { fileId, storagePath, signedUrl: signed.signedUrl } };
}

export interface FinalizeUploadInput {
  fileId: string;
  scope: FileScope;
  clientId?: string | null;
  folderId?: string | null;
  fileName: string;
  description?: string;
}

async function removeUploadedObject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  storagePath: string,
): Promise<void> {
  try {
    await supabase.storage.from(fileCenterBucket).remove([storagePath]);
  } catch {
    // Best effort — an object without a row is invisible to the UI and
    // harmless; a row pointing at missing bytes is the state that must never
    // exist, and no row has been written on any path that lands here.
  }
}

export async function finalizeUpload(input: FinalizeUploadInput): Promise<ActionResult & { fileId?: string }> {
  const { supabase, userId, flags } = await getFileCenterAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!flags.canManage) return { ok: false, error: "You do not have permission to manage files." };

  if (typeof input.fileId !== "string" || !uuidPattern.test(input.fileId)) {
    return { ok: false, error: "Malformed upload reference. Start the upload again." };
  }

  // mimeType is intentionally absent here: the type recorded below is the one
  // storage observed on the PUT, not a second browser claim.
  const validated = await validateUploadRequest(supabase, {
    scope: input.scope,
    clientId: input.clientId,
    folderId: input.folderId,
    fileName: input.fileName,
    description: input.description,
  });
  if (!validated.ok) return validated;
  const { scope, clientId, folderId, name, description } = validated.request;

  // Rebuilt from the validated inputs rather than accepted from the browser,
  // so a caller cannot file a row against an object it never got a ticket for.
  const storagePath = buildStoragePath(scope, clientId, input.fileId, name);

  const { data: objectInfo, error: infoError } = await supabase.storage.from(fileCenterBucket).info(storagePath);
  if (infoError || !objectInfo) {
    return { ok: false, error: "The file never reached storage, so nothing was saved. Try the upload again." };
  }

  // storage-js has surfaced these fields in both casings across versions.
  const info = objectInfo as Record<string, unknown>;
  const storedSize = Number(info.size ?? (info.metadata as Record<string, unknown> | undefined)?.size ?? 0);
  const rawType = info.contentType ?? info.content_type ?? "";
  const mimeType = typeof rawType === "string" && rawType ? rawType : "application/octet-stream";

  if (!Number.isFinite(storedSize) || storedSize > maxFileSizeBytes) {
    await removeUploadedObject(supabase, storagePath);
    const message = `File is too large. Keep it under ${Math.round(maxFileSizeBytes / (1024 * 1024))} MB.`;
    return { ok: false, error: message, fieldErrors: { file: message } };
  }
  if (!isAllowedMimeType(mimeType)) {
    await removeUploadedObject(supabase, storagePath);
    return { ok: false, error: "This file type is not allowed.", fieldErrors: { file: "This file type is not allowed." } };
  }

  const { data: created, error: insertError } = await supabase
    .from("company_files")
    .insert({
      id: input.fileId,
      scope,
      client_id: clientId,
      folder_id: folderId,
      name,
      storage_bucket: fileCenterBucket,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: storedSize,
      description,
      uploaded_by: userId,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    if (errorCode(insertError) === UNIQUE_VIOLATION) {
      // The only unique keys on this table are the id and the storage path,
      // both minted by the ticket — a violation means this exact upload was
      // ALREADY filed (a retry or a double-click). Report success and leave
      // the object alone: it belongs to the existing row.
      revalidateFiles();
      return { ok: true, fileId: input.fileId };
    }
    // Without cleanup the verified object would sit in storage with no row
    // pointing at it. The cleanup outcome is deliberately ignored — the caller
    // needs the real insert error, not the cleanup's.
    await removeUploadedObject(supabase, storagePath);
    return { ok: false, error: insertError?.message ?? "Could not save the uploaded file." };
  }

  revalidateFiles();
  return { ok: true, fileId: created.id };
}

export async function renameFile(fileId: string, name: string): Promise<ActionResult> {
  const { supabase, userId, flags } = await getFileCenterAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!flags.canManage) return { ok: false, error: "You do not have permission to manage files." };
  if (!fileId) return { ok: false, error: "Missing file id." };

  const safeName = sanitizeFileName(name);
  if (!safeName) {
    return { ok: false, error: "Enter a usable file name.", fieldErrors: { name: "Enter a usable file name." } };
  }

  const { data: updated, error } = await supabase
    .from("company_files")
    .update({ name: safeName })
    .eq("id", fileId)
    .select("id");

  if (errorCode(error) === UNIQUE_VIOLATION) {
    return { ok: false, error: DUPLICATE_FILE, fieldErrors: { name: DUPLICATE_FILE } };
  }
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: FILE_NO_ROWS };

  revalidateFiles();
  return { ok: true };
}

export async function moveFile(fileId: string, folderId: string | null): Promise<ActionResult> {
  const { supabase, userId, flags } = await getFileCenterAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!flags.canManage) return { ok: false, error: "You do not have permission to manage files." };
  if (!fileId) return { ok: false, error: "Missing file id." };

  // The file's own location decides which folders are legal destinations.
  const { data: file, error: loadError } = await supabase
    .from("company_files")
    .select("id, scope, client_id")
    .eq("id", fileId)
    .maybeSingle();
  if (loadError) return { ok: false, error: loadError.message };
  if (!file) return { ok: false, error: FILE_NO_ROWS };

  const targetFolderId = folderId || null;
  if (targetFolderId) {
    const folder = await loadFolderInLocation(supabase, targetFolderId, file.scope, file.client_id ?? null);
    if (!folder.ok) return { ok: false, error: folder.error };
  }

  const { data: updated, error } = await supabase
    .from("company_files")
    .update({ folder_id: targetFolderId })
    .eq("id", fileId)
    .select("id");

  if (errorCode(error) === UNIQUE_VIOLATION) {
    return { ok: false, error: "A file with that name already exists in the destination folder." };
  }
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: FILE_NO_ROWS };

  revalidateFiles();
  return { ok: true };
}

export async function setFileDescription(fileId: string, description: string): Promise<ActionResult> {
  const { supabase, userId, flags } = await getFileCenterAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!flags.canManage) return { ok: false, error: "You do not have permission to manage files." };
  if (!fileId) return { ok: false, error: "Missing file id." };

  const trimmed = description.trim();
  if (trimmed.length > maxDescriptionLength) {
    const message = `Keep the description under ${maxDescriptionLength} characters.`;
    return { ok: false, error: message, fieldErrors: { description: message } };
  }

  const { data: updated, error } = await supabase
    .from("company_files")
    .update({ description: trimmed })
    .eq("id", fileId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: FILE_NO_ROWS };

  revalidateFiles();
  return { ok: true };
}

/** Archive is the everyday "remove": reversible, and the row keeps its object. */
async function setFileArchivedAt(fileId: string, archivedAt: string | null): Promise<ActionResult> {
  const { supabase, userId, flags } = await getFileCenterAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!flags.canManage) return { ok: false, error: "You do not have permission to manage files." };
  if (!fileId) return { ok: false, error: "Missing file id." };

  const { data: updated, error } = await supabase
    .from("company_files")
    .update({ archived_at: archivedAt })
    .eq("id", fileId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: FILE_NO_ROWS };

  revalidateFiles();
  return { ok: true };
}

export async function archiveFile(fileId: string): Promise<ActionResult> {
  return setFileArchivedAt(fileId, new Date().toISOString());
}

export async function restoreFile(fileId: string): Promise<ActionResult> {
  return setFileArchivedAt(fileId, null);
}

export async function deleteFile(fileId: string): Promise<ActionResult> {
  const { supabase, userId, role, flags } = await getFileCenterAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!flags.canManage || !flags.canDelete) {
    return { ok: false, error: "Admin role required to permanently delete files." };
  }
  if (!fileId) return { ok: false, error: "Missing file id." };

  const { data: file, error: loadError } = await supabase
    .from("company_files")
    .select("id, name, scope, client_id, storage_bucket, storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (loadError) return { ok: false, error: loadError.message };
  if (!file) return { ok: false, error: FILE_NO_ROWS };

  // Storage object removal needs the service role (object DELETE is not
  // granted to portal users), so a missing admin client must stop the action.
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Add SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY before permanently deleting files." };
  }

  // Object first, row second: if the row delete then fails, what remains is a
  // visible row that can be deleted again — not an unreferenced blob that no
  // screen can ever find. A "not found" object is fine to proceed past (the
  // object is already gone); any other storage failure aborts before the row
  // is touched.
  const { error: storageError } = await admin.storage.from(file.storage_bucket).remove([file.storage_path]);
  if (storageError && !/not.?found/i.test(storageError.message ?? "")) {
    return { ok: false, error: `Could not remove the stored file: ${storageError.message}` };
  }

  const { data: deleted, error } = await supabase.from("company_files").delete().eq("id", fileId).select("id");
  if (error) return { ok: false, error: error.message };
  if (!deleted || deleted.length === 0) return { ok: false, error: FILE_NO_ROWS };

  await recordFileAudit(
    role,
    "delete",
    "company_file",
    fileId,
    userId,
    `Deleted file "${file.name}" (${file.scope})`,
    { name: file.name, scope: file.scope, client_id: file.client_id, storage_path: file.storage_path },
  );

  revalidateFiles();
  return { ok: true };
}

export async function getFileDownloadUrl(fileId: string): Promise<ActionResult & { url?: string; fileName?: string }> {
  const { supabase, userId, flags } = await getFileCenterAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!flags.canRead) return { ok: false, error: "Your account is not active." };
  if (!fileId) return { ok: false, error: "Missing file id." };

  const { data: file, error: loadError } = await supabase
    .from("company_files")
    .select("name, storage_bucket, storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (loadError) return { ok: false, error: loadError.message };
  if (!file) return { ok: false, error: "File not found." };

  // Short-lived signed URL from the USER-scoped client: the bucket is private,
  // so this is the only way a browser ever reaches an object.
  const { data: signed, error } = await supabase.storage
    .from(file.storage_bucket)
    .createSignedUrl(file.storage_path, 60);
  if (error || !signed?.signedUrl) return { ok: false, error: "Could not generate a download link." };

  return { ok: true, url: signed.signedUrl, fileName: file.name };
}
