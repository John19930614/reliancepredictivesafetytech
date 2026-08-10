import "server-only";

// Files the PDF of an accepted proposal into the File Center, so the signed
// document sits on record next to the client's other files without anyone
// remembering to export and re-upload it.
//
// CALLED FROM BOTH ACCEPTANCE PATHS — the employee status change
// (setProposalStatus → "accepted") and the client's own share-link acceptance
// (acceptProposalViaShareLink). The second has NO session, which is why this
// module runs on the service-role client: the actor may be an anonymous
// client holding a share token. Every value written is derived server-side
// from the proposal row — nothing here trusts caller-supplied content.
//
// BEST-EFFORT BY CONTRACT. The acceptance is the business event; the filed
// copy is a convenience. Callers must treat a failure here as a warning
// (audit it), never as a reason to report the acceptance itself as failed —
// and this module never throws.

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGeneratorState } from "@/lib/proposals/generator-state";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import { renderProposalPdf } from "@/lib/proposals/pdf";
import { resolveDocumentExtras } from "@/lib/proposals/team-server";
import { buildProposalDocumentModel } from "@/components/proposals/proposal-document-model";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";
import { fileCenterBucket, fileCenterPath, type FileScope } from "@/lib/files/types";
import { buildStoragePath, maxFileNameLength, sanitizeFileName } from "@/lib/files/validation";
import type { ProposalStatus } from "@/lib/proposals/types";

/** Same convention as the rest of the proposals module (see access.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/**
 * Root-level folder the accepted PDFs land in, inside the client's File Center
 * area (or the company area for a proposal with no client assigned). Matched
 * case-insensitively, so a hand-made "proposals" folder is reused, not
 * duplicated — the sibling-name unique index is case-insensitive too.
 */
export const acceptedProposalsFolderName = "Proposals";

/**
 * `<number> <title> (accepted vN).pdf`, capped to the File Center's 200-char
 * name limit WITHOUT ever truncating the suffix — a filed contract whose name
 * lost its revision marker (or its extension) would be ambiguous evidence.
 */
export function buildAcceptedProposalFileName(
  proposalNumber: string | null,
  title: string,
  revisionNumber: number,
): string {
  const revision = Number.isFinite(revisionNumber) && revisionNumber > 0 ? revisionNumber : 1;
  const suffix = ` (accepted v${revision}).pdf`;
  const base = sanitizeFileName([proposalNumber ?? "", title].join(" ").trim());
  const trimmed = base.slice(0, Math.max(0, maxFileNameLength - suffix.length)).trimEnd();
  return `${trimmed || "Proposal"}${suffix}`;
}

interface FolderResolution {
  ok: boolean;
  folderId?: string;
  error?: string;
}

/**
 * Find-or-create of the "Proposals" folder at the root of the location. The
 * create can lose a race with a concurrent acceptance; the sibling-name unique
 * index turns that into a unique violation, after which the folder is simply
 * read back.
 */
async function findOrCreateProposalsFolder(
  db: LooseClient,
  scope: FileScope,
  clientId: string | null,
  createdBy: string | null,
): Promise<FolderResolution> {
  const locate = () => {
    let query = db
      .from("company_file_folders")
      .select("id")
      .eq("scope", scope)
      .is("parent_id", null)
      .ilike("name", acceptedProposalsFolderName);
    query = clientId ? query.eq("client_id", clientId) : query.is("client_id", null);
    return query.maybeSingle();
  };

  const { data: existing, error: findError } = await locate();
  if (findError) return { ok: false, error: findError.message };
  if (existing?.id) return { ok: true, folderId: existing.id as string };

  const { data: created, error: insertError } = await db
    .from("company_file_folders")
    .insert({ scope, client_id: clientId, parent_id: null, name: acceptedProposalsFolderName, created_by: createdBy })
    .select("id")
    .single();
  if (created?.id) return { ok: true, folderId: created.id as string };

  const { data: raced } = await locate();
  if (raced?.id) return { ok: true, folderId: raced.id as string };

  return { ok: false, error: insertError?.message ?? "Could not create the Proposals folder." };
}

export interface AcceptanceFilingInput {
  proposalId: string;
  /**
   * The revision that was accepted, when the caller knows it (share-link
   * acceptances always do). Omitted, the proposal's own accepted_revision_id
   * is used, and failing that the current working copy.
   */
  revisionId?: string | null;
  /** The signed-in employee for a manual acceptance; null for share-link clients. */
  actorUserId?: string | null;
  actorRole?: string | null;
}

export interface AcceptanceFilingResult {
  ok: boolean;
  error?: string;
  fileId?: string;
  /** True when an identically named copy was already on file — nothing written. */
  skipped?: boolean;
}

