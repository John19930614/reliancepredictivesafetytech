import "server-only";

import { revalidatePath } from "next/cache";
import { buildProposalDocumentModel } from "@/components/proposals/proposal-document-model";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";
import { createProposalEnvelope, downloadCompletedEnvelopePdf, type DocusignRecipient } from "@/lib/docusign/client";
import { getDocusignConfigStatus } from "@/lib/docusign/config";
import { fileCenterBucket, fileCenterPath, type FileScope } from "@/lib/files/types";
import { buildStoragePath, maxFileNameLength, sanitizeFileName } from "@/lib/files/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { findOrCreateProposalsFolder } from "./acceptance-filing";
import { parseClientContacts } from "./client-contacts";
import { proposalDownloadFilename } from "./downloads";
import { isGeneratorState, type GeneratorState } from "./generator-state";
import { canTransitionProposal } from "./policy";
import { renderProposalPdf } from "./pdf";
import { computeProposalTotals } from "./pricing";
import { resolveDocumentExtras } from "./team-server";
import type { ProposalStatus } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

export interface SendProposalForDocusignInput {
  proposalId: string;
  revisionId: string | null;
  actorUserId: string;
  actorRole: string | null;
}

export interface SendProposalForDocusignResult {
  ok: boolean;
  error?: string;
  envelopeId?: string;
}

export interface RecordDocusignEnvelopeEventInput {
  envelopeId: string;
  status: string;
  occurredAt?: string | null;
  payload: unknown;
}

function normalizeEnvelopeStatus(status: string): string {
  const cleaned = status.toLowerCase().replace(/^envelope-/, "");
  if (["created", "sent", "delivered", "completed", "declined", "voided", "corrected"].includes(cleaned)) {
    return cleaned;
  }
  return "unknown";
}

function findRecipient(state: GeneratorState): DocusignRecipient | null {
  const contact = parseClientContacts(state.fields).find((entry) => entry.email);
  if (!contact) return null;
  return { name: contact.name || contact.email, email: contact.email };
}

function signedProposalFileName(proposalNumber: string | null, title: string, revisionNumber: number): string {
  const suffix = ` (DocuSign signed v${revisionNumber}).pdf`;
  const base = sanitizeFileName([proposalNumber ?? "", title].join(" ").trim());
  const trimmed = base.slice(0, Math.max(0, maxFileNameLength - suffix.length)).trimEnd();
  return `${trimmed || "Proposal"}${suffix}`;
}

async function loadProposalForRendering(
  db: LooseClient,
  proposalId: string,
  revisionId: string | null,
): Promise<
  | {
      ok: true;
      proposal: Record<string, unknown>;
      state: GeneratorState;
      revisionId: string | null;
      revisionNumber: number;
    }
  | { ok: false; error: string }
> {
  const { data: proposal, error: proposalError } = await db
    .from("client_proposals")
    .select("id, title, proposal_number, client_id, status, current_revision, valid_until, form_data")
    .eq("id", proposalId)
    .maybeSingle();

  if (proposalError || !proposal) return { ok: false, error: proposalError?.message ?? "Proposal not found." };

  let state: unknown = proposal.form_data;
  let resolvedRevisionId = revisionId;
  let revisionNumber = Number(proposal.current_revision ?? 1);

  if (revisionId) {
    const { data: revision } = await db
      .from("client_proposal_revisions")
      .select("id, revision_number, form_data")
      .eq("id", revisionId)
      .eq("proposal_id", proposalId)
      .maybeSingle();
    if (!revision) return { ok: false, error: "That revision does not belong to this proposal." };
    state = revision.form_data;
    resolvedRevisionId = revision.id as string;
    revisionNumber = Number(revision.revision_number ?? revisionNumber);
  } else {
    const { data: revision } = await db
      .from("client_proposal_revisions")
      .select("id, revision_number, form_data")
      .eq("proposal_id", proposalId)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (revision?.id && isGeneratorState(revision.form_data)) {
      state = revision.form_data;
      resolvedRevisionId = revision.id as string;
      revisionNumber = Number(revision.revision_number ?? revisionNumber);
    }
  }

  if (!isGeneratorState(state)) {
    return { ok: false, error: "This proposal revision has no saved document content to send." };
  }

  return { ok: true, proposal: proposal as Record<string, unknown>, state, revisionId: resolvedRevisionId, revisionNumber };
}

