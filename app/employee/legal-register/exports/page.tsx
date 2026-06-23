import { ExportCenter, type ExportBundles } from "@/components/legal-register/ExportCenter";
import { getLegalAccess } from "@/lib/legal/access";
import type { ExportMeta } from "@/lib/legal/export";

export default async function ExportsPage() {
  const { supabase } = await getLegalAccess();

  const empty: ExportBundles = { register: [], gaps: [], audits: [], modules: [], sources: [], changeLog: [], reviewQueue: [] };
  let bundles = empty;
  const meta: ExportMeta = { company: "Reliance Predictive Safety Technologies" };

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    meta.generatedBy = user?.email ?? undefined;

    const [register, gaps, audits, modules, sources, changeLog, reviewQueue] = await Promise.all([
      supabase.from("legal_register_items").select("*").eq("archived", false).order("updated_at", { ascending: false }),
      supabase.from("gap_analysis_results").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("audit_checklist_items").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("module_recommendations").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("legal_register_sources").select("*").order("name", { ascending: true }),
      supabase.from("legal_register_change_log").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("legal_register_items").select("*").eq("review_status", "needs_review").eq("archived", false),
    ]);

    // Enrich change log with entry titles for export readability.
    const changeRows = changeLog.data ?? [];
    const entryIds = [...new Set(changeRows.map((c: { entry_id: string | null }) => c.entry_id).filter(Boolean))] as string[];
    const titleById = new Map<string, string>();
    if (entryIds.length > 0) {
      const { data: entries } = await supabase.from("legal_register_items").select("id, title").in("id", entryIds);
      for (const e of entries ?? []) titleById.set(e.id, e.title);
    }

    bundles = {
      register: register.data ?? [],
      gaps: gaps.data ?? [],
      audits: audits.data ?? [],
      modules: modules.data ?? [],
      sources: sources.data ?? [],
      changeLog: changeRows.map((c: { entry_id: string | null }) => ({ ...c, entry_title: c.entry_id ? titleById.get(c.entry_id) ?? c.entry_id.slice(0, 8) : "—" })),
      reviewQueue: reviewQueue.data ?? [],
    };

    meta.sources = (sources.data ?? []).filter((s: { enabled: boolean }) => s.enabled).map((s: { name: string }) => s.name);
  }

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Legal Register</div>
          <h1>Export Center</h1>
          <p>Export any part of the legal register to PDF or Excel, with Black Label formatting, company and date headers, the source list, and the compliance disclaimer.</p>
        </div>
      </div>
      <ExportCenter bundles={bundles} meta={meta} />
    </>
  );
}
