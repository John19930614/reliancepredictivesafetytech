import { ArrowLeft, CheckCircle2, ExternalLink, FileSignature, UserRound } from "lucide-react";
import Link from "next/link";
import { attachExistingEmployeeDocument, reviewEmployeeOnboardingUpload } from "@/app/employee/users/[id]/actions";
import type {
  CompanyDocument,
  EmployeeDocumentAssignment,
  EmployeeFormResponse,
  EmployeeOnboardingUpload,
  EmployeeOnboardingAuditEvent,
  EmployeeSignedDocument,
  EmployeeDocumentSignature,
  HrComplianceRequirement,
  HrFormDefinition,
  HrDocumentTemplate,
  HrEmployeeProfile,
} from "@/lib/company-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";

type EmployeeProfilePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string; error?: string }>;
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Not signed";
}

export default async function EmployeeProfilePage({ params, searchParams }: EmployeeProfilePageProps) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  const { data: currentRole } =
    supabase && user
      ? await supabase
          .from("user_roles")
          .select("role, account_status")
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null };

  const canViewProfile = currentRole?.account_status === "active" && isPortalAdminRole(currentRole.role);
  const admin = canViewProfile ? createAdminClient() : null;

  if (!canViewProfile || !admin) {
    return (
      <section className="portal-card">
        <UserRound color="#c9932b" size={28} />
        <h1>Admin access required</h1>
        <p>Your account needs an active admin role before it can view employee profiles.</p>
      </section>
    );
  }

  const [
    { data: authData },
    { data: profile },
    { data: assignments },
    { data: signatures },
    { data: formResponses },
    { data: signedDocuments },
    { data: onboardingUploads },
    { data: auditEvents },
    { data: allDocuments },
  ] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("employee_profiles").select("*").eq("user_id", id).maybeSingle(),
    admin.from("employee_document_assignments").select("*").eq("user_id", id).order("created_at"),
    admin.from("employee_document_signatures").select("*").eq("user_id", id).order("signed_at", { ascending: false }),
    admin.from("employee_form_responses").select("*").eq("user_id", id).order("updated_at", { ascending: false }),
    admin.from("employee_signed_documents").select("*").eq("user_id", id).order("signed_at", { ascending: false }),
    admin.from("employee_onboarding_uploads").select("*").eq("user_id", id).order("created_at", { ascending: false }),
    admin.from("employee_onboarding_audit_events").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(100),
    admin.from("company_documents").select("*").order("updated_at", { ascending: false }),
  ]);

  const employee = authData.users.find((authUser) => authUser.id === id);
  const typedProfile = profile as HrEmployeeProfile | null;
  const typedAssignments = (assignments ?? []) as EmployeeDocumentAssignment[];
  const typedSignatures = (signatures ?? []) as EmployeeDocumentSignature[];
  const typedFormResponses = (formResponses ?? []) as EmployeeFormResponse[];
  const typedSignedDocuments = (signedDocuments ?? []) as EmployeeSignedDocument[];
  const typedOnboardingUploads = (onboardingUploads ?? []) as EmployeeOnboardingUpload[];
  const typedAuditEvents = (auditEvents ?? []) as EmployeeOnboardingAuditEvent[];
  const typedAllDocuments = (allDocuments ?? []) as CompanyDocument[];
  const templateIds = [...new Set(typedAssignments.map((assignment) => assignment.template_id))];
  const { data: templates } =
    templateIds.length > 0
      ? await admin.from("hr_document_templates").select("*").in("id", templateIds).order("sort_order")
      : { data: [] };

  const typedTemplates = (templates ?? []) as HrDocumentTemplate[];
  const formDefinitionIds = [...new Set(typedTemplates.map((template) => template.form_definition_id).filter(Boolean) as string[])];
  const { data: formDefinitions } =
    formDefinitionIds.length > 0 ? await admin.from("hr_form_definitions").select("*").in("id", formDefinitionIds) : { data: [] };
  const requirementIds = [
    ...new Set(
      [
        ...typedAssignments.map((assignment) => assignment.compliance_requirement_id),
        ...typedTemplates.map((template) => template.compliance_requirement_id),
      ].filter(Boolean) as string[],
    ),
  ];
  const { data: complianceRequirements } =
    requirementIds.length > 0 ? await admin.from("hr_compliance_requirements").select("*").in("id", requirementIds) : { data: [] };
  const sourceDocumentIds = [
    ...new Set(
      [
        ...typedTemplates.map((template) => template.source_document_id),
        ...typedSignatures.map((signature) => signature.source_document_id),
        ...typedAssignments.map((assignment) => assignment.existing_document_id),
      ].filter(Boolean) as string[],
    ),
  ];
  const { data: sourceDocuments } =
    sourceDocumentIds.length > 0 ? await admin.from("company_documents").select("*").in("id", sourceDocumentIds) : { data: [] };

  const templatesById = new Map(typedTemplates.map((template) => [template.id, template]));
  const formDefinitionsById = new Map((formDefinitions ?? []).map((definition) => [definition.id, definition as HrFormDefinition]));
  const signaturesByAssignmentId = new Map(typedSignatures.map((signature) => [signature.assignment_id, signature]));
  const responsesByAssignmentId = new Map(typedFormResponses.map((response) => [response.assignment_id, response]));
  const signedDocumentsByAssignmentId = new Map(typedSignedDocuments.map((document) => [document.assignment_id, document]));
  const auditEventsByAssignmentId = new Map<string, EmployeeOnboardingAuditEvent[]>();
  const sourceDocumentMap = new Map((sourceDocuments ?? []).map((document) => [document.id, document as CompanyDocument]));
  const signedUrls = new Map<string, string>();
  const signedPdfUrls = new Map<string, string>();
  const uploadUrls = new Map<string, string>();

  for (const event of typedAuditEvents) {
    if (!event.assignment_id) {
      continue;
    }
    auditEventsByAssignmentId.set(event.assignment_id, [...(auditEventsByAssignmentId.get(event.assignment_id) ?? []), event]);
  }

  for (const document of sourceDocumentMap.values()) {
    if (!document.file_path) {
      continue;
    }

    const { data } = await admin.storage.from("company-documents").createSignedUrl(document.file_path, 60);
    if (data?.signedUrl) {
      signedUrls.set(document.id, data.signedUrl);
    }
  }

  for (const document of typedSignedDocuments) {
    const { data } = await admin.storage.from(document.file_bucket).createSignedUrl(document.file_path, 60);
    if (data?.signedUrl) {
      signedPdfUrls.set(document.assignment_id, data.signedUrl);
    }
  }

  for (const upload of typedOnboardingUploads) {
    const { data } = await admin.storage.from(upload.file_bucket).createSignedUrl(upload.file_path, 60);
    if (data?.signedUrl) {
      uploadUrls.set(upload.id, data.signedUrl);
    }
  }

  const requiredAssignments = typedAssignments.filter((assignment) => templatesById.get(assignment.template_id)?.required);
  const completeCount = requiredAssignments.filter((assignment) => assignment.status !== "pending").length;
  const requirementsById = new Map((complianceRequirements ?? []).map((requirement) => [requirement.id, requirement as HrComplianceRequirement]));
  const uploadsByAssignmentId = new Map<string, EmployeeOnboardingUpload[]>();
  for (const upload of typedOnboardingUploads) {
    uploadsByAssignmentId.set(upload.assignment_id, [...(uploadsByAssignmentId.get(upload.assignment_id) ?? []), upload]);
  }
  const readinessCounts = typedAssignments.reduce(
    (counts, assignment) => {
      if (assignment.status === "pending") {
        counts.pending += 1;
      } else if (assignment.status === "waived") {
        counts.waived += 1;
      } else {
        counts.complete += 1;
      }

      if (assignment.verification_status === "pending_review") counts.review += 1;
      if (assignment.verification_status === "rejected") counts.rejected += 1;
      return counts;
    },
    { complete: 0, pending: 0, review: 0, rejected: 0, waived: 0 },
  );

  return (
    <>
      <div className="portal-topline">
        <div>
          <Link className="button button-light" href="/employee/users">
            <ArrowLeft size={16} />
            Back to Users
          </Link>
          <div className="eyebrow" style={{ marginTop: 18 }}>Employee Profile</div>
          <h1>{typedProfile?.legal_name || employee?.email || "Employee"}</h1>
          <p>{employee?.email ?? "No email"} - Onboarding {typedProfile?.onboarding_status ?? "not started"}</p>
        </div>
        <span className="badge">
          {requiredAssignments.length === 0 ? "No packet assigned" : `${completeCount} of ${requiredAssignments.length} required complete`}
        </span>
      </div>

      {query.message ? <div className="success-box portal-alert">{query.message}</div> : null}
      {query.error ? <div className="success-box portal-alert portal-alert-error">{query.error}</div> : null}

      <div className="client-detail-grid">
        <section className="portal-card">
          <UserRound color="#c9932b" size={28} />
          <h2>Profile details</h2>
          <div className="profile-facts">
            <p><strong>Legal name:</strong> {typedProfile?.legal_name ?? "Not provided"}</p>
            <p><strong>Phone:</strong> {typedProfile?.phone ?? "Not provided"}</p>
            <p><strong>Emergency contact:</strong> {typedProfile?.emergency_contact_name ?? "Not provided"}</p>
            <p><strong>Emergency phone:</strong> {typedProfile?.emergency_contact_phone ?? "Not provided"}</p>
            <p><strong>Relationship:</strong> {typedProfile?.emergency_contact_relationship ?? "Not provided"}</p>
            <p><strong>Completed:</strong> {formatDate(typedProfile?.onboarding_completed_at)}</p>
            <p>
              <strong>Readiness:</strong> {readinessCounts.complete} complete, {readinessCounts.pending} missing,{" "}
              {readinessCounts.review} pending review, {readinessCounts.rejected} rejected, {readinessCounts.waived} waived
            </p>
          </div>
        </section>

        <section className="hr-document-stack">
          {typedAssignments.length === 0 ? (
            <div className="empty-state">No HR onboarding documents are assigned to this employee.</div>
          ) : (
            typedAssignments.map((assignment) => {
              const template = templatesById.get(assignment.template_id);
              const signature = signaturesByAssignmentId.get(assignment.id);
              const response = responsesByAssignmentId.get(assignment.id);
              const signedDocument = signedDocumentsByAssignmentId.get(assignment.id);
              const formDefinition = template?.form_definition_id ? formDefinitionsById.get(template.form_definition_id) : null;
              const signedPdfUrl = signedPdfUrls.get(assignment.id);
              const assignmentAuditEvents = auditEventsByAssignmentId.get(assignment.id) ?? [];
              const sourceDocumentId = assignment.existing_document_id ?? signature?.source_document_id ?? template?.source_document_id ?? null;
              const sourceDocument = sourceDocumentId ? sourceDocumentMap.get(sourceDocumentId) : null;
              const sourceUrl = sourceDocument?.id ? signedUrls.get(sourceDocument.id) : null;
              const requirement = requirementsById.get(assignment.compliance_requirement_id ?? template?.compliance_requirement_id ?? "");
              const assignmentUploads = uploadsByAssignmentId.get(assignment.id) ?? [];
              const latestUpload = assignmentUploads.find((upload) => upload.upload_status !== "superseded");

              return (
                <article className="doc-card" key={assignment.id}>
                  <div className="portal-topline" style={{ marginBottom: 12 }}>
                    <div>
                      <h2>{signature?.document_title ?? template?.title ?? "HR document"}</h2>
                      <p>
                        Version {signature?.template_version ?? template?.version ?? "unknown"} - {assignment.status} -{" "}
                        {assignment.verification_status?.replace("_", " ")}
                      </p>
                      {requirement ? <p>{requirement.jurisdiction_state ?? requirement.jurisdiction_level} - {requirement.document_mode.replace("_", " ")}</p> : null}
                    </div>
                    <span className="badge">
                      {assignment.status === "signed" ? <CheckCircle2 size={15} /> : <FileSignature size={15} />}
                      {assignment.status}
                    </span>
                  </div>

                  {signature ? (
                    <div className="profile-facts">
                      <p><strong>Signed by:</strong> {signedDocument?.typed_legal_name ?? signature.typed_legal_name}</p>
                      <p><strong>Signed at:</strong> {formatDate(signedDocument?.signed_at ?? signature.signed_at)}</p>
                      <p><strong>Signer email:</strong> {signedDocument?.signer_email ?? signature.signer_email ?? "Not captured"}</p>
                      {formDefinition ? <p><strong>Fillable form:</strong> {formDefinition.title}</p> : null}
                      {response ? <p><strong>Response status:</strong> {response.status}</p> : null}
                      {signedDocument ? <p><strong>PDF SHA-256:</strong> {signedDocument.file_sha256}</p> : null}
                    </div>
                  ) : assignment.status === "waived" ? (
                    <div className="success-box">
                      Satisfied by uploaded record on {formatDate(assignment.waived_at)}.
                      {assignment.notes ? ` ${assignment.notes}` : ""}
                    </div>
                  ) : latestUpload ? (
                    <div className={latestUpload.upload_status === "rejected" ? "success-box portal-alert-error" : "success-box"}>
                      Latest upload: {latestUpload.upload_status.replace("_", " ")} - {latestUpload.file_name}
                      {assignment.rejection_reason ? ` - ${assignment.rejection_reason}` : ""}
                    </div>
                  ) : (
                    <p>Waiting for employee signature.</p>
                  )}

                  {signedPdfUrl ? (
                    <a className="source-link" href={signedPdfUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} />
                      View completed signed PDF
                    </a>
                  ) : null}

                  {sourceUrl ? (
                    <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} />
                      {sourceDocument?.title ?? "View linked source file"}
                    </a>
                  ) : sourceDocument ? (
                    <p>Linked source file: {sourceDocument.title}</p>
                  ) : null}

                  {assignmentUploads.length > 0 ? (
                    <div className="profile-facts audit-event-list">
                      <p><strong>Secure uploads:</strong></p>
                      {assignmentUploads.slice(0, 4).map((upload) => {
                        const uploadUrl = uploadUrls.get(upload.id);

                        return (
                          <div className="upload-review-row" key={upload.id}>
                            <p>
                              {upload.upload_status.replace("_", " ")} - {upload.file_name} - SHA-256 {upload.file_sha256}
                            </p>
                            {uploadUrl ? (
                              <a className="source-link" href={uploadUrl} target="_blank" rel="noreferrer">
                                <ExternalLink size={16} />
                                View upload
                              </a>
                            ) : null}
                            {upload.upload_status === "pending_review" ? (
                              <form action={reviewEmployeeOnboardingUpload} className="signature-panel">
                                <input name="profile_user_id" type="hidden" value={id} />
                                <input name="assignment_id" type="hidden" value={assignment.id} />
                                <input name="upload_id" type="hidden" value={upload.id} />
                                <div className="form-grid">
                                  <div className="field">
                                    <label htmlFor={`review-notes-${upload.id}`}>Review notes</label>
                                    <input id={`review-notes-${upload.id}`} name="review_notes" placeholder="Verified, rejected reason, or retention note" />
                                  </div>
                                  <div className="field">
                                    <label htmlFor={`retention-${upload.id}`}>Retention until</label>
                                    <input id={`retention-${upload.id}`} name="retention_until" type="date" />
                                  </div>
                                  <label className="checkbox-pill">
                                    <input name="legal_hold" type="checkbox" defaultChecked={assignment.legal_hold} />
                                    Legal hold
                                  </label>
                                </div>
                                <div className="hr-form-actions">
                                  <button className="button button-primary" name="decision" value="approve" type="submit">
                                    Approve Upload
                                  </button>
                                  <button className="button button-danger" name="decision" value="reject" type="submit">
                                    Reject Upload
                                  </button>
                                </div>
                              </form>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {assignmentAuditEvents.length > 0 ? (
                    <div className="profile-facts audit-event-list">
                      <p><strong>Audit trail:</strong></p>
                      {assignmentAuditEvents.slice(0, 4).map((event) => (
                        <p key={event.id}>
                          {event.event_type.replace(/_/g, " ")} - {formatDate(event.created_at)}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {assignment.status === "pending" ? (
                    <form action={attachExistingEmployeeDocument} className="signature-panel">
                      <input name="profile_user_id" type="hidden" value={id} />
                      <input name="assignment_id" type="hidden" value={assignment.id} />
                      <div className="field">
                        <label htmlFor={`existing-document-${assignment.id}`}>Existing employee document</label>
                        <select id={`existing-document-${assignment.id}`} name="existing_document_id" required defaultValue="">
                          <option value="">Choose a document</option>
                          {typedAllDocuments.map((document) => (
                            <option key={document.id} value={document.id}>
                              {document.title} - {document.category}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={`bypass-notes-${assignment.id}`}>Bypass notes</label>
                        <input
                          id={`bypass-notes-${assignment.id}`}
                          name="notes"
                          placeholder="Already signed offline, uploaded by admin, payroll packet received..."
                        />
                      </div>
                      <button className="button button-secondary" type="submit">
                        <ExternalLink size={16} />
                        Satisfy with Uploaded Record
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })
          )}
        </section>
      </div>
    </>
  );
}
