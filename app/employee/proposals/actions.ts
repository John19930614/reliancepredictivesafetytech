"use server";

import { revalidatePath } from "next/cache";
import { getProposalAccess } from "@/lib/proposals/access";
import { canEditProposalContent, canTransitionProposal, nextRevisionNumber } from "@/lib/proposals/policy";
import { isGeneratorState } from "@/lib/proposals/generator-state";
import { proposalStatuses, type ProposalStatus } from "@/lib/proposals/types";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function revalidateProposals(proposalId?: string) {
  revalidatePath("/employee/proposals");
  if (proposalId) revalidatePath(`/employee/proposals/${proposalId}`);
}

export interface CreateProposalInput {
  title: string;
  clientId?: string | null;
  owner?: string | null;
  proposalValue?: number | null;
  validUntil?: string | null;
  summary?: string | null;
  bodyMarkdown?: string | null;
}

export async function createProposal(input: CreateProposalInput): Promise<ActionResult & { proposalId?: string }> {
  const { supabase, userId, canManage } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to create proposals." };

  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Give the proposal a title." };

  const { data: proposal, error } = await supabase
    .from("client_proposals")
    .insert({
      title,
      client_id: input.clientId || null,
      owner: input.owner?.trim() || null,
      proposal_value: input.proposalValue ?? null,
      valid_until: input.validUntil || null,
      summary: input.summary?.trim() || null,
      body_markdown: input.bodyMarkdown ?? null,
      status: "draft",
      current_revision: 1,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !proposal) return { ok: false, error: error?.message ?? "Failed to create proposal." };

  const { error: revisionError } = await supabase.from("client_proposal_revisions").insert({
    proposal_id: proposal.id,
    revision_number: 1,
    title,
    summary: input.summary?.trim() || null,
    body_markdown: input.bodyMarkdown ?? null,
    change_note: "Initial version",
    status_at_save: "draft",
    created_by: userId,
  });
  if (revisionError) return { ok: false, error: `Proposal created but revision 1 failed: ${revisionError.message}` };

  await recordAuditEvent(
    buildDataAuditEvent("create", "client_proposal", proposal.id, userId, `Created proposal "${title}"`, null, {
      client_id: input.clientId ?? null,
    }),
  );

  revalidateProposals(proposal.id);
  return { ok: true, proposalId: proposal.id };
}

export interface ProposalMetaPatch {
  clientId?: string | null;
  owner?: string | null;
  proposalValue?: number | null;
  validUntil?: string | null;
}

/** Updates assignment/commercial fields. Does NOT create a revision (content is unchanged). */
export async function updateProposalMeta(proposalId: string, patch: ProposalMetaPatch): Promise<ActionResult> {
  const { supabase, userId, canManage } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to edit proposals." };
  if (!proposalId) return { ok: false, error: "Missing proposal id." };

  const update: Record<string, unknown> = {};
  if (patch.clientId !== undefined) update.client_id = patch.clientId || null;
  if (patch.owner !== undefined) update.owner = patch.owner?.trim() || null;
  if (patch.proposalValue !== undefined) update.proposal_value = patch.proposalValue;
  if (patch.validUntil !== undefined) update.valid_until = patch.validUntil || null;
  if (Object.keys(update).length === 0) return { ok: true };

  const { data: before } = await supabase
    .from("client_proposals")
    .select("client_id, owner, proposal_value, valid_until, title")
    .eq("id", proposalId)
    .maybeSingle();

  const { error } = await supabase.from("client_proposals").update(update).eq("id", proposalId);
  if (error) return { ok: false, error: error.message };

  await recordAuditEvent(
    buildDataAuditEvent(
      "update",
      "client_proposal",
      proposalId,
      userId,
      patch.clientId !== undefined ? "Updated proposal company assignment" : "Updated proposal details",
      before ?? null,
      update,
    ),
  );

  revalidateProposals(proposalId);
  return { ok: true };
}

export interface SaveRevisionInput {
  title: string;
  summary?: string | null;
  bodyMarkdown?: string | null;
  changeNote?: string | null;
  /** Serialized Proposal Generator state ({v, fields, phases, services}). */
  formData?: unknown;
}

/** Saves content edits as a new immutable revision and updates the working copy. */
export async function saveProposalRevision(proposalId: string, input: SaveRevisionInput): Promise<ActionResult & { revisionNumber?: number }> {
  const { supabase, userId, canManage } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to edit proposals." };
  if (!proposalId) return { ok: false, error: "Missing proposal id." };

  const title = input.title?.trim();
  if (!title) return { ok: false, error: "The proposal needs a title." };

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, status, current_revision")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: "Proposal not found." };

  const editGate = canEditProposalContent(proposal.status as ProposalStatus);
  if (!editGate.ok) return { ok: false, error: editGate.reason };

  if (input.formData !== undefined && input.formData !== null && !isGeneratorState(input.formData)) {
    return { ok: false, error: "Malformed proposal form data." };
  }
  const formData = input.formData ?? null;

  const revisionNumber = nextRevisionNumber(proposal.current_revision);

  const { error: revisionError } = await supabase.from("client_proposal_revisions").insert({
    proposal_id: proposalId,
    revision_number: revisionNumber,
    title,
    summary: input.summary?.trim() || null,
    body_markdown: input.bodyMarkdown ?? null,
    change_note: input.changeNote?.trim() || null,
    status_at_save: proposal.status,
    form_data: formData,
    created_by: userId,
  });
  if (revisionError) return { ok: false, error: revisionError.message };

  const { error: updateError } = await supabase
    .from("client_proposals")
    .update({
      title,
      summary: input.summary?.trim() || null,
      body_markdown: input.bodyMarkdown ?? null,
      current_revision: revisionNumber,
      form_data: formData,
    })
    .eq("id", proposalId);
  if (updateError) return { ok: false, error: updateError.message };

  await recordAuditEvent(
    buildDataAuditEvent("update", "client_proposal", proposalId, userId, `Saved proposal revision ${revisionNumber}`, null, {
      revision_number: revisionNumber,
      change_note: input.changeNote?.trim() || null,
    }),
  );

  revalidateProposals(proposalId);
  return { ok: true, revisionNumber };
}

/** Restores an earlier revision by copying it forward as a NEW revision (history stays intact). */
export async function restoreProposalRevision(proposalId: string, revisionId: string): Promise<ActionResult & { revisionNumber?: number }> {
  const { supabase, userId, canManage } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to edit proposals." };
  if (!proposalId || !revisionId) return { ok: false, error: "Missing proposal or revision id." };

  const { data: revision } = await supabase
    .from("client_proposal_revisions")
    .select("id, proposal_id, revision_number, title, summary, body_markdown, form_data")
    .eq("id", revisionId)
    .eq("proposal_id", proposalId)
    .maybeSingle();
  if (!revision) return { ok: false, error: "Revision not found." };

  const result = await saveProposalRevision(proposalId, {
    title: revision.title,
    summary: revision.summary,
    bodyMarkdown: revision.body_markdown,
    changeNote: `Restored from revision ${revision.revision_number}`,
    formData: revision.form_data,
  });
  return result;
}

export async function setProposalStatus(proposalId: string, status: ProposalStatus): Promise<ActionResult> {
  const { supabase, userId, canManage } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to update proposals." };
  if (!proposalId) return { ok: false, error: "Missing proposal id." };
  if (!proposalStatuses.includes(status)) return { ok: false, error: "Unknown status." };

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, status, title")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: "Proposal not found." };

  const gate = canTransitionProposal(proposal.status as ProposalStatus, status);
  if (!gate.ok) return { ok: false, error: gate.reason };

  const { error } = await supabase.from("client_proposals").update({ status }).eq("id", proposalId);
  if (error) return { ok: false, error: error.message };

  await recordAuditEvent(
    buildDataAuditEvent(
      "update",
      "client_proposal",
      proposalId,
      userId,
      `Moved proposal "${proposal.title}" from ${proposal.status} to ${status}`,
      { status: proposal.status },
      { status },
    ),
  );

  revalidateProposals(proposalId);
  return { ok: true };
}

export async function deleteProposal(proposalId: string): Promise<ActionResult> {
  const { supabase, userId, isAdmin } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isAdmin) return { ok: false, error: "Admin role required to delete proposals." };
  if (!proposalId) return { ok: false, error: "Missing proposal id." };

  const { data: before } = await supabase
    .from("client_proposals")
    .select("title, status, client_id")
    .eq("id", proposalId)
    .maybeSingle();

  const { error } = await supabase.from("client_proposals").delete().eq("id", proposalId);
  if (error) return { ok: false, error: error.message };

  await recordAuditEvent(
    buildDataAuditEvent("delete", "client_proposal", proposalId, userId, `Deleted proposal "${before?.title ?? proposalId}"`, before ?? null),
  );

  revalidateProposals();
  return { ok: true };
}
