import { Target } from "lucide-react";
import { LeadTriagePanel } from "@/components/LeadTriagePanel";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { MobileLeadsList } from "@/components/mobile/MobileLeadsList";
import { loadLatestLeadTriage } from "@/lib/leads/latest-triage";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { requireMobileTabSession } from "../session";

export const dynamic = "force-dynamic";

export default async function MobileLeadsPage() {
  const session = await requireMobileTabSession("leads");
  const { supabase } = session;

  const { data: clients, error } = await supabase
    .from("company_clients")
    .select("id, name, contact_name, lifecycle_stage, status, owner, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error && isMissingSchemaRelationError(error)) {
    return (
      <>
        <MobileHeader eyebrow="Leads" title="Pipeline" />
        <div className="m-empty">
          <Target aria-hidden="true" size={26} strokeWidth={1.7} />
          <p>The pipeline is not set up yet.</p>
          <small>Apply the sales migrations in Supabase to turn this on.</small>
        </div>
      </>
    );
  }

  if (error) {
    console.error("Could not load mobile leads.", error);
  }

  const triage = await loadLatestLeadTriage(supabase);

  return (
    <>
      <LeadTriagePanel compact runDate={triage.runDate} suggestions={triage.suggestions} />
      <MobileLeadsList
        leads={(clients ?? []).map((client) => ({
          id: client.id,
          name: client.name,
          contactName: client.contact_name,
          lifecycleStage: client.lifecycle_stage,
          status: client.status,
          owner: client.owner,
          updatedAt: client.updated_at,
        }))}
      />
    </>
  );
}
