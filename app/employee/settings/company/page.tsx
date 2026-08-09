import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";
import { toCompanyProfile } from "@/lib/company/profile";
import { CompanyProfileForm } from "@/components/settings/CompanyProfileForm";

/**
 * The seller's own company record.
 *
 * Covered by the existing `settings` module catalog entry, whose path prefix is
 * `/employee/settings` — the same way `/employee/proposals/bio` sits under
 * `client_proposals` rather than claiming a catalog key of its own.
 */
export default async function CompanyProfilePage() {
  const supabase = await createClient();
  if (!supabase) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: profileRow }, { data: roleRows }] = await Promise.all([
    supabase
      .from("platform_company_profile")
      .select("legal_name, display_name, address_line1, address_line2, city, state, postal_code, country, email, phone, website")
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("account_status", "active"),
  ]);

  // Same resolution as getProposalAccess(): duplicates resolve to the strongest
  // active role rather than failing, because RLS grants on an EXISTS over the
  // same rows and the UI must not disagree with what the database will allow.
  const canEdit = (Array.isArray(roleRows) ? roleRows : []).some((row) =>
    isPortalAdminRole((row as { role?: string | null })?.role ?? null),
  );

  const profile = toCompanyProfile(profileRow as Record<string, unknown> | null);

  return (
    <>
      <div className="portal-topline">
        <div>
          <Link className="button button-light" href="/employee/settings" style={{ marginBottom: 8 }}>
            <ChevronLeft size={16} /> Back to settings
          </Link>
          <div className="eyebrow">Settings</div>
          <h1>Company profile</h1>
          <p>
            The name, address and contact details printed as the <strong>Prepared By</strong> block on every proposal.
            Proposals snapshot these when they are created, so changing them here affects future proposals — it does not
            rewrite one a client has already signed.
          </p>
        </div>
      </div>

      <CompanyProfileForm profile={profile} canEdit={canEdit} />
    </>
  );
}
