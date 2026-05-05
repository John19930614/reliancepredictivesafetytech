import { FileSignature, Save, Sparkles } from "lucide-react";
import {
  createHrDocumentTemplate,
  updateHrDocumentTemplate,
  upsertRequiredHrDocumentTemplates,
} from "@/app/employee/hr-documents/actions";
import type { CompanyDocument, HrDocumentTemplate } from "@/lib/company-data";
import { requiredHrDocumentTemplates } from "@/lib/hr-document-templates";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";

type HrDocumentsPageProps = {
  searchParams: Promise<{ message?: string; error?: string }>;
};

export default async function HrDocumentsPage({ searchParams }: HrDocumentsPageProps) {
  const params = await searchParams;
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

  const canManageHrDocuments = currentRole?.account_status === "active" && isPortalAdminRole(currentRole.role);
  const [{ data: templates }, { data: documents }] =
    supabase && canManageHrDocuments
      ? await Promise.all([
          supabase.from("hr_document_templates").select("*").order("sort_order"),
          supabase.from("company_documents").select("*").order("title"),
        ])
      : [{ data: null }, { data: null }];

  const hrTemplates = (templates ?? []) as HrDocumentTemplate[];
  const sourceDocuments = (documents ?? []) as CompanyDocument[];
  const requiredTemplateKeys = new Set(requiredHrDocumentTemplates.map((template) => `${template.title}:${template.version}`));
  const installedRequiredCount = hrTemplates.filter((template) => requiredTemplateKeys.has(`${template.title}:${template.version}`)).length;
  const missingRequiredCount = requiredHrDocumentTemplates.length - installedRequiredCount;

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">HR Document Templates</div>
          <h1>Employee signing packet</h1>
          <p>Maintain the website text employees sign and optionally link source files from the document library.</p>
        </div>
        <span className="badge">{canManageHrDocuments ? `${hrTemplates.length} templates` : "Admin role required"}</span>
      </div>

      {params.message ? <div className="success-box portal-alert">{params.message}</div> : null}
      {params.error ? <div className="success-box portal-alert portal-alert-error">{params.error}</div> : null}
      {canManageHrDocuments ? (
        <div className="success-box portal-alert">
          These forms support compliance workflows but do not replace legal, payroll, or HR review. Verify official government form
          versions and company policy language before relying on the packet as the official HR system of record.
        </div>
      ) : null}

      {!canManageHrDocuments ? (
        <section className="portal-card">
          <FileSignature color="#c9932b" size={28} />
          <h3>Admin access required</h3>
          <p>Your account needs an active admin, company admin, super admin, or platform admin role before it can manage HR documents.</p>
        </section>
      ) : (
        <div className="hr-template-layout">
          <div className="hr-template-tools">
            <form action={upsertRequiredHrDocumentTemplates} className="form-panel">
              <Sparkles color="#c9932b" size={26} />
              <h2>Required starter packet</h2>
              <p className="muted-copy">
                Adds federal, Texas, payroll, policy, privacy, safety, security, and e-sign forms using the current starter
                packet.
              </p>
              <div className="hr-form-summary">
                <span>{installedRequiredCount} installed</span>
                <span>{missingRequiredCount > 0 ? `${missingRequiredCount} missing` : "Ready"}</span>
              </div>
              <button className="button button-primary" type="submit">
                <Sparkles size={18} />
                Add / Update Required Forms
              </button>
            </form>

            <form action={createHrDocumentTemplate} className="form-panel">
              <h2>New template</h2>
              <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
                <div className="field">
                  <label htmlFor="title">Title</label>
                  <input id="title" name="title" required />
                </div>
                <div className="field">
                  <label htmlFor="category">Category</label>
                  <input id="category" name="category" defaultValue="People / HR" />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="version">Version</label>
                    <input id="version" name="version" type="number" min="1" defaultValue="1" />
                  </div>
                  <div className="field">
                    <label htmlFor="sort_order">Sort order</label>
                    <input id="sort_order" name="sort_order" type="number" defaultValue="100" />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="source_document_id">Optional source file</label>
                  <select id="source_document_id" name="source_document_id" defaultValue="">
                    <option value="">No linked file</option>
                    {sourceDocuments.map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.title}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="checkbox-pill">
                  <input name="active" type="checkbox" defaultChecked />
                  Active
                </label>
                <label className="checkbox-pill">
                  <input name="required" type="checkbox" defaultChecked />
                  Required
                </label>
                <div className="field">
                  <label htmlFor="body_text">Document body</label>
                  <textarea id="body_text" name="body_text" required />
                </div>
                <button className="button button-primary" type="submit">
                  <FileSignature size={18} />
                  Create Template
                </button>
              </div>
            </form>
          </div>

          <section className="hr-document-stack">
            {hrTemplates.length === 0 ? (
              <div className="empty-state">No HR document templates found.</div>
            ) : (
              hrTemplates.map((template) => (
                <form action={updateHrDocumentTemplate} className="doc-card hr-template-card" key={template.id}>
                  <input name="template_id" type="hidden" value={template.id} />
                  <div className="portal-topline" style={{ marginBottom: 12 }}>
                    <div>
                      <h2>{template.title}</h2>
                      <p>
                        {template.category} - Version {template.version} - {template.active ? "Active" : "Inactive"} -{" "}
                        {template.required ? "Required" : "Optional"}
                      </p>
                    </div>
                    <button className="button button-light" type="submit">
                      <Save size={16} />
                      Save
                    </button>
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label>Title</label>
                      <input name="title" defaultValue={template.title} required />
                    </div>
                    <div className="field">
                      <label>Category</label>
                      <input name="category" defaultValue={template.category} />
                    </div>
                    <div className="field">
                      <label>Version</label>
                      <input name="version" type="number" min="1" defaultValue={template.version} />
                    </div>
                    <div className="field">
                      <label>Sort order</label>
                      <input name="sort_order" type="number" defaultValue={template.sort_order} />
                    </div>
                    <div className="field-full">
                      <label>Optional source file</label>
                      <select name="source_document_id" defaultValue={template.source_document_id ?? ""}>
                        <option value="">No linked file</option>
                        {sourceDocuments.map((document) => (
                          <option key={document.id} value={document.id}>
                            {document.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="checkbox-pill">
                      <input name="active" type="checkbox" defaultChecked={template.active} />
                      Active
                    </label>
                    <label className="checkbox-pill">
                      <input name="required" type="checkbox" defaultChecked={template.required} />
                      Required
                    </label>
                    <div className="field-full">
                      <label>Document body</label>
                      <textarea name="body_text" defaultValue={template.body_text} required />
                    </div>
                  </div>
                </form>
              ))
            )}
          </section>
        </div>
      )}
    </>
  );
}
