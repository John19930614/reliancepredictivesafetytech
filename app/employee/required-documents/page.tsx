import { RequiredDocumentUploadManager } from "@/components/RequiredDocumentUploadManager";
import type { CompanyDocument } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

export default async function RequiredDocumentsPage() {
  const supabase = await createClient();
  const { data: documents } = supabase
    ? await supabase.from("company_documents").select("*").order("updated_at", { ascending: false })
    : { data: null };

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Required Document Checklist</div>
          <h1>Master document register</h1>
          <p>Required company, legal, product, compliance, finance, sales, and technology documents.</p>
        </div>
      </div>

      <RequiredDocumentUploadManager initialDocuments={(documents ?? []) as CompanyDocument[]} />
    </>
  );
}
