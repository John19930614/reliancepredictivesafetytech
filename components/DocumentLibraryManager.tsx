"use client";

import { useMemo, useState } from "react";
import { Download, UploadCloud } from "lucide-react";
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

type DocumentLibraryManagerProps = {
  initialDocuments: CompanyDocument[];
  checklistItems: CompanyChecklistItem[];
  clients: CompanyClient[];
  requirements: CompanyDocumentRequirement[];
};

export function DocumentLibraryManager({ initialDocuments, checklistItems, clients, requirements }: DocumentLibraryManagerProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [filters, setFilters] = useState({ category: "", status: "", owner: "", recordType: "", lifecycleStage: "", clientId: "", legalHold: "" });
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

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

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    const title = String(formData.get("title") ?? "");
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
      setMessage("Choose a document to upload.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setUploading(false);
      setMessage("Supabase is required for employee document uploads.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUploading(false);
      setMessage("Please sign in again before uploading.");
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `${user.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("company-documents").upload(filePath, file);

    if (uploadError) {
      setUploading(false);
      setMessage(uploadError.message);
      return;
    }

    const payload = {
      title: title || file.name,
      category,
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
      setMessage(error.message);
      return;
    }

    if (data) {
      setDocuments((current) => [data as CompanyDocument, ...current]);
      setMessage("Document uploaded and registered.");
      event.currentTarget.reset();
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
        {message ? <div className="success-box">{message}</div> : null}
        <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" />
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
            {uploading ? "Uploading..." : "Upload Document"}
          </button>
        </div>
      </form>

      <section>
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
                    <p>{document.record_type ?? "Company Record"} - {document.category} - {document.lifecycle_stage ?? "No stage"}</p>
                    <p>{document.legal_hold ? "Legal hold active" : "No legal hold"} - Expires {document.expiration_date ?? "TBD"}</p>
                  </div>
                  <button className="button button-light" onClick={() => downloadDocument(document)} type="button">
                    <Download size={16} />
                    View
                  </button>
                </div>
                <div className="form-grid">
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
