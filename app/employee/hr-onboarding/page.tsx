import { CheckCircle2, ExternalLink, FileSignature, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { saveEmployeeProfile, signEmployeeDocument } from "@/app/employee/hr-onboarding/actions";
import type {
  CompanyDocument,
  EmployeeDocumentAssignment,
  EmployeeDocumentSignature,
  HrEmployeeProfile,
  HrDocumentTemplate,
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

  const [{ data: profile }, { data: assignments }, { data: signatures }] = await Promise.all([
    supabase.from("employee_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("employee_document_assignments").select("*").eq("user_id", user.id).order("created_at"),
    supabase.from("employee_document_signatures").select("*").eq("user_id", user.id).order("signed_at", { ascending: false }),
  ]);

  const typedAssignments = (assignments ?? []) as EmployeeDocumentAssignment[];
  const typedSignatures = (signatures ?? []) as EmployeeDocumentSignature[];
  const templateIds = [...new Set(typedAssignments.map((assignment) => assignment.template_id))];
  const { data: templates } =
    templateIds.length > 0
      ? await supabase.from("hr_document_templates").select("*").in("id", templateIds).order("sort_order")
      : { data: [] };

  const typedTemplates = (templates ?? []) as HrDocumentTemplate[];
  const sourceDocumentIds = [...new Set(typedTemplates.map((template) => template.source_document_id).filter(Boolean) as string[])];
  const { data: sourceDocuments } =
    sourceDocumentIds.length > 0
      ? await supabase.from("company_documents").select("*").in("id", sourceDocumentIds)
      : { data: [] };

  const sourceDocumentMap = new Map((sourceDocuments ?? []).map((document) => [document.id, document as CompanyDocument]));
  const signedUrls = new Map<string, string>();

  for (const document of sourceDocumentMap.values()) {
    if (!document.file_path) {
      continue;
    }

    const { data } = await supabase.storage.from("company-documents").createSignedUrl(document.file_path, 60);
    if (data?.signedUrl) {
      signedUrls.set(document.id, data.signedUrl);
    }
  }

  const templatesById = new Map(typedTemplates.map((template) => [template.id, template]));
  const signaturesByAssignmentId = new Map(typedSignatures.map((signature) => [signature.assignment_id, signature]));
  const requiredAssignments = typedAssignments.filter((assignment) => templatesById.get(assignment.template_id)?.required);
  const completeCount = requiredAssignments.filter((assignment) => assignment.status !== "pending").length;
  const totalRequired = requiredAssignments.length;
  const allComplete = totalRequired === 0 || completeCount === totalRequired;
  const completionLabel = totalRequired === 0 ? "No HR packet assigned" : `${completeCount} of ${totalRequired} required documents complete`;
  const nextPath = getSafeNextPath(params.next);

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Employee HR Onboarding</div>
          <h1>Complete your onboarding packet</h1>
          <p>Review each required document, confirm consent, and sign with your legal name.</p>
        </div>
        <span className="badge">{allComplete ? "Complete" : completionLabel}</span>
      </div>

      {params.message ? <div className="success-box portal-alert">{params.message}</div> : null}
      {params.error ? <div className="success-box portal-alert portal-alert-error">{params.error}</div> : null}
      {allComplete ? (
        <div className="success-box portal-alert onboarding-complete-alert">
          <div>
            <strong>Onboarding paperwork complete.</strong>
            <p>You can continue into the employee portal.</p>
          </div>
          <Link className="button button-primary" href={nextPath}>
            Continue to Dashboard
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
              <input id="legal_name" name="legal_name" defaultValue={(profile as HrEmployeeProfile | null)?.legal_name ?? ""} required />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" defaultValue={(profile as HrEmployeeProfile | null)?.phone ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="emergency_contact_name">Emergency contact</label>
              <input
                id="emergency_contact_name"
                name="emergency_contact_name"
                defaultValue={(profile as HrEmployeeProfile | null)?.emergency_contact_name ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor="emergency_contact_phone">Emergency contact phone</label>
              <input
                id="emergency_contact_phone"
                name="emergency_contact_phone"
                defaultValue={(profile as HrEmployeeProfile | null)?.emergency_contact_phone ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor="emergency_contact_relationship">Relationship</label>
              <input
                id="emergency_contact_relationship"
                name="emergency_contact_relationship"
                defaultValue={(profile as HrEmployeeProfile | null)?.emergency_contact_relationship ?? ""}
              />
            </div>
            <button className="button button-primary" type="submit">
              <ShieldCheck size={18} />
              Save Profile
            </button>
          </div>
        </form>

        <section className="hr-document-stack">
          {typedAssignments.length === 0 ? (
            <div className="empty-state">No HR onboarding documents have been assigned yet.</div>
          ) : (
            typedAssignments.map((assignment) => {
              const template = templatesById.get(assignment.template_id);
              const signature = signaturesByAssignmentId.get(assignment.id);
              const sourceDocument = template?.source_document_id ? sourceDocumentMap.get(template.source_document_id) : null;
              const sourceUrl = sourceDocument?.id ? signedUrls.get(sourceDocument.id) : null;

              if (!template) {
                return null;
              }

              return (
                <article className="doc-card hr-sign-card" key={assignment.id}>
                  <div className="portal-topline" style={{ marginBottom: 12 }}>
                    <div>
                      <div className="eyebrow">{template.category}</div>
                      <h2>{template.title}</h2>
                      <p>
                        Version {template.version} - {assignment.status}
                      </p>
                    </div>
                    {assignment.status === "signed" ? (
                      <span className="badge">
                        <CheckCircle2 size={15} />
                        Signed {formatDate(signature?.signed_at ?? assignment.signed_at)}
                      </span>
                    ) : (
                      <span className="badge">Required</span>
                    )}
                  </div>

                  {sourceUrl ? (
                    <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={16} />
                      View attached source file
                    </a>
                  ) : null}

                  <div className="document-body">{template.body_text}</div>

                  {assignment.status === "pending" ? (
                    <form action={signEmployeeDocument} className="signature-panel">
                      <input name="assignment_id" type="hidden" value={assignment.id} />
                      <input name="next" type="hidden" value={params.next ?? ""} />
                      <label className="checkbox-pill">
                        <input name="consented" type="checkbox" required />
                        I have reviewed this document and agree to sign it electronically.
                      </label>
                      <div className="field">
                        <label htmlFor={`typed-name-${assignment.id}`}>Typed legal name</label>
                        <input
                          id={`typed-name-${assignment.id}`}
                          name="typed_legal_name"
                          defaultValue={(profile as HrEmployeeProfile | null)?.legal_name ?? ""}
                          required
                        />
                      </div>
                      <button className="button button-primary" type="submit">
                        <FileSignature size={18} />
                        Sign Document
                      </button>
                    </form>
                  ) : (
                    <div className="success-box">
                      Signed by {signature?.typed_legal_name ?? "employee"} on {formatDate(signature?.signed_at ?? assignment.signed_at)}.
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </>
  );
}
