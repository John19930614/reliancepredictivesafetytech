import { CheckCircle2, ExternalLink, FileSignature, ShieldCheck, UploadCloud } from "lucide-react";
import Link from "next/link";
import {
  saveEmployeeFormDraft,
  saveEmployeeProfile,
  signEmployeeDocument,
  signEmployeeStructuredForm,
  uploadEmployeeOnboardingDocument,
} from "@/app/employee/hr-onboarding/actions";
import type {
  CompanyDocument,
  EmployeeDocumentAssignment,
  EmployeeDocumentSignature,
  EmployeeFormResponse,
  EmployeeOnboardingUpload,
  EmployeeSignedDocument,
  HrComplianceRequirement,
  HrDocumentTemplate,
  HrEmployeeProfile,
  HrFormAnswers,
  HrFormDefinition,
  HrFormField,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

type HrOnboardingPageProps = {
  searchParams: Promise<{ message?: string; error?: string; next?: string }>;
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString() : "Not signed";
}

function getSafeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/employee") || value.startsWith("/employee-login")) {
    return "/employee";
  }

  if (value === "/employee/hr-onboarding" || value.startsWith("/employee/hr-onboarding?")) {
    return "/employee";
  }

  return value;
}

function isFormField(value: unknown): value is HrFormField {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as HrFormField).name === "string" &&
    typeof (value as HrFormField).label === "string" &&
    typeof (value as HrFormField).type === "string"
  );
}

function getFieldSchema(formDefinition: HrFormDefinition | undefined) {
  return Array.isArray(formDefinition?.field_schema) ? formDefinition.field_schema.filter(isFormField) : [];
}

function getAnswer(answers: HrFormAnswers | null | undefined, field: HrFormField) {
  const value = answers?.[field.name];
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "object" && value) return value;
  return field.type === "checkbox" ? false : "";
}

function groupFieldsBySection(fields: HrFormField[]) {
  const sections = new Map<string, HrFormField[]>();

  for (const field of fields) {
    const section = field.section || "Form details";
    sections.set(section, [...(sections.get(section) ?? []), field]);
  }

  return [...sections.entries()];
}

function getAssignmentCategory(
  assignment: EmployeeDocumentAssignment,
  templatesById: Map<string, HrDocumentTemplate>,
  requirementsById: Map<string, HrComplianceRequirement>,
) {
  const template = templatesById.get(assignment.template_id);
  const requirement = requirementsById.get(assignment.compliance_requirement_id ?? template?.compliance_requirement_id ?? "");
  return requirement?.category ?? template?.category ?? "HR Packet";
}

function groupAssignmentsByCategory(
  assignments: EmployeeDocumentAssignment[],
  templatesById: Map<string, HrDocumentTemplate>,
  requirementsById: Map<string, HrComplianceRequirement>,
) {
  const groups = new Map<string, EmployeeDocumentAssignment[]>();

  for (const assignment of assignments) {
    const category = getAssignmentCategory(assignment, templatesById, requirementsById);
    groups.set(category, [...(groups.get(category) ?? []), assignment]);
  }

  return [...groups.entries()];
}