async function markProposalSentIfAllowed(
  db: LooseClient,
  proposal: Record<string, unknown>,
  actorUserId: string | null,
  actorRole: string | null,
) {
  const currentStatus = (proposal.status as ProposalStatus) ?? "draft";
  const gate = canTransitionProposal(currentStatus, "sent");
  if (!gate.ok) return;
  const { error } = await db.from("client_proposals").update({ status: "sent" }).eq("id", proposal.id);
  if (error) return;
  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "client_proposal",
      proposal.id as string,
      actorUserId,
      `Moved proposal "${proposal.title}" from ${currentStatus} to sent for DocuSign`,
      { status: currentStatus },
      { status: "sent", channel: "docusign" },
    ),
    actor_role: actorRole,
  });
}

export async function sendProposalForDocusign(
  input: SendProposalForDocusignInput,
): Promise<SendProposalForDocusignResult> {
  const status = getDocusignConfigStatus();
  if (!status.configured) {
    return {
      ok: false,
      error: status.enabled
        ? `DocuSign is missing required settings: ${status.missing.join(", ")}.`
        : "DocuSign is not enabled for this environment.",
    };
  }

  const db: LooseClient | null = createAdminClient();
  if (!db) return { ok: false, error: "Service-role credentials are required to send proposals with DocuSign." };

  const loaded = await loadProposalForRendering(db, input.proposalId, input.revisionId);
  if (!loaded.ok) return loaded;

  const recipient = findRecipient(loaded.state);
  if (!recipient) {
    return { ok: false, error: "Add a client contact with an email address before sending this proposal to DocuSign." };
  }

  const { team, signature } = await resolveDocumentExtras(loaded.state, null);
  const model = buildProposalDocumentModel({
    state: loaded.state,
    totals: computeProposalTotals(loaded.state),
    proposal: {
      id: loaded.proposal.id as string,
      title: (loaded.proposal.title as string) || "Proposal",
      status: (loaded.proposal.status as ProposalStatus) ?? "sent",
      currentRevision: Number(loaded.proposal.current_revision ?? loaded.revisionNumber),
      validUntil: (loaded.proposal.valid_until as string | null) ?? null,
    },
    revisionNumber: loaded.revisionNumber,
    team,
    signature,
  });
  const pdfBytes = await renderProposalPdf({ model, documentTitle: model.headline });

  const envelope = await createProposalEnvelope({
    proposalId: input.proposalId,
    revisionId: loaded.revisionId,
    documentName: proposalDownloadFilename((loaded.proposal.title as string) || "Proposal", loaded.revisionNumber, "pdf"),
    pdfBytes,
    recipient,
  });

  const { error: insertError } = await db.from("client_proposal_docusign_envelopes").insert({
    proposal_id: input.proposalId,
    revision_id: loaded.revisionId,
    envelope_id: envelope.envelopeId,
    status: normalizeEnvelopeStatus(envelope.status),
    recipient_name: recipient.name,
    recipient_email: recipient.email,
    email_subject: envelope.emailSubject,
    sent_by: input.actorUserId,
  });
  if (insertError) return { ok: false, error: insertError.message };

  await markProposalSentIfAllowed(db, loaded.proposal, input.actorUserId, input.actorRole);
  await recordAuditEvent({
    ...buildDataAuditEvent(
      "create",
      "client_proposal_docusign_envelope",
      envelope.envelopeId,
      input.actorUserId,
      `Sent proposal "${loaded.proposal.title}" to ${recipient.email} with DocuSign`,
      null,
      { proposal_id: input.proposalId, revision_id: loaded.revisionId, recipient_email: recipient.email },
    ),
    actor_role: input.actorRole,
  });

  revalidatePath("/employee/proposals");
  revalidatePath(`/employee/proposals/${input.proposalId}`);
  return { ok: true, envelopeId: envelope.envelopeId };
}

async function updateEnvelopeEvent(db: LooseClient, input: RecordDocusignEnvelopeEventInput) {
  const status = normalizeEnvelopeStatus(input.status);
  const patch: Record<string, unknown> = {
    status,
    last_event_at: input.occurredAt ?? new Date().toISOString(),
    last_event_payload: input.payload,
  };
  if (status === "completed") patch.completed_at = input.occurredAt ?? new Date().toISOString();
  if (status === "declined") patch.declined_at = input.occurredAt ?? new Date().toISOString();
  if (status === "voided") patch.voided_at = input.occurredAt ?? new Date().toISOString();

  return db
    .from("client_proposal_docusign_envelopes")
    .update(patch)
    .eq("envelope_id", input.envelopeId)
    .select("id, proposal_id, revision_id, completed_file_id, recipient_name, recipient_email")
    .maybeSingle();
}

