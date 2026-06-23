import { DocumentLibraryManager } from "@/components/DocumentLibraryManager";
import { startupChecklistSeed, type CompanyChecklistItem, type CompanyClient, type CompanyDocument, type CompanyDocumentRequirement } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  legal_name: string | null;
  email: string | null;
}

interface ShareRow {
  id: string;
  document_id: string;
  shared_with_user_id: string;
  shared_by: string | null;
  note: string | null;
}

function profileLabel(p: ProfileRow | undefined, fallback: string): string {
  if (!p) return fallback;
  return p.display_name || p.legal_name || p.email || fallback;
}

export default async function DocumentLibraryPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  const [{ data: documents }, { data: checklistItems }, { data: clients }, { data: requirements }, { data: profiles }, { data: shares }] = supabase
    ? await Promise.all([
        supabase.from("company_documents").select("*").order("updated_at", { ascending: false }),
        supabase.from("company_checklist_items").select("*").order("section").order("created_at"),
        supabase.from("company_clients").select("*").order("updated_at", { ascending: false }),
        supabase.from("company_document_requirements").select("*").order("sort_order"),
        supabase.from("employee_profiles").select("user_id, display_name, legal_name, email"),
        // document_shares is added by 20260623010000 and not yet in the generated
        // Supabase types; query via a loosely-typed client (mirrors getLegalAccess).
        (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: boolean) => Promise<{ data: unknown }> } } })
          .from("document_shares")
          .select("id, document_id, shared_with_user_id, shared_by, note")
          .eq("revoked", false),
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }, { data: null }, { data: null }];

  const currentUserId = user?.id ?? null;
  const docList = (documents ?? []) as CompanyDocument[];
  const profileRows = (profiles ?? []) as ProfileRow[];
  const shareRows = (shares ?? []) as ShareRow[];

  const profileById = new Map(profileRows.map((p) => [p.user_id, p]));
  const docById = new Map(docList.map((d) => [d.id, d]));

  // People you can share with (excludes yourself).
  const users = profileRows
    .filter((p) => p.user_id !== currentUserId)
    .map((p) => ({ userId: p.user_id, label: profileLabel(p, p.email ?? p.user_id) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Documents shared WITH the current user.
  const incomingShares = shareRows
    .filter((s) => s.shared_with_user_id === currentUserId && docById.has(s.document_id))
    .map((s) => ({
      id: s.id,
      document: docById.get(s.document_id)!,
      sharedByLabel: profileLabel(profileById.get(s.shared_by ?? ""), "A teammate"),
      note: s.note,
    }));

  // Recipients of documents the current user has shared, grouped by document.
  const outgoingByDocument: Record<string, { id: string; recipientLabel: string }[]> = {};
  for (const s of shareRows) {
    if (s.shared_by !== currentUserId) continue;
    (outgoingByDocument[s.document_id] ??= []).push({
      id: s.id,
      recipientLabel: profileLabel(profileById.get(s.shared_with_user_id), s.shared_with_user_id),
    });
  }

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Master Document Library</div>
          <h1>Sales-to-active document control</h1>
          <p>Track master templates, company records, and client records across the full customer lifecycle.</p>
        </div>
      </div>
      <DocumentLibraryManager
        clients={(clients ?? []) as CompanyClient[]}
        checklistItems={(checklistItems && checklistItems.length > 0 ? checklistItems : startupChecklistSeed) as CompanyChecklistItem[]}
        initialDocuments={docList}
        requirements={(requirements ?? []) as CompanyDocumentRequirement[]}
        currentUserId={currentUserId}
        users={users}
        incomingShares={incomingShares}
        outgoingByDocument={outgoingByDocument}
      />
    </>
  );
}
