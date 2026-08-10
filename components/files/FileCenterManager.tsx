"use client";

// The one interactive surface of the File Center. Every mutation goes through
// the Server Actions in app/employee/files/actions.ts (no Supabase client in
// the browser bundle — CLAUDE.md, no client-side mutation), and every
// navigation is a URL change so the server component re-queries the folder:
// ?scope=client&client=<id>&folder=<id>.

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Download,
  Folder,
  FolderPlus,
  FolderUp,
  Pencil,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { fileCenterPath, type CompanyFileRow, type FileFolderRow, type FileScope } from "@/lib/files/types";
import {
  allowedFileMimeTypes,
  isAllowedMimeType,
  maxDescriptionLength,
  maxFileSizeBytes,
  maxFolderNameLength,
} from "@/lib/files/validation";
import {
  archiveFile,
  createFolder,
  deleteFile,
  deleteFolder,
  getFileDownloadUrl,
  moveFile,
  moveFolder,
  renameFile,
  renameFolder,
  restoreFile,
  setFileDescription,
  uploadFile,
} from "@/app/employee/files/actions";

export interface FileCenterPageData {
  scope: FileScope;
  clientId: string | null;
  clients: { id: string; name: string }[];
  folderId: string | null;
  /** Root → current, excluding root; the last entry is the open folder. */
  breadcrumb: { id: string; name: string }[];
  /** Children of the current folder. */
  folders: FileFolderRow[];
  /** Files in the current folder, archived included. */
  files: CompanyFileRow[];
  canDelete: boolean;
}

interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const maxFileSizeLabel = `${Math.round(maxFileSizeBytes / (1024 * 1024))} MB`;

/** Matches record-badge-danger's palette; not a brand color. */
const dangerText = { color: "#9b1c1c" };