export async function recordDocusignEnvelopeEvent(
  input: RecordDocusignEnvelopeEventInput,
): Promise<{ ok: boolean; error?: string; ignored?: boolean }> {
  const db: LooseClient | null = createAdminClient();
  if (!db) return { ok: false, error: "Service-role credentials are not configured." };

  const { data: envelope, error } = await updateEnvelopeEvent(db, input);
  if (error) return { ok: false, error: error.message };
  if (!envelope) return { ok: true, ignored: true };
  if (normalizeEnvelopeStatus(input.status) !== "completed") return { ok: true };
  if (envelope.completed_file_id) return { ok: true };

  const { data: proposal } = await db
    .from("client_proposals")
    .select("id, title, proposal_number, client_id, status, current_revision")
    .eq("id", envelope.proposal_id)
    .maybeSingle();
  if (!proposal) return { ok: false, error: "Proposal not found for completed DocuSign envelope." };

  const revisionNumber =
    envelope.revision_id != null
      ? Number(
          (
            await db
              .from("client_proposal_revisions")
              .select("revision_number")
              .eq("id", envelope.revision_id)
              .eq("proposal_id", envelope.proposal_id)
              .maybeSingle()
          ).data?.revision_number ?? proposal.current_revision ?? 1,
        )
      : Number(proposal.current_revision ?? 1);

  const clientId = (proposal.client_id as string | null) ?? null;
  const scope: FileScope = clientId ? "client" : "company";
  const folder = await findOrCreateProposalsFolder(db, scope, clientId, null);
  if (!folder.ok || !folder.folderId) return { ok: false, error: folder.error ?? "Could not resolve Proposals folder." };

  const name = signedProposalFileName(
    (proposal.proposal_number as string | null) ?? null,
    (proposal.title as string) || "Proposal",
    revisionNumber,
  );

  let existingFileQuery = db
    .from("company_files")
    .select("id")
    .eq("scope", scope)
    .eq("name", name)
    .is("archived_at", null);
  existingFileQuery = clientId ? existingFileQuery.eq("client_id", clientId) : existingFileQuery.is("client_id", null);
  const { data: existingFiles } = await existingFileQuery.limit(1);
  const existingFile = Array.isArray(existingFiles) ? existingFiles[0] : null;

  let completedFileId = existingFile?.id as string | undefined;
  let createdNewFile = false;
  if (!completedFileId) {
    const signedPdf = await downloadCompletedEnvelopePdf(input.envelopeId);
    const fileId = crypto.randomUUID();
    const storagePath = buildStoragePath(scope, clientId, fileId, name);

    const { error: uploadError } = await db.storage
      .from(fileCenterBucket)
      .upload(storagePath, Buffer.from(signedPdf), { contentType: "application/pdf", upsert: false });
    if (uploadError) return { ok: false, error: uploadError.message };

    const { error: fileError } = await db.from("company_files").insert({
      id: fileId,
      scope,
      client_id: clientId,
      folder_id: folder.folderId,
      name,
      storage_bucket: fileCenterBucket,
      storage_path: storagePath,
      mime_type: "application/pdf",
      size_bytes: signedPdf.byteLength,
      description: `Filed automatically from completed DocuSign envelope ${input.envelopeId}.`,
      uploaded_by: null,
    });
    if (fileError) {
      try {
        await db.storage.from(fileCenterBucket).remove([storagePath]);
      } catch {
        // Best effort cleanup.
      }
      return { ok: false, error: fileError.message };
    }

    completedFileId = fileId;
    createdNewFile = true;
  }

  await db
    .from("client_proposal_docusign_envelopes")
    .update({ completed_file_id: completedFileId })
    .eq("envelope_id", input.envelopeId);

  const proposalStatus = (proposal.status as ProposalStatus) ?? "sent";
  if (canTransitionProposal(proposalStatus, "accepted").ok) {
    await db
      .from("client_proposals")
      .update({
        status: "accepted",
        accepted_at: input.occurredAt ?? new Date().toISOString(),
        accepted_by_name: envelope.recipient_name,
        accepted_by_email: envelope.recipient_email,
        accepted_revision_id: envelope.revision_id ?? null,
      })
      .eq("id", envelope.proposal_id);
  }

  if (createdNewFile) {
    await recordAuditEvent({
      ...buildDataAuditEvent(
        "create",
        "company_file",
        completedFileId,
        null,
        `Filed DocuSign-completed proposal "${proposal.title}" into the File Center`,
        null,
        { proposal_id: envelope.proposal_id, envelope_id: input.envelopeId, scope, client_id: clientId },
      ),
      actor_role: "docusign_connect",
    });
  }

  revalidatePath(fileCenterPath);
  revalidatePath("/employee/proposals");
  revalidatePath(`/employee/proposals/${envelope.proposal_id}`);
  return { ok: true };
}
