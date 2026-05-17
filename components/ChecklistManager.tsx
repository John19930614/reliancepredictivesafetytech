"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { checklistStatuses, type CompanyChecklistItem } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type ChecklistManagerProps = {
  initialItems: CompanyChecklistItem[];
};

export function ChecklistManager({ initialItems }: ChecklistManagerProps) {
  const [items, setItems] = useState(initialItems);
  const [savingId, setSavingId] = useState<string | null>(null);
  const grouped = useMemo(() => {
    return items.reduce<Record<string, CompanyChecklistItem[]>>((accumulator, item) => {
      accumulator[item.section] = accumulator[item.section] ?? [];
      accumulator[item.section].push(item);
      return accumulator;
    }, {});
  }, [items]);

  async function updateItem(item: CompanyChecklistItem, patch: Partial<CompanyChecklistItem>) {
    const nextPatch: Partial<CompanyChecklistItem> = {
      ...patch,
      completed: patch.status === "Complete" ? true : (patch.completed ?? item.completed),
    };

    setItems((current) =>
      current.map((currentItem) => (currentItem === item || currentItem.id === item.id ? { ...currentItem, ...nextPatch } : currentItem)),
    );

    if (!item.id) {
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      return;
    }

    setSavingId(item.id);
    await supabase.from("company_checklist_items").update(nextPatch).eq("id", item.id);
    setSavingId(null);
  }

  return (
    <div className="table-card">
      {Object.entries(grouped).map(([section, sectionItems]) => (
        <section className="checklist-section" key={section}>
          <div className="portal-topline" style={{ marginBottom: 16 }}>
            <div>
              <h2>{section}</h2>
              <p>{sectionItems.length} active launch item{sectionItems.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <div className="checklist-list">
            {sectionItems.map((item) => (
              <article className="checklist-row" key={item.id ?? item.title}>
                <input
                  aria-label={`Mark ${item.title} complete`}
                  checked={item.completed}
                  onChange={(event) =>
                    updateItem(item, {
                      completed: event.target.checked,
                      status: event.target.checked ? "Complete" : "Not Started",
                    })
                  }
                  type="checkbox"
                />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <p>
                    <strong>Owner:</strong> {item.owner || "Unassigned"} - <strong>Cost:</strong>{" "}
                    {item.estimated_cost || "TBD"}
                  </p>
                  <div className="form-grid" style={{ marginTop: 12 }}>
                    <div className="field">
                      <label>Status</label>
                      <select
                        value={item.status}
                        onChange={(event) => updateItem(item, { status: event.target.value, completed: event.target.value === "Complete" })}
                      >
                        {checklistStatuses.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Priority</label>
                      <input
                        value={item.priority}
                        onChange={(event) => updateItem(item, { priority: event.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Owner</label>
                      <input value={item.owner} onChange={(event) => updateItem(item, { owner: event.target.value })} />
                    </div>
                    <div className="field">
                      <label>Due date</label>
                      <input
                        type="date"
                        value={item.due_date ?? ""}
                        onChange={(event) => updateItem(item, { due_date: event.target.value || null })}
                      />
                    </div>
                    <div className="field">
                      <label>Cost estimate</label>
                      <input
                        value={item.estimated_cost}
                        onChange={(event) => updateItem(item, { estimated_cost: event.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Linked document ID</label>
                      <input
                        value={item.linked_document_id ?? ""}
                        onChange={(event) => updateItem(item, { linked_document_id: event.target.value || null })}
                      />
                    </div>
                    <div className="field-full">
                      <label>Notes</label>
                      <textarea value={item.notes} onChange={(event) => updateItem(item, { notes: event.target.value })} />
                    </div>
                  </div>
                </div>
                <span className="badge">
                  <Save size={14} /> {savingId === item.id ? "Saving" : item.status}
                </span>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
