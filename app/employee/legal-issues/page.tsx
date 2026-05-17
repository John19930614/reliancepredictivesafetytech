import { LegalIssuesManager } from "@/components/LegalIssuesManager";
import type { CompanyClient, CompanyDocument, CompanyLegalIssue } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

export default async function LegalIssuesPage() {
  const supabase = await createClient();
  const [{ data: clients }, { data: documents }, { data: issues }] = supabase
    ? await Promise.all([
        supabase.from("company_clients").select("*").order("name"),
        supabase.from("company_documents").select("*").order("title"),
        supabase.from("company_legal_issues").select("*").order("updated_at", { ascending: false }),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Legal Issues</div>
          <h1>Escalation log</h1>
          <p>Track legal/compliance issues by severity, owner, due date, client, linked document, and resolution.</p>
        </div>
      </div>
      <LegalIssuesManager
        clients={(clients ?? []) as CompanyClient[]}
        documents={(documents ?? []) as CompanyDocument[]}
        initialIssues={(issues ?? []) as CompanyLegalIssue[]}
      />
    </>
  );
}
