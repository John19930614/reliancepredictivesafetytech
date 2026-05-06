"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileUp, UploadCloud } from "lucide-react";
import { requiredDocuments, type CompanyDocument } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type RequiredDocumentUploadManagerProps = {
  initialDocuments: CompanyDocument[];
};

const categoryOverrides: Record<string, string> = {
  Compliance: "Compliance / Certifications",
  Sales: "Sales / Marketing",
};

function categoryForSection(section: string) {
  return categoryOverrides[section] ?? section;
}

function documentKey(title: string, category: string) {
  return `${category.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
}

function fieldId(key: string) {
  return key.replace(/[^a-z0-9_-]+/g, "-");
}

function uploadErrorMessage(message: string) {
  if (message.toLowerCase().includes("company_documents_document_number_unique_idx")) {
    return "That document number is already in use. Choose a unique corporate document number.";
  }

  return message;
}

export function RequiredDocumentUploadManager({ initialDocuments }: RequiredDocumentUploadManagerProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const documentsByRequiredItem = useMemo(() => {
    const map = new Map<string, CompanyDocument>();

    for (const document of documents) {
      const key = documentKey(document.title, document.category);
      if (!map.has(key)) {
        map.set(key, document);
      }
    }

    return map;
  }, [documents]);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>, title: string, category: string, currentDocument?: CompanyDocument) {
    event.preventDefault();
    const form = event.currentTarget;
    const key = documentKey(title, category);
    const formData = new FormData(form);
    const file = formData.get("file");
    const documentNumber = String(formData.get("document_number") ?? "").trim() || null;
    const owner = String(formData.get("owner") ?? "").trim();
    const revision = String(formData.get("revision") ?? "").trim() || "1.0";
    const status = String(formData.get("status") ?? "").trim() || "Uploaded";
    const notes = String(formData.get("notes") ?? "").trim();

    setMessages((current) => ({ ...current, [key]: "" }));

    if (!(file instanceof File) || !file.name) {
      setMessages((current) => ({ ...current, [key]: "Choose the needed document before uploading." }));
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setMessages((current) => ({ ...current, [key]: "Supabase is required for document uploads." }));
      return;
    }

    setPendingKey(key);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setPendingKey(null);
      setMessages((current) => ({ ...current, [key]: "Please sign in again before uploading." }));
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `${user.id}/required-documents/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("company-documents").upload(filePath, file);

    if (uploadError) {
      setPendingKey(null);
      setMessages((current) => ({ ...current, [key]: uploadError.message }));
      return;
    }

    const payload = {
      title,
      category,
      document_number: documentNumber,
      record_type: "Company Record",
      file_path: filePath,
      file_name: file.name,
      file_type: file.type,
      status,
      owner,
      revision,
      notes,
      uploaded_by: user.id,
    };

    const query = currentDocument
      ? supabase.from("company_documents").update(payload).eq("id", currentDocument.id)
      : supabase.from("company_documents").insert(payload);

    const { data, error } = await query.select("*").single();
    setPendingKey(null);

    if (error) {
      setMessages((current) => ({ ...current, [key]: uploadErrorMessage(error.message) }));
      return;
    }

    if (data) {
      const nextDocument = data as CompanyDocument;
      setDocuments((current) =>
        currentDocument
          ? current.map((document) => (document.id === currentDocument.id ? nextDocument : document))
          : [nextDocument, ...current],
      );
      setMessages((current) => ({
        ...current,
        [key]: currentDocument ? "Document file and control details updated." : "Document uploaded and registered.",
      }));
      form.reset();
    }
  }

  return (
    <div className="required-documents-grid">
      {requiredDocuments.map((group) => {
        const Icon = group.icon;
        const category = categoryForSection(group.section);

        return (
          <section className="doc-card required-document-folder" key={group.section}>
            <div className="required-document-folder-header">
              <Icon color="#c9932b" size={26} />
              <div>
                <h3>{group.section}</h3>
                <p>Folder: {category}</p>
              </div>
            </div>

            <div className="required-document-list">
              {group.items.map((item) => {
                const key = documentKey(item, category);
                const id = fieldId(key);
                const document = documentsByRequiredItem.get(key);
                const isPending = pendingKey === key;

                return (
                  <article className="required-document-row" key={item}>
                    <div className="required-document-status">
                      {document?.file_path ? <CheckCircle2 color="#22863a" size={20} /> : <FileUp color="#c9932b" size={20} />}
                      <div>
                        <h4>{item}</h4>
                        <p>
                          {document?.status ?? "Needed"} - {document?.file_name ?? "No file uploaded"} - Revision{" "}
                          {document?.revision ?? "1.0"}
                        </p>
                        <p>{document?.document_number ? `Document # ${document.document_number}` : "Document number not set"}</p>
                      </div>
                    </div>

                    {messages[key] ? <div className="success-box required-document-message">{messages[key]}</div> : null}

                    <form
                      className="required-document-upload-form"
                      key={`${document?.id ?? "new"}-${document?.updated_at ?? "pending"}`}
                      onSubmit={(event) => handleUpload(event, item, category, document)}
                    >
                      <div className="form-grid">
                        <div className="field">
                          <label htmlFor={`document-number-${id}`}>Document number</label>
                          <input
                            id={`document-number-${id}`}
                            name="document_number"
                            defaultValue={document?.document_number ?? ""}
                            placeholder="RPS-LEG-001"
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`owner-${id}`}>Owner</label>
                          <input id={`owner-${id}`} name="owner" defaultValue={document?.owner ?? ""} />
                        </div>
                        <div className="field">
                          <label htmlFor={`revision-${id}`}>Revision</label>
                          <input id={`revision-${id}`} name="revision" defaultValue={document?.revision ?? "1.0"} />
                        </div>
                        <div className="field">
                          <label htmlFor={`status-${id}`}>Status</label>
                          <select id={`status-${id}`} name="status" defaultValue={document?.status ?? "Uploaded"}>
                            <option>Uploaded</option>
                            <option>Draft</option>
                            <option>In Review</option>
                            <option>Approved</option>
                            <option>Signed / Executed</option>
                            <option>Needs Revision</option>
                          </select>
                        </div>
                        <div className="field-full">
                          <label htmlFor={`file-${id}`}>Needed document</label>
                          <input id={`file-${id}`} name="file" required type="file" />
                        </div>
                        <div className="field-full">
                          <label htmlFor={`notes-${id}`}>Notes</label>
                          <textarea id={`notes-${id}`} name="notes" defaultValue={document?.notes ?? ""} />
                        </div>
                      </div>
                      <button className="button button-primary" disabled={isPending} type="submit">
                        <UploadCloud size={18} />
                        {isPending ? "Uploading..." : document ? "Replace File" : "Upload Document"}
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