function buildHref(scope: FileScope, clientId: string | null, folderId: string | null) {
  const params = new URLSearchParams();
  if (scope === "client") {
    params.set("scope", "client");
    if (clientId) params.set("client", clientId);
  }
  if (folderId) params.set("folder", folderId);
  const query = params.toString();
  return query ? `${fileCenterPath}?${query}` : fileCenterPath;
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function messageFor(result: ActionResult | null | undefined, fallback: string) {
  const fieldErrors = Object.values(result?.fieldErrors ?? {});
  return result?.error || (fieldErrors.length > 0 ? fieldErrors[0] : "") || fallback;
}

export function FileCenterManager({ data }: { data: FileCenterPageData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const [description, setDescription] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionTone, setActionTone] = useState<"success" | "error">("success");
  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isClientScope = data.scope === "client";
  // On the client tab nothing can be listed or filed until a client is chosen.
  const clientReady = !isClientScope || Boolean(data.clientId);
  const currentFolderName = data.breadcrumb.length > 0 ? data.breadcrumb[data.breadcrumb.length - 1].name : null;
  /** Parent of the OPEN folder — where a child folder lands when moved up. */
  const parentFolderId = data.breadcrumb.length > 1 ? data.breadcrumb[data.breadcrumb.length - 2].id : null;

  function run(key: string, action: () => Promise<ActionResult>, successText: string, onSuccess?: () => void) {
    setPendingKey(key);
    setActionMessage("");
    startTransition(async () => {
      let result: ActionResult | null;
      try {
        result = await action();
      } catch {
        // A Server Action that throws tells us nothing about whether it was
        // applied — say so instead of showing nothing.
        setPendingKey("");
        setActionTone("error");
        setActionMessage("The server did not answer, so this change may or may not have been saved. Reload before retrying.");
        return;
      }
      setPendingKey("");
      if (!result?.ok) {
        setActionTone("error");
        setActionMessage(messageFor(result, "That change could not be saved."));
        return;
      }
      setActionTone("success");
      setActionMessage(successText);
      onSuccess?.();
      router.refresh();
    });
  }

  function handleCreateFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) {
      setFolderError("Enter a folder name.");
      return;
    }
    setFolderError("");
    setPendingKey("create-folder");
    startTransition(async () => {
      let result: ActionResult | null;
      try {
        result = await createFolder({ scope: data.scope, clientId: data.clientId, parentId: data.folderId, name });
      } catch {
        setPendingKey("");
        setFolderError("The server did not answer. Try again.");
        return;
      }
      setPendingKey("");
      if (!result?.ok) {
        setFolderError(messageFor(result, "The folder could not be created."));
        return;
      }
      setFolderName("");
      router.refresh();
    });
  }

  function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file || !file.name) {
      setUploadError("Choose a file to upload.");
      return;
    }
    // Fast local feedback only — the server re-checks both bounds.
    if (file.size > maxFileSizeBytes) {
      setUploadError(`That file is ${formatSize(file.size)} — the limit is ${maxFileSizeLabel}.`);
      return;
    }
    if (!isAllowedMimeType(file.type)) {
      setUploadError(`"${file.type || "unknown type"}" is not an accepted file type.`);
      return;
    }
    setUploadError("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", data.scope);
    if (data.clientId) formData.append("clientId", data.clientId);
    if (data.folderId) formData.append("folderId", data.folderId);
    formData.append("description", description.trim());
    setPendingKey("upload");
    startTransition(async () => {
      let result: ActionResult | null;
      try {
        result = await uploadFile(formData);
      } catch {
        setPendingKey("");
        setUploadError("The server did not answer, so it is not known whether the upload landed. Reload before retrying.");
        return;
      }
      setPendingKey("");
      if (!result?.ok) {
        setUploadError(messageFor(result, "The file could not be uploaded."));
        return;
      }
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setActionTone("success");
      setActionMessage("File uploaded.");
      router.refresh();
    });
  }

  function handleDownload(file: CompanyFileRow) {
    setPendingKey(`download-${file.id}`);
    setActionMessage("");
    startTransition(async () => {
      let result: (ActionResult & { url?: string; fileName?: string }) | null;
      try {
        result = await getFileDownloadUrl(file.id);
      } catch {
        setPendingKey("");
        setActionTone("error");
        setActionMessage("The server did not answer. Try the download again.");
        return;
      }
      setPendingKey("");
      if (!result?.ok || !result.url) {
        setActionTone("error");
        setActionMessage(messageFor(result, "The download link could not be created."));
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  function handleRenameFolder(folder: FileFolderRow) {
    const name = window.prompt("Rename folder", folder.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === folder.name) return;
    run(`folder-${folder.id}`, () => renameFolder(folder.id, trimmed), "Folder renamed.");
  }

  function handleMoveFolderUp(folder: FileFolderRow) {
    run(`folder-${folder.id}`, () => moveFolder(folder.id, parentFolderId), "Folder moved up a level.");
  }

  function handleDeleteFolder(folder: FileFolderRow) {
    const confirmed = window.confirm(
      `Delete the folder "${folder.name}"? Files inside are not deleted — they move to the root of ${
        isClientScope ? "this client's files" : "the company files"
      }.`,
    );
    if (!confirmed) return;
    run(`folder-${folder.id}`, () => deleteFolder(folder.id), "Folder deleted. Its files are at the root.");
  }

  function handleRenameFile(file: CompanyFileRow) {
    const name = window.prompt("Rename file", file.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === file.name) return;
    run(`file-${file.id}`, () => renameFile(file.id, trimmed), "File renamed.");
  }

  function handleMoveFileToRoot(file: CompanyFileRow) {
    run(`file-${file.id}`, () => moveFile(file.id, null), "File moved to the root.");
  }

  function handleArchive(file: CompanyFileRow) {
    run(`file-${file.id}`, () => archiveFile(file.id), "File archived. Restore it any time.");
  }

  function handleRestore(file: CompanyFileRow) {
    run(`file-${file.id}`, () => restoreFile(file.id), "File restored.");
  }

  function handleDelete(file: CompanyFileRow) {
    if (!data.canDelete) return;
    if (!window.confirm(`Delete "${file.name}"?`)) return;
    if (!window.confirm(`This permanently deletes the file and its stored object. There is no undo. Delete "${file.name}"?`)) return;
    run(`file-${file.id}`, () => deleteFile(file.id), "File permanently deleted.");
  }

  function startDescriptionEdit(file: CompanyFileRow) {
    setEditingDescriptionId(file.id);
    setDescriptionDraft(file.description ?? "");
  }

  function saveDescription(fileId: string) {
    run(`file-${fileId}`, () => setFileDescription(fileId, descriptionDraft.trim()), "Description saved.", () =>
      setEditingDescriptionId(null),
    );
  }

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Governance</div>
          <h1>File Center</h1>
          <p>One library for company records and client files — folders, uploads, archives, and downloads.</p>
        </div>
      </div>

      <div className="segmented-control" style={{ justifyContent: "flex-start", marginBottom: 16 }}>
        <button
          className={!isClientScope ? "active" : undefined}
          onClick={() => router.push(fileCenterPath)}
          type="button"
        >
          Company Files
        </button>
        <button
          className={isClientScope ? "active" : undefined}
          onClick={() => router.push(`${fileCenterPath}?scope=client`)}
          type="button"
        >
          Client Files
        </button>
      </div>

      {isClientScope ? (
        <div className="field" style={{ maxWidth: 360, marginBottom: 16 }}>
          <label htmlFor="file-center-client">Client</label>
          <select
            id="file-center-client"
            onChange={(event) => router.push(buildHref("client", event.target.value || null, null))}
            value={data.clientId ?? ""}
          >
            <option value="">Select a client…</option>
            {data.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!clientReady ? (
        <div className="empty-state">Choose a client above to browse and manage their files.</div>
      ) : (
        <div className="document-grid">
          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <form className="form-panel" onSubmit={handleUpload}>
              <h2>Upload a file</h2>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
                <div className="field">
                  <label htmlFor="file-center-upload">File</label>
                  <input
                    accept={allowedFileMimeTypes.join(",")}
                    id="file-center-upload"
                    name="file"
                    ref={fileInputRef}
                    type="file"
                  />
                  <p style={{ margin: "6px 0 0", color: "var(--portal-muted)", fontSize: "0.78rem" }}>
                    Up to {maxFileSizeLabel}. Documents, images, Office files, and common text formats. Lands in{" "}
                    {currentFolderName ? `"${currentFolderName}"` : "the root"}.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="file-center-description">Description (optional)</label>
                  <textarea
                    id="file-center-description"
                    maxLength={maxDescriptionLength}
                    onChange={(event) => setDescription(event.target.value)}
                    value={description}
                  />
                </div>
                {uploadError ? (
                  <p role="alert" style={{ margin: 0, fontSize: "0.82rem", ...dangerText }}>
                    {uploadError}
                  </p>
                ) : null}
                <button className="button button-primary" disabled={isPending} type="submit">
                  <UploadCloud size={18} />
                  {pendingKey === "upload" ? "Uploading…" : "Upload File"}
                </button>
              </div>
            </form>

            <form className="form-panel" onSubmit={handleCreateFolder}>
              <h2>New folder</h2>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
                <div className="field">
                  <label htmlFor="file-center-folder-name">Folder name</label>
                  <input
                    id="file-center-folder-name"
                    maxLength={maxFolderNameLength}
                    onChange={(event) => setFolderName(event.target.value)}
                    placeholder="e.g. Site Audits 2026"
                    value={folderName}
                  />
                  <p style={{ margin: "6px 0 0", color: "var(--portal-muted)", fontSize: "0.78rem" }}>
                    Created inside {currentFolderName ? `"${currentFolderName}"` : "the root"}.
                  </p>
                </div>
                {folderError ? (
                  <p role="alert" style={{ margin: 0, fontSize: "0.82rem", ...dangerText }}>
                    {folderError}
                  </p>
                ) : null}
                <button className="button button-light" disabled={isPending} type="submit">
                  <FolderPlus size={18} />
                  {pendingKey === "create-folder" ? "Creating…" : "Create Folder"}
                </button>
              </div>
            </form>
          </div>

          <section>
            <nav
              aria-label="Folder path"
              style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, fontSize: "0.85rem" }}
            >
              {data.folderId ? (
                <Link href={buildHref(data.scope, data.clientId, null)}>All files</Link>
              ) : (
                <span aria-current="page" style={{ fontWeight: 700 }}>
                  All files
                </span>
              )}
              {data.breadcrumb.map((crumb, index) => {
                const isCurrent = index === data.breadcrumb.length - 1;
                return (
                  <span key={crumb.id} style={{ alignItems: "center", display: "inline-flex", gap: 6 }}>
                    <span aria-hidden="true" style={{ color: "var(--portal-muted)" }}>
                      ›
                    </span>
                    {isCurrent ? (
                      <span aria-current="page" style={{ fontWeight: 700 }}>
                        {crumb.name}
                      </span>
                    ) : (
                      <Link href={buildHref(data.scope, data.clientId, crumb.id)}>{crumb.name}</Link>
                    )}
                  </span>
                );
              })}
            </nav>

            {actionMessage ? (
              <div
                className="success-box"
                role={actionTone === "error" ? "alert" : "status"}
                style={{
                  marginBottom: 12,
                  padding: 12,
                  ...(actionTone === "error" ? { background: "#fff0f0", borderColor: "#e09a9a", ...dangerText } : {}),
                }}
              >
                {actionMessage}
              </div>
            ) : null}

            {data.folders.length > 0 ? (
              <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                {data.folders.map((folder) => (
                  <div
                    className="doc-card"
                    key={folder.id}
                    style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between", padding: "12px 16px" }}
                  >
                    <Link
                      href={buildHref(data.scope, data.clientId, folder.id)}
                      style={{ alignItems: "center", display: "inline-flex", gap: 8, fontWeight: 700 }}
                    >
                      <Folder size={17} style={{ color: "var(--portal-gold)" }} />
                      {folder.name}
                    </Link>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        aria-label={`Rename the folder ${folder.name}`}
                        className="button button-light"
                        disabled={isPending}
                        onClick={() => handleRenameFolder(folder)}
                        title="Rename"
                        type="button"
                      >
                        <Pencil size={14} />
                      </button>
                      {data.folderId ? (
                        <button
                          aria-label={`Move the folder ${folder.name} up a level`}
                          className="button button-light"
                          disabled={isPending}
                          onClick={() => handleMoveFolderUp(folder)}
                          title="Move up a level"
                          type="button"
                        >
                          <FolderUp size={14} />
                        </button>
                      ) : null}
                      <button
                        aria-label={`Delete the folder ${folder.name}`}
                        className="button button-light"
                        disabled={isPending}
                        onClick={() => handleDeleteFolder(folder)}
                        title="Delete"
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {data.files.length === 0 && data.folders.length === 0 ? (
              <div className="empty-state">Nothing here yet. Create a folder or upload the first file.</div>
            ) : data.files.length === 0 ? (
              <div className="empty-state">No files at this level yet.</div>
            ) : (
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Size</th>
                      <th>Uploaded</th>
                      <th>Description</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.files.map((file) => {
                      const archived = Boolean(file.archived_at);
                      return (
                        <tr key={file.id} style={archived ? { opacity: 0.55 } : undefined}>
                          <td>
                            <span style={{ alignItems: "center", display: "inline-flex", gap: 8 }}>
                              {file.name}
                              {archived ? <span className="record-badge record-badge-neutral">Archived</span> : null}
                            </span>
                          </td>
                          <td>{formatSize(file.size_bytes)}</td>
                          <td>{formatDate(file.created_at)}</td>
                          <td>
                            {archived ? (
                              <span style={{ color: "var(--portal-muted)" }}>{file.description || "—"}</span>
                            ) : editingDescriptionId === file.id ? (
                              <span style={{ alignItems: "center", display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
                                <input
                                  aria-label={`Description for ${file.name}`}
                                  maxLength={maxDescriptionLength}
                                  onChange={(event) => setDescriptionDraft(event.target.value)}
                                  style={{ minWidth: 180 }}
                                  value={descriptionDraft}
                                />
                                <button
                                  className="button button-light"
                                  disabled={isPending}
                                  onClick={() => saveDescription(file.id)}
                                  type="button"
                                >
                                  Save
                                </button>
                                <button
                                  className="button button-light"
                                  disabled={isPending}
                                  onClick={() => setEditingDescriptionId(null)}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                aria-label={`Edit the description of ${file.name}`}
                                onClick={() => startDescriptionEdit(file)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: file.description ? "inherit" : "var(--portal-muted)",
                                  cursor: "pointer",
                                  font: "inherit",
                                  padding: 0,
                                  textAlign: "left",
                                }}
                                title="Edit description"
                                type="button"
                              >
                                {file.description || "Add description"}
                              </button>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {!archived ? (
                                <>
                                  <button
                                    aria-label={`Download ${file.name}`}
                                    className="button button-light"
                                    disabled={isPending}
                                    onClick={() => handleDownload(file)}
                                    title="Download"
                                    type="button"
                                  >
                                    <Download size={14} />
                                  </button>
                                  <button
                                    aria-label={`Rename ${file.name}`}
                                    className="button button-light"
                                    disabled={isPending}
                                    onClick={() => handleRenameFile(file)}
                                    title="Rename"
                                    type="button"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  {data.folderId ? (
                                    <button
                                      aria-label={`Move ${file.name} to the root`}
                                      className="button button-light"
                                      disabled={isPending}
                                      onClick={() => handleMoveFileToRoot(file)}
                                      title="Move to root"
                                      type="button"
                                    >
                                      <FolderUp size={14} />
                                    </button>
                                  ) : null}
                                  <button
                                    aria-label={`Archive ${file.name}`}
                                    className="button button-light"
                                    disabled={isPending}
                                    onClick={() => handleArchive(file)}
                                    title="Archive"
                                    type="button"
                                  >
                                    <Archive size={14} />
                                  </button>
                                </>
                              ) : (
                                <button
                                  aria-label={`Restore ${file.name}`}
                                  className="button button-light"
                                  disabled={isPending}
                                  onClick={() => handleRestore(file)}
                                  title="Restore"
                                  type="button"
                                >
                                  <ArchiveRestore size={14} />
                                </button>
                              )}
                              {data.canDelete ? (
                                <button
                                  aria-label={`Permanently delete ${file.name}`}
                                  className="button button-light"
                                  disabled={isPending}
                                  onClick={() => handleDelete(file)}
                                  title="Delete permanently"
                                  type="button"
                                >
                                  <Trash2 size={14} />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
