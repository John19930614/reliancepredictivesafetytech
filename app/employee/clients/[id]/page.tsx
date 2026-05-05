import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientDetailManager } from "@/components/ClientDetailManager";
import type {
  ClientOnboardingItem,
  CompanyClient,
  CompanyDocument,
  CompanyDocumentRequirement,
  CompanyLegalIssue,
  CompanySalesActivity,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

type ClientDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  if (!supabase) {
    notFound();
  }

  const { data: client } = await supabase.from("company_clients").select("*").eq("id", id).single();

  if (!client) {
    notFound();
  }

  const [{ data: activities }, { data: items }, { data: documents }, { data: legalIssues }, { data: requirements }, { data: masterTemplates }] =
    await Promise.all([
      supabase.from("company_sales_activities").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("client_onboarding_items").select("*").eq("client_id", id).order("sort_order"),
      supabase.from("company_documents").select("*").eq("client_id", id).order("updated_at", { ascending: false }),
      supabase.from("company_legal_issues").select("*").eq("client_id", id).order("updated_at", { ascending: false }),
      supabase.from("company_document_requirements").select("*").order("sort_order"),
      supabase.from("company_documents").select("*").eq("record_type", "Master Template").order("updated_at", { ascending: false }),
    ]);

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Client Record</div>
          <h1>{client.name}</h1>
          <p>{client.lifecycle_stage} - {client.contact_name ?? "No contact"} - {client.email ?? "No email"}</p>
        </div>
        <Link className="button button-light" href="/employee/sales">
          Back to pipeline
        </Link>
      </div>
      <ClientDetailManager
        activities={(activities ?? []) as CompanySalesActivity[]}
        client={client as CompanyClient}
        documents={(documents ?? []) as CompanyDocument[]}
        legalIssues={(legalIssues ?? []) as CompanyLegalIssue[]}
        masterTemplates={(masterTemplates ?? []) as CompanyDocument[]}
        onboardingItems={(items ?? []) as ClientOnboardingItem[]}
        requirements={(requirements ?? []) as CompanyDocumentRequirement[]}
      />
    </>
  );
}
