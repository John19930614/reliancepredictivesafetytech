"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  legalIssueSeverities,
  legalIssueStatuses,
  type CompanyClient,
  type CompanyDocument,
  type CompanyLegalIssue,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/friendly-error";

type LegalIssuesManagerProps = {
  clients: CompanyClient[];
  documents: CompanyDocument[];
  initialIssues: CompanyLegalIssue[];
};

export function LegalIssuesManager({ clients, documents, initialIssues }: LegalIssuesManagerProps) {
  const [issues, setIssues] = useState(initialIssues);
  const [filters, setFilters] = useState({ severity: "", status: "" });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const clientsById = useMemo(() => Object.fromEntries(clients.map((client) => [client.id, client])), [clients]);

  const filteredIssues = issues.filter((issue) => {
    return (!filters.severity || issue.severity === filters.severity) && (!filters.status || issue.status === filters.status);
  });

  function setStatusMessage(text: string, tone: "success" | "error" = "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function createIssue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    const formData = new FormData(form);
    const supabase = createClient();
    if (!supabase) {
      setStatusMessage("Company data is unavailable right now. Refresh the page, or contact an administrator.", "error");
      return;
    }

    const payload = {
      title: String(formData.get("title") ?? ""),
      severity: String(formData.get("severity") ?? "Medium"),
      status: String(formData.get("status") ?? "Open"),
      owner: String(formData.get("owner") ?? ""),
      due_date: String(formData.get("due_date") ?? "") || null,
      client_id: String(formData.get("client_id") ?? "") || null,
      linked_document_id: String(formData.get("linked_document_id") ?? "") || null,
      description: String(formData.get("description") ?? ""),
    };

    const { data, error } = await supabase.from("company_legal_issues").insert(payload).select("*").single();
    if (error || !data) {
      console.error(error);
      setStatusMessage(friendlyError(error, "Could not create legal issue."), "error");
      return;
    }

    setIssues((current) => [data as CompanyLegalIssue, ...current]);
    form.reset();
    setStatusMessage("Legal issue logged.");
  }

  async function updateIssue(issue: CompanyLegalIssue, patch: Partial<CompanyLegalIssue>) {
    setIssues((current) => current.map((currentIssue) => (currentIssue.id === issue.id ? { ...currentIssue, ...patch } : currentIssue)));
    const supabase = createClient();
    if (supabase) {
      await supabase.from("company_legal_issues").update(patch).eq("id", issue.id);
    }
  }

  return (
    <div className="document-grid">
      <form className="form-panel" onSubmit={createIssue}>
        <h2>Log issue</h2>
        {message ? (
          messageTone === "error" ? (
            <div className="success-box portal-alert portal-alert-error" role="alert">{message}</div>
          ) : (
            <div className="success-box" role="status">{message}</div>
          )
        ) : null}
        <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
          <div className="field">
            <label>Title</label>
            <input name="title" required />
          </div>
          <div className="field">
            <label>Severity</label>
            <select name="severity" defaultValue="Medium">
              {legalIssueSeverities.map((severity) => (
                <option key={severity}>{severity}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select name="status" defaultValue="Open">
              {legalIssueStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Owner</label>
            <input name="owner" />
          </div>
          <div className="field">
            <label>Due date</label>
            <input name="due_date" type="date" />
          </div>
          <div className="field">
            <label>Client</label>
            <select name="client_id" defaultValue="">
              <option value="">Unlinked</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Linked document</label>
            <select name="linked_document_id" defaultValue="">
              <option value="">Unlinked</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea name="description" />
          </div>
          <button className="button button-primary" type="submit">
            <Plus size={18} />
            Log Issue
          </button>
        </div>
      </form>
      <section>
        <div className="filters">
          <select value={filters.severity} onChange={(event) => setFilters((current) => ({ ...current, severity: event.target.value }))}>
            <option value="">All severities</option>
            {legalIssueSeverities.map((severity) => (
              <option key={severity}>{severity}</option>
            ))}
          </select>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">All statuses</option>
            {legalIssueStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </div>
        <div className="doc-list">
          {filteredIssues.length === 0 ? (
            <div className="empty-state">No legal issues match the current filters.</div>
          ) : (
            filteredIssues.map((issue) => (
              <article className="doc-card" key={issue.id}>
                <h3>{issue.title}</h3>
                <p>{issue.severity} - {issue.status} - {clientsById[issue.client_id ?? ""]?.name ?? "No client"}</p>
                <div className="form-grid">
                  <div className="field">
                    <label>Status</label>
                    <select value={issue.status} onChange={(event) => updateIssue(issue, { status: event.target.value })}>
                      {legalIssueStatuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Resolution notes</label>
                    <textarea value={issue.resolution_notes ?? ""} onChange={(event) => updateIssue(issue, { resolution_notes: event.target.value })} />
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
