import { DocumentLibraryManager } from "@/components/DocumentLibraryManager";
import { startupChecklistSeed, type CompanyChecklistItem, type CompanyDocument } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentLibraryPage() {
  const supabase = await createClient();
  const [{ data: documents }, { data: checklistItems }] = supabase
    ? await Promise.all([
        supabase.from("company_documents").select("*").order("updated_at", { ascending: false }),
        supabase.from("company_checklist_items").select("*").order("section").order("created_at"),
      ])
    : [{ data: null }, { data: null }];

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Document Library</div>
          <h1>Company document control</h1>
          <p>Upload, categorize, link, filter, view, and update document status.</p>
        </div>
      </div>
      <DocumentLibraryManager
        checklistItems={(checklistItems && checklistItems.length > 0 ? checklistItems : startupChecklistSeed) as CompanyChecklistItem[]}
        initialDocuments={(documents ?? []) as CompanyDocument[]}
      />
    </>
  );
}
