"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Save, Trash2, XCircle } from "lucide-react";
import {
  operationsRecordCategories,
  operationsRecordPriorities,
  operationsRecordStatuses,
  operationsRecordTypes,
  type CompanyClient,
  type CompanyDocument,
  type CompanyOperationsRecord,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/friendly-error";

type OperationsDatabaseManagerProps = {
  initialRecords: CompanyOperationsRecord[];
  clients: CompanyClient[];
  documents: CompanyDocument[];
  ownerOptions?: string[];
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

type OperationsFilters = {
  category: string;
  status: string;
  priority: string;
  owner: string;
  dueStatus: string;
  search: string;
};

const activeStatusFilter = "__active";
const closedStatuses = ["Archived", "Complete"];

function cleanOptional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function dueStatus(record: Pick<CompanyOperationsRecord, "due_date" | "status">) {
  if (isClosedRecord(record)) return "closed";
  if (!record.due_date) return "no_due";
  const today = todayIsoDate();
  if (record.due_date < today) return "overdue";
  const dueSoon = new Date(`${today}T12:00:00`);
  dueSoon.setDate(dueSoon.getDate() + 7);
  return record.due_date <= dueSoon.toISOString().slice(0, 10) ? "due_soon" : "scheduled";
}

function dueStatusLabel(status: string) {
  return status.replace("_", " ");
}

function isClosedRecord(record: Pick<CompanyOperationsRecord, "status">) {
  return closedStatuses.includes(record.status);
}

export function OperationsDatabaseManager({ initialRecords, clients, documents, ownerOptions = [] }: OperationsDatabaseManagerProps) {
  const [records, setRecords] = useState(initialRecords);
  const [drafts, setDrafts] = useState<Record<string, OperationsRecordPatch>>({});
  const [filters, setFilters] = useState<OperationsFilters>({
    category: "",
    status: activeStatusFilter,
    priority: "",
    owner: "",
    dueStatus: "",
    search: "",
  });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const filteredRecords = useMemo(() => {
    const search = filters.search.toLowerCase();

    return records.filter((record) => {
      const view = { ...record, ...(drafts[record.id] ?? {}) };
      const text = `${view.title} ${view.owner ?? ""} ${view.description ?? ""} ${view.notes ?? ""}`.toLowerCase();

      return (
        (!filters.category || view.category === filters.category) &&
        (filters.status === activeStatusFilter ? !isClosedRecord(view) : !filters.status || view.status === filters.status) &&
        (!filters.priority || view.priority === filters.priority) &&
        (!filters.owner || (filters.owner === "unassigned" ? !view.owner : view.owner === filters.owner)) &&
        (!filters.dueStatus || dueStatus(view) === filters.dueStatus) &&
        (!search || text.includes(search))
      );
    });
  }, [drafts, filters, records]);

  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);
  const documentsById = useMemo(() => new Map(documents.map((document) => [document.id, document.title])), [documents]);
  const recordTypeOptions = useMemo(() => {
    const knownTypes = new Set<string>(operationsRecordTypes);
    const extraTypes = new Set<string>();

    records.forEach((record) => {
      const recordType = (drafts[record.id]?.record_type ?? record.record_type)?.trim();
      if (recordType && !knownTypes.has(recordType)) extraTypes.add(recordType);
    });

    return [...operationsRecordTypes, ...[...extraTypes].sort((first, second) => first.localeCompare(second))];
  }, [drafts, records]);
  const ownerSelectOptions = useMemo(() => {
    const owners = new Set<string>();
    ownerOptions.forEach((owner) => {
      const trimmedOwner = owner.trim();
      if (trimmedOwner) owners.add(trimmedOwner);
    });
    clients.forEach((client) => {
      const owner = client.owner?.trim();
      if (owner) owners.add(owner);
    });
    documents.forEach((document) => {
      const owner = document.owner?.trim();
      if (owner) owners.add(owner);
    });
    records.forEach((record) => {
      const owner = (drafts[record.id]?.owner ?? record.owner)?.trim();
      if (owner) owners.add(owner);
    });
    return [...owners].sort((first, second) => first.localeCompare(second));
  }, [clients, documents, drafts, ownerOptions, records]);

  function viewRecord(record: CompanyOperationsRecord) {
    return { ...record, ...(drafts[record.id] ?? {}) };
  }

  function setStatusMessage(text: string, tone: "success" | "error" = "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  function updateDraft(recordId: string, patch: OperationsRecordPatch) {
    setDrafts((current) => ({
      ...current,
      [recordId]: { ...(current[recordId] ?? {}), ...patch },
    }));
  }

  function cancelDraft(recordId: string) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[recordId];
      return next;
    });
    setStatusMessage("Draft changes canceled.");
  }

  function recordBadges(record: CompanyOperationsRecord) {
    const view = viewRecord(record);
    const badges = [
      { label: view.priority, tone: view.priority === "Critical" ? "danger" : view.priority === "High" ? "gold" : "neutral" },
      { label: view.status, tone: view.status === "Archived" ? "neutral" : view.status === "Waiting" ? "gold" : "default" },
    ];
    const due = dueStatus(view);
    if (due === "overdue") badges.push({ label: "Overdue", tone: "danger" });
    if (due === "due_soon") badges.push({ label: "Due soon", tone: "gold" });
    if (due === "no_due") badges.push({ label: "No due date", tone: "neutral" });
    if (!view.owner) badges.push({ label: "No owner", tone: "neutral" });
    if (drafts[record.id]) badges.push({ label: "Unsaved", tone: "gold" });
    return badges;
  }

  async function createRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setCreating(true);
    setMessage("");

    const formData = new FormData(form);
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
      setStatusMessage("Add a title before saving the record.", "error");
      return;
    }

    const supabase = createClient();

    if (!supabase) {
      setCreating(false);
      setStatusMessage("Company data is unavailable right now. Refresh the page, or contact an administrator.", "error");
      return;
    }

    const { data, error } = await supabase.from("company_operations_records").insert(payload).select("*").single();
    setCreating(false);

    if (error) {
      console.error(error);
      setStatusMessage(friendlyError(error, "The operations record could not be added."), "error");
      return;
    }

    if (data) {
      setRecords((current) => [data as CompanyOperationsRecord, ...current]);
      setStatusMessage("Operations record added.");
      form.reset();
    }
  }

  async function saveRecord(record: CompanyOperationsRecord, quickPatch?: OperationsRecordPatch) {
    const patch = quickPatch ? { ...(drafts[record.id] ?? {}), ...quickPatch } : drafts[record.id];
    if (!patch) {
      setStatusMessage("No changes to save.");
      return;
    }

    setSavingId(record.id);
    setMessage("");

    const supabase = createClient();
    if (!supabase) {
      setSavingId(null);
      setStatusMessage("Company data is unavailable right now. Refresh the page, or contact an administrator.", "error");
      return;
    }

    const { data, error } = await supabase
      .from("company_operations_records")
      .update(patch)
      .eq("id", record.id)
      .select("*")
      .single();

    setSavingId(null);

    if (error) {
      console.error(error);
      setStatusMessage(friendlyError(error, "The operations record could not be saved."), "error");
      return;
    }

    if (data) {
      setRecords((current) => current.map((item) => (item.id === record.id ? (data as CompanyOperationsRecord) : item)));
      setDrafts((current) => {
        const next = { ...current };
        delete next[record.id];
        return next;
      });
      setStatusMessage(isClosedRecord(data as CompanyOperationsRecord) ? "Operations record closed and removed from active records." : "Operations record saved.");
    }
  }

  async function deleteRecord(record: CompanyOperationsRecord) {
    if (!window.confirm(`Remove "${record.title}" from operations records?`)) return;

    setDeletingId(record.id);
    setMessage("");

    const supabase = createClient();
    if (!supabase) {
      setDeletingId(null);
      setStatusMessage("Company data is unavailable right now. Refresh the page, or contact an administrator.", "error");
      return;
    }

    const { error } = await supabase.from("company_operations_records").delete().eq("id", record.id);
    setDeletingId(null);

    if (error) {
      console.error(error);
      setStatusMessage(friendlyError(error, "The operations record could not be removed."), "error");
      return;
    }

    setRecords((current) => current.filter((item) => item.id !== record.id));
    setDrafts((current) => {
      const next = { ...current };
      delete next[record.id];
      return next;
    });
    setStatusMessage("Operations record removed.");
  }

  return (
    <div className="operations-layout">
      <form className="form-panel" onSubmit={createRecord}>
        <h2>Add operations record</h2>
        {message ? <div className={`success-box portal-alert ${messageTone === "error" ? "portal-alert-error" : ""}`}>{message}</div> : null}
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
            <select id="record_type" name="record_type" defaultValue="General">
              {recordTypeOptions.map((recordType) => (
                <option key={recordType}>{recordType}</option>
              ))}
            </select>
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
            <select id="owner" name="owner" defaultValue="">
              <option value="">Unassigned</option>
              {ownerSelectOptions.map((owner) => (
                <option key={owner}>{owner}</option>
              ))}
            </select>
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
            {creating ? "Adding…" : "Add Record"}
          </button>
        </div>
      </form>

      <section>
        <div className="filters operations-filters">
          <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
            <option value="">All categories</option>
            {operationsRecordCategories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value={activeStatusFilter}>Active records</option>
            <option value="">All statuses</option>
            {operationsRecordStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}>
            <option value="">All priorities</option>
            {operationsRecordPriorities.map((priority) => (
              <option key={priority}>{priority}</option>
            ))}
          </select>
          <select value={filters.owner} onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))}>
            <option value="">All owners</option>
            <option value="unassigned">No owner</option>
            {ownerSelectOptions.map((owner) => (
              <option key={owner}>{owner}</option>
            ))}
          </select>
          <select value={filters.dueStatus} onChange={(event) => setFilters((current) => ({ ...current, dueStatus: event.target.value }))}>
            <option value="">All due states</option>
            {["overdue", "due_soon", "scheduled", "no_due", "closed"].map((status) => (
              <option key={status} value={status}>
                {dueStatusLabel(status)}
              </option>
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
            filteredRecords.map((record) => {
              const draftRecord = viewRecord(record);
              const dirty = Boolean(drafts[record.id]);

              return (
                <article className="doc-card operations-record-card" key={record.id}>
                  <div className="portal-topline" style={{ marginBottom: 12 }}>
                    <div>
                      <h3>{draftRecord.title}</h3>
                      <p>
                        {draftRecord.category} - {draftRecord.record_type}
                      </p>
                      <div className="record-badge-row">
                        {recordBadges(record).map((badge) => (
                          <span className={`record-badge record-badge-${badge.tone}`} key={`${record.id}-${badge.label}`}>
                            {badge.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="badge">
                      <Save size={14} /> {savingId === record.id ? "Saving" : dirty ? "Draft" : "Saved"}
                    </span>
                  </div>
                <div className="form-grid">
                  <div className="field">
                    <label>Category</label>
                    <select value={draftRecord.category} onChange={(event) => updateDraft(record.id, { category: event.target.value })}>
                      {operationsRecordCategories.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Record type</label>
                    <select value={draftRecord.record_type} onChange={(event) => updateDraft(record.id, { record_type: event.target.value })}>
                      {recordTypeOptions.map((recordType) => (
                        <option key={recordType}>{recordType}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select value={draftRecord.status} onChange={(event) => updateDraft(record.id, { status: event.target.value })}>
                      {operationsRecordStatuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Priority</label>
                    <select value={draftRecord.priority} onChange={(event) => updateDraft(record.id, { priority: event.target.value })}>
                      {operationsRecordPriorities.map((priority) => (
                        <option key={priority}>{priority}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Owner</label>
                    <select value={draftRecord.owner ?? ""} onChange={(event) => updateDraft(record.id, { owner: event.target.value || null })}>
                      <option value="">Unassigned</option>
                      {ownerSelectOptions.map((owner) => (
                        <option key={owner}>{owner}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Due date</label>
                    <input type="date" value={draftRecord.due_date ?? ""} onChange={(event) => updateDraft(record.id, { due_date: event.target.value || null })} />
                  </div>
                  <div className="field">
                    <label>Related client</label>
                    <select value={draftRecord.related_client_id ?? ""} onChange={(event) => updateDraft(record.id, { related_client_id: event.target.value || null })}>
                      <option value="">None</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                    {draftRecord.related_client_id ? <p>{clientsById.get(draftRecord.related_client_id) ?? "Linked client"}</p> : null}
                  </div>
                  <div className="field">
                    <label>Related document</label>
                    <select value={draftRecord.related_document_id ?? ""} onChange={(event) => updateDraft(record.id, { related_document_id: event.target.value || null })}>
                      <option value="">None</option>
                      {documents.map((document) => (
                        <option key={document.id} value={document.id}>
                          {document.title}
                        </option>
                      ))}
                    </select>
                    {draftRecord.related_document_id ? <p>{documentsById.get(draftRecord.related_document_id) ?? "Linked document"}</p> : null}
                  </div>
                  <div className="field-full">
                    <label>Description</label>
                    <textarea value={draftRecord.description ?? ""} onChange={(event) => updateDraft(record.id, { description: event.target.value || null })} />
                  </div>
                  <div className="field-full">
                    <label>Notes</label>
                    <textarea value={draftRecord.notes ?? ""} onChange={(event) => updateDraft(record.id, { notes: event.target.value || null })} />
                  </div>
                </div>
                <div className="operations-record-actions">
                  <button className="button button-primary" disabled={!dirty || savingId === record.id || deletingId === record.id} onClick={() => saveRecord(record)} type="button">
                    <Save size={17} />
                    {savingId === record.id ? "Saving…" : "Save"}
                  </button>
                  <button
                    className="button button-secondary button-neutral"
                    disabled={savingId === record.id || deletingId === record.id || draftRecord.status === "Complete"}
                    onClick={() => saveRecord(record, { status: "Complete" })}
                    type="button"
                  >
                    <CheckCircle2 size={17} />
                    Mark Complete
                  </button>
                  <button className="button button-secondary button-neutral" disabled={!dirty || savingId === record.id || deletingId === record.id} onClick={() => cancelDraft(record.id)} type="button">
                    <XCircle size={17} />
                    Cancel
                  </button>
                  <button
                    className="button button-danger"
                    disabled={savingId === record.id || deletingId === record.id}
                    onClick={() => deleteRecord(record)}
                    type="button"
                  >
                    <Trash2 size={17} />
                    {deletingId === record.id ? "Removing…" : "Remove"}
                  </button>
                  {messageTone === "error" && dirty ? (
                    <span className="operation-save-warning">
                      <AlertTriangle size={15} />
                      Draft kept until saved.
                    </span>
                  ) : null}
                </div>
              </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
