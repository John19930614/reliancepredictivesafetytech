import "server-only";

// Server side of the proposal's party blocks: reads the seller's own company
// record and the client company (address + the people at it) that the editor
// prefills a proposal from.
//
// Every function degrades to an empty result rather than throwing. A missing
// address or an unapplied migration must leave the seller with an editable
// proposal and a visible gap, never a 500 on the editor route.
//
// Reads use the CALLER's Supabase client rather than the admin client, so RLS
// decides what comes back. These are CRM records: a non-employee session must
// get nothing, not a client list.

import {
  emptyCompanyProfile,
  toCompanyProfile,
  type CompanyProfile,
} from "@/lib/company/profile";
import {
  formatAddressText,
  maxClientContacts,
  normalizeClientContact,
  type ClientCompanyDetail,
  type ClientContactOption,
} from "./client-contacts";

export type { ClientCompanyDetail, ClientContactOption };

/** Minimal structural type so this module does not depend on a generated one. */
type QueryableClient = { from: (table: string) => any };

/**
 * The seller's own company record.
 *
 * Returns a blank profile when the row is absent (migration not applied yet) so
 * the editor prefills nothing rather than crashing — an empty seller block is
 * visibly wrong and gets fixed; a 500 on /edit blocks all work.
 */
export async function loadCompanyProfile(client: QueryableClient): Promise<CompanyProfile> {
  try {
    const { data, error } = await client
      .from("platform_company_profile")
      .select("legal_name, display_name, address_line1, address_line2, city, state, postal_code, country, email, phone, website")
      .maybeSingle();
    if (error || !data) return { ...emptyCompanyProfile };
    return toCompanyProfile(data as Record<string, unknown>);
  } catch {
    return { ...emptyCompanyProfile };
  }
}

/**
 * The client company assigned to a proposal, with its address and its people.
 *
 * The contacts query is tolerated failing on its own: `company_client_contacts`
 * is newer than `company_clients`, and an environment where the 20260809100000
 * migration has not run should still prefill the company name and fall back to
 * the single legacy contact rather than showing an empty panel.
 */
export async function loadClientCompanyDetail(
  client: QueryableClient,
  clientId: string | null | undefined,
): Promise<ClientCompanyDetail | null> {
  if (!clientId) return null;

  const { data: company, error } = await client
    .from("company_clients")
    .select("id, name, contact_name, email, address_line1, address_line2, city, state, postal_code, country")
    .eq("id", clientId)
    .maybeSingle();

  if (error || !company) return null;
  const row = company as Record<string, unknown>;

  return {
    id: String(row.id ?? clientId),
    name: typeof row.name === "string" ? row.name.trim() : "",
    addressText: formatAddressText(row as never),
    contacts: await loadClientContacts(client, clientId),
    legacyContactName: typeof row.contact_name === "string" ? row.contact_name.trim() : "",
    legacyContactEmail: typeof row.email === "string" ? row.email.trim() : "",
  };
}

/**
 * The signed-in employee's name, for the document's "Prepared By" line.
 *
 * Prefers `proposal_team_bios.display_name` — the name that colleague has
 * explicitly chosen to appear on client documents, which is often not their
 * portal handle ("John H. Haldemann", not "jhaldemann"). Falls back to the auth
 * account's full name, then to the local part of their email, then to "".
 *
 * Returns "" rather than a placeholder: the seller block prints "Authorized
 * Representative" for an unknown preparer, which is accurate, whereas a guessed
 * name on a commercial document is not.
 */
export async function loadPreparedByName(
  client: QueryableClient & { auth?: { getUser: () => Promise<{ data: { user: unknown } }> } },
  userId: string | null,
): Promise<string> {
  if (!userId) return "";

  try {
    const { data } = await client
      .from("proposal_team_bios")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    const fromBio = typeof (data as { display_name?: unknown } | null)?.display_name === "string"
      ? ((data as { display_name: string }).display_name).trim()
      : "";
    if (fromBio) return fromBio;
  } catch {
    // The bios table is newer than this feature; fall through to the account.
  }

  try {
    const result = await client.auth?.getUser();
    const user = result?.data?.user as
      | { email?: string | null; user_metadata?: Record<string, unknown> | null }
      | null
      | undefined;
    if (!user) return "";

    const metadata = user.user_metadata ?? {};
    for (const key of ["full_name", "name", "display_name"]) {
      const value = metadata[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
    const email = typeof user.email === "string" ? user.email : "";
    const localPart = email.split("@")[0]?.trim() ?? "";
    return localPart;
  } catch {
    return "";
  }
}

/**
 * People on a client company, primary first then by the record's own ordering.
 *
 * Capped at a generous multiple of `maxClientContacts`: the picker shows every
 * contact so the seller can choose, and only the SELECTION is capped. A company
 * with forty contacts is a CRM problem, not a reason to unbounded-query.
 */
export async function loadClientContacts(
  client: QueryableClient,
  clientId: string,
): Promise<ClientContactOption[]> {
  try {
    const { data, error } = await client
      .from("company_client_contacts")
      .select("id, name, title, email, phone, is_primary, sort_order")
      .eq("client_id", clientId)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(maxClientContacts * 10);

    if (error || !data) return [];

    return (data as Record<string, unknown>[])
      .map((row) => ({
        id: String(row.id ?? ""),
        isPrimary: row.is_primary === true,
        ...normalizeClientContact({
          name: row.name as string | undefined,
          title: row.title as string | undefined,
          email: row.email as string | undefined,
          phone: row.phone as string | undefined,
        }),
      }))
      .filter((contact) => contact.id !== "" && contact.name !== "");
  } catch {
    return [];
  }
}
