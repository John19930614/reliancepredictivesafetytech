import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientDetailManager } from "@/components/ClientDetailManager";
import {
  CompanyAddressAndContacts,
  type CompanyContactRow,
} from "@/components/clients/CompanyAddressAndContacts";
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

  const [
    { data: activities },
    { data: items },
    { data: documents },
    { data: legalIssues },
    { data: requirements },
    { data: masterTemplates },
    { data: contacts },
  ] = await Promise.all([
      supabase.from("company_sales_activities").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("client_onboarding_items").select("*").eq("client_id", id).order("sort_order"),
      supabase.from("company_documents").select("*").eq("client_id", id).order("updated_at", { ascending: false }),
      supabase.from("company_legal_issues").select("*").eq("client_id", id).order("updated_at", { ascending: false }),
      supabase.from("company_document_requirements").select("*").order("sort_order"),
      supabase.from("company_documents").select("*").eq("record_type", "Master Template").order("updated_at", { ascending: false }),
      // Primary first, then the record's own ordering — the same order the
      // proposal editor's picker shows them in.
      supabase
        .from("company_client_contacts")
        .select("id, name, title, email, phone, notes, is_primary")
        .eq("client_id", id)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
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
      {/* Above the rest of the record: this is what every proposal for this
          company pulls its Prepared For block from, and it was the one thing
          the company record could not hold. */}
      <CompanyAddressAndContacts
        clientId={id}
        clientName={(client.name ?? "") as string}
        clientCode={(client.client_code ?? null) as string | null}
        address={{
          address_line1: (client.address_line1 ?? null) as string | null,
          address_line2: (client.address_line2 ?? null) as string | null,
          city: (client.city ?? null) as string | null,
          state: (client.state ?? null) as string | null,
          postal_code: (client.postal_code ?? null) as string | null,
          country: (client.country ?? null) as string | null,
          website: (client.website ?? null) as string | null,
        }}
        contacts={(contacts ?? []) as CompanyContactRow[]}
      />

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
