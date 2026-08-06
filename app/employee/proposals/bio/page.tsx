import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProposalAccess } from "@/lib/proposals/access";
import { resolveProposalSignature } from "@/lib/proposals/team-server";
import { BioEditor } from "./BioEditor";

/**
 * Self-service bio and signature for the signed-in employee.
 *
 * Lives under /employee/proposals/* so it inherits the `client_proposals`
 * module catalog entry and its sidebar/permission wiring — there is no
 * standalone employee profile module to hang it off, and inventing one for two
 * fields would add a nav entry, a catalog key, and a permission surface for no
 * benefit.
 */
export default async function ProposalBioPage() {
  const { supabase, userId, canRead } = await getProposalAccess();
  if (!supabase || !userId || !canRead) notFound();

  // Tolerated, like the share-link queries on the detail page: this table
  // arrives with the 20260806 migration, and a deploy can legitimately land
  // first. An error here means "nothing saved yet", not a broken page.
  const { data, error } = await supabase
    .from("proposal_team_bios")
    .select("display_name, title, bio, is_publishable, signature_path, signature_updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  const available = !error;
  const row = (data ?? null) as Record<string, unknown> | null;

  // Reuses the document renderer's own resolver so the preview here is exactly
  // the image a client will see, not a separately-built approximation.
  const signature = row?.signature_path ? await resolveProposalSignature(userId) : null;

  return (
    <>
      <div className="portal-topline">
        <div>
          <Link href="/employee/proposals" className="button button-light" style={{ marginBottom: 8 }}>
            <ChevronLeft size={16} /> Back to proposals
          </Link>
          <div className="eyebrow">Proposals</div>
          <h1>My bio &amp; signature</h1>
          <p>What clients read about you, and the signature the platform applies on your behalf.</p>
        </div>
      </div>

      {available ? (
        <BioEditor
          initial={{
            displayName: String(row?.display_name ?? ""),
            title: String(row?.title ?? ""),
            bio: String(row?.bio ?? ""),
            isPublishable: row?.is_publishable === true,
          }}
          signaturePreview={signature?.dataUrl ?? null}
          signatureUpdatedAt={(row?.signature_updated_at as string | null) ?? null}
        />
      ) : (
        <div className="empty-state">
          Team bios are not available yet — the database migration that adds them has not been applied to this
          environment.
        </div>
      )}
    </>
  );
}
