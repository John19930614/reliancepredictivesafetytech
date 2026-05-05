import { DocumentLibraryManager } from "@/components/DocumentLibraryManager";
import { startupChecklistSeed, type CompanyChecklistItem, type CompanyClient, type CompanyDocument, type CompanyDocumentRequirement } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentLibraryPage() {
  const supabase = await createClient();
  const [{ data: documents }, { data: checklistItems }, { data: clients }, { data: requirements }] = supabase
    ? await Promise.all([
        supabase.from("company_documents").select("*").order("updated_at", { ascending: false }),
        supabase.from("company_checklist_items").select("*").order("section").order("created_at"),
        supabase.from("company_clients").select("*").order("updated_at", { ascending: false }),
        supabase.from("company_document_requirements").select("*").order("sort_order"),
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }];

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Master Document Library</div>
          <h1>Sales-to-active document control</h1>
          <p>Track master templates, company records, and client records across the full customer lifecycle.</p>
        </div>
      </div>
      <DocumentLibraryManager
        clients={(clients ?? []) as CompanyClient[]}
        checklistItems={(checklistItems && checklistItems.length > 0 ? checklistItems : startupChecklistSeed) as CompanyChecklistItem[]}
        initialDocuments={(documents ?? []) as CompanyDocument[]}
        requirements={(requirements ?? []) as CompanyDocumentRequirement[]}
      />
    </>
  );
}
