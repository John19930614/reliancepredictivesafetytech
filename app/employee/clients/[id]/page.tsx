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
import {
  ClientRelatedPanels,
  type ClientFileRow,
  type ClientTrainingEventRow,
} from "@/components/clients/ClientRelatedPanels";
import { CompanyProfileForm, emptyProfileDraft } from "@/components/clients/CompanyProfileForm";
import type { ClientMeetingRow, ClientProposalRow } from "@/lib/clients/related";
import { createClient } from "@/lib/supabase/server";

type ClientDetailPageProps = {
  params: Promise<{ id: string }>;
};

/** Same convention as lib/files/access.ts, for tables absent from the types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

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

  // company_slug postdates the last Supabase types regen, same untyped read the
  // page already uses for company_files and company_profiles.
  const companySlug = ((client as LooseClient).company_slug ?? null) as string | null;

  const [
    { data: activities },
    { data: items },
    { data: documents },
    { data: legalIssues },
    { data: requirements },
    { data: masterTemplates },
    { data: contacts },
    { data: proposals },
    { data: files, count: fileCount },
    { data: meetings },
    { data: trainingEvents },
    profileResult,
    { locked: slugLocked },
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
      // The four families that already key on client_id and had no home on this
      // page. All read-only; each row links back to the module that owns it.
      supabase
        .from("client_proposals")
        .select("id, title, proposal_number, status, proposal_value, accepted_at, updated_at")
        .eq("client_id", id)
        .order("updated_at", { ascending: false })
        .limit(10),
      // company_files postdates the last Supabase types regen, so it is reached
      // through an untyped handle — the same convention lib/files/access.ts
      // already uses for the whole File Center module.
      (supabase as LooseClient)
        .from("company_files")
        .select("id, name, created_at", { count: "exact" })
        .eq("client_id", id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("sales_video_meetings")
        .select("id, title, status, scheduled_at")
        .eq("client_id", id)
        .order("scheduled_at", { ascending: false })
        .limit(10),
      supabase
        .from("client_training_events")
        .select("id, title, status, scheduled_start_at, delivery_mode")
        .eq("client_id", id)
        .order("scheduled_start_at", { ascending: false })
        .limit(6),
      // Newer than the last types regen, same untyped handle as company_files
      // above. A missing table degrades the panel rather than the page.
      (supabase as LooseClient)
        .from("company_profiles")
        .select(
          "client_id, employee_count, site_count, annual_revenue, primary_state, states_operated, naics_code, hazard_class, emr, trir, recordables_12mo, lost_time_12mo, osha_citations_3yr, contractor_share_pct, union_workforce, notes",
        )
        .eq("client_id", id)
        .maybeSingle(),
      // Whether the slug is still changeable. The counter table lock_company_slug
      // consults has RLS on with no policies, so it cannot be read from here —
      // company_slug_locked() is a SECURITY DEFINER function that exists to
      // answer exactly this one boolean and nothing else about the counters.
      //
      // Asking the same source the trigger asks is the point. Inferring it
      // instead — counting proposals numbered under the slug — disagrees with
      // the trigger whenever those proposals are deleted but the counter rows
      // remain: the database stays locked while the form offers an edit that
      // will be rejected on submit.
      //
      // Untyped handle: the function postdates the last types regen, the same
      // convention this file already uses for company_files and company_profiles.
      companySlug
        ? (supabase as LooseClient)
            .rpc("company_slug_locked", { p_client: id })
            .then(({ data }: { data: unknown }) => ({ locked: data === true }))
        : Promise.resolve({ locked: false }),
    ]);

  // A blank field means "not known", so null must render as an empty box rather
  // than a 0 — the estimator treats a stored 0 for headcount, sites or EMR as
  // missing precisely because 0 is a value somebody chose to type.
  const profileRow = (profileResult?.data ?? null) as Record<string, unknown> | null;
  const profileMissing = Boolean(
    profileResult?.error && ["42P01", "PGRST205"].includes((profileResult.error as { code?: string }).code ?? ""),
  );
  const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
  const profileDraft = profileRow
    ? {
        ...emptyProfileDraft,
        employee_count: str(profileRow.employee_count),
        site_count: str(profileRow.site_count),
        annual_revenue: str(profileRow.annual_revenue),
        primary_state: str(profileRow.primary_state),
        states_operated: str(profileRow.states_operated),
        naics_code: str(profileRow.naics_code),
        hazard_class: str(profileRow.hazard_class),
        emr: str(profileRow.emr),
        trir: str(profileRow.trir),
        recordables_12mo: str(profileRow.recordables_12mo),
        lost_time_12mo: str(profileRow.lost_time_12mo),
        osha_citations_3yr: str(profileRow.osha_citations_3yr),
        contractor_share_pct: str(profileRow.contractor_share_pct),
        union_workforce: profileRow.union_workforce === true,
        notes: str(profileRow.notes),
      }
    : emptyProfileDraft;

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
        companySlug={companySlug}
        slugLocked={slugLocked}
        // Resolved here rather than in the client component so the example
        // numbers cannot disagree across a hydration boundary at New Year.
        year={new Date().getFullYear()}
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

      {/* What a safety contract is actually scoped and priced on. Every deal
          screen shows a value; this is the only place the numbers behind it
          are entered. */}
      <CompanyProfileForm canManage clientId={id} initial={profileDraft} unavailable={profileMissing} />

      <ClientDetailManager
        activities={(activities ?? []) as CompanySalesActivity[]}
        client={client as CompanyClient}
        documents={(documents ?? []) as CompanyDocument[]}
        legalIssues={(legalIssues ?? []) as CompanyLegalIssue[]}
        masterTemplates={(masterTemplates ?? []) as CompanyDocument[]}
        onboardingItems={(items ?? []) as ClientOnboardingItem[]}
        requirements={(requirements ?? []) as CompanyDocumentRequirement[]}
      />

      <ClientRelatedPanels
        files={(files ?? []) as ClientFileRow[]}
        fileCount={fileCount ?? 0}
        meetings={(meetings ?? []) as ClientMeetingRow[]}
        now={new Date()}
        proposals={(proposals ?? []) as ClientProposalRow[]}
        trainingEvents={(trainingEvents ?? []) as ClientTrainingEventRow[]}
      />
    </>
  );
}
