import { OperationsDatabaseManager } from "@/components/OperationsDatabaseManager";
import type { CompanyClient, CompanyDocument, CompanyOperationsRecord } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

export default async function OperationsDatabasePage() {
  const supabase = await createClient();
  const [{ data: records }, { data: clients }, { data: documents }] = supabase
    ? await Promise.all([
        supabase.from("company_operations_records").select("*").order("updated_at", { ascending: false }),
        supabase.from("company_clients").select("*").order("name"),
        supabase.from("company_documents").select("*").order("title"),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Operations Database</div>
          <h1>Central company records</h1>
          <p>Track operating needs, owners, deadlines, risks, internal decisions, vendors, assets, and linked client or document records.</p>
        </div>
        <span className="badge">{(records ?? []).length} record{(records ?? []).length === 1 ? "" : "s"}</span>
      </div>
      <OperationsDatabaseManager
        clients={(clients ?? []) as CompanyClient[]}
        documents={(documents ?? []) as CompanyDocument[]}
        initialRecords={(records ?? []) as CompanyOperationsRecord[]}
      />
    </>
  );
}
