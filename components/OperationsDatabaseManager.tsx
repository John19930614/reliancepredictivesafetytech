"use client";

import { useMemo, useState } from "react";
import { Database, Save } from "lucide-react";
import {
  operationsRecordCategories,
  operationsRecordPriorities,
  operationsRecordStatuses,
  type CompanyClient,
  type CompanyDocument,
  type CompanyOperationsRecord,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type OperationsDatabaseManagerProps = {
  initialRecords: CompanyOperationsRecord[];
  clients: CompanyClient[];
  documents: CompanyDocument[];
};

type OperationsRecordPatch = Partial<
  Pick<
    CompanyOperationsRecord,
    | "title"
    | "category"
    | "record_type"
    | "status"
    | "priority"
    | "owner"
    | "due_date"
    | "description"
    | "notes"
    | "related_client_id"
    | "related_document_id"
  >
>;

function cleanOptional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function OperationsDatabaseManager({ initialRecords, clients, documents }: OperationsDatabaseManagerProps) {
  const [records, setRecords] = useState(initialRecords);
  const [filters, setFilters] = useState({ category: "", status: "", search: "" });
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const filteredRecords = useMemo(() => {
    const search = filters.search.toLowerCase();

    return records.filter((record) => {
      const text = `${record.title} ${record.owner ?? ""} ${record.description ?? ""} ${record.notes ?? ""}`.toLowerCase();

      return (
        (!filters.category || record.category === filters.category) &&
        (!filters.status || record.status === filters.status) &&
        (!search || text.includes(search))
      );
    });
  }, [filters, records]);

  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);
  const documentsById = useMemo(() => new Map(documents.map((document) => [document.id, document.title])), [documents]);

  async function createRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      title: String(formData.get("title") ?? "").trim(),
      category: String(formData.get("category") ?? "Operations"),
      record_type: String(formData.get("record_type") ?? "General").trim() || "General",
      status: String(formData.get("status") ?? "Open"),
      priority: String(formData.get("priority") ?? "Medium"),
      owner: cleanOptional(formData.get("owner")),
      due_date: cleanOptional(formData.get("due_date")),
      description: cleanOptional(formData.get("description")),
      notes: cleanOptional(formData.get("notes")),
      related_client_id: cleanOptional(formData.get("related_client_id")),
      related_document_id: cleanOptional(formData.get("related_document_id")),
    };

    if (!payload.title) {
      setCreating(false);
      setMessage("Add a title before saving the record.");
      return;
    }

    const supabase = createClient();

    if (!supabase) {
      setCreating(false);
      setMessage("Supabase is required for the operations database.");
      return;
    }

    const { data, error } = await supabase.from("company_operations_records").insert(payload).select("*").single();
    setCreating(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (data) {
      setRecords((current) => [data as CompanyOperationsRecord, ...current]);
      setMessage("Operations record added.");
      event.currentTarget.reset();
    }
  }

  async function updateRecord(record: CompanyOperationsRecord, patch: OperationsRecordPatch) {
    setRecords((current) => current.map((item) => (item.id === record.id ? { ...item, ...patch } : item)));
    setSavingId(record.id);

    const supabase = createClient();
    if (supabase) {
      await supabase.from("company_operations_records").update(patch).eq("id", record.id);
    }

    setSavingId(null);
  }

  return (
    <div className="operations-layout">
      <form className="form-panel" onSubmit={createRecord}>
        <h2>Add operations record</h2>
        {message ? <div className="success-box portal-alert">{message}</div> : null}
        <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" required />
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" name="category" defaultValue="Operations">
              {operationsRecordCategories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="record_type">Record type</label>
            <input id="record_type" name="record_type" placeholder="Task, SOP, vendor, asset, risk..." />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue="Open">
                {operationsRecordStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="priority">Priority</label>
              <select id="priority" name="priority" defaultValue="Medium">
                {operationsRecordPriorities.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="owner">Owner</label>
            <input id="owner" name="owner" />
          </div>
          <div className="field">
            <label htmlFor="due_date">Due date</label>
            <input id="due_date" name="due_date" type="date" />
          </div>
          <div className="field">
            <label htmlFor="related_client_id">Related client</label>
            <select id="related_client_id" name="related_client_id" defaultValue="">
              <option value="">None</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="related_document_id">Related document</label>
            <select id="related_document_id" name="related_document_id" defaultValue="">
              <option value="">None</option>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" />
          </div>
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" />
          </div>
          <button className="button button-primary" disabled={creating} type="submit">
            <Database size={18} />
            {creating ? "Adding..." : "Add Record"}
          </button>
        </div>
      </form>

      <section>
        <div className="filters">
          <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
            <option value="">All categories</option>
            {operationsRecordCategories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">All statuses</option>
            {operationsRecordStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <input
            placeholder="Search records"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </div>

        <div className="doc-list">
          {filteredRecords.length === 0 ? (
            <div className="empty-state">No operations records match the current filters.</div>
          ) : (
            filteredRecords.map((record) => (
              <article className="doc-card" key={record.id}>
                <div className="portal-topline" style={{ marginBottom: 12 }}>
                  <div>
                    <h3>{record.title}</h3>
                    <p>
                      {record.category} - {record.record_type}
                    </p>
                  </div>
                  <span className="badge">
                    <Save size={14} /> {savingId === record.id ? "Saving" : record.status}
                  </span>
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label>Status</label>
                    <select value={record.status} onChange={(event) => updateRecord(record, { status: event.target.value })}>
                      {operationsRecordStatuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Priority</label>
                    <select value={record.priority} onChange={(event) => updateRecord(record, { priority: event.target.value })}>
                      {operationsRecordPriorities.map((priority) => (
                        <option key={priority}>{priority}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Owner</label>
                    <input value={record.owner ?? ""} onChange={(event) => updateRecord(record, { owner: event.target.value || null })} />
                  </div>
                  <div className="field">
                    <label>Due date</label>
                    <input type="date" value={record.due_date ?? ""} onChange={(event) => updateRecord(record, { due_date: event.target.value || null })} />
                  </div>
                  <div className="field">
                    <label>Related client</label>
                    <select value={record.related_client_id ?? ""} onChange={(event) => updateRecord(record, { related_client_id: event.target.value || null })}>
                      <option value="">None</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                    {record.related_client_id ? <p>{clientsById.get(record.related_client_id) ?? "Linked client"}</p> : null}
                  </div>
                  <div className="field">
                    <label>Related document</label>
                    <select value={record.related_document_id ?? ""} onChange={(event) => updateRecord(record, { related_document_id: event.target.value || null })}>
                      <option value="">None</option>
                      {documents.map((document) => (
                        <option key={document.id} value={document.id}>
                          {document.title}
                        </option>
                      ))}
                    </select>
                    {record.related_document_id ? <p>{documentsById.get(record.related_document_id) ?? "Linked document"}</p> : null}
                  </div>
                  <div className="field-full">
                    <label>Description</label>
                    <textarea value={record.description ?? ""} onChange={(event) => updateRecord(record, { description: event.target.value || null })} />
                  </div>
                  <div className="field-full">
                    <label>Notes</label>
                    <textarea value={record.notes ?? ""} onChange={(event) => updateRecord(record, { notes: event.target.value || null })} />
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
