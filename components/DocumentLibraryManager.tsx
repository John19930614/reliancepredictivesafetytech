"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, Inbox, Share2, UploadCloud, X } from "lucide-react";
import {
  documentCategories,
  documentStatuses,
  lifecycleStages,
  recordTypes,
  type CompanyChecklistItem,
  type CompanyClient,
  type CompanyDocument,
  type CompanyDocumentRequirement,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { shareDocument, revokeShare, getSharedDownloadUrl } from "@/app/employee/documents/actions";

type ShareUser = { userId: string; label: string };
type IncomingShare = { id: string; document: CompanyDocument; sharedByLabel: string; note: string | null };
type OutgoingRecipient = { id: string; recipientLabel: string };

type DocumentLibraryManagerProps = {
  initialDocuments: CompanyDocument[];
  checklistItems: CompanyChecklistItem[];
  clients: CompanyClient[];
  requirements: CompanyDocumentRequirement[];
  currentUserId?: string | null;
  users?: ShareUser[];
  incomingShares?: IncomingShare[];
  outgoingByDocument?: Record<string, OutgoingRecipient[]>;
};

export function DocumentLibraryManager({
  initialDocuments,
  checklistItems,
  clients,
  requirements,
  currentUserId = null,
  users = [],
  incomingShares = [],
  outgoingByDocument = {},
}: DocumentLibraryManagerProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [filters, setFilters] = useState({ category: "", status: "", owner: "", recordType: "", lifecycleStage: "", clientId: "", legalHold: "" });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [uploading, setUploading] = useState(false);
  const [sharePanelFor, setSharePanelFor] = useState<string | null>(null);
  const [shareRecipient, setShareRecipient] = useState("");
  const [shareNote, setShareNote] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [sharing, startSharing] = useTransition();
  const sharingEnabled = Boolean(currentUserId);

  function handleShare(documentId: string) {
    if (!shareRecipient) {
      setShareMessage("Pick someone to share with.");
      return;
    }
    setShareMessage("");
    startSharing(async () => {
      const res = await shareDocument(documentId, shareRecipient, shareNote || undefined);
      if (res.ok) {
        setShareMessage("Shared. They'll see it under “Shared with me”.");
        setShareRecipient("");
        setShareNote("");
      } else {
        setShareMessage(res.error ?? "Could not share.");
      }
    });
  }

  function handleRevoke(shareId: string) {
    startSharing(async () => {
      const res = await revokeShare(shareId);
      if (!res.ok) setShareMessage(res.error ?? "Could not revoke.");
    });
  }

  async function downloadShared(documentId: string) {
    const res = await getSharedDownloadUrl(documentId);
    if (res.ok && res.url) {
      window.open(res.url, "_blank", "noopener,noreferrer");
    } else {
      setShareMessage(res.error ?? "Could not open the document.");
    }
  }

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => {
      return (
        (!filters.category || document.category === filters.category) &&
        (!filters.status || document.status === filters.status) &&
        (!filters.owner || (document.owner ?? "").toLowerCase().includes(filters.owner.toLowerCase())) &&
        (!filters.recordType || document.record_type === filters.recordType) &&
        (!filters.lifecycleStage || document.lifecycle_stage === filters.lifecycleStage) &&
        (!filters.clientId || document.client_id === filters.clientId) &&
        (!filters.legalHold || String(Boolean(document.legal_hold)) === filters.legalHold)
      );
    });
  }, [documents, filters]);

  function setStatusMessage(text: string, tone: "success" | "error" = "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setUploading(true);
    setMessage("");

    const formData = new FormData(form);
    const file = formData.get("file");
    const title = String(formData.get("title") ?? "");
    const documentNumber = String(formData.get("document_number") ?? "").trim() || null;
    const category = String(formData.get("category") ?? "");
    const checklistItemId = String(formData.get("checklist_item_id") ?? "") || null;
    const requirementId = String(formData.get("requirement_id") ?? "") || null;
    const clientId = String(formData.get("client_id") ?? "") || null;
    const recordType = String(formData.get("record_type") ?? "Company Record");
    const lifecycleStage = String(formData.get("lifecycle_stage") ?? "") || null;
    const status = String(formData.get("status") ?? "Uploaded");
    const owner = String(formData.get("owner") ?? "");
    const dueNotes = String(formData.get("notes") ?? "");
    const legalHold = formData.get("legal_hold") === "on";

    if (!(file instanceof File) || !file.name) {
      setUploading(false);
      setStatusMessage("Choose a document to upload.", "error");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setUploading(false);
      setStatusMessage("Company data is unavailable right now. Refresh the page, or contact an administrator.", "error");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUploading(false);
      setStatusMessage("Please sign in again before uploading.", "error");
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `${user.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("company-documents").upload(filePath, file);

    if (uploadError) {
      console.error(uploadError);
      setUploading(false);
      setStatusMessage(friendlyError(uploadError, "The file could not be uploaded. Try again."), "error");
      return;
    }

    const payload = {
      title: title || file.name,
      category,
      document_number: documentNumber,
      checklist_item_id: checklistItemId,
      requirement_id: requirementId,
      client_id: clientId,
      record_type: recordType,
      lifecycle_stage: lifecycleStage,
      file_path: filePath,
      file_name: file.name,
      file_type: file.type,
      status,
      owner,
      revision: "1.0",
      notes: dueNotes,
      effective_date: String(formData.get("effective_date") ?? "") || null,
      executed_date: String(formData.get("executed_date") ?? "") || null,
      expiration_date: String(formData.get("expiration_date") ?? "") || null,
      renewal_date: String(formData.get("renewal_date") ?? "") || null,
      legal_hold: legalHold,
      uploaded_by: user.id,
    };

    const { data, error } = await supabase.from("company_documents").insert(payload).select("*").single();

    setUploading(false);

    if (error) {
      console.error(error);
      setStatusMessage(friendlyError(error, "The document could not be registered. Try again."), "error");
      return;
    }

    if (data) {
      setDocuments((current) => [data as CompanyDocument, ...current]);
      setStatusMessage("Document uploaded and registered.");
      form.reset();
    }
  }

  async function updateDocument(document: CompanyDocument, patch: Partial<CompanyDocument>) {
    setDocuments((current) => current.map((item) => (item.id === document.id ? { ...item, ...patch } : item)));
    const supabase = createClient();

    if (!supabase) {
      return;
    }

    await supabase.from("company_documents").update(patch).eq("id", document.id);
  }

  async function downloadDocument(document: CompanyDocument) {
    if (!document.file_path) {
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase.storage.from("company-documents").createSignedUrl(document.file_path, 60);
    if (!error && data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="document-grid">
      <form className="form-panel" onSubmit={handleUpload}>
        <h2>Upload document</h2>
        {message ? (
          messageTone === "error" ? (
            <div className="success-box portal-alert portal-alert-error" role="alert">{message}</div>
          ) : (
            <div className="success-box" role="status">{message}</div>
          )
        ) : null}
        <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" />
          </div>
          <div className="field">
            <label htmlFor="document_number">Document number</label>
            <input id="document_number" name="document_number" placeholder="RPS-LEG-001" />
          </div>
          <div className="field">
            <label htmlFor="record_type">Record type</label>
            <select id="record_type" name="record_type" defaultValue="Company Record">
              {recordTypes.map((recordType) => (
                <option key={recordType}>{recordType}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" name="category" required>
              {documentCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lifecycle_stage">Lifecycle stage</label>
            <select id="lifecycle_stage" name="lifecycle_stage" defaultValue="">
              <option value="">None</option>
              {lifecycleStages.map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="client_id">Client</label>
            <select id="client_id" name="client_id" defaultValue="">
              <option value="">Unlinked</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="requirement_id">Requirement</label>
            <select id="requirement_id" name="requirement_id" defaultValue="">
              <option value="">Unlinked</option>
              {requirements.map((requirement) => (
                <option key={requirement.id} value={requirement.id}>
                  {requirement.lifecycle_stage}: {requirement.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="checklist_item_id">Checklist item</label>
            <select id="checklist_item_id" name="checklist_item_id" defaultValue="">
              <option value="">Unlinked</option>
              {checklistItems.map((item) => (
                <option disabled={!item.id} key={item.id ?? item.title} value={item.id ?? ""}>
                  {item.section}: {item.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue="Uploaded">
              {documentStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="owner">Owner</label>
            <input id="owner" name="owner" />
          </div>
          <div className="field">
            <label htmlFor="effective_date">Effective date</label>
            <input id="effective_date" name="effective_date" type="date" />
          </div>
          <div className="field">
            <label htmlFor="executed_date">Executed date</label>
            <input id="executed_date" name="executed_date" type="date" />
          </div>
          <div className="field">
            <label htmlFor="expiration_date">Expiration date</label>
            <input id="expiration_date" name="expiration_date" type="date" />
          </div>
          <div className="field">
            <label htmlFor="renewal_date">Renewal date</label>
            <input id="renewal_date" name="renewal_date" type="date" />
          </div>
          <label className="checkbox-pill">
            <input name="legal_hold" type="checkbox" />
            Legal hold
          </label>
          <div className="field">
            <label htmlFor="file">File</label>
            <input id="file" name="file" required type="file" />
          </div>
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" />
          </div>
          <button className="button button-primary" disabled={uploading} type="submit">
            <UploadCloud size={18} />
            {uploading ? "Uploading…" : "Upload Document"}
          </button>
        </div>
      </form>

      <section>
        {sharingEnabled && incomingShares.length > 0 ? (
          <div className="doc-card" style={{ marginBottom: 16 }}>
            <h3 style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <Inbox size={18} /> Shared with me
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {incomingShares.map((share) => (
                <div key={share.id} className="portal-topline" style={{ alignItems: "center" }}>
                  <div>
                    <strong>{share.document.title}</strong>
                    <p style={{ margin: 0, color: "var(--portal-muted)", fontSize: "0.82rem" }}>
                      From {share.sharedByLabel}
                      {share.note ? ` — “${share.note}”` : ""}
                    </p>
                  </div>
                  <button className="button button-light" type="button" onClick={() => downloadShared(share.document.id)}>
                    <Download size={16} /> View
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {shareMessage ? <div className="success-box" style={{ marginBottom: 12 }}>{shareMessage}</div> : null}

        <div className="filters">
          <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
            <option value="">All categories</option>
            {documentCategories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">All statuses</option>
            {documentStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <input
            placeholder="Filter owner"
            value={filters.owner}
            onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))}
          />
          <select value={filters.recordType} onChange={(event) => setFilters((current) => ({ ...current, recordType: event.target.value }))}>
            <option value="">All record types</option>
            {recordTypes.map((recordType) => (
              <option key={recordType}>{recordType}</option>
            ))}
          </select>
          <select value={filters.lifecycleStage} onChange={(event) => setFilters((current) => ({ ...current, lifecycleStage: event.target.value }))}>
            <option value="">All stages</option>
            {lifecycleStages.map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
          <select value={filters.clientId} onChange={(event) => setFilters((current) => ({ ...current, clientId: event.target.value }))}>
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <select value={filters.legalHold} onChange={(event) => setFilters((current) => ({ ...current, legalHold: event.target.value }))}>
            <option value="">Any legal hold</option>
            <option value="true">Legal hold only</option>
            <option value="false">No legal hold</option>
          </select>
        </div>

        <div className="doc-list">
          {filteredDocuments.length === 0 ? (
            <div className="empty-state">No documents match the current filters.</div>
          ) : (
            filteredDocuments.map((document) => (
              <article className="doc-card" key={document.id}>
                <div className="portal-topline" style={{ marginBottom: 12 }}>
                  <div>
                    <h3>{document.title}</h3>
                    <p>{document.document_number ? `Document # ${document.document_number}` : "No document number"}</p>
                    <p>{document.record_type ?? "Company Record"} - {document.category} - {document.lifecycle_stage ?? "No stage"}</p>
                    <p>{document.legal_hold ? "Legal hold active" : "No legal hold"} - Expires {document.expiration_date ?? "TBD"}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="button button-light" onClick={() => downloadDocument(document)} type="button">
                      <Download size={16} />
                      View
                    </button>
                    {sharingEnabled ? (
                      <button
                        className="button button-light"
                        type="button"
                        onClick={() => {
                          setSharePanelFor((current) => (current === document.id ? null : document.id));
                          setShareRecipient("");
                          setShareNote("");
                          setShareMessage("");
                        }}
                      >
                        <Share2 size={16} />
                        Share
                      </button>
                    ) : null}
                  </div>
                </div>

                {sharingEnabled && sharePanelFor === document.id ? (
                  <div className="doc-card" style={{ margin: "0 0 12px", background: "color-mix(in srgb, var(--portal-gold) 6%, transparent)" }}>
                    <div className="portal-topline" style={{ marginBottom: 8 }}>
                      <strong>Share “{document.title}” with a teammate</strong>
                      <button className="button button-light" type="button" onClick={() => setSharePanelFor(null)} aria-label="Close">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
                      <div className="field">
                        <label>Recipient</label>
                        <select value={shareRecipient} onChange={(event) => setShareRecipient(event.target.value)}>
                          <option value="">Select a teammate…</option>
                          {users.map((u) => (
                            <option key={u.userId} value={u.userId}>{u.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Note (optional)</label>
                        <input value={shareNote} onChange={(event) => setShareNote(event.target.value)} placeholder="e.g. Please review section 3" />
                      </div>
                      <button className="button button-primary" type="button" disabled={sharing} style={{ justifySelf: "start" }} onClick={() => handleShare(document.id)}>
                        <Share2 size={16} /> {sharing ? "Sharing…" : "Share"}
                      </button>
                    </div>
                    {(outgoingByDocument[document.id] ?? []).length > 0 ? (
                      <div style={{ marginTop: 12 }}>
                        <label style={{ fontSize: "0.78rem", color: "var(--portal-muted)" }}>Shared with</label>
                        {(outgoingByDocument[document.id] ?? []).map((recipient) => (
                          <div key={recipient.id} className="portal-topline" style={{ alignItems: "center", marginTop: 4 }}>
                            <span>{recipient.recipientLabel}</span>
                            <button className="button button-light" type="button" disabled={sharing} onClick={() => handleRevoke(recipient.id)}>
                              Revoke
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="form-grid">
                  <div className="field">
                    <label>Document number</label>
                    <input
                      value={document.document_number ?? ""}
                      onChange={(event) => updateDocument(document, { document_number: event.target.value || null })}
                    />
                  </div>
                  <div className="field">
                    <label>Record type</label>
                    <select
                      value={document.record_type ?? "Company Record"}
                      onChange={(event) => updateDocument(document, { record_type: event.target.value })}
                    >
                      {recordTypes.map((recordType) => (
                        <option key={recordType}>{recordType}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Lifecycle stage</label>
                    <select
                      value={document.lifecycle_stage ?? ""}
                      onChange={(event) => updateDocument(document, { lifecycle_stage: event.target.value || null })}
                    >
                      <option value="">None</option>
                      {lifecycleStages.map((stage) => (
                        <option key={stage}>{stage}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Client</label>
                    <select
                      value={document.client_id ?? ""}
                      onChange={(event) => updateDocument(document, { client_id: event.target.value || null })}
                    >
                      <option value="">Unlinked</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select
                      value={document.status ?? "Uploaded"}
                      onChange={(event) => updateDocument(document, { status: event.target.value })}
                    >
                      {documentStatuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Owner</label>
                    <input
                      value={document.owner ?? ""}
                      onChange={(event) => updateDocument(document, { owner: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Revision</label>
                    <input
                      value={document.revision ?? ""}
                      onChange={(event) => updateDocument(document, { revision: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>File name</label>
                    <input disabled value={document.file_name ?? ""} />
                  </div>
                  <label className="checkbox-pill">
                    <input
                      checked={Boolean(document.legal_hold)}
                      onChange={(event) => updateDocument(document, { legal_hold: event.target.checked })}
                      type="checkbox"
                    />
                    Legal hold
                  </label>
                  <div className="field-full">
                    <label>Notes</label>
                    <textarea
                      value={document.notes ?? ""}
                      onChange={(event) => updateDocument(document, { notes: event.target.value })}
                    />
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
