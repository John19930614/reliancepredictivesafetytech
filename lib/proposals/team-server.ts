import "server-only";

// Server side of the proposal team feature: turns the ids stored in a
// proposal's form_data into the bios and signature image the document renders.
//
// Every function here degrades to an empty result rather than throwing. The
// bios table and the signature bucket are additive features on a document that
// already renders without them, and the public share route in particular must
// not 500 because a signature object went missing.

import { createAdminClient } from "@/lib/supabase/admin";
import type { DocumentSignature, DocumentTeamMember } from "@/components/proposals/proposal-document-model";
import { splitBioParagraphs } from "@/components/proposals/proposal-document-model";
import {
  maxTeamMembers,
  parseSignerId,
  parseTeamMemberIds,
  type TeamRosterEntry,
} from "./team-selection";

export type { TeamRosterEntry };

/** Row shape read from `proposal_team_bios`. */
export interface TeamBioRow {
  user_id: string;
  display_name: string | null;
  title: string | null;
  bio: string | null;
  signature_bucket: string | null;
  signature_path: string | null;
  is_publishable: boolean | null;
}

/**
 * Largest signature image we will inline into a document, in bytes.
 *
 * The image becomes a base64 data: URI on every render of the proposal — the
 * HTML view, the share link, and the PDF. A phone photo of a signature can be
 * several megabytes, which would bloat every one of those responses. The upload
 * form enforces the same ceiling; this is the second line of defence for a row
 * written before the limit existed.
 */
export const maxSignatureBytes = 512 * 1024;

/**
 * PNG and JPEG only.
 *
 * WebP is deliberately excluded even though browsers render it: pdf-lib can
 * embed PNG and JPEG and nothing else, so a WebP signature would look correct
 * on screen and then silently vanish from the generated PDF — the one copy that
 * actually goes to the client.
 */
const allowedSignatureTypes = Object.freeze(["image/png", "image/jpeg"] as const);

export function isAllowedSignatureType(mimeType: string): boolean {
  return (allowedSignatureTypes as readonly string[]).includes(mimeType);
}

/**
 * Loads publishable bios for `userIds`, in the order the seller selected them.
 *
 * Unpublishable rows are filtered out here rather than in the query so that a
 * bio which was published when the proposal was written, then unpublished,
 * simply stops appearing — the document does not break and no stale copy is
 * cached anywhere.
 */
export async function resolveProposalTeam(userIds: readonly string[]): Promise<DocumentTeamMember[]> {
  if (userIds.length === 0) return [];
  const admin = createAdminClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("proposal_team_bios")
    .select("user_id, display_name, title, bio, is_publishable")
    .in("user_id", userIds.slice(0, maxTeamMembers));

  if (error || !data) return [];

  const byId = new Map<string, TeamBioRow>();
  for (const row of data as TeamBioRow[]) byId.set(row.user_id, row);

  const members: DocumentTeamMember[] = [];
  for (const id of userIds) {
    const row = byId.get(id);
    if (!row || row.is_publishable !== true) continue;
    const name = (row.display_name ?? "").trim();
    const paragraphs = splitBioParagraphs(row.bio ?? "");
    // A bio with no name and no prose would render as an empty bordered box.
    if (name === "" && paragraphs.length === 0) continue;
    members.push({
      id,
      name: name === "" ? "Team member" : name,
      title: (row.title ?? "").trim(),
      paragraphs,
    });
  }
  return members;
}

/**
 * Loads the signer's stored signature and inlines it as a data: URI.
 *
 * The object lives in a private bucket, so a plain URL would 404 for the client
 * viewing a share link. Downloading it server-side and embedding the bytes is
 * what makes the same markup work on the authenticated view, the public share
 * route, and the generated PDF.
 *
 * `signedOn` is the proposal's own signing timestamp when the caller has one —
 * NOT signature_updated_at, which is when the image file was last replaced.
 */
export async function resolveProposalSignature(
  signerId: string | null,
  signedOn: string | null = null,
): Promise<DocumentSignature | null> {
  if (!signerId) return null;
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: row, error } = await admin
    .from("proposal_team_bios")
    .select("display_name, title, signature_bucket, signature_path, is_publishable")
    .eq("user_id", signerId)
    .maybeSingle();

  if (error || !row) return null;
  const bio = row as unknown as TeamBioRow;
  if (!bio.signature_bucket || !bio.signature_path) return null;

  const { data: file, error: downloadError } = await admin.storage
    .from(bio.signature_bucket)
    .download(bio.signature_path);
  if (downloadError || !file) return null;
  if (file.size > maxSignatureBytes) return null;

  const mimeType = file.type && isAllowedSignatureType(file.type) ? file.type : "image/png";
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    name: (bio.display_name ?? "").trim() || "Authorized Representative",
    title: (bio.title ?? "").trim(),
    signedOn,
  };
}

/**
 * Everything the document renderer needs beyond the saved form state.
 *
 * One helper so the four places that render a proposal — the detail view, a
 * historical revision, the public share route, and the PDF — cannot drift into
 * showing different bios or a signature on one but not another.
 */
export async function resolveDocumentExtras(
  state: { fields?: Record<string, unknown> } | null,
  signedOn: string | null = null,
): Promise<{ team: DocumentTeamMember[]; signature: DocumentSignature | null }> {
  if (!state) return { team: [], signature: null };
  const [team, signature] = await Promise.all([
    resolveProposalTeam(parseTeamMemberIds(state.fields)),
    resolveProposalSignature(parseSignerId(state.fields), signedOn),
  ]);
  return { team, signature };
}

/**
 * Every colleague who has published a bio, for the editor's checkbox list.
 *
 * Read with the caller's own client (not the admin client) so the roster
 * respects the table's RLS: an unauthenticated or non-employee caller gets
 * nothing rather than the staff list.
 */
export async function loadTeamRoster(
  client: { from: (table: string) => any },
): Promise<TeamRosterEntry[]> {
  const { data, error } = await client
    .from("proposal_team_bios")
    .select("user_id, display_name, title, bio, signature_path, is_publishable")
    .eq("is_publishable", true)
    .order("display_name", { ascending: true });

  if (error || !data) return [];

  return (data as TeamBioRow[])
    .map((row) => ({
      userId: row.user_id,
      name: (row.display_name ?? "").trim() || "Unnamed teammate",
      title: (row.title ?? "").trim(),
      // Whether this person has written anything yet. A publishable row with an
      // empty bio prints a name and a title under "Your Team" and no words at
      // all, which reads to a client as an unfinished document — and the seller
      // ticking the box has no way to know, because the roster only ever told
      // them about the signature.
      hasBio: (row.bio ?? "").trim().length > 0,
      hasSignature: Boolean(row.signature_path),
    }))
    .filter((entry) => entry.userId);
}
