"use client";

// Management UI for proposal templates: capture from an existing proposal,
// rename, archive/restore, delete. Every write goes through a Server Action in
// ./actions.ts — nothing here talks to Supabase directly.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, BookmarkPlus, Loader2, PencilLine, Trash2, TriangleAlert } from "lucide-react";
import {
  createTemplateFromProposal,
  deleteProposalTemplate,
  setProposalTemplateArchived,
  updateProposalTemplate,
} from "./actions";
import { templateDescriptionMaxLength, templateNameMaxLength } from "@/lib/proposals/templates";

export interface ManagedTemplate {
  id: string;
  name: string;
  description: string | null;
  is_archived: boolean;
  updated_at: string;
  /** Blocked field ids the stored body still carries, if any. */
  leakFieldIds: string[];
}

interface ProposalOption {
  id: string;
  title: string;
}

interface TemplateManagerProps {
  templates: ManagedTemplate[];
  proposals: ProposalOption[];
  canManage: boolean;
  isAdmin: boolean;
}

export function ProposalTemplateManager({ templates, proposals, canManage, isAdmin }: TemplateManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  function refresh(message: string) {
    setError("");
    setNotice(message);
    startTransition(() => router.refresh());
  }

  async function handleCapture(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusyId("capture");
    setError("");
    setNotice("");

    const result = await createTemplateFromProposal({
      proposalId: String(data.get("proposal_id") ?? ""),
      name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? ""),
    });
    setBusyId(null);

    if (!result.ok) {
      setError(result.error ?? "Failed to save the template.");
      return;
    }
    form.reset();
    refresh("Template saved.");
  }

  function startEditing(template: ManagedTemplate) {
    setEditingId(template.id);
    setEditName(template.name);
    setEditDescription(template.description ?? "");
    setError("");
    setNotice("");
  }

  async function handleRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setBusyId(editingId);
    setError("");

    const result = await updateProposalTemplate(editingId, { name: editName, description: editDescription });
    setBusyId(null);

    if (!result.ok) {
      setError(result.error ?? "Failed to update the template.");
      return;
    }
    setEditingId(null);
    refresh("Template updated.");
  }

  async function handleArchive(template: ManagedTemplate) {
    setBusyId(template.id);
    setError("");

    const result = await setProposalTemplateArchived(template.id, !template.is_archived);
    setBusyId(null);

    if (!result.ok) {
      setError(result.error ?? "Failed to change the template.");
      return;
    }
    refresh(template.is_archived ? "Template restored." : "Template archived.");
  }

  async function handleDelete(template: ManagedTemplate) {
    if (!window.confirm(`Delete the template "${template.name}"? This cannot be undone.`)) return;
    setBusyId(template.id);
    setError("");

    const result = await deleteProposalTemplate(template.id);
    setBusyId(null);

    if (!result.ok) {
      setError(result.error ?? "Failed to delete the template.");
      return;
    }
    refresh("Template deleted.");
  }

  return (
    <div className="document-grid">
      <form className="form-panel" onSubmit={handleCapture}>
        <h2>Save a proposal as a template</h2>
        <p style={{ color: "var(--portal-muted)", marginTop: 4, fontSize: "0.9rem" }}>
          Pick a proposal whose scope and pricing you want to reuse. Its client block and proposal number are removed
          before the template is stored.
        </p>

        <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
          <div className="field">
            <label htmlFor="template-proposal">Proposal to capture</label>
            <select id="template-proposal" name="proposal_id" defaultValue="" required disabled={!canManage}>
              <option value="">Select a proposal…</option>
              {proposals.map((proposal) => (
                <option key={proposal.id} value={proposal.id}>
                  {proposal.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="template-name">Template name</label>
            <input
              id="template-name"
              name="name"
              maxLength={templateNameMaxLength}
              placeholder="e.g. 6-month pilot — two jobsites"
              required
              disabled={!canManage}
            />
          </div>
          <div className="field">
            <label htmlFor="template-description">Description</label>
            <textarea
              id="template-description"
              name="description"
              maxLength={templateDescriptionMaxLength}
              rows={3}
              placeholder="When should a seller reach for this one?"
              disabled={!canManage}
            />
          </div>

          <button
            className="button button-primary"
            disabled={!canManage || busyId === "capture"}
            type="submit"
            style={{ justifySelf: "start" }}
          >
            {busyId === "capture" ? <Loader2 size={18} className="spin" /> : <BookmarkPlus size={18} />}
            {busyId === "capture" ? "Saving…" : "Save as template"}
          </button>
          {!canManage ? (
            <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem" }}>
              Your role can view templates but not create them.
            </p>
          ) : null}
        </div>
      </form>

      <section>
        <h2 style={{ marginBottom: 12 }}>All templates</h2>

        {error ? (
          <div className="success-box portal-alert portal-alert-error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        ) : null}
        {notice && !error ? (
          <div className="success-box" style={{ marginBottom: 12 }}>
            {notice}
          </div>
        ) : null}

        {templates.length === 0 ? (
          <div className="empty-state">No templates yet. Save a proposal to create the first one.</div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td>
                      {template.name}
                      {template.leakFieldIds.length > 0 ? (
                        <span
                          title={`Stored client-identity fields: ${template.leakFieldIds.join(", ")}. They are stripped when the template is applied.`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            marginLeft: 8,
                            color: "var(--portal-muted)",
                            fontSize: "0.8rem",
                          }}
                        >
                          <TriangleAlert size={14} /> legacy body
                        </span>
                      ) : null}
                    </td>
                    <td>{template.description ?? "—"}</td>
                    <td>{template.is_archived ? "Archived" : "Active"}</td>
                    <td>{new Date(template.updated_at).toLocaleDateString()}</td>
                    <td>
                      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          className="button button-light"
                          type="button"
                          disabled={!canManage || busyId === template.id || pending}
                          onClick={() => startEditing(template)}
                        >
                          <PencilLine size={16} /> Rename
                        </button>
                        <button
                          className="button button-light"
                          type="button"
                          disabled={!canManage || busyId === template.id || pending}
                          onClick={() => handleArchive(template)}
                        >
                          {template.is_archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                          {template.is_archived ? "Restore" : "Archive"}
                        </button>
                        {isAdmin ? (
                          <button
                            className="button button-light"
                            type="button"
                            disabled={busyId === template.id || pending}
                            onClick={() => handleDelete(template)}
                          >
                            <Trash2 size={16} /> Delete
                          </button>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editingId ? (
          <form className="form-panel" onSubmit={handleRename} style={{ marginTop: 16 }}>
            <h3>Rename template</h3>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 12 }}>
              <div className="field">
                <label htmlFor="edit-template-name">Name</label>
                <input
                  id="edit-template-name"
                  value={editName}
                  maxLength={templateNameMaxLength}
                  onChange={(event) => setEditName(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="edit-template-description">Description</label>
                <textarea
                  id="edit-template-description"
                  value={editDescription}
                  maxLength={templateDescriptionMaxLength}
                  rows={3}
                  onChange={(event) => setEditDescription(event.target.value)}
                />
              </div>
              <span style={{ display: "flex", gap: 8 }}>
                <button className="button button-primary" type="submit" disabled={busyId === editingId}>
                  {busyId === editingId ? <Loader2 size={18} className="spin" /> : <PencilLine size={18} />}
                  Save changes
                </button>
                <button className="button button-light" type="button" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
              </span>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
