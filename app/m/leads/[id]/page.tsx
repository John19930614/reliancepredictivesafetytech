import { notFound } from "next/navigation";
import { MobileLeadDetail } from "@/components/mobile/MobileLeadDetail";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { requireMobileTabSession } from "../../session";

export const dynamic = "force-dynamic";

export default async function MobileLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireMobileTabSession("leads");
  const { supabase } = session;

  const { data: lead, error } = await supabase
    .from("company_clients")
    .select("id, name, contact_name, email, phone, company_type, lifecycle_stage, status, owner, source, notes, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error && !isMissingSchemaRelationError(error)) {
    console.error("Could not load the mobile lead.", error);
  }

  if (!lead) {
    notFound();
  }

  const { data: activities } = await supabase
    .from("company_sales_activities")
    .select("id, activity_type, title, notes, outcome, owner, activity_date, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <MobileLeadDetail
      activities={(activities ?? []).map((activity) => ({
        id: activity.id,
        activityType: activity.activity_type,
        title: activity.title,
        notes: activity.notes,
        outcome: activity.outcome,
        owner: activity.owner,
        createdAt: activity.created_at,
      }))}
      lead={{
        id: lead.id,
        name: lead.name,
        contactName: lead.contact_name,
        email: lead.email,
        phone: lead.phone,
        companyType: lead.company_type,
        lifecycleStage: lead.lifecycle_stage,
        status: lead.status,
        owner: lead.owner,
        source: lead.source,
        notes: lead.notes,
        updatedAt: lead.updated_at,
      }}
    />
  );
}