function renderStructuredField(field: HrFormField, answers: HrFormAnswers | null | undefined) {
  const fieldId = `field-${field.name}`;
  const name = `field__${field.name}`;
  const value = getAnswer(answers, field);
  const stringValue = typeof value === "string" ? value : "";

  if (field.type === "address") {
    const address = typeof value === "object" && typeof value !== "boolean" ? value : {};
    return (
      <div className="field field-full" key={field.name}>
        <label>{field.label}</label>
        <div className="form-grid form-grid-address">
          <input name={`${name}__line1`} placeholder="Address line 1" required={field.required} defaultValue={String(address.line1 ?? "")} />
          <input name={`${name}__line2`} placeholder="Address line 2" defaultValue={String(address.line2 ?? "")} />
          <input name={`${name}__city`} placeholder="City" required={field.required} defaultValue={String(address.city ?? "")} />
          <input name={`${name}__state`} placeholder="State" required={field.required} defaultValue={String(address.state ?? "")} />
          <input
            name={`${name}__postal_code`}
            placeholder="ZIP / Postal code"
            required={field.required}
            defaultValue={String(address.postal_code ?? "")}
          />
        </div>
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="checkbox-pill field-full" key={field.name}>
        <input name={name} required={field.required} type="checkbox" defaultChecked={value === true} />
        {field.label}
      </label>
    );
  }

  if (field.type === "radio") {
    return (
      <fieldset className="field field-full hr-choice-field" key={field.name}>
        <legend>{field.label}</legend>
        {(field.options ?? []).map((option) => (
          <label className="checkbox-pill" key={option}>
            <input name={name} required={field.required} type="radio" value={option} defaultChecked={stringValue === option} />
            {option}
          </label>
        ))}
      </fieldset>
    );
  }

  if (field.type === "select") {
    return (
      <div className="field" key={field.name}>
        <label htmlFor={fieldId}>{field.label}</label>
        <select id={fieldId} name={name} required={field.required} defaultValue={stringValue}>
          <option value="">Choose one</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="field field-full" key={field.name}>
        <label htmlFor={fieldId}>{field.label}</label>
        <textarea id={fieldId} name={name} required={field.required} defaultValue={stringValue} />
      </div>
    );
  }

  const inputType =
    field.type === "date"
      ? "date"
      : field.type === "email"
        ? "email"
        : field.type === "number" || field.type === "currency"
          ? "number"
          : field.type === "phone"
            ? "tel"
            : "text";

  return (
    <div className="field" key={field.name}>
      <label htmlFor={fieldId}>{field.label}</label>
      <input
        id={fieldId}
        name={name}
        type={inputType}
        inputMode={field.type === "ssn" || field.type === "currency" || field.type === "number" ? "numeric" : undefined}
        autoComplete={field.sensitive ? "off" : undefined}
        placeholder={field.type === "ssn" ? "XXX-XX-XXXX" : field.placeholder}
        required={field.required}
        step={field.type === "currency" ? "0.01" : undefined}
        defaultValue={stringValue}
      />
    </div>
  );
}

