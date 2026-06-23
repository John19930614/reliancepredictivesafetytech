import { ChangeLogTable, type ChangeLogRow } from "@/components/legal-register/ChangeLogTable";
import { getLegalAccess } from "@/lib/legal/access";

export default async function ChangeLogPage() {
  const { supabase } = await getLegalAccess();

  let rows: ChangeLogRow[] = [];
  if (supabase) {
    const { data: changes } = await supabase
      .from("legal_register_change_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    const changeRows = (changes ?? []) as ChangeLogRow[];

    // Resolve entry titles in one batch for display.
    const entryIds = [...new Set(changeRows.map((c) => c.entry_id).filter(Boolean))] as string[];
    const titleById = new Map<string, string>();
    if (entryIds.length > 0) {
      const { data: entries } = await supabase
        .from("legal_register_items")
        .select("id, title")
        .in("id", entryIds);
      for (const e of entries ?? []) titleById.set(e.id, e.title);
    }

    rows = changeRows.map((c) => ({ ...c, entry_title: c.entry_id ? titleById.get(c.entry_id) ?? null : null }));
  }

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Legal Register</div>
          <h1>Change Log</h1>
          <p>An append-only record of every change to legal register entries — creations, edits, approvals, rejections, and archives.</p>
        </div>
      </div>
      <ChangeLogTable rows={rows} />
    </>
  );
}
