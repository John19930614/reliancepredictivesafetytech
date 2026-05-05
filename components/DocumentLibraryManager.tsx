"use client";

import { useMemo, useState } from "react";
import { Download, UploadCloud } from "lucide-react";
import {
  documentCategories,
  documentStatuses,
  type CompanyChecklistItem,
  type CompanyDocument,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type DocumentLibraryManagerProps = {
  initialDocuments: CompanyDocument[];
  checklistItems: CompanyChecklistItem[];
};

export function DocumentLibraryManager({ initialDocuments, checklistItems }: DocumentLibraryManagerProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [filters, setFilters] = useState({ category: "", status: "", owner: "" });
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => {
      return (
        (!filters.category || document.category === filters.category) &&
        (!filters.status || document.status === filters.status) &&
        (!filters.owner || (document.owner ?? "").toLowerCase().includes(filters.owner.toLowerCase()))
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
    const status = String(formData.get("status") ?? "Uploaded");
    const owner = String(formData.get("owner") ?? "");
    const dueNotes = String(formData.get("notes") ?? "");

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
      file_path: filePath,
      file_name: file.name,
      file_type: file.type,
      status,
      owner,
      revision: "1.0",
      notes: dueNotes,
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
            <label htmlFor="category">Category</label>
            <select id="category" name="category" required>
              {documentCategories.map((category) => (
                <option key={category}>{category}</option>
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
                    <p>{document.category}</p>
                  </div>
                  <button className="button button-light" onClick={() => downloadDocument(document)} type="button">
                    <Download size={16} />
                    View
                  </button>
                </div>
                <div className="form-grid">
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
