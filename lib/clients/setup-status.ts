// Which pieces of a company's setup are missing.
//
// PURE. Takes what four reads returned and decides what to offer; no I/O, so
// the one rule that matters here can be tested directly.
//
// THAT RULE: A READ THAT FAILED IS NOT AN EMPTY RESULT. If the folder query
// errors, this must not report "no folders" — the banner would offer to create
// a set that already exists, and pressing it would either duplicate rows or
// collide with the sibling-name unique index. Every check below therefore
// requires a SUCCESSFUL read before it will call anything missing. Silence is
// the correct answer to a question that could not be asked.
//
// This is the same failure the lifecycle review found in three other panels,
// where a failed read rendered as a confident empty state.

import { clientFolderTemplate } from "@/lib/clients/folder-template";

/** One read's outcome, in the shape PostgREST returns. */
export interface ReadOutcome<T> {
  data?: T | null;
  error?: unknown;
}

export interface ClientSetupStatus {
  needsChecklist: boolean;
  needsFolders: boolean;
  needsProfile: boolean;
  /** True when at least one piece is missing — i.e. the banner has something to say. */
  incomplete: boolean;
}

export interface ClientSetupInput {
  /** client_onboarding_items rows for this client. */
  checklist: ReadOutcome<ReadonlyArray<unknown>>;
  /** Top-level company_file_folders rows for this client, name only. */
  folders: ReadOutcome<ReadonlyArray<{ name?: unknown }>>;
  /** The company_profiles row, or null when there isn't one. */
  profile: ReadOutcome<unknown>;
  /**
   * True when company_profiles does not exist in the database at all — the
   * migration has not been applied. Nothing can be created, so nothing is
   * offered; the profile panel says its own piece about that.
   */
  profileTableMissing?: boolean;
}

/** Which of the standard folders this company does not have, case-insensitively. */
export function missingFolderNames(rows: ReadonlyArray<{ name?: unknown }>): string[] {
  const have = new Set(rows.map((row) => String(row?.name ?? "").toLowerCase()));
  return clientFolderTemplate.filter((folder) => !have.has(folder.name.toLowerCase())).map((folder) => folder.name);
}

export function clientSetupStatus(input: ClientSetupInput): ClientSetupStatus {
  const needsChecklist = !input.checklist.error && (input.checklist.data ?? []).length === 0;

  const needsFolders = !input.folders.error && missingFolderNames(input.folders.data ?? []).length > 0;

  const needsProfile =
    input.profileTableMissing !== true && !input.profile.error && (input.profile.data ?? null) === null;

  return {
    needsChecklist,
    needsFolders,
    needsProfile,
    incomplete: needsChecklist || needsFolders || needsProfile,
  };
}