export default async function HrOnboardingPage({ searchParams }: HrOnboardingPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!supabase || !user) {
    return (
      <section className="portal-card">
        <h1>HR onboarding</h1>
        <p>Sign in to complete employee onboarding.</p>
      </section>
    );
  }

  const [{ data: profile }, { data: assignments }, { data: signatures }, { data: responses }, { data: signedDocuments }, { data: uploads }] =
    await Promise.all([
      supabase.from("employee_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("employee_document_assignments").select("*").eq("user_id", user.id).order("created_at"),
      supabase.from("employee_document_signatures").select("*").eq("user_id", user.id).order("signed_at", { ascending: false }),
      supabase.from("employee_form_responses").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
      supabase.from("employee_signed_documents").select("*").eq("user_id", user.id).order("signed_at", { ascending: false }),
      supabase.from("employee_onboarding_uploads").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    ]);

  const typedProfile = profile as HrEmployeeProfile | null;
  const typedAssignments = (assignments ?? []) as EmployeeDocumentAssignment[];
  const typedSignatures = (signatures ?? []) as EmployeeDocumentSignature[];
  const typedResponses = (responses ?? []) as EmployeeFormResponse[];
  const typedSignedDocuments = (signedDocuments ?? []) as EmployeeSignedDocument[];
  const typedUploads = (uploads ?? []) as EmployeeOnboardingUpload[];
  const templateIds = [...new Set(typedAssignments.map((assignment) => assignment.template_id))];
  const { data: templates } =
    templateIds.length > 0
      ? await supabase.from("hr_document_templates").select("*").in("id", templateIds).order("sort_order")
      : { data: [] };

  const typedTemplates = (templates ?? []) as HrDocumentTemplate[];
  const formDefinitionIds = [...new Set(typedTemplates.map((template) => template.form_definition_id).filter(Boolean) as string[])];
  const { data: formDefinitions } =
    formDefinitionIds.length > 0
      ? await supabase.from("hr_form_definitions").select("*").in("id", formDefinitionIds).order("sort_order")
      : { data: [] };
  const requirementIds = [
    ...new Set(
      [
        ...typedAssignments.map((assignment) => assignment.compliance_requirement_id),
        ...typedTemplates.map((template) => template.compliance_requirement_id),
      ].filter(Boolean) as string[],
    ),
  ];
  const { data: requirements } =
    requirementIds.length > 0 ? await supabase.from("hr_compliance_requirements").select("*").in("id", requirementIds).order("sort_order") : { data: [] };
  const sourceDocumentIds = [...new Set(typedTemplates.map((template) => template.source_document_id).filter(Boolean) as string[])];
  const { data: sourceDocuments } =
    sourceDocumentIds.length > 0 ? await supabase.from("company_documents").select("*").in("id", sourceDocumentIds) : { data: [] };

  const sourceDocumentMap = new Map((sourceDocuments ?? []).map((document) => [document.id, document as CompanyDocument]));
  const sourceUrls = new Map<string, string>();
  const completedPdfUrls = new Map<string, string>();
  const uploadUrls = new Map<string, string>();

  for (const document of sourceDocumentMap.values()) {
    if (!document.file_path) continue;
    const { data } = await supabase.storage.from("company-documents").createSignedUrl(document.file_path, 60);
    if (data?.signedUrl) sourceUrls.set(document.id, data.signedUrl);
  }

  for (const document of typedSignedDocuments) {
    const { data } = await supabase.storage.from(document.file_bucket).createSignedUrl(document.file_path, 60);
    if (data?.signedUrl) completedPdfUrls.set(document.assignment_id, data.signedUrl);
  }

  for (const upload of typedUploads) {
    const { data } = await supabase.storage.from(upload.file_bucket).createSignedUrl(upload.file_path, 60);
    if (data?.signedUrl) uploadUrls.set(upload.id, data.signedUrl);
  }

  const templatesById = new Map(typedTemplates.map((template) => [template.id, template]));
  const visibleAssignments = typedAssignments.filter((assignment) => {
    const template = templatesById.get(assignment.template_id);
    return template?.active && template.required;
  });
  const formDefinitionsById = new Map((formDefinitions ?? []).map((definition) => [definition.id, definition as HrFormDefinition]));
  const requirementsById = new Map((requirements ?? []).map((requirement) => [requirement.id, requirement as HrComplianceRequirement]));
  const signaturesByAssignmentId = new Map(typedSignatures.map((signature) => [signature.assignment_id, signature]));
  const responsesByAssignmentId = new Map(typedResponses.map((response) => [response.assignment_id, response]));
  const signedDocumentsByAssignmentId = new Map(typedSignedDocuments.map((document) => [document.assignment_id, document]));
  const uploadsByAssignmentId = new Map<string, EmployeeOnboardingUpload>();
  for (const upload of typedUploads) {
    if (!uploadsByAssignmentId.has(upload.assignment_id) && upload.upload_status !== "superseded") {
      uploadsByAssignmentId.set(upload.assignment_id, upload);
    }
  }
  const checklistAssignments = visibleAssignments.filter((assignment) => templatesById.get(assignment.template_id)?.required);
  const completeCount = checklistAssignments.filter((assignment) => assignment.status !== "pending").length;
  const totalChecklistItems = checklistAssignments.length;
  const allComplete = totalChecklistItems === 0 || completeCount === totalChecklistItems;
  const completionLabel =
    totalChecklistItems === 0 ? "No HR checklist assigned" : `${completeCount} of ${totalChecklistItems} checklist items complete`;
  const nextPath = getSafeNextPath(params.next);
  const activePendingAssignmentId = visibleAssignments.find((assignment) => assignment.status === "pending")?.id ?? null;
  const assignmentGroups = groupAssignmentsByCategory(visibleAssignments, templatesById, requirementsById);

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Employee HR Onboarding</div>
          <h1>HR onboarding checklist</h1>
          <p>Track each onboarding item, save drafts as needed, and sign with your legal name when a form is ready.</p>
        </div>
        <span className="badge">{allComplete ? "Complete" : completionLabel}</span>
      </div>

      {params.message ? <div className="success-box portal-alert">{params.message}</div> : null}
      {params.error ? <div className="success-box portal-alert portal-alert-error">{params.error}</div> : null}
      {allComplete ? (
        <div className="success-box portal-alert onboarding-complete-alert">
          <div>
            <strong>Onboarding checklist complete.</strong>
            <p>Your HR onboarding items are complete.</p>
          </div>
          <Link className="button button-primary" href={nextPath}>
            Back to Dashboard
          </Link>
        </div>
      ) : null}

      <div className="hr-onboarding-layout">
        <form action={saveEmployeeProfile} className="form-panel">
          <input name="next" type="hidden" value={params.next ?? ""} />
          <h2>Employee profile</h2>
          <p className="muted-copy">Your legal name is used for typed signatures.</p>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
            <div className="field">
              <label htmlFor="legal_name">Legal name</label>
              <input id="legal_name" name="legal_name" defaultValue={typedProfile?.legal_name ?? ""} required />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" defaultValue={typedProfile?.phone ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="emergency_contact_name">Emergency contact</label>
              <input id="emergency_contact_name" name="emergency_contact_name" defaultValue={typedProfile?.emergency_contact_name ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="emergency_contact_phone">Emergency contact phone</label>
              <input
                id="emergency_contact_phone"
                name="emergency_contact_phone"
                defaultValue={typedProfile?.emergency_contact_phone ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor="emergency_contact_relationship">Relationship</label>
              <input
                id="emergency_contact_relationship"
                name="emergency_contact_relationship"
                defaultValue={typedProfile?.emergency_contact_relationship ?? ""}
              />
            </div>
            <button className="button button-primary" type="submit">
              <ShieldCheck size={18} />
              Save Profile
            </button>
          </div>
        </form>

        <section className="hr-document-stack">
          {visibleAssignments.length === 0 ? (
            <div className="empty-state">No HR onboarding documents have been assigned yet.</div>
          ) : (
            assignmentGroups.map(([category, groupAssignments]) => (
              <div className="hr-category-group" key={category}>
                <div className="hr-category-head">
                  <h2>{category}</h2>
                  <span className="badge">
                    {groupAssignments.filter((assignment) => assignment.status !== "pending").length} of {groupAssignments.length} complete
                  </span>
                </div>
                {groupAssignments.map((assignment) => {
                  const template = templatesById.get(assignment.template_id);
                  const requirement = requirementsById.get(assignment.compliance_requirement_id ?? template?.compliance_requirement_id ?? "");
                  const signature = signaturesByAssignmentId.get(assignment.id);
                  const response = responsesByAssignmentId.get(assignment.id);
                  const signedDocument = signedDocumentsByAssignmentId.get(assignment.id);
                  const latestUpload = uploadsByAssignmentId.get(assignment.id);
                  const uploadUrl = latestUpload ? uploadUrls.get(latestUpload.id) : null;
                  const completedPdfUrl = completedPdfUrls.get(assignment.id);
                  const formDefinition = template?.form_definition_id ? formDefinitionsById.get(template.form_definition_id) : undefined;
                  const fields = getFieldSchema(formDefinition);
                  const sourceDocument = template?.source_document_id ? sourceDocumentMap.get(template.source_document_id) : null;
                  const sourceUrl = sourceDocument?.id ? sourceUrls.get(sourceDocument.id) : null;
                  const isUploadRequirement = requirement?.document_mode === "upload";
                  const canEditCurrentStep =
                    assignment.status === "pending" && (!activePendingAssignmentId || activePendingAssignmentId === assignment.id);

                  if (!template) return null;

                  return (
                    <article className="doc-card hr-sign-card" key={assignment.id}>
                      <div className="portal-topline" style={{ marginBottom: 12 }}>
                        <div>
                          <div className="eyebrow">
                            {requirement?.jurisdiction_state ? `${requirement.jurisdiction_state} - ` : ""}
                            {requirement?.document_mode?.replace("_", " ") ?? template.category}
                          </div>
                          <h2>{template.title}</h2>
                          <p>
                            Version {template.version} - {assignment.status} - {assignment.verification_status?.replace("_", " ")}
                          </p>
                        </div>
                        {assignment.status === "signed" ? (
                          <span className="badge">
                            <CheckCircle2 size={15} />
                            Complete {formatDate(signedDocument?.signed_at ?? signature?.signed_at ?? assignment.signed_at)}
                          </span>
                        ) : (
                          <span className="badge">{canEditCurrentStep ? "Current checklist item" : "Checklist item"}</span>
                        )}
                      </div>

                      {sourceUrl ? (
                        <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer">
                          <ExternalLink size={16} />
                          View attached source file
                        </a>
                      ) : null}

                      {requirement?.official_source_url ? (
                        <a className="source-link" href={requirement.official_source_url} target="_blank" rel="noreferrer">
                          <ExternalLink size={16} />
                          Official source
                        </a>
                      ) : null}

                      <div className="document-body">{template.body_text}</div>

                      {latestUpload ? (
                        <div className={latestUpload.upload_status === "rejected" ? "success-box portal-alert-error" : "success-box"}>
                          Upload status: {latestUpload.upload_status.replace("_", " ")} - {latestUpload.file_name}
                          {assignment.rejection_reason ? ` - ${assignment.rejection_reason}` : ""}
                          {uploadUrl ? (
                            <a className="source-link" href={uploadUrl} target="_blank" rel="noreferrer">
                              <ExternalLink size={16} />
                              View uploaded file
                            </a>
                          ) : null}
                        </div>
                      ) : null}

                      {isUploadRequirement && assignment.status === "pending" && canEditCurrentStep ? (
                        <form action={uploadEmployeeOnboardingDocument} className="signature-panel">
                          <input name="assignment_id" type="hidden" value={assignment.id} />
                          <input name="next" type="hidden" value={params.next ?? ""} />
                          <div className="field">
                            <label htmlFor={`upload-${assignment.id}`}>Secure onboarding file</label>
                            <input id={`upload-${assignment.id}`} name="file" required type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" />
                          </div>
                          <button className="button button-primary" type="submit">
                            <UploadCloud size={18} />
                            Upload for Review
                          </button>
                        </form>
                      ) : isUploadRequirement && assignment.status === "pending" ? (
                        <div className="success-box">Complete the current step above before uploading this requirement.</div>
                      ) : formDefinition && assignment.status === "pending" && canEditCurrentStep ? (
                        <form action={signEmployeeStructuredForm} className="signature-panel">
                          <input name="assignment_id" type="hidden" value={assignment.id} />
                          <input name="next" type="hidden" value={params.next ?? ""} />
                          <div className="hr-form-meta">
                            <span>
                              {formDefinition.jurisdiction_type.toUpperCase()} {formDefinition.jurisdiction_code}
                            </span>
                            {formDefinition.applies_to_state ? <span>Applies to {formDefinition.applies_to_state}</span> : null}
                            {formDefinition.official_form_edition ? <span>Edition {formDefinition.official_form_edition}</span> : null}
                            {formDefinition.official_form_expiration_date ? (
                              <span>Expires {formatDate(formDefinition.official_form_expiration_date)}</span>
                            ) : null}
                          </div>
                          {formDefinition.description ? <p className="muted-copy">{formDefinition.description}</p> : null}
                          {groupFieldsBySection(fields).map(([section, sectionFields]) => (
                            <fieldset className="hr-field-section" key={section}>
                              <legend>{section}</legend>
                              <div className="form-grid">{sectionFields.map((field) => renderStructuredField(field, response?.answers))}</div>
                            </fieldset>
                          ))}
                          <label className="checkbox-pill">
                            <input name="consented" type="checkbox" required />
                            I reviewed this completed form and agree to sign it electronically.
                          </label>
                          <div className="field">
                            <label htmlFor={`typed-name-${assignment.id}`}>Typed legal name</label>
                            <input id={`typed-name-${assignment.id}`} name="typed_legal_name" defaultValue={typedProfile?.legal_name ?? ""} required />
                          </div>
                          <div className="hr-form-actions">
                            <button className="button button-light" formAction={saveEmployeeFormDraft} formNoValidate type="submit">
                              Save Draft
                            </button>
                            <button className="button button-primary" type="submit">
                              <FileSignature size={18} />
                              Sign and Save PDF
                            </button>
                          </div>
                        </form>
                      ) : formDefinition && assignment.status === "pending" ? (
                        <div className="success-box">
                          Complete the current step above before filling this form. Draft status: {response?.status ?? "not started"}.
                        </div>
                      ) : assignment.status === "pending" ? (
                        <form action={signEmployeeDocument} className="signature-panel">
                          <input name="assignment_id" type="hidden" value={assignment.id} />
                          <input name="next" type="hidden" value={params.next ?? ""} />
                          <label className="checkbox-pill">
                            <input name="consented" type="checkbox" required />
                            I have reviewed this document and agree to sign it electronically.
                          </label>
                          <div className="field">
                            <label htmlFor={`typed-name-${assignment.id}`}>Typed legal name</label>
                            <input id={`typed-name-${assignment.id}`} name="typed_legal_name" defaultValue={typedProfile?.legal_name ?? ""} required />
                          </div>
                          <button className="button button-primary" type="submit">
                            <FileSignature size={18} />
                            Sign Document
                          </button>
                        </form>
                      ) : (
                        <div className="success-box">
                          Completed by {signedDocument?.typed_legal_name ?? signature?.typed_legal_name ?? "employee"} on{" "}
                          {formatDate(signedDocument?.signed_at ?? signature?.signed_at ?? assignment.signed_at)}.
                          {completedPdfUrl ? (
                            <a className="source-link" href={completedPdfUrl} target="_blank" rel="noreferrer">
                              <ExternalLink size={16} />
                              View signed PDF record
                            </a>
                          ) : null}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}
