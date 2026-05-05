import { ArrowLeft, CheckCircle2, ExternalLink, FileSignature, UserRound } from "lucide-react";
import Link from "next/link";
import { attachExistingEmployeeDocument } from "@/app/employee/users/[id]/actions";
import type {
  CompanyDocument,
  EmployeeDocumentAssignment,
  EmployeeDocumentSignature,
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

  const [{ data: authData }, { data: profile }, { data: assignments }, { data: signatures }, { data: allDocuments }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("employee_profiles").select("*").eq("user_id", id).maybeSingle(),
    admin.from("employee_document_assignments").select("*").eq("user_id", id).order("created_at"),
    admin.from("employee_document_signatures").select("*").eq("user_id", id).order("signed_at", { ascending: false }),
    admin.from("company_documents").select("*").order("updated_at", { ascending: false }),
  ]);

  const employee = authData.users.find((authUser) => authUser.id === id);
  const typedProfile = profile as HrEmployeeProfile | null;
  const typedAssignments = (assignments ?? []) as EmployeeDocumentAssignment[];
  const typedSignatures = (signatures ?? []) as EmployeeDocumentSignature[];
  const typedAllDocuments = (allDocuments ?? []) as CompanyDocument[];
  const templateIds = [...new Set(typedAssignments.map((assignment) => assignment.template_id))];
  const { data: templates } =
    templateIds.length > 0
      ? await admin.from("hr_document_templates").select("*").in("id", templateIds).order("sort_order")
      : { data: [] };

  const typedTemplates = (templates ?? []) as HrDocumentTemplate[];
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
  const signaturesByAssignmentId = new Map(typedSignatures.map((signature) => [signature.assignment_id, signature]));
  const sourceDocumentMap = new Map((sourceDocuments ?? []).map((document) => [document.id, document as CompanyDocument]));
  const signedUrls = new Map<string, string>();

  for (const document of sourceDocumentMap.values()) {
    if (!document.file_path) {
      continue;
    }

    const { data } = await admin.storage.from("company-documents").createSignedUrl(document.file_path, 60);
    if (data?.signedUrl) {
      signedUrls.set(document.id, data.signedUrl);
    }
  }

  const requiredAssignments = typedAssignments.filter((assignment) => templatesById.get(assignment.template_id)?.required);
  const completeCount = requiredAssignments.filter((assignment) => assignment.status !== "pending").length;

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
          </div>
        </section>

        <section className="hr-document-stack">
          {typedAssignments.length === 0 ? (
            <div className="empty-state">No HR onboarding documents are assigned to this employee.</div>
          ) : (
            typedAssignments.map((assignment) => {
              const template = templatesById.get(assignment.template_id);
              const signature = signaturesByAssignmentId.get(assignment.id);
              const sourceDocumentId = assignment.existing_document_id ?? signature?.source_document_id ?? template?.source_document_id ?? null;
              const sourceDocument = sourceDocumentId ? sourceDocumentMap.get(sourceDocumentId) : null;
              const sourceUrl = sourceDocument?.id ? signedUrls.get(sourceDocument.id) : null;

              return (
                <article className="doc-card" key={assignment.id}>
                  <div className="portal-topline" style={{ marginBottom: 12 }}>
                    <div>
                      <h2>{signature?.document_title ?? template?.title ?? "HR document"}</h2>
                      <p>
                        Version {signature?.template_version ?? template?.version ?? "unknown"} - {assignment.status}
                      </p>
                    </div>
                    <span className="badge">
                      {assignment.status === "signed" ? <CheckCircle2 size={15} /> : <FileSignature size={15} />}
                      {assignment.status}
                    </span>
                  </div>

                  {signature ? (
                    <div className="profile-facts">
                      <p><strong>Signed by:</strong> {signature.typed_legal_name}</p>
                      <p><strong>Signed at:</strong> {formatDate(signature.signed_at)}</p>
                      <p><strong>Signer email:</strong> {signature.signer_email ?? "Not captured"}</p>
                    </div>
                  ) : assignment.status === "waived" ? (
                    <div className="success-box">
                      Requirement bypassed with an existing document on {formatDate(assignment.waived_at)}.
                      {assignment.notes ? ` ${assignment.notes}` : ""}
                    </div>
                  ) : (
                    <p>Waiting for employee signature.</p>
                  )}

                  {sourceUrl ? (
                    <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} />
                      {sourceDocument?.title ?? "View linked source file"}
                    </a>
                  ) : sourceDocument ? (
                    <p>Linked source file: {sourceDocument.title}</p>
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
                        Attach and Bypass
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
