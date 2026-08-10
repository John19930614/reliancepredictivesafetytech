// Hand-written row types for the File Center, mirroring
// supabase/migrations/20260810100000_file_center.sql. Kept separate from the
// generated lib/supabase/types.ts (which is never edited by hand) so server
// actions and components can share one shape per table.

/**
 * Which library a folder or file belongs to. 'company' rows have client_id
 * null (the firm's internal library); 'client' rows always carry the
 * company_clients id they file under. The database enforces the pairing with a
 * check constraint, so a row can never sit between the two scopes.
 */
export type FileScope = "company" | "client";

/** One node of the folder tree (public.company_file_folders). */
export interface FileFolderRow {
  id: string;
  scope: FileScope;
  /** Set exactly when scope is 'client'. */
  client_id: string | null;
  /** Null = a root-level folder of its scope/client location. */
  parent_id: string | null;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** One stored file's metadata (public.company_files); bytes live in storage. */
export interface CompanyFileRow {
  id: string;
  scope: FileScope;
  /** Set exactly when scope is 'client'. */
  client_id: string | null;
  /** Null = filed at the scope root (or its folder was deleted). */
  folder_id: string | null;
  /**
   * Display name, kept pretty (spaces, casing). The storage object key is
   * derived separately — see buildStoragePath() in lib/files/validation.ts.
   */
  name: string;
  storage_bucket: string;
  /** Object key within storage_bucket; unique across the table. */
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  description: string;
  uploaded_by: string | null;
  /** Soft archive timestamp; null = live. Employees archive, admins delete. */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The private storage bucket backing the File Center. Named in one place so
 * upload, download, and cleanup code can never drift onto different buckets.
 */
export const fileCenterBucket = "file-center";

/** Portal route for the module, matching its module catalog entry. */
export const fileCenterPath = "/employee/files";
