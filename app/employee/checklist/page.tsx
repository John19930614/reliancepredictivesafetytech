import { ChecklistManager } from "@/components/ChecklistManager";
import { startupChecklistSeed, type CompanyChecklistItem } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

function normalizeItem(item: Record<string, unknown>): CompanyChecklistItem {
  return {
    id: String(item.id),
    section: String(item.section),
    title: String(item.title),
    description: String(item.description ?? ""),
    priority: String(item.priority ?? "High"),
    status: String(item.status ?? "Not Started"),
    owner: String(item.owner ?? ""),
    due_date: item.due_date ? String(item.due_date) : null,
    estimated_cost: String(item.estimated_cost ?? ""),
    notes: String(item.notes ?? ""),
    completed: Boolean(item.completed),
    linked_document_id: item.linked_document_id ? String(item.linked_document_id) : null,
    updated_at: item.updated_at ? String(item.updated_at) : undefined,
  };
}

export default async function StartupChecklistPage() {
  const supabase = await createClient();
  const { data } = supabase
    ? await supabase.from("company_checklist_items").select("*").order("section").order("created_at")
    : { data: null };
  const items = data && data.length > 0 ? data.map((item) => normalizeItem(item)) : startupChecklistSeed;

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Active Startup Checklist</div>
          <h1>Launch booklet checklist</h1>
          <p>Track owner, due date, cost, status, notes, completion, and linked documents by section.</p>
        </div>
      </div>
      <ChecklistManager initialItems={items} />
    </>
  );
}
