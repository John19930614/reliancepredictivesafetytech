// Pure input rules for the File Center, kept separate from the server actions
// so they can be unit-tested directly.
//
// Server Actions are public POST endpoints: anything the browser can call, a
// script can call with arbitrary payloads. Names, sizes, and MIME types are
// bounded here before any value reaches the database or a storage object key,
// so the caller gets a clean field error instead of a raw Postgres constraint
// message — or worse, a hostile name woven into an object path.

import type { FileScope } from "./types";

/** Upload ceiling. Mirrors what the upload form advertises ("up to 25 MB"). */
export const maxFileSizeBytes = 25 * 1024 * 1024;
/** Matches the check on `company_files.name` (1–200 chars). */
export const maxFileNameLength = 200;
/** Matches the check on `company_file_folders.name` (1–120 chars). */
export const maxFolderNameLength = 120;
/** Matches the check on `company_files.description` (≤ 1000 chars). */
export const maxDescriptionLength = 1000;

/**
 * Allowlist, not blocklist: only formats the team actually shares — documents,
 * images, Office files, and a few text/data formats. Executables, scripts, and
 * anything unrecognized are rejected by omission.
 */
export const allowedFileMimeTypes: readonly string[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/zip",
];

const allowedMimeTypeSet = new Set(allowedFileMimeTypes);

/**
 * Case-insensitive membership test that ignores parameters — browsers report
 * text uploads as e.g. "text/csv;charset=utf-8", and the suffix must not make
 * an allowed type look foreign.
 */
export function isAllowedMimeType(mime: string): boolean {
  const bareType = mime.split(";", 1)[0].trim().toLowerCase();
  return allowedMimeTypeSet.has(bareType);
}

/**
 * Shared name scrub: path separators and control characters become spaces
 * (they change where a name renders or what object key it implies), whitespace
 * runs collapse to one space, and leading dots are stripped so a name can
 * never masquerade as a dotfile or a relative-path hop. The result is capped
 * at `maxLength` and may be "" — callers reject empty names.
 */
function sanitizeName(raw: string, maxLength: number): string {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex -- matching control chars is the point
    .replace(/[\\/\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Consume mixed leading runs of dots and spaces (". . .name" → "name").
    .replace(/^[\s.]+/, "");
  // The cap can cut mid-run and leave a dangling space; trim it back off.
  return cleaned.slice(0, maxLength).trimEnd();
}

/** Display-name scrub for files. Returns "" when nothing survives. */
export function sanitizeFileName(name: string): string {
  return sanitizeName(name, maxFileNameLength);
}

/** Display-name scrub for folders. Returns "" when nothing survives. */
export function sanitizeFolderName(name: string): string {
  const cleaned = sanitizeName(name, maxFolderNameLength);
  // "." and ".." are path navigation, not names. Unreachable today because
  // sanitizeName strips leading dots, but pinned explicitly so a future
  // relaxation of that rule cannot quietly reopen it.
  if (cleaned === "." || cleaned === "..") return "";
  return cleaned;
}

/**
 * Object key inside the `file-center` bucket:
 *   company scope — `company/<fileId>-<name>`
 *   client scope  — `client/<clientId>/<fileId>-<name>`
 *
 * The database keeps the pretty display name; the KEY additionally squeezes
 * `safeName` down to [a-zA-Z0-9._-] (same character policy as
 * DocumentLibraryManager's uploads) because storage keys travel through URLs
 * and signed requests where spaces and unicode invite encoding bugs. Prefixing
 * the uuid keeps keys unique even when two uploads share a name.
 */
export function buildStoragePath(
  scope: FileScope,
  clientId: string | null,
  fileId: string,
  safeName: string,
): string {
  const keyName = safeName.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (scope === "client") {
    if (!clientId) {
      throw new Error("A client-scoped file requires a client id to build its storage path.");
    }
    return `client/${clientId}/${fileId}-${keyName}`;
  }
  return `company/${fileId}-${keyName}`;
}

/**
 * True when re-parenting `folderId` under `newParentId` would make the folder
 * its own ancestor (including `newParentId === folderId`). `parents` maps
 * folder id → parent_id for the SAME scope/client location; the walk climbs
 * from `newParentId` toward the root and reports whether it passes through
 * `folderId`.
 *
 * The walk is bounded at `parents.size + 1` steps: a legitimate chain visits
 * each folder at most once, so anything longer means the map already contains
 * a cycle and we stop instead of spinning. Ids missing from the map are
 * treated as roots.
 */
export function wouldCreateFolderCycle(
  folderId: string,
  newParentId: string | null,
  parents: ReadonlyMap<string, string | null>,
): boolean {
  let current: string | null = newParentId;
  const maxSteps = parents.size + 1;
  for (let step = 0; step < maxSteps && current !== null; step += 1) {
    if (current === folderId) return true;
    current = parents.get(current) ?? null;
  }
  return false;
}
