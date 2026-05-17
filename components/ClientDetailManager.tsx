"use client";

import { useMemo, useState } from "react";
import { Download, FileSignature, Plus, Save, UploadCloud } from "lucide-react";
import {
  checklistStatuses,
  lifecycleStages,
  type ClientOnboardingItem,
  type CompanyClient,
  type CompanyDocument,
  type CompanyDocumentRequirement,
  type CompanyLegalIssue,
  type CompanySalesActivity,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type ClientDetailManagerProps = {
  client: CompanyClient;
  activities: CompanySalesActivity[];
  onboardingItems: ClientOnboardingItem[];
  documents: CompanyDocument[];
  requirements: CompanyDocumentRequirement[];
  masterTemplates: CompanyDocument[];
  legalIssues: CompanyLegalIssue[];
};

export function ClientDetailManager({
  client,
  activities,
  onboardingItems,
  documents,
  requirements,
  masterTemplates,
  legalIssues,
}: ClientDetailManagerProps) {
  const [currentClient, setCurrentClient] = useState(client);
  const [profileDraft, setProfileDraft] = useState({
    name: client.name ?? "",
    contact_name: client.contact_name ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    company_type: client.company_type ?? "",
    lifecycle_stage: client.lifecycle_stage,
    status: client.status ?? "Active",
    owner: client.owner ?? "",
    source: client.source ?? "",
    notes: client.notes ?? "",
  });
  const [currentActivities, setCurrentActivities] = useState(activities);
  const [currentItems, setCurrentItems] = useState(onboardingItems);
  const [currentDocuments, setCurrentDocuments] = useState(documents);
  const [message, setMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingRequirementId, setUploadingRequirementId] = useState<string | null>(null);

  const activeApprovalComplete = currentItems.some((item) => item.title === "Active company approval complete" && item.completed);
  const contractSigned = currentItems.some((item) => item.title === "Contract signed" && item.completed);
  const readyForActive = activeApprovalComplete && contractSigned;
  const currentStageItems = currentItems.filter((item) => item.lifecycle_stage === currentClient.lifecycle_stage);
  const currentStageRequirements = requirements.filter((requirement) => requirement.lifecycle_stage === currentClient.lifecycle_stage);

  const groupedItems = useMemo(() => {
    return currentItems.reduce<Record<string, ClientOnboardingItem[]>>((accumulator, item) => {
      accumulator[item.section] = accumulator[item.section] ?? [];
      accumulator[item.section].push(item);
      return accumulator;
    }, {});
  }, [currentItems]);

  async function saveClientProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSavingProfile(true);

    const supabase = createClient();
    if (!supabase) {
      setSavingProfile(false);
      setMessage("Supabase is required to update company information.");
      return;
    }

    const patch = {
      name: profileDraft.name.trim(),
      contact_name: profileDraft.contact_name.trim() || null,
      email: profileDraft.email.trim() || null,
      phone: profileDraft.phone.trim() || null,
      company_type: profileDraft.company_type.trim() || null,
      lifecycle_stage: profileDraft.lifecycle_stage,
      status: profileDraft.status.trim() || "Active",
      owner: profileDraft.owner.trim() || null,
      source: profileDraft.source.trim() || null,
      notes: profileDraft.notes.trim() || null,
    };

    if (!patch.name) {
      setSavingProfile(false);
      setMessage("Company name is required.");
      return;
    }

    const { data, error } = await supabase.from("company_clients").update(patch).eq("id", currentClient.id).select("*").single();

    setSavingProfile(false);

    if (error || !data) {
      setMessage(error?.message ?? "Could not update company information.");
      return;
    }

    setCurrentClient(data as CompanyClient);
    setProfileDraft({
      name: data.name ?? "",
      contact_name: data.contact_name ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
      company_type: data.company_type ?? "",
      lifecycle_stage: data.lifecycle_stage,
      status: data.status ?? "Active",
      owner: data.owner ?? "",
      source: data.source ?? "",
      notes: data.notes ?? "",
    });
    setMessage("Company information saved.");
  }

  function findClientDocument(requirement: CompanyDocumentRequirement) {
    return currentDocuments.find(
      (document) =>
        document.requirement_id === requirement.id ||
        (document.lifecycle_stage === requirement.lifecycle_stage &&
          document.category === requirement.category &&
          document.title.toLowerCase() === requirement.title.toLowerCase()),
    );
  }

  function findMasterTemplate(requirement: CompanyDocumentRequirement) {
    return masterTemplates.find(
      (document) =>
        document.requirement_id === requirement.id ||
        (document.lifecycle_stage === requirement.lifecycle_stage &&
          document.category === requirement.category &&
          document.title.toLowerCase() === requirement.title.toLowerCase()),
    );
  }

  async function downloadDocument(document: CompanyDocument | undefined) {
    if (!document?.file_path) {
      setMessage("No file is attached to that document yet.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase is required to view documents.");
      return;
    }

    const { data, error } = await supabase.storage.from("company-documents").createSignedUrl(document.file_path, 60);
    if (error || !data?.signedUrl) {
      setMessage(error?.message ?? "Could not create a document download link.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function uploadRequirementDocument(event: React.FormEvent<HTMLFormElement>, requirement: CompanyDocumentRequirement) {
    event.preventDefault();
    setMessage("");
    setUploadingRequirementId(requirement.id);

    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    const notes = String(formData.get("notes") ?? "");

    if (!(file instanceof File) || !file.name) {
      setUploadingRequirementId(null);
      setMessage("Choose a document copy to upload.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setUploadingRequirementId(null);
      setMessage("Supabase is required to upload documents.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setUploadingRequirementId(null);
      setMessage("Please sign in again before uploading.");
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `${user.id}/${currentClient.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("company-documents").upload(filePath, file);

    if (uploadError) {
      setUploadingRequirementId(null);
      setMessage(uploadError.message);
      return;
    }

    const { data, error } = await supabase
      .from("company_documents")
      .insert({
        title: requirement.title,
        category: requirement.category,
        requirement_id: requirement.id,
        client_id: currentClient.id,
        record_type: "Client Record",
        lifecycle_stage: requirement.lifecycle_stage,
        file_path: filePath,
        file_name: file.name,
        file_type: file.type,
        status: "Uploaded",
        owner: currentClient.owner,
        revision: "1.0",
        notes,
        uploaded_by: user.id,
      })
      .select("*")
      .single();

    setUploadingRequirementId(null);

    if (error || !data) {
      setMessage(error?.message ?? "Could not register the uploaded document.");
      return;
    }

    setCurrentDocuments((current) => [data as CompanyDocument, ...current]);
    event.currentTarget.reset();
    setMessage(`${requirement.title} uploaded for ${currentClient.lifecycle_stage}.`);
  }

  async function updateDocument(document: CompanyDocument, patch: Partial<CompanyDocument>) {
    setCurrentDocuments((current) => current.map((item) => (item.id === document.id ? { ...item, ...patch } : item)));
    const supabase = createClient();
    if (!supabase) {
      return;
    }
    const { error } = await supabase.from("company_documents").update(patch).eq("id", document.id);
    if (error) {
      setMessage(error.message);
    }
  }

  async function markSigned(document: CompanyDocument | undefined) {
    if (!document) {
      setMessage("Upload the signed copy before marking this document executed.");
      return;
    }

    await updateDocument(document, {
      status: "Signed / Executed",
      executed_date: new Date().toISOString().slice(0, 10),
    });
    setMessage(`${document.title} marked signed / executed.`);
  }

  async function addActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase is required to add activities.");
      return;
    }

    const { data, error } = await supabase
      .from("company_sales_activities")
      .insert({
        client_id: currentClient.id,
        activity_type: String(formData.get("activity_type") ?? "Note"),
        title: String(formData.get("title") ?? ""),
        notes: String(formData.get("notes") ?? ""),
        activity_date: String(formData.get("activity_date") ?? "") || null,
        owner: String(formData.get("owner") ?? ""),
        outcome: String(formData.get("outcome") ?? ""),
      })
      .select("*")
      .single();

    if (error || !data) {
      setMessage(error?.message ?? "Could not add activity.");
      return;
    }

    setCurrentActivities((current) => [data as CompanySalesActivity, ...current]);
    event.currentTarget.reset();
    setMessage("Activity added.");
  }

  async function updateOnboardingItem(item: ClientOnboardingItem, patch: Partial<ClientOnboardingItem>) {
    const nextPatch = {
      ...patch,
      completed: patch.status === "Complete" ? true : (patch.completed ?? item.completed),
    };

    setCurrentItems((current) => current.map((currentItem) => (currentItem.id === item.id ? { ...currentItem, ...nextPatch } : currentItem)));
    const supabase = createClient();
    if (supabase) {
      await supabase.from("client_onboarding_items").update(nextPatch).eq("id", item.id);
    }
  }

  return (
    <div className="client-detail-grid">
      <form className="form-panel" onSubmit={saveClientProfile}>
        <h2>Company profile</h2>
        {message ? <div className="success-box">{message}</div> : null}
        <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
          <div className="field">
            <label htmlFor="client-name">Company name</label>
            <input
              id="client-name"
              required
              value={profileDraft.name}
              onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="client-contact-name">Primary contact</label>
            <input
              id="client-contact-name"
              value={profileDraft.contact_name}
              onChange={(event) => setProfileDraft((current) => ({ ...current, contact_name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="client-email">Email</label>
            <input
              id="client-email"
              type="email"
              value={profileDraft.email}
              onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="client-phone">Phone</label>
            <input
              id="client-phone"
              value={profileDraft.phone}
              onChange={(event) => setProfileDraft((current) => ({ ...current, phone: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="client-company-type">Company type</label>
            <input
              id="client-company-type"
              value={profileDraft.company_type}
              onChange={(event) => setProfileDraft((current) => ({ ...current, company_type: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="client-lifecycle-stage">Lifecycle stage</label>
            <select
              id="client-lifecycle-stage"
              value={profileDraft.lifecycle_stage}
              onChange={(event) => setProfileDraft((current) => ({ ...current, lifecycle_stage: event.target.value }))}
            >
              {lifecycleStages.map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="client-owner">Owner</label>
            <input
              id="client-owner"
              value={profileDraft.owner}
              onChange={(event) => setProfileDraft((current) => ({ ...current, owner: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="client-status">Status</label>
            <input
              id="client-status"
              value={profileDraft.status}
              onChange={(event) => setProfileDraft((current) => ({ ...current, status: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="client-source">Source</label>
            <input
              id="client-source"
              value={profileDraft.source}
              onChange={(event) => setProfileDraft((current) => ({ ...current, source: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="client-notes">Notes</label>
            <textarea
              id="client-notes"
              value={profileDraft.notes}
              onChange={(event) => setProfileDraft((current) => ({ ...current, notes: event.target.value }))}
            />
          </div>
          <button className="button button-primary" disabled={savingProfile} type="submit">
            <Save size={18} />
            {savingProfile ? "Saving..." : "Save Company Info"}
          </button>
          <div className="success-box">
            Active readiness: {readyForActive ? "Ready for active company status" : "Contract signed and active approval are still required"}
          </div>
        </div>
      </form>

      <section className="table-card">
        <div className="checklist-section">
          <div className="stage-workspace-head">
            <div>
              <div className="eyebrow">Current Step Workspace</div>
              <h2>{currentClient.lifecycle_stage}</h2>
            </div>
            <span className="badge">
              {currentStageItems.filter((item) => item.completed).length}/{currentStageItems.length} checklist
            </span>
          </div>

          <div className="stage-workspace-grid">
            <section>
              <h3>Step checklist</h3>
              <div className="checklist-list">
                {currentStageItems.length === 0 ? (
                  <div className="empty-state">No checklist items are assigned to this stage yet.</div>
                ) : (
                  currentStageItems.map((item) => (
                    <article className="checklist-row stage-checklist-row" key={item.id}>
                      <input
                        checked={item.completed}
                        onChange={(event) =>
                          updateOnboardingItem(item, {
                            completed: event.target.checked,
                            status: event.target.checked ? "Complete" : "Not Started",
                          })
                        }
                        type="checkbox"
                      />
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.owner ?? "Unassigned"} - Due {item.due_date ?? "TBD"}</p>
                      </div>
                      <select
                        value={item.status}
                        onChange={(event) => updateOnboardingItem(item, { status: event.target.value, completed: event.target.value === "Complete" })}
                      >
                        {checklistStatuses.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section>
              <h3>Required documents</h3>
              <div className="doc-list">
                {currentStageRequirements.length === 0 ? (
                  <div className="empty-state">No documents are required for this stage.</div>
                ) : (
                  currentStageRequirements.map((requirement) => {
                    const clientDocument = findClientDocument(requirement);
                    const masterTemplate = findMasterTemplate(requirement);
                    return (
                      <article className="doc-card document-slot" key={requirement.id}>
                        <div className="document-slot-head">
                          <div>
                            <h3>{requirement.title}</h3>
                            <p>
                              {requirement.category} - {requirement.required_for_active ? "Required for active" : "Supporting document"}
                            </p>
                          </div>
                          <span className="badge">{clientDocument?.status ?? "Missing"}</span>
                        </div>
                        <p>
                          Client copy: {clientDocument?.file_name ?? "Not uploaded"} - Executed {clientDocument?.executed_date ?? "TBD"}
                        </p>
                        <p>Master template: {masterTemplate?.file_name ?? "No template linked"}</p>
                        <div className="document-actions">
                          <button className="button button-light" onClick={() => downloadDocument(clientDocument)} type="button">
                            <Download size={16} />
                            Client Copy
                          </button>
                          <button className="button button-light" onClick={() => downloadDocument(masterTemplate)} type="button">
                            <Download size={16} />
                            Template
                          </button>
                          <button className="button button-light" onClick={() => markSigned(clientDocument)} type="button">
                            <FileSignature size={16} />
                            Mark Signed
                          </button>
                        </div>
                        <form className="stage-upload-form" onSubmit={(event) => uploadRequirementDocument(event, requirement)}>
                          <input aria-label={`Upload ${requirement.title}`} name="file" required type="file" />
                          <input aria-label="Document notes" name="notes" placeholder="Notes" />
                          <button className="button button-primary" disabled={uploadingRequirementId === requirement.id} type="submit">
                            <UploadCloud size={16} />
                            {uploadingRequirementId === requirement.id ? "Uploading..." : "Upload Copy"}
                          </button>
                        </form>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="checklist-section">
          <h2>Sales activity</h2>
          <form className="form-grid" onSubmit={addActivity}>
            <div className="field">
              <label>Type</label>
              <input name="activity_type" defaultValue="Note" />
            </div>
            <div className="field">
              <label>Title</label>
              <input name="title" required />
            </div>
            <div className="field">
              <label>Date</label>
              <input name="activity_date" type="date" />
            </div>
            <div className="field">
              <label>Owner</label>
              <input name="owner" />
            </div>
            <div className="field">
              <label>Outcome</label>
              <input name="outcome" />
            </div>
            <div className="field-full">
              <label>Notes</label>
              <textarea name="notes" />
            </div>
            <button className="button button-primary" type="submit">
              <Plus size={18} />
              Add Activity
            </button>
          </form>
          <div className="doc-list" style={{ marginTop: 16 }}>
            {currentActivities.map((activity) => (
              <article className="doc-card" key={activity.id}>
                <h3>{activity.title}</h3>
                <p>{activity.activity_type} - {activity.activity_date ?? "No date"} - {activity.outcome ?? "No outcome"}</p>
                <p>{activity.notes}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="checklist-section">
          <h2>All lifecycle checklist</h2>
          <div className="checklist-list">
            {Object.entries(groupedItems).map(([section, items]) => (
              <div key={section}>
                <h3>{section}</h3>
                {items.map((item) => (
                  <article className="checklist-row" key={item.id}>
                    <input
                      checked={item.completed}
                      onChange={(event) =>
                        updateOnboardingItem(item, {
                          completed: event.target.checked,
                          status: event.target.checked ? "Complete" : "Not Started",
                        })
                      }
                      type="checkbox"
                    />
                    <div>
                      <h3>{item.title}</h3>
                      <div className="form-grid">
                        <div className="field">
                          <label>Status</label>
                          <select
                            value={item.status}
                            onChange={(event) => updateOnboardingItem(item, { status: event.target.value, completed: event.target.value === "Complete" })}
                          >
                            {checklistStatuses.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Due date</label>
                          <input
                            type="date"
                            value={item.due_date ?? ""}
                            onChange={(event) => updateOnboardingItem(item, { due_date: event.target.value || null })}
                          />
                        </div>
                      </div>
                    </div>
                    <span className="badge">
                      <Save size={14} /> {item.status}
                    </span>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="table-card client-wide">
        <div className="checklist-section">
          <h2>Linked documents</h2>
          <div className="doc-list">
            {currentDocuments.length === 0 ? <div className="empty-state">No linked documents yet.</div> : currentDocuments.map((document) => (
              <article className="doc-card" key={document.id}>
                <div className="document-slot-head">
                  <div>
                    <h3>{document.title}</h3>
                    <p>{document.category} - {document.status} - {document.lifecycle_stage ?? "No stage"}</p>
                  </div>
                  <button className="button button-light" onClick={() => downloadDocument(document)} type="button">
                    <Download size={16} />
                    View
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="checklist-section">
          <h2>Legal issues</h2>
          <div className="doc-list">
            {legalIssues.length === 0 ? <div className="empty-state">No legal issues logged.</div> : legalIssues.map((issue) => (
              <article className="doc-card" key={issue.id}>
                <h3>{issue.title}</h3>
                <p>{issue.severity} - {issue.status} - Due {issue.due_date ?? "TBD"}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
