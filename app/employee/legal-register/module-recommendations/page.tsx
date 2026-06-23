import { ModuleRecommendationBuilder, type ModuleRec } from "@/components/legal-register/ModuleRecommendationBuilder";
import { getLegalAccess } from "@/lib/legal/access";

export default async function ModuleRecommendationsPage() {
  const { supabase, isAdmin } = await getLegalAccess();

  let recs: ModuleRec[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("module_recommendations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    recs = data ?? [];
  }

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Legal Register</div>
          <h1>Module Recommendations</h1>
          <p>Platform modules recommended from legal register findings — with the forms, permits, inspections, training, dashboards, alerts, and workflows each would need. Track build status here.</p>
        </div>
      </div>
      <ModuleRecommendationBuilder recs={recs} isAdmin={isAdmin} />
    </>
  );
}
