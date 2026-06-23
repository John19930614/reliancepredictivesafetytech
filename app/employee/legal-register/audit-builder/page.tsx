import { AuditChecklistBuilder, type AuditItem } from "@/components/legal-register/AuditChecklistBuilder";
import { getLegalAccess } from "@/lib/legal/access";

export default async function AuditBuilderPage() {
  const { supabase } = await getLegalAccess();

  let items: AuditItem[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("audit_checklist_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    items = data ?? [];
  }

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Legal Register</div>
          <h1>Audit Checklist Builder</h1>
          <p>Practical Yes/No/NA audit checklist items generated from legal register findings, with evidence, risk, responsible role, and frequency. Export them from the Export Center.</p>
        </div>
      </div>
      <AuditChecklistBuilder items={items} />
    </>
  );
}