export async function fileAcceptedProposalPdf(input: AcceptanceFilingInput): Promise<AcceptanceFilingResult> {
  try {
    const db: LooseClient | null = createAdminClient();
    if (!db) {
      return { ok: false, error: "Service-role credentials are not configured, so the accepted PDF could not be filed." };
    }

    const { data: proposal, error: proposalError } = await db
      .from("client_proposals")
      .select(
        "id, title, proposal_number, client_id, status, current_revision, valid_until, form_data, accepted_at, accepted_revision_id",
      )
      .eq("id", input.proposalId)
      .maybeSingle();
    if (proposalError || !proposal) {
      return { ok: false, error: proposalError?.message ?? "Proposal not found." };
    }

    // What to render: the accepted revision when one is known, else the
    // working copy. Scoped by BOTH ids so a revision uuid from another
    // proposal can never be filed under this one's name.
    const revisionId = input.revisionId ?? ((proposal.accepted_revision_id as string | null) ?? null);
    let state: unknown = proposal.form_data;
    let revisionNumber: number | undefined;
    if (revisionId) {
      const { data: revision } = await db
        .from("client_proposal_revisions")
        .select("revision_number, form_data")
        .eq("id", revisionId)
        .eq("proposal_id", input.proposalId)
        .maybeSingle();
      if (revision) {
        state = revision.form_data;
        revisionNumber = Number(revision.revision_number);
      }
    }

    if (!isGeneratorState(state)) {
      return { ok: false, error: "The proposal has no saved document content, so there is no PDF to file." };
    }

    const clientId = (proposal.client_id as string | null) ?? null;
    const scope: FileScope = clientId ? "client" : "company";

    const folder = await findOrCreateProposalsFolder(db, scope, clientId, input.actorUserId ?? null);
    if (!folder.ok || !folder.folderId) return { ok: false, error: folder.error ?? "Could not resolve the Proposals folder." };

    const currentRevision = Number(proposal.current_revision ?? 1);
    const name = buildAcceptedProposalFileName(
      (proposal.proposal_number as string | null) ?? null,
      (proposal.title as string) || "Proposal",
      revisionNumber ?? currentRevision,
    );

    // One acceptance files one copy. company_files has no sibling-name unique
    // index, so idempotency is an explicit lookup rather than a constraint.
    let existingQuery = db
      .from("company_files")
      .select("id")
      .eq("scope", scope)
      .eq("name", name)
      .is("archived_at", null);
    existingQuery = clientId ? existingQuery.eq("client_id", clientId) : existingQuery.is("client_id", null);
    const { data: existingRows } = await existingQuery.limit(1);
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (existing?.id) return { ok: true, skipped: true, fileId: existing.id as string };

    // Rendered exactly the way the PDF download route renders it, so the filed
    // copy cannot drift from what the client saw and accepted.
    const { team, signature } = await resolveDocumentExtras(state, (proposal.accepted_at as string | null) ?? null);
    const model = buildProposalDocumentModel({
      state,
      totals: computeProposalTotals(state),
      proposal: {
        id: proposal.id as string,
        title: proposal.title as string,
        status: (proposal.status as ProposalStatus) ?? "accepted",
        currentRevision,
        validUntil: (proposal.valid_until as string | null) ?? null,
      },
      revisionNumber,
      team,
      signature,
    });
    const bytes = await renderProposalPdf({ model, documentTitle: model.headline });

    const fileId = crypto.randomUUID();
    const storagePath = buildStoragePath(scope, clientId, fileId, name);

    const { error: uploadError } = await db.storage
      .from(fileCenterBucket)
      .upload(storagePath, Buffer.from(bytes), { contentType: "application/pdf", upsert: false });
    if (uploadError) return { ok: false, error: uploadError.message };

    const { error: insertError } = await db.from("company_files").insert({
      id: fileId,
      scope,
      client_id: clientId,
      folder_id: folder.folderId,
      name,
      storage_bucket: fileCenterBucket,
      storage_path: storagePath,
      mime_type: "application/pdf",
      size_bytes: bytes.byteLength,
      description: "Filed automatically when this proposal was accepted.",
      uploaded_by: input.actorUserId ?? null,
    });
    if (insertError) {
      try {
        await db.storage.from(fileCenterBucket).remove([storagePath]);
      } catch {
        // Best effort — an object without a row is invisible and harmless.
      }
      return { ok: false, error: insertError.message };
    }

    await recordAuditEvent({
      ...buildDataAuditEvent(
        "create",
        "company_file",
        fileId,
        input.actorUserId ?? null,
        `Filed accepted proposal "${proposal.title}" into the File Center`,
        null,
        { proposal_id: input.proposalId, scope, client_id: clientId, folder_id: folder.folderId, name },
      ),
      actor_role: input.actorRole ?? null,
    });

    revalidatePath(fileCenterPath);
    return { ok: true, fileId };
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "Unexpected failure while filing the accepted proposal PDF.",
    };
  }
}
