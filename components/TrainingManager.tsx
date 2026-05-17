"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Download, FileUp, PlayCircle, Plus, Save, UploadCloud } from "lucide-react";
import {
  clientTrainingDeliveryModes,
  clientTrainingEventStatuses,
  trainingModuleCategories,
  trainingModuleStatuses,
  type ClientTrainingEvent,
  type ClientTrainingEventModule,
  type CompanyClient,
  type TrainingModule,
  type TrainingModuleFile,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type TrainingManagerProps = {
  clients: CompanyClient[];
  initialModules: TrainingModule[];
  initialFiles: TrainingModuleFile[];
  initialEvents: ClientTrainingEvent[];
  initialEventModules: ClientTrainingEventModule[];
};

const trainingFileAccept = [
  ".pdf",
  ".ppt",
  ".pptx",
  ".doc",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".mp4",
  ".mov",
  ".webm",
].join(",");

const acceptedExtensions = new Set(trainingFileAccept.split(","));

function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function cleanOptionalText(value: FormDataEntryValue | null) {
  const text = cleanText(value);
  return text || null;
}

function cleanNumber(value: FormDataEntryValue | null) {
  const text = cleanText(value);
  if (!text) {
    return null;
  }

  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

function fileExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex === -1 ? "" : fileName.slice(dotIndex).toLowerCase();
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function datetimeLocalToIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export function TrainingManager({
  clients,
  initialModules,
  initialFiles,
  initialEvents,
  initialEventModules,
}: TrainingManagerProps) {
  const [modules, setModules] = useState(initialModules);
  const [files, setFiles] = useState(initialFiles);
  const [events, setEvents] = useState(initialEvents);
  const [eventModules, setEventModules] = useState(initialEventModules);
  const [message, setMessage] = useState("");
  const [pendingModuleId, setPendingModuleId] = useState<string | null>(null);
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedEventId, setSelectedEventId] = useState(initialEvents[0]?.id ?? "");

  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const modulesById = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);

  const filesByModuleId = useMemo(() => {
    const map = new Map<string, TrainingModuleFile[]>();
    for (const file of files) {
      map.set(file.module_id, [...(map.get(file.module_id) ?? []), file]);
    }
    return map;
  }, [files]);

  const eventModulesByEventId = useMemo(() => {
    const map = new Map<string, ClientTrainingEventModule[]>();
    for (const eventModule of eventModules) {
      map.set(eventModule.event_id, [...(map.get(eventModule.event_id) ?? []), eventModule]);
    }
    for (const [eventId, assignments] of map) {
      map.set(eventId, [...assignments].sort((first, second) => first.sort_order - second.sort_order));
    }
    return map;
  }, [eventModules]);

  const filteredModules = modules.filter((module) => {
    const statusMatches = selectedStatus === "All" || module.status === selectedStatus;
    const categoryMatches = selectedCategory === "All" || module.category === selectedCategory;
    return statusMatches && categoryMatches;
  });

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;
  const selectedEventAssignments = selectedEvent ? eventModulesByEventId.get(selectedEvent.id) ?? [] : [];

  function getSupabaseOrMessage() {
    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase is required for training records.");
      return null;
    }
    return supabase;
  }

  async function getSignedInUser() {
    const supabase = getSupabaseOrMessage();
    if (!supabase) {
      return null;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Please sign in again before changing training records.");
      return null;
    }

    return { supabase, user };
  }

  async function createModule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = cleanText(formData.get("title"));

    if (!title) {
      setMessage("Training module title is required.");
      return;
    }

    const session = await getSignedInUser();
    if (!session) {
      return;
    }

    const { data, error } = await session.supabase
      .from("training_modules")
      .insert({
        title,
        description: cleanOptionalText(formData.get("description")),
        category: cleanText(formData.get("category")) || "General Safety",
        audience: cleanText(formData.get("audience")) || "Client Workforce",
        status: cleanText(formData.get("status")) || "Draft",
        owner: cleanOptionalText(formData.get("owner")),
        estimated_duration_minutes: cleanNumber(formData.get("estimated_duration_minutes")),
        created_by: session.user.id,
        updated_by: session.user.id,
      })
      .select("*")
      .single();

    if (error || !data) {
      setMessage(error?.message ?? "Could not create the training module.");
      return;
    }

    setModules((current) => [data as TrainingModule, ...current]);
    form.reset();
    setMessage("Training module created.");
  }

  async function saveModuleMetadata(event: React.FormEvent<HTMLFormElement>, module: TrainingModule) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const session = await getSignedInUser();
    if (!session) {
      return;
    }

    const patch = {
      title: cleanText(formData.get("title")) || module.title,
      description: cleanOptionalText(formData.get("description")),
      category: cleanText(formData.get("category")) || module.category,
      audience: cleanText(formData.get("audience")) || module.audience,
      status: cleanText(formData.get("status")) || module.status,
      owner: cleanOptionalText(formData.get("owner")),
      estimated_duration_minutes: cleanNumber(formData.get("estimated_duration_minutes")),
      updated_by: session.user.id,
    };

    const { data, error } = await session.supabase.from("training_modules").update(patch).eq("id", module.id).select("*").single();

    if (error || !data) {
      setMessage(error?.message ?? "Could not save module metadata.");
      return;
    }

    setModules((current) => current.map((item) => (item.id === module.id ? (data as TrainingModule) : item)));
    setMessage(`${patch.title} saved.`);
  }

  async function uploadModuleFile(event: React.FormEvent<HTMLFormElement>, module: TrainingModule) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    const sortOrder = cleanNumber(formData.get("sort_order")) ?? (filesByModuleId.get(module.id)?.length ?? 0) + 1;

    if (!(file instanceof File) || !file.name) {
      setMessage("Choose a training file before uploading.");
      return;
    }

    if (!acceptedExtensions.has(fileExtension(file.name))) {
      setMessage("Training uploads must be slides, documents, images, or common video files.");
      return;
    }

    const session = await getSignedInUser();
    if (!session) {
      return;
    }

    setPendingModuleId(module.id);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `${session.user.id}/modules/${module.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await session.supabase.storage.from("training-materials").upload(filePath, file, {
      contentType: file.type || undefined,
    });

    if (uploadError) {
      setPendingModuleId(null);
      setMessage(uploadError.message);
      return;
    }

    const { data, error } = await session.supabase
      .from("training_module_files")
      .insert({
        module_id: module.id,
        file_bucket: "training-materials",
        file_path: filePath,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: session.user.id,
        sort_order: sortOrder,
      })
      .select("*")
      .single();

    setPendingModuleId(null);

    if (error || !data) {
      setMessage(error?.message ?? "File uploaded, but the training record could not be saved.");
      return;
    }

    setFiles((current) => [data as TrainingModuleFile, ...current]);
    form.reset();
    setMessage(`${file.name} uploaded to ${module.title}.`);
  }

  async function openTrainingFile(file: TrainingModuleFile) {
    const supabase = getSupabaseOrMessage();
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase.storage.from(file.file_bucket).createSignedUrl(file.file_path, 60);
    if (error || !data?.signedUrl) {
      setMessage(error?.message ?? "Could not create a signed training file link.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function createTrainingEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = cleanText(formData.get("title"));
    const clientId = cleanText(formData.get("client_id"));

    if (!title || !clientId) {
      setMessage("Choose a client and enter a training event title.");
      return;
    }

    const session = await getSignedInUser();
    if (!session) {
      return;
    }

    const { data, error } = await session.supabase
      .from("client_training_events")
      .insert({
        client_id: clientId,
        title,
        scheduled_start_at: datetimeLocalToIso(cleanText(formData.get("scheduled_start_at"))),
        delivery_mode: cleanText(formData.get("delivery_mode")) || "In Person",
        location: cleanOptionalText(formData.get("location")),
        instructor: cleanOptionalText(formData.get("instructor")),
        status: cleanText(formData.get("status")) || "Planned",
        notes: cleanOptionalText(formData.get("notes")),
        created_by: session.user.id,
        updated_by: session.user.id,
      })
      .select("*")
      .single();

    if (error || !data) {
      setMessage(error?.message ?? "Could not create the training event.");
      return;
    }

    const nextEvent = data as ClientTrainingEvent;
    setEvents((current) => [nextEvent, ...current]);
    setSelectedEventId(nextEvent.id);
    form.reset();
    setMessage("Client training event created.");
  }

  async function updateEventStatus(trainingEvent: ClientTrainingEvent, status: string) {
    const session = await getSignedInUser();
    if (!session) {
      return;
    }

    const { data, error } = await session.supabase
      .from("client_training_events")
      .update({ status, updated_by: session.user.id })
      .eq("id", trainingEvent.id)
      .select("*")
      .single();

    if (error || !data) {
      setMessage(error?.message ?? "Could not update event status.");
      return;
    }

    setEvents((current) => current.map((item) => (item.id === trainingEvent.id ? (data as ClientTrainingEvent) : item)));
  }

  async function assignModuleToEvent(event: React.FormEvent<HTMLFormElement>, trainingEvent: ClientTrainingEvent) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const moduleId = cleanText(formData.get("module_id"));

    if (!moduleId) {
      setMessage("Choose a training module to add.");
      return;
    }

    const session = await getSignedInUser();
    if (!session) {
      return;
    }

    setPendingEventId(trainingEvent.id);
    const currentAssignments = eventModulesByEventId.get(trainingEvent.id) ?? [];
    const { data, error } = await session.supabase
      .from("client_training_event_modules")
      .insert({
        event_id: trainingEvent.id,
        module_id: moduleId,
        sort_order: cleanNumber(formData.get("sort_order")) ?? currentAssignments.length + 1,
        presenter_notes: cleanOptionalText(formData.get("presenter_notes")),
      })
      .select("*")
      .single();

    setPendingEventId(null);

    if (error || !data) {
      setMessage(error?.message ?? "Could not add that module to the event.");
      return;
    }

    setEventModules((current) => [...current, data as ClientTrainingEventModule]);
    form.reset();
    setMessage("Module added to the training event.");
  }

  return (
    <div className="training-workspace">
      {message ? <div className="success-box">{message}</div> : null}

      <div className="training-dashboard-grid">
        <form className="form-panel training-create-panel" onSubmit={createModule}>
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Module Library</div>
              <h2>Create module</h2>
            </div>
            <FileUp size={22} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="training-title">Title</label>
              <input id="training-title" name="title" required placeholder="Hot work permit basics" />
            </div>
            <div className="field">
              <label htmlFor="training-category">Category</label>
              <select id="training-category" name="category" defaultValue="General Safety">
                {trainingModuleCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="training-audience">Audience</label>
              <input id="training-audience" name="audience" defaultValue="Client Workforce" />
            </div>
            <div className="field">
              <label htmlFor="training-status">Status</label>
              <select id="training-status" name="status" defaultValue="Draft">
                {trainingModuleStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="training-owner">Owner</label>
              <input id="training-owner" name="owner" />
            </div>
            <div className="field">
              <label htmlFor="training-duration">Minutes</label>
              <input id="training-duration" min="0" name="estimated_duration_minutes" type="number" />
            </div>
            <div className="field-full">
              <label htmlFor="training-description">Description</label>
              <textarea id="training-description" name="description" />
            </div>
          </div>
          <button className="button button-primary" type="submit">
            <Plus size={18} />
            Create Module
          </button>
        </form>

        <form className="form-panel training-create-panel" onSubmit={createTrainingEvent}>
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Client Class</div>
              <h2>Schedule event</h2>
            </div>
            <CalendarPlus size={22} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="event-client">Client</label>
              <select id="event-client" name="client_id" required defaultValue="">
                <option value="" disabled>
                  Select client
                </option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="event-title">Title</label>
              <input id="event-title" name="title" required placeholder="New hire safety orientation" />
            </div>
            <div className="field">
              <label htmlFor="event-start">Date and time</label>
              <input id="event-start" name="scheduled_start_at" type="datetime-local" />
            </div>
            <div className="field">
              <label htmlFor="event-mode">Delivery</label>
              <select id="event-mode" name="delivery_mode" defaultValue="In Person">
                {clientTrainingDeliveryModes.map((mode) => (
                  <option key={mode}>{mode}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="event-location">Location</label>
              <input id="event-location" name="location" placeholder="Client site, classroom, or meeting link" />
            </div>
            <div className="field">
              <label htmlFor="event-instructor">Instructor</label>
              <input id="event-instructor" name="instructor" />
            </div>
            <div className="field">
              <label htmlFor="event-status">Status</label>
              <select id="event-status" name="status" defaultValue="Planned">
                {clientTrainingEventStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="field-full">
              <label htmlFor="event-notes">Notes</label>
              <textarea id="event-notes" name="notes" />
            </div>
          </div>
          <button className="button button-primary" disabled={clients.length === 0} type="submit">
            <CalendarPlus size={18} />
            Create Event
          </button>
        </form>
      </div>

      <section className="table-card training-presenter">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">Presenter View</div>
            <h2>Open class materials</h2>
          </div>
          <PlayCircle size={22} />
        </div>
        <div className="training-event-picker">
          <select value={selectedEvent?.id ?? ""} onChange={(event) => setSelectedEventId(event.target.value)}>
            {events.length === 0 ? <option value="">No training events yet</option> : null}
            {events.map((trainingEvent) => (
              <option key={trainingEvent.id} value={trainingEvent.id}>
                {trainingEvent.title} - {clientsById.get(trainingEvent.client_id)?.name ?? "Client"}
              </option>
            ))}
          </select>
        </div>

        {selectedEvent ? (
          <div className="training-presenter-grid">
            <article className="doc-card">
              <h3>{selectedEvent.title}</h3>
              <p>{clientsById.get(selectedEvent.client_id)?.name ?? "Unknown client"}</p>
              <p>
                {formatDateTime(selectedEvent.scheduled_start_at)} - {selectedEvent.delivery_mode} - {selectedEvent.location ?? "Location TBD"}
              </p>
              <select value={selectedEvent.status} onChange={(event) => updateEventStatus(selectedEvent, event.target.value)}>
                {clientTrainingEventStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </article>

            <div className="training-presenter-modules">
              {selectedEventAssignments.length === 0 ? (
                <div className="empty-state">No modules are assigned to this training event yet.</div>
              ) : (
                selectedEventAssignments.map((assignment) => {
                  const module = modulesById.get(assignment.module_id);
                  const moduleFiles = module ? filesByModuleId.get(module.id) ?? [] : [];
                  return (
                    <article className="doc-card training-presenter-module" key={assignment.id}>
                      <div>
                        <h3>
                          {assignment.sort_order}. {module?.title ?? "Missing module"}
                        </h3>
                        <p>{assignment.presenter_notes ?? module?.description ?? "No presenter notes."}</p>
                      </div>
                      <div className="training-file-list">
                        {moduleFiles.length === 0 ? (
                          <span className="badge">No files</span>
                        ) : (
                          moduleFiles.map((file) => (
                            <button className="button button-light" key={file.id} onClick={() => openTrainingFile(file)} type="button">
                              <Download size={16} />
                              {file.file_name}
                            </button>
                          ))
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="empty-state">Create a training event to start building a presenter view.</div>
        )}
      </section>

      <div className="training-content-grid">
        <section className="table-card">
          <div className="training-toolbar">
            <div>
              <div className="eyebrow">Modules</div>
              <h2>Reusable training materials</h2>
            </div>
            <div className="training-filters">
              <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} aria-label="Filter modules by category">
                <option>All</option>
                {trainingModuleCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
              <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} aria-label="Filter modules by status">
                <option>All</option>
                {trainingModuleStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="training-module-list">
            {filteredModules.length === 0 ? (
              <div className="empty-state">No training modules match those filters.</div>
            ) : (
              filteredModules.map((module) => {
                const moduleFiles = filesByModuleId.get(module.id) ?? [];
                return (
                  <article className="doc-card training-module-card" key={module.id}>
                    <form className="training-module-form" onSubmit={(event) => saveModuleMetadata(event, module)}>
                      <div className="training-module-head">
                        <div>
                          <h3>{module.title}</h3>
                          <p>
                            {module.category} - {module.audience} - {module.estimated_duration_minutes ?? "TBD"} min
                          </p>
                        </div>
                        <span className="badge">{module.status}</span>
                      </div>
                      <div className="form-grid">
                        <div className="field">
                          <label htmlFor={`module-title-${module.id}`}>Title</label>
                          <input id={`module-title-${module.id}`} name="title" defaultValue={module.title} required />
                        </div>
                        <div className="field">
                          <label htmlFor={`module-category-${module.id}`}>Category</label>
                          <select id={`module-category-${module.id}`} name="category" defaultValue={module.category}>
                            {trainingModuleCategories.map((category) => (
                              <option key={category}>{category}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor={`module-audience-${module.id}`}>Audience</label>
                          <input id={`module-audience-${module.id}`} name="audience" defaultValue={module.audience} />
                        </div>
                        <div className="field">
                          <label htmlFor={`module-status-${module.id}`}>Status</label>
                          <select id={`module-status-${module.id}`} name="status" defaultValue={module.status}>
                            {trainingModuleStatuses.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label htmlFor={`module-owner-${module.id}`}>Owner</label>
                          <input id={`module-owner-${module.id}`} name="owner" defaultValue={module.owner ?? ""} />
                        </div>
                        <div className="field">
                          <label htmlFor={`module-duration-${module.id}`}>Minutes</label>
                          <input
                            id={`module-duration-${module.id}`}
                            min="0"
                            name="estimated_duration_minutes"
                            type="number"
                            defaultValue={module.estimated_duration_minutes ?? ""}
                          />
                        </div>
                        <div className="field-full">
                          <label htmlFor={`module-description-${module.id}`}>Description</label>
                          <textarea id={`module-description-${module.id}`} name="description" defaultValue={module.description ?? ""} />
                        </div>
                      </div>
                      <button className="button button-secondary button-neutral" type="submit">
                        <Save size={16} />
                        Save Metadata
                      </button>
                    </form>

                    <form className="stage-upload-form" onSubmit={(event) => uploadModuleFile(event, module)}>
                      <input aria-label={`Upload file for ${module.title}`} accept={trainingFileAccept} name="file" required type="file" />
                      <input aria-label="File sort order" min="0" name="sort_order" placeholder="Order" type="number" />
                      <button className="button button-primary" disabled={pendingModuleId === module.id} type="submit">
                        <UploadCloud size={16} />
                        {pendingModuleId === module.id ? "Uploading..." : "Upload File"}
                      </button>
                    </form>

                    <div className="training-file-list">
                      {moduleFiles.length === 0 ? (
                        <div className="empty-state">No files uploaded for this module.</div>
                      ) : (
                        moduleFiles.map((file) => (
                          <button className="button button-light" key={file.id} onClick={() => openTrainingFile(file)} type="button">
                            <Download size={16} />
                            {file.file_name}
                          </button>
                        ))
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="table-card">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Events</div>
              <h2>Client training schedule</h2>
            </div>
          </div>
          <div className="training-event-list">
            {events.length === 0 ? (
              <div className="empty-state">No client training events yet.</div>
            ) : (
              events.map((trainingEvent) => {
                const assignments = eventModulesByEventId.get(trainingEvent.id) ?? [];
                const assignedModuleIds = new Set(assignments.map((assignment) => assignment.module_id));
                return (
                  <article className="doc-card training-event-row" key={trainingEvent.id}>
                    <div className="training-module-head">
                      <div>
                        <h3>{trainingEvent.title}</h3>
                        <p>{clientsById.get(trainingEvent.client_id)?.name ?? "Unknown client"}</p>
                        <p>
                          {formatDateTime(trainingEvent.scheduled_start_at)} - {trainingEvent.instructor ?? "Instructor TBD"}
                        </p>
                      </div>
                      <span className="badge">{trainingEvent.status}</span>
                    </div>

                    <form className="stage-upload-form" onSubmit={(event) => assignModuleToEvent(event, trainingEvent)}>
                      <select aria-label={`Assign module to ${trainingEvent.title}`} name="module_id" required defaultValue="">
                        <option value="" disabled>
                          Select module
                        </option>
                        {modules
                          .filter((module) => !assignedModuleIds.has(module.id))
                          .map((module) => (
                            <option key={module.id} value={module.id}>
                              {module.title}
                            </option>
                          ))}
                      </select>
                      <input aria-label="Module order" min="0" name="sort_order" placeholder="Order" type="number" />
                      <input aria-label="Presenter notes" name="presenter_notes" placeholder="Presenter notes" />
                      <button className="button button-primary" disabled={pendingEventId === trainingEvent.id || modules.length === 0} type="submit">
                        <Plus size={16} />
                        Add
                      </button>
                    </form>

                    <div className="training-assignment-list">
                      {assignments.length === 0 ? (
                        <p>No modules assigned.</p>
                      ) : (
                        assignments.map((assignment) => (
                          <p key={assignment.id}>
                            {assignment.sort_order}. {modulesById.get(assignment.module_id)?.title ?? "Missing module"}
                          </p>
                        ))
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
