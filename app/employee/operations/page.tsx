import { OperationsDatabaseManager } from "@/components/OperationsDatabaseManager";
import type { CompanyClient, CompanyDocument, CompanyOperationsRecord, HrEmployeeProfile } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

export default async function OperationsDatabasePage() {
  const supabase = await createClient();
  const [{ data: records }, { data: clients }, { data: documents }, { data: employeeProfiles }] = supabase
    ? await Promise.all([
        supabase.from("company_operations_records").select("*").order("updated_at", { ascending: false }),
        supabase.from("company_clients").select("*").order("name"),
        supabase.from("company_documents").select("*").order("title"),
        supabase.from("employee_profiles").select("user_id, display_name, legal_name, email").eq("profile_status", "active").order("display_name"),
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }];
  const ownerOptions = ((employeeProfiles ?? []) as HrEmployeeProfile[]).map(
    (profile) => profile.display_name || profile.legal_name || profile.email || profile.user_id.slice(0, 8)
  );

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
        ownerOptions={ownerOptions}
      />
    </>
  );
}
