"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getProposalAccess } from "@/lib/proposals/access";
import {
  canEditProposalContent,
  canEditProposalMeta,
  canTransitionProposal,
  isProposalUuid,
  nextRevisionNumber,
  proposalTitleMaxLength,
  validateProposalFields,
} from "@/lib/proposals/policy";
import {
  canDecideProposal,
  canDispatchToClient,
  canSendProposal,
  canSubmitForReview,
  editVoidsApproval,
  isProposalDecision,
  normalizeDecisionNote,
  type ProposalDecision,
} from "@/lib/proposals/approval";
import { loadApprovalState } from "@/lib/proposals/approval-server";
import {
  buildShareLinkUrl,
  canShareProposal,
  clampShareLinkDays,
  declineReasonMaxLength,
  extractClientIp,
  shareLinkExpiryIso,
  validateAcceptanceInput,
  validateDeclineInput,
  type DeclineInput,
} from "./share-link-policy";
import { generateShareToken, hashShareToken } from "./share-token";
import { applyShareLinkAcceptance, applyShareLinkDecline, resolveShareLink } from "./share-link-server";
import { isProposalExpired } from "@/lib/proposals/validity";
import {
  buildPrefillState,
  isGeneratorState,
  type GeneratorItem,
  type GeneratorState,
  type ProposalPrefill,
} from "@/lib/proposals/generator-state";
import {
  loadClientCompanyDetail,
  loadCompanyProfile,
  loadPreparedByName,
} from "@/lib/proposals/company-server";
import { lookupPhase, type PhaseKey } from "@/lib/proposals/catalog";
import { serializeTeamMemberIds, teamFieldIds } from "@/lib/proposals/team-selection";
import { resolveDocumentExtras } from "@/lib/proposals/team-server";
import type { DocumentSignature, DocumentTeamMember } from "@/components/proposals/proposal-document-model";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import { proposalStatuses, type ProposalStatus } from "@/lib/proposals/types";
import { fileAcceptedProposalPdf } from "@/lib/proposals/acceptance-filing";
import { notifyProposalEventById } from "@/lib/proposals/notifications-server";
import { sendProposalForDocusign } from "@/lib/proposals/docusign";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Field-level messages keyed by input field name, when validation failed. */
  fieldErrors?: Record<string, string>;
}

/**
 * PostgREST returns no error for an UPDATE/DELETE that matched zero rows —
 * whether the id does not exist or RLS filtered it out. Every mutation in this
 * file therefore asks for the affected ids back and treats an empty result as a
 * failure, so we never report success (or write an audit event) for a no-op.
 */
const NO_ROWS_MESSAGE = "Proposal not found or you do not have permission to change it.";

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";

function revalidateProposals(proposalId?: string) {
  revalidatePath("/employee/proposals");
  if (proposalId) revalidatePath(`/employee/proposals/${proposalId}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorCode(error: any): string | null {
  return typeof error?.code === "string" ? error.code : null;
}

async function recordProposalAudit(
  role: string | null,
  action: "create" | "update" | "delete",
  proposalId: string,
  userId: string,
  summary: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
) {
  await recordAuditEvent({
    ...buildDataAuditEvent(action, "client_proposal", proposalId, userId, summary, before, after),
    actor_role: role,
  });
}

/**
 * The phase rows the generator seeds for a blank form — transcribed from the
 * `addPhase(...)` calls in the DOMContentLoaded handler of
 * assets/proposal-generator-v15.html. All three are priced at 0 because the
 * pilot bundles them into the package fee, and each carries a pilot-specific
 * description that overrides the catalog copy.
 *
 * These must be persisted rather than left implicit: the bridge replaces the
 * generator's item lists whenever they are present as arrays, so seeding empty
 * arrays would open a brand-new proposal with no line items at all. The asset
 * seeds no default SERVICE rows, so `services` stays empty.
 */
/**
 * Phases a brand-new proposal opens with.
 *
 * These used to be pilot copy — "configuration of the two pilot jobsites",
 * "across the 6-month pilot", every line ending "— included in the pilot." Two
 * problems with that. Every proposal started life announcing a pilot whether it
 * was one or not, and the sentences hardcoded a jobsite count and a term length
 * that no field controlled, so they stayed wrong however the seller edited the
 * proposal beside them. They were exactly the drift lib/proposals/consistency.ts
 * now flags, shipped as the default.
 *
 * Neutral now, and free of counts and durations — the same COPY RULE the
 * package catalog follows. A seller quoting a pilot picks the Basic Pilot
 * package and writes the pilot's terms themselves.
 */
const defaultPhases: ReadonlyArray<{ key: PhaseKey; desc: string }> = [
  {
    key: "discovery",
    desc: "Kickoff, platform access setup, and configuration of the jobsites and user accounts in scope.",
  },
  {
    key: "build",
    desc: "Configure modules, templates, dashboards, and workflows for day-to-day use.",
  },
  {
    key: "launch",
    desc: "User training, launch support, and check-ins across the engagement term.",
  },
];

function buildDefaultPhaseItems(): GeneratorItem[] {
  return defaultPhases.map(({ key, desc }) => ({
    type: "phase",
    key,
    name: lookupPhase(key)?.name ?? "",
    qty: 1,
    price: 0,
    desc,
    // Phase options carry no billing unit; the asset writes `o.unit || ""`.
    unit: "",
  }));
}

/** Full, valid generator state so revision 1 is openable and restorable. */
function buildInitialFormState(prefill: ProposalPrefill | null): GeneratorState {
  const prefilled = buildPrefillState(prefill);
  return {
    v: prefilled?.v ?? 1,
    fields: {
      // A blank proposal is not a platform sale yet, and the generator's
      // fallback package printed one anyway: a "Platform Services" subscription
      // row at $0 in the fee table, with Subscription Price pills beside it.
      // Seeded explicitly rather than by changing defaultPackageKey, so
      // proposals already saved without a packageSelect keep rendering exactly
      // as they were sent.
      packageSelect: "none",
      ...(prefilled?.fields ?? {}),
    },
    phases: buildDefaultPhaseItems(),
    services: [],
  };
}

/**
 * Today's calendar date in the company's own timezone, as `YYYY-MM-DD`.
 *
 * NOT `toISOString().slice(0, 10)`: UTC runs ahead of US Central, so a proposal
 * created after 6pm would be dated tomorrow. `en-CA` is the locale whose short
 * date format is ISO order.
 */
function todayInCompanyTimezone(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

/**
 * Recomputes the fee total from the SUBMITTED generator state instead of
 * trusting a number posted by the browser, so `client_proposals.proposal_value`
 * always matches the document the customer is shown. Returns null when there is
 * no state to price, or when the total falls outside what the column and the
 * field validator accept — in that case proposal_value is left untouched rather
 * than failing the save on a pricing overflow.
 */
function recomputeProposalValue(formData: GeneratorState | null): number | null {
  if (!formData) return null;
  const { total } = computeProposalTotals(formData);
  return validateProposalFields({ proposalValue: total }).ok ? total : null;
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
  const { supabase, userId, canManage, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to create proposals." };

  const validation = validateProposalFields({
    title: input.title,
    clientId: input.clientId,
    proposalValue: input.proposalValue,
    validUntil: input.validUntil,
  });
  if (!validation.ok) return { ok: false, error: validation.error, fieldErrors: validation.errors };

  const title = input.title.trim();
  const clientId = input.clientId || null;
  const summary = input.summary?.trim() || null;

  // Everything the new proposal can be filled in from before anyone types: the
  // assigned company's address and people, our own company record, and the
  // name of whoever is creating it.
  const [clientCompany, companyProfile, preparedByName] = await Promise.all([
    loadClientCompanyDetail(supabase, clientId),
    loadCompanyProfile(supabase),
    loadPreparedByName(supabase, userId),
  ]);

  // The row is inserted BEFORE the form state is built, because the proposal's
  // reference number is allocated by the insert trigger
  // (allocate_client_proposal_number — CODE-NN for a client with a code, the
  // global RPS scheme otherwise) and the document has to print the number this
  // proposal actually got. Building the state first would mean either guessing
  // the number or burning a sequence value on a row that may fail to insert.
  const { data: proposal, error } = await supabase
    .from("client_proposals")
    .insert({
      title,
      client_id: clientId,
      owner: input.owner?.trim() || null,
      proposal_value: input.proposalValue ?? null,
      valid_until: input.validUntil || null,
      summary,
      body_markdown: input.bodyMarkdown ?? null,
      status: "draft",
      current_revision: 1,
      created_by: userId,
    })
    .select("id, proposal_number")
    .single();

  if (error || !proposal) return { ok: false, error: error?.message ?? "Failed to create proposal." };

  // Seed revision 1 with a complete generator state. Without this the first
  // revision has null form_data, which makes it un-openable and blanks the
  // working copy if anyone restores it.
  const formData = buildInitialFormState({
    company: clientCompany,
    companyProfile,
    preparedBy: preparedByName,
    proposalNumber: (proposal.proposal_number ?? null) as string | null,
    today: todayInCompanyTimezone(),
  });

  const { error: formDataError } = await supabase
    .from("client_proposals")
    .update({ form_data: formData })
    .eq("id", proposal.id);
  if (formDataError) {
    return { ok: false, error: `Proposal created but its starting content failed to save: ${formDataError.message}` };
  }

  const { error: revisionError } = await supabase.from("client_proposal_revisions").insert({
    proposal_id: proposal.id,
    revision_number: 1,
    title,
    summary,
    body_markdown: input.bodyMarkdown ?? null,
    change_note: "Initial version",
    status_at_save: "draft",
    form_data: formData,
    created_by: userId,
  });
  if (revisionError) return { ok: false, error: `Proposal created but revision 1 failed: ${revisionError.message}` };

  await recordProposalAudit(role, "create", proposal.id, userId, `Created proposal "${title}"`, null, {
    client_id: clientId,
  });

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
  const { supabase, userId, canManage, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to edit proposals." };
  if (!proposalId) return { ok: false, error: "Missing proposal id." };

  const validated: Parameters<typeof validateProposalFields>[0] = {};
  if (patch.clientId !== undefined) validated.clientId = patch.clientId;
  if (patch.proposalValue !== undefined) validated.proposalValue = patch.proposalValue;
  if (patch.validUntil !== undefined) validated.validUntil = patch.validUntil;
  const validation = validateProposalFields(validated);
  if (!validation.ok) return { ok: false, error: validation.error, fieldErrors: validation.errors };

  const update: Record<string, unknown> = {};
  if (patch.clientId !== undefined) update.client_id = patch.clientId || null;
  if (patch.owner !== undefined) update.owner = patch.owner?.trim() || null;
  if (patch.proposalValue !== undefined) update.proposal_value = patch.proposalValue;
  if (patch.validUntil !== undefined) update.valid_until = patch.validUntil || null;
  if (Object.keys(update).length === 0) return { ok: true };

  const { data: before } = await supabase
    .from("client_proposals")
    .select("client_id, owner, proposal_value, valid_until, title, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (!before) return { ok: false, error: NO_ROWS_MESSAGE };

  // The commercial fields are part of the offer and their edits create no
  // revision, so they freeze once the proposal leaves the working states.
  // `owner` stays editable — it is internal routing, not part of the offer.
  const touchesLockedFields =
    patch.clientId !== undefined || patch.proposalValue !== undefined || patch.validUntil !== undefined;
  if (touchesLockedFields) {
    const metaGate = canEditProposalMeta(before.status as ProposalStatus);
    if (!metaGate.ok) return { ok: false, error: metaGate.reason };
  }

  const { data: updated, error } = await supabase
    .from("client_proposals")
    .update(update)
    .eq("id", proposalId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordProposalAudit(
    role,
    "update",
    proposalId,
    userId,
    patch.clientId !== undefined ? "Updated proposal company assignment" : "Updated proposal details",
    before,
    update,
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
  /**
   * Optimistic lock: the `current_revision` the editor was opened on. When
   * supplied and stale, the save is rejected instead of racing another editor
   * into a unique-constraint error. Omit to skip the check.
   */
  baseRevision?: number;
}

function concurrentSaveMessage(revisionNumber: number): string {
  return `Someone else saved v${revisionNumber} while you were editing.`;
}

/** Saves content edits as a new immutable revision and updates the working copy. */
export async function saveProposalRevision(proposalId: string, input: SaveRevisionInput): Promise<ActionResult & { revisionNumber?: number }> {
  const { supabase, userId, canManage, canApprove, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to edit proposals." };
  if (!proposalId) return { ok: false, error: "Missing proposal id." };

  const validation = validateProposalFields({ title: input.title });
  if (!validation.ok) return { ok: false, error: validation.error, fieldErrors: validation.errors };
  const title = input.title.trim();

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, status, current_revision")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: NO_ROWS_MESSAGE };

  const editGate = canEditProposalContent(proposal.status as ProposalStatus);
  if (!editGate.ok) return { ok: false, error: editGate.reason };

  if (typeof input.baseRevision === "number" && proposal.current_revision !== input.baseRevision) {
    return { ok: false, error: concurrentSaveMessage(proposal.current_revision) };
  }

  let formData: GeneratorState | null = null;
  if (input.formData !== undefined && input.formData !== null) {
    if (!isGeneratorState(input.formData)) return { ok: false, error: "Malformed proposal form data." };
    formData = input.formData;
  }

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
  if (revisionError) {
    // Lost the race with a concurrent save: (proposal_id, revision_number) is
    // unique. Never surface the raw constraint text.
    if (errorCode(revisionError) === UNIQUE_VIOLATION) {
      return { ok: false, error: concurrentSaveMessage(revisionNumber) };
    }
    return { ok: false, error: revisionError.message };
  }

  const workingCopy: Record<string, unknown> = {
    title,
    summary: input.summary?.trim() || null,
    body_markdown: input.bodyMarkdown ?? null,
    current_revision: revisionNumber,
    form_data: formData,
  };
  const proposalValue = recomputeProposalValue(formData);
  if (proposalValue !== null) workingCopy.proposal_value = proposalValue;

  const { data: updated, error: updateError } = await supabase
    .from("client_proposals")
    .update(workingCopy)
    .eq("id", proposalId)
    .select("id");
  if (updateError) return { ok: false, error: updateError.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordProposalAudit(role, "update", proposalId, userId, `Saved proposal revision ${revisionNumber}`, null, {
    revision_number: revisionNumber,
    change_note: input.changeNote?.trim() || null,
    proposal_value: proposalValue,
  });

  // A standing approval covers ONE revision. The maker saving a new one means
  // what the reviewer read is no longer what would go out, so the proposal
  // returns to review. An approver's own edit carries their approval forward —
  // bouncing it back to the person who just made the change is theatre.
  //
  // Nothing is deleted: client_proposal_approvals is append-only, and the
  // approval of the earlier revision stays in the history. It simply no longer
  // names the current revision, which is what every send gate tests.
  if (editVoidsApproval(canApprove) && proposal.status === "in_review") {
    const { data: reopened } = await supabase
      .from("client_proposals")
      .update({ status: "draft" satisfies ProposalStatus })
      .eq("id", proposalId)
      .eq("status", "in_review")
      .select("id");
    if (Array.isArray(reopened) && reopened.length > 0) {
      await recordProposalAudit(
        role,
        "update",
        proposalId,
        userId,
        `Proposal returned to draft: v${revisionNumber} was saved after review began, so it needs approving again`,
        { status: "in_review" },
        { status: "draft", revision_number: revisionNumber },
      );
    }
  }

  revalidateProposals(proposalId);
  return { ok: true, revisionNumber };
}

/* -------------------------------------------------------------------------- */
/* Maker–checker                                                               */
/*                                                                             */
/* The maker hands the proposal over; the approver decides. Both are recorded  */
/* — the decision table is the answer to "who authorised this going out".      */
/* -------------------------------------------------------------------------- */

/** Maker's action: hand a draft to the reviewer. Needs no approver capability. */
export async function submitProposalForReview(proposalId: string): Promise<ActionResult> {
  const { supabase, userId, canManage, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to update proposals." };
  if (!proposalId || !isProposalUuid(proposalId)) return { ok: false, error: "Missing or invalid proposal id." };

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, status, title, current_revision")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: NO_ROWS_MESSAGE };

  const gate = canSubmitForReview(proposal.status as ProposalStatus);
  if (!gate.ok) return { ok: false, error: gate.reason };

  const { data: updated, error } = await supabase
    .from("client_proposals")
    .update({ status: "in_review" satisfies ProposalStatus })
    .eq("id", proposalId)
    // Guards the read-then-write: a concurrent transition must not be
    // overwritten by this one.
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordProposalAudit(
    role,
    "update",
    proposalId,
    userId,
    `Submitted proposal "${proposal.title}" for review at v${proposal.current_revision}`,
    { status: proposal.status },
    { status: "in_review", revision_number: proposal.current_revision },
  );

  // The maker-checker handoff: the approver cannot act on what they were never
  // told about. Best-effort — the submission stands if the notification fails.
  await notifyProposalEventById(
    "submitted_for_review",
    proposalId,
    { channel: "employee", revisionNumber: Number(proposal.current_revision ?? 1) },
    { excludeUserId: userId },
  );

  revalidateProposals(proposalId);
  return { ok: true };
}

export interface DecideProposalInput {
  decision: ProposalDecision;
  /** Reviewer's note. Required when asking for changes — otherwise the maker
   * is told "no" with no indication of what to fix. */
  note?: string | null;
}

/** Approver's action: approve the current revision, or send it back with a note. */
export async function decideProposal(proposalId: string, input: DecideProposalInput): Promise<ActionResult> {
  const { supabase, userId, canManage, canApprove, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to update proposals." };
  if (!proposalId || !isProposalUuid(proposalId)) return { ok: false, error: "Missing or invalid proposal id." };
  if (!isProposalDecision(input?.decision)) return { ok: false, error: "Unknown review decision." };

  const note = normalizeDecisionNote(input.note);
  if (!note.ok) return { ok: false, error: note.error };
  if (input.decision === "changes_requested" && note.value === null) {
    return { ok: false, error: "Say what needs changing so the author knows what to fix." };
  }

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, status, title, current_revision")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: NO_ROWS_MESSAGE };

  const gate = canDecideProposal(proposal.status as ProposalStatus, canApprove);
  if (!gate.ok) return { ok: false, error: gate.reason };

  // Pin the decision to the immutable revision, not to the proposal. Looked up
  // rather than trusted from the client so the recorded id is the one the
  // database agrees is current.
  const { data: revision } = await supabase
    .from("client_proposal_revisions")
    .select("id, revision_number")
    .eq("proposal_id", proposalId)
    .eq("revision_number", proposal.current_revision)
    .maybeSingle();

  const { error: decisionError } = await supabase.from("client_proposal_approvals").insert({
    proposal_id: proposalId,
    revision_id: revision?.id ?? null,
    revision_number: proposal.current_revision,
    decision: input.decision,
    note: note.value,
    decided_by: userId,
  });
  if (decisionError) return { ok: false, error: decisionError.message };

  // Changes requested reopens the draft so the maker can edit; an approval
  // leaves it in_review, ready for the separate, deliberate Send.
  if (input.decision === "changes_requested") {
    await supabase
      .from("client_proposals")
      .update({ status: "draft" satisfies ProposalStatus })
      .eq("id", proposalId)
      .eq("status", "in_review");
  }

  await recordProposalAudit(
    role,
    "update",
    proposalId,
    userId,
    input.decision === "approved"
      ? `Approved proposal "${proposal.title}" at v${proposal.current_revision}`
      : `Requested changes on proposal "${proposal.title}" at v${proposal.current_revision}`,
    { status: proposal.status },
    { decision: input.decision, revision_number: proposal.current_revision, note: note.value },
  );

  revalidateProposals(proposalId);
  return { ok: true };
}

/**
 * Saves the working copy's form state WITHOUT minting a revision. Autosave and
 * "Save Draft" go through here; only an explicit "Save revision" should grow
 * the immutable history.
 */
export async function saveProposalDraft(proposalId: string, formData: unknown): Promise<ActionResult> {
  const { supabase, userId, canManage, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to edit proposals." };
  if (!proposalId) return { ok: false, error: "Missing proposal id." };
  if (!isGeneratorState(formData)) return { ok: false, error: "Malformed proposal form data." };

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: NO_ROWS_MESSAGE };

  const editGate = canEditProposalContent(proposal.status as ProposalStatus);
  if (!editGate.ok) return { ok: false, error: editGate.reason };

  const draft: Record<string, unknown> = { form_data: formData, updated_at: new Date().toISOString() };
  const proposalValue = recomputeProposalValue(formData);
  if (proposalValue !== null) draft.proposal_value = proposalValue;

  const { data: updated, error } = await supabase
    .from("client_proposals")
    .update(draft)
    .eq("id", proposalId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordProposalAudit(role, "update", proposalId, userId, "Saved proposal draft (no new revision)", null, {
    form_data_saved: true,
    proposal_value: proposalValue,
  });

  revalidateProposals(proposalId);
  return { ok: true };
}

/**
 * Resolves the bios and signature image for a team selection, for the EDITOR's
 * live preview.
 *
 * The document view resolves these server-side per render, but the editor's
 * preview is driven by postMessage state that never leaves the browser — so
 * ticking a teammate on the left used to change nothing at all on the right,
 * and the preview labelled "exactly what the client sees" was quietly missing
 * the Your Team section (and, with it, shifted every section number after it).
 *
 * Deliberately routed through `resolveDocumentExtras`, the same helper the
 * document view, the revision view, the share route and the PDF use: a second
 * resolver here is exactly how the preview would drift from the document again.
 * The ids arrive from a client-editable form field and are re-validated by
 * parseTeamMemberIds / parseSignerId (well-formed uuids only, capped at
 * maxTeamMembers) before any query runs.
 */
export async function loadProposalDocumentExtras(
  memberIds: unknown,
  signerId: unknown,
): Promise<{ team: DocumentTeamMember[]; signature: DocumentSignature | null }> {
  const { canRead } = await getProposalAccess();
  // Not an error result: the preview degrades to a document without the team
  // section rather than putting a permissions banner over the editor.
  if (!canRead) return { team: [], signature: null };

  const ids = Array.isArray(memberIds) ? memberIds.filter((id): id is string => typeof id === "string") : [];
  return resolveDocumentExtras({
    fields: {
      [teamFieldIds.members]: serializeTeamMemberIds(ids),
      [teamFieldIds.signer]: typeof signerId === "string" ? signerId : "",
    },
  });
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

  // Restoring a revision with no usable form state would blank the working
  // copy — refuse rather than destroy the current draft.
  if (!isGeneratorState(revision.form_data)) {
    return {
      ok: false,
      error: `Revision ${revision.revision_number} has no usable saved form data, so restoring it would blank the current proposal.`,
    };
  }

  const result = await saveProposalRevision(proposalId, {
    title: revision.title,
    summary: revision.summary,
    bodyMarkdown: revision.body_markdown,
    changeNote: `Restored from revision ${revision.revision_number}`,
    formData: revision.form_data,
  });
  return result;
}

/** Copies a proposal into a fresh draft, carrying the generator state over. */
export async function duplicateProposal(proposalId: string): Promise<ActionResult & { proposalId?: string }> {
  const { supabase, userId, canManage, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to create proposals." };
  if (!proposalId) return { ok: false, error: "Missing proposal id." };

  const { data: source } = await supabase
    .from("client_proposals")
    .select("id, title, summary, body_markdown, proposal_value, valid_until, client_id, owner, form_data")
    .eq("id", proposalId)
    .maybeSingle();
  if (!source) return { ok: false, error: NO_ROWS_MESSAGE };

  const title = `${source.title} (Copy)`.slice(0, proposalTitleMaxLength);
  const formData = isGeneratorState(source.form_data) ? source.form_data : buildInitialFormState(null);

  const { data: created, error } = await supabase
    .from("client_proposals")
    .insert({
      title,
      client_id: source.client_id ?? null,
      owner: source.owner ?? null,
      proposal_value: source.proposal_value ?? null,
      valid_until: source.valid_until ?? null,
      summary: source.summary ?? null,
      body_markdown: source.body_markdown ?? null,
      status: "draft",
      current_revision: 1,
      form_data: formData,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Failed to duplicate proposal." };

  const { error: revisionError } = await supabase.from("client_proposal_revisions").insert({
    proposal_id: created.id,
    revision_number: 1,
    title,
    summary: source.summary ?? null,
    body_markdown: source.body_markdown ?? null,
    change_note: `Duplicated from ${source.title}`,
    status_at_save: "draft",
    form_data: formData,
    created_by: userId,
  });
  if (revisionError) return { ok: false, error: `Proposal duplicated but revision 1 failed: ${revisionError.message}` };

  await recordProposalAudit(role, "create", created.id, userId, `Duplicated proposal "${source.title}"`, null, {
    duplicated_from: proposalId,
  });

  revalidateProposals(created.id);
  return { ok: true, proposalId: created.id };
}

export interface SetProposalStatusOptions {
  /**
   * Why the client said no, when moving to `declined`. Required by the UI
   * rather than by this action: a decline recorded here with no reason is worse
   * data than one recorded with it, but refusing the transition outright would
   * leave a lost deal sitting in `sent` forever.
   */
  declineReason?: string | null;
}

export async function setProposalStatus(
  proposalId: string,
  status: ProposalStatus,
  options: SetProposalStatusOptions = {},
): Promise<ActionResult> {
  const { supabase, userId, canManage, canApprove, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to update proposals." };
  if (!proposalId) return { ok: false, error: "Missing proposal id." };
  if (!proposalStatuses.includes(status)) return { ok: false, error: "Unknown status." };

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, status, title, current_revision")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: NO_ROWS_MESSAGE };

  const gate = canTransitionProposal(proposal.status as ProposalStatus, status);
  if (!gate.ok) return { ok: false, error: gate.reason };

  // The send moment. Every other transition is ordinary workflow; this one puts
  // a document in front of a client, so it needs the approver capability AND an
  // approval naming the revision that is current right now.
  if (status === "sent") {
    const approval = await loadApprovalState(supabase, proposalId, proposal.current_revision);
    const sendGate = canSendProposal({
      status: proposal.status as ProposalStatus,
      isApprover: canApprove,
      approval,
      currentRevision: proposal.current_revision,
    });
    if (!sendGate.ok) return { ok: false, error: sendGate.reason };
  }

  // Stamp the MOMENT, not just the state. A status that flips with no timestamp
  // is why the timeline's decline branch was unreachable and why decline_reason
  // — a column that has existed since 20260804101000 — had never been written by
  // anything.
  const patch: Record<string, unknown> = { status };
  if (status === "declined") {
    patch.declined_at = new Date().toISOString();
    const reason = typeof options.declineReason === "string" ? options.declineReason.trim() : "";
    // Always written, so a decline with no reason cannot inherit the reason
    // from a PREVIOUS decline of the same proposal.
    patch.decline_reason = reason ? reason.slice(0, declineReasonMaxLength) : null;
  }
  if (status === "accepted") {
    patch.accepted_at = new Date().toISOString();
  }

  // Reopening clears the outcome. `sent` is reachable more than once (declined
  // -> draft -> in_review -> sent is the documented recovery path), and the
  // share-link writers gate on `accepted_at is null` / `declined_at is null` —
  // so without this, round two of a proposal can never be accepted or declined
  // by the client at all, and the stale round-one reason stays attached to a
  // live deal. The outcome of each round lives in the audit trail and in the
  // revision history; these columns describe the CURRENT round only.
  if (status === "draft") {
    patch.accepted_at = null;
    patch.accepted_by_name = null;
    patch.accepted_by_email = null;
    patch.acceptance_ip = null;
    patch.accepted_revision_id = null;
    patch.declined_at = null;
    patch.decline_reason = null;
  }

  const { data: updated, error } = await supabase
    .from("client_proposals")
    .update(patch)
    .eq("id", proposalId)
    // Conditional on the status we READ above. Without it this action races the
    // client's own share-link accept/decline: whichever write lands second wins
    // silently, and a recorded client decision can be overwritten by a
    // colleague clicking a button they queued up beforehand.
    .eq("status", proposal.status)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "This proposal changed while you were looking at it — reload to see its current status before trying again.",
    };
  }

  await recordProposalAudit(
    role,
    "update",
    proposalId,
    userId,
    `Moved proposal "${proposal.title}" from ${proposal.status} to ${status}` +
      (status === "declined" && patch.decline_reason ? ` (reason: ${patch.decline_reason})` : ""),
    { status: proposal.status },
    patch,
  );

  // Best-effort convenience copy: the accepted document is filed into the
  // client's File Center folder. The acceptance stands either way — a filing
  // failure is audited as a warning, never surfaced as an action failure.
  if (status === "accepted") {
    const filing = await fileAcceptedProposalPdf({ proposalId, actorUserId: userId, actorRole: role });
    if (!filing.ok) {
      await recordAuditEvent({
        ...buildDataAuditEvent(
          "update",
          "client_proposal",
          proposalId,
          userId,
          `Accepted proposal "${proposal.title}" could not be auto-filed to the File Center: ${filing.error}`,
        ),
        severity: "warn",
        actor_role: role,
      });
    }
  }

  // An outcome recorded by an employee still needs to reach the other owner —
  // acceptance is often relayed by phone and entered by whoever took the call.
  if (status === "accepted" || status === "declined") {
    await notifyProposalEventById(
      status,
      proposalId,
      {
        channel: "employee",
        declineReason: typeof patch.decline_reason === "string" ? patch.decline_reason : null,
      },
      { excludeUserId: userId },
    );
  }

  revalidateProposals(proposalId);
  return { ok: true };
}

export async function deleteProposal(proposalId: string): Promise<ActionResult> {
  const { supabase, userId, isAdmin, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!isAdmin) return { ok: false, error: "Admin role required to delete proposals." };
  if (!proposalId) return { ok: false, error: "Missing proposal id." };

  const { data: before } = await supabase
    .from("client_proposals")
    .select("title, status, client_id")
    .eq("id", proposalId)
    .maybeSingle();

  const { data: deleted, error } = await supabase
    .from("client_proposals")
    .delete()
    .eq("id", proposalId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!deleted || deleted.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordProposalAudit(
    role,
    "delete",
    proposalId,
    userId,
    `Deleted proposal "${before?.title ?? proposalId}"`,
    before ?? null,
  );

  // The detail route must be revalidated too, or /employee/proposals/[id]
  // keeps serving a cached page for a proposal that no longer exists.
  revalidateProposals(proposalId);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Client-facing share links                                                   */
/*                                                                             */
/* A `sent` proposal used to have no stored artifact: no record of what the     */
/* client received, no binding to a revision, and no client-facing path at all  */
/* now that the generator's "Download HTML" is hidden (it leaked the internal   */
/* price book). A share link fixes all three — it renders ONE immutable         */
/* revision at a public URL, and the acceptance captured through it is stamped  */
/* with that same revision id.                                                  */
/* -------------------------------------------------------------------------- */

/** Absolute origin for a share URL, or null so the caller falls back to a path. */
async function shareLinkOrigin(): Promise<string | null> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured;
  try {
    const store = await headers();
    const host = store.get("x-forwarded-host") ?? store.get("host");
    if (!host) return null;
    const proto = store.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}

export interface CreateShareLinkInput {
  /** The revision to bind the link to. Must belong to this proposal. */
  revisionId: string;
  /** Clamped to 1–180 days. */
  expiresInDays?: number;
}

export interface CreateShareLinkResult extends ActionResult {
  /**
   * The RAW token, returned EXACTLY ONCE. Only its SHA-256 hash is stored, so
   * this value cannot be recovered afterwards — not by an admin, not from a
   * database dump. Surface it to the creator with that warning and never log it.
   */
  token?: string;
  url?: string;
  linkId?: string;
  expiresAt?: string;
}

export async function createProposalShareLink(
  proposalId: string,
  input: CreateShareLinkInput,
): Promise<CreateShareLinkResult> {
  const { supabase, userId, canManage, canApprove, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to share proposals." };
  if (!proposalId || !isProposalUuid(proposalId)) return { ok: false, error: "Missing or invalid proposal id." };
  if (!input?.revisionId || !isProposalUuid(input.revisionId)) {
    return { ok: false, error: "Choose which revision the client should see." };
  }

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, title, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: NO_ROWS_MESSAGE };

  const gate = canShareProposal(proposal.status as ProposalStatus);
  if (!gate.ok) return { ok: false, error: gate.reason };

  // A share link IS the client-facing document. Reaching `sent` already
  // required an approval, but the capability is re-checked here so the maker
  // cannot mint a client URL for a proposal the reviewer sent.
  const dispatchGate = canDispatchToClient(proposal.status as ProposalStatus, canApprove);
  if (!dispatchGate.ok) return { ok: false, error: dispatchGate.reason };

  // Scoped by proposal id as well as revision id: a revision uuid from another
  // proposal must never become a shareable document under this heading.
  const { data: revision } = await supabase
    .from("client_proposal_revisions")
    .select("id, revision_number, form_data")
    .eq("id", input.revisionId)
    .eq("proposal_id", proposalId)
    .maybeSingle();
  if (!revision) return { ok: false, error: "That revision does not belong to this proposal." };
  if (!isGeneratorState(revision.form_data)) {
    return {
      ok: false,
      error: `Revision v${revision.revision_number} has no saved document content, so there is nothing to show a client.`,
    };
  }

  const days = clampShareLinkDays(input.expiresInDays);
  const expiresAt = shareLinkExpiryIso(days);
  const token = generateShareToken();

  const { data: created, error } = await supabase
    .from("client_proposal_share_links")
    .insert({
      proposal_id: proposalId,
      revision_id: revision.id,
      // Only the digest is persisted. `token` never leaves this function except
      // in the return value below.
      token_hash: hashShareToken(token),
      expires_at: expiresAt,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !created) return { ok: false, error: error?.message ?? "Failed to create the share link." };

  await recordProposalAudit(
    role,
    "create",
    proposalId,
    userId,
    `Issued a client share link for "${proposal.title}" bound to revision v${revision.revision_number}`,
    null,
    // Deliberately records the link id, the revision binding and the expiry —
    // never the token or its hash.
    { share_link_id: created.id, revision_number: revision.revision_number, expires_at: expiresAt, expires_in_days: days },
  );

  revalidateProposals(proposalId);
  return {
    ok: true,
    token,
    url: buildShareLinkUrl(await shareLinkOrigin(), token),
    linkId: created.id,
    expiresAt,
  };
}

export async function revokeProposalShareLink(linkId: string): Promise<ActionResult> {
  const { supabase, userId, canManage, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to manage share links." };
  if (!linkId || !isProposalUuid(linkId)) return { ok: false, error: "Missing or invalid share link id." };

  // `revoked_at is null` is part of the predicate so a second revoke is a
  // no-op rather than moving the timestamp and rewriting the evidence.
  const { data: revoked, error } = await supabase
    .from("client_proposal_share_links")
    .update({ revoked_at: new Date().toISOString(), revoked_by: userId })
    .eq("id", linkId)
    .is("revoked_at", null)
    .select("id, proposal_id");
  if (error) return { ok: false, error: error.message };
  if (!revoked || revoked.length === 0) {
    return { ok: false, error: "That share link was not found, or it was already revoked." };
  }

  const proposalId = revoked[0].proposal_id as string;
  await recordProposalAudit(role, "update", proposalId, userId, "Revoked a client share link", null, {
    share_link_id: linkId,
    revoked: true,
  });

  revalidateProposals(proposalId);
  return { ok: true };
}

export async function sendProposalToDocusign(
  proposalId: string,
  revisionId: string | null,
): Promise<ActionResult & { envelopeId?: string }> {
  const { supabase, userId, canManage, canApprove, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to send proposals for signature." };
  if (!proposalId || !isProposalUuid(proposalId)) return { ok: false, error: "Missing or invalid proposal id." };
  if (revisionId && !isProposalUuid(revisionId)) return { ok: false, error: "Choose a valid revision to send." };

  // `status` was NOT selected here before, and no gate read it: this action
  // checked only that the proposal existed. Any portal user could put a raw
  // draft in front of a client for signature.
  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: NO_ROWS_MESSAGE };

  const dispatchGate = canDispatchToClient(proposal.status as ProposalStatus, canApprove);
  if (!dispatchGate.ok) return { ok: false, error: dispatchGate.reason };

  let result: Awaited<ReturnType<typeof sendProposalForDocusign>>;
  try {
    result = await sendProposalForDocusign({
      proposalId,
      revisionId,
      actorUserId: userId,
      actorRole: role,
    });
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "DocuSign could not send this proposal.",
    };
  }
  if (!result.ok) return { ok: false, error: result.error };

  revalidateProposals(proposalId);
  return { ok: true, envelopeId: result.envelopeId };
}

export interface AcceptViaShareLinkInput {
  name: string;
  email: string;
  /** The explicit agreement checkbox. Acceptance is refused without it. */
  agreed: boolean;
}

/**
 * CLIENT-FACING and UNAUTHENTICATED. Reachable by anyone holding a valid,
 * unexpired, unrevoked share token — that token is the entire credential.
 *
 * Everything the caller supplies is untrusted:
 *   * the token is format-checked, hashed, and matched constant-time;
 *   * name/email/agreement go through validateAcceptanceInput();
 *   * the IP is read from request headers here, never from the payload;
 *   * the accepted revision is taken from the LINK, never from the caller, so a
 *     client cannot accept a revision they were not shown.
 *
 * Failure messages are deliberately uniform and say nothing about whether a
 * proposal exists behind an unknown token.
 */
export async function acceptProposalViaShareLink(
  token: string,
  input: AcceptViaShareLinkInput,
): Promise<ActionResult> {
  const genericRejection = "This proposal link is no longer available.";

  const validation = validateAcceptanceInput(input ?? {});
  if (!validation.ok || !validation.value) {
    return { ok: false, error: validation.error, fieldErrors: validation.errors };
  }

  const resolved = await resolveShareLink(token);
  if (resolved.state !== "valid" || !resolved.view) return { ok: false, error: genericRejection };
  const view = resolved.view;

  // The same workflow gate the employee-facing status change uses, so a share
  // link can never move a proposal along a path the platform forbids.
  const gate = canTransitionProposal(view.status, "accepted");
  if (!gate.ok) return { ok: false, error: "This proposal is no longer open for acceptance." };

  // The validity date is PRINTED on the document the client is looking at, and
  // until now it was decorative: the gate above checks status and nothing else,
  // so a client could accept in month four at month-one pricing. The date the
  // document states is now the date the platform enforces.
  if (isProposalExpired(view.validUntil, todayInCompanyTimezone())) {
    return {
      ok: false,
      error:
        "This proposal's validity period has passed, so it can no longer be accepted online. Please contact your representative for a current version.",
    };
  }

  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const store = await headers();
    ip = extractClientIp(store.get("x-forwarded-for"));
    userAgent = store.get("user-agent")?.slice(0, 500) ?? null;
  } catch {
    // Header access can fail outside a request scope; the acceptance still
    // stands, it just carries no IP evidence.
  }

  const written = await applyShareLinkAcceptance({
    proposalId: view.proposalId,
    revisionId: view.revisionId,
    name: validation.value.name,
    email: validation.value.email,
    ip,
  });
  if (!written.ok) return { ok: false, error: written.error };

  // Acceptance is the most consequential event in this module's lifecycle and
  // has no signed-in actor, so the audit trail is the only record of who did it.
  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "client_proposal",
      view.proposalId,
      null,
      `Client accepted proposal "${view.title}" (revision v${view.revisionNumber}) via share link`,
      { status: view.status, accepted_at: null },
      {
        status: "accepted",
        accepted_by_name: validation.value.name,
        accepted_by_email: validation.value.email,
        accepted_revision_id: view.revisionId,
        revision_number: view.revisionNumber,
        share_link_id: view.linkId,
      },
    ),
    event_category: "data",
    severity: "warn",
    actor_role: "client_share_link",
    ip_address: ip,
    user_agent: userAgent,
    evidence_links: [view.linkId],
  });

  // Best-effort: file the PDF of the revision the client just accepted into
  // their File Center folder. Never affects the client's own result — they
  // accepted successfully whether or not the copy could be filed.
  const filing = await fileAcceptedProposalPdf({
    proposalId: view.proposalId,
    revisionId: view.revisionId,
    actorUserId: null,
    actorRole: "client_share_link",
  });
  if (!filing.ok) {
    await recordAuditEvent({
      ...buildDataAuditEvent(
        "update",
        "client_proposal",
        view.proposalId,
        null,
        `Accepted proposal "${view.title}" could not be auto-filed to the File Center: ${filing.error}`,
      ),
      severity: "warn",
      actor_role: "client_share_link",
    });
  }

  // The whole point of the feature: a client accepting at 9pm reaches the
  // owners tonight, not whenever someone next opens the proposals list.
  await notifyProposalEventById("accepted", view.proposalId, {
    channel: "share_link",
    actorName: validation.value.name,
    revisionNumber: view.revisionNumber,
  });

  revalidateProposals(view.proposalId);
  return { ok: true };
}

/**
 * Records a client's DECLINE from the public share page.
 *
 * Mirrors acceptProposalViaShareLink exactly — same token resolution, same
 * uniform rejection message, same conditional write — because a decline is the
 * other half of the same decision and must be no harder to give than a yes.
 * Until now there was no way to say no: the client went dark, and the columns
 * built to hold the answer were never written by anything.
 *
 * Deliberately NOT gated on validity. A client declining an expired proposal is
 * still telling us why we lost, and that is the whole point of the feature.
 */
export async function declineProposalViaShareLink(token: string, input: DeclineInput): Promise<ActionResult> {
  const genericRejection = "This proposal link is no longer available.";

  const validation = validateDeclineInput(input ?? {});
  if (!validation.ok || !validation.value) {
    return { ok: false, error: validation.error, fieldErrors: validation.errors };
  }

  const resolved = await resolveShareLink(token);
  if (resolved.state !== "valid" || !resolved.view) return { ok: false, error: genericRejection };
  const view = resolved.view;

  const gate = canTransitionProposal(view.status, "declined");
  if (!gate.ok) return { ok: false, error: "This proposal is no longer open for a response." };

  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const store = await headers();
    ip = extractClientIp(store.get("x-forwarded-for"));
    userAgent = store.get("user-agent")?.slice(0, 500) ?? null;
  } catch {
    // Header access can fail outside a request scope; the decline still stands.
  }

  const written = await applyShareLinkDecline({
    proposalId: view.proposalId,
    name: validation.value.name,
    reason: validation.value.reason,
  });
  if (!written.ok) return { ok: false, error: written.error };

  // Like acceptance, this has no signed-in actor, so the audit trail is the
  // only record of who declined and why.
  await recordAuditEvent({
    ...buildDataAuditEvent(
      "update",
      "client_proposal",
      view.proposalId,
      null,
      `Client declined proposal "${view.title}" (revision v${view.revisionNumber}) via share link: ${validation.value.reason}`,
      { status: view.status, declined_at: null },
      {
        status: "declined",
        declined_by_name: validation.value.name,
        decline_reason: validation.value.reason,
        decline_reason_code: validation.value.reasonValue,
        revision_number: view.revisionNumber,
        share_link_id: view.linkId,
      },
    ),
    event_category: "data",
    severity: "warn",
    actor_role: "client_share_link",
    ip_address: ip,
    user_agent: userAgent,
    evidence_links: [view.linkId],
  });

  // A loss with a stated reason is the most useful thing the client ever tells
  // us, and it is worthless if it sits unread.
  await notifyProposalEventById("declined", view.proposalId, {
    channel: "share_link",
    actorName: validation.value.name,
    declineReason: validation.value.reason,
    revisionNumber: view.revisionNumber,
  });

  revalidateProposals(view.proposalId);
  return { ok: true };
}

/**
 * Extends (or clears) the acceptance window on a proposal that is already out
 * with the client.
 *
 * Its own action rather than a loosening of canEditProposalMeta, which freezes
 * valid_until outside `draft` for good reason: everything else in that gate is
 * part of the offer. Without this, enforcing expiry at acceptance would be a
 * dead end — the only way to give a client another week would be reopening the
 * proposal to draft, which VOIDS the standing approval (editVoidsApproval) and
 * forces a re-approval to send the same document again.
 *
 * The document's own body is untouched, so no revision is minted and no
 * approval is disturbed. `validDays` inside form_data is deliberately left
 * alone: it is the seller's prose, and rewriting saved content from here would
 * edit a document that is locked for editing.
 */
export async function extendProposalValidity(proposalId: string, validUntil: string | null): Promise<ActionResult> {
  const { supabase, userId, canManage, role } = await getProposalAccess();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };
  if (!canManage) return { ok: false, error: "You do not have permission to update proposals." };
  if (!proposalId) return { ok: false, error: "Missing proposal id." };

  const validation = validateProposalFields({ validUntil });
  if (!validation.ok) return { ok: false, error: validation.error, fieldErrors: validation.errors };

  // A date already in the past expires the proposal the moment it is saved,
  // killing every live share link. validateProposalFields checks SHAPE only, so
  // a half-typed year ("0202-10-31") passes it — and this control is driven by
  // a date input, which is exactly how such a value gets submitted.
  if (validUntil && isProposalExpired(validUntil, todayInCompanyTimezone())) {
    return {
      ok: false,
      error: "That date has already passed. Pick a date from today onward, or clear it to leave the proposal open.",
      fieldErrors: { validUntil: "Choose today or a later date." },
    };
  }

  const { data: proposal } = await supabase
    .from("client_proposals")
    .select("id, status, title, valid_until")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal) return { ok: false, error: NO_ROWS_MESSAGE };

  // A closed proposal's validity is history. Reopening is the deliberate path.
  const status = proposal.status as ProposalStatus;
  if (status === "accepted" || status === "declined" || status === "archived") {
    return { ok: false, error: `This proposal is ${status}, so its validity period can no longer be changed.` };
  }

  const { data: updated, error } = await supabase
    .from("client_proposals")
    .update({ valid_until: validUntil || null })
    .eq("id", proposalId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: NO_ROWS_MESSAGE };

  await recordProposalAudit(
    role,
    "update",
    proposalId,
    userId,
    `Changed the validity date on proposal "${proposal.title}" from ${proposal.valid_until ?? "none"} to ${validUntil || "none"}`,
    { valid_until: proposal.valid_until ?? null },
    { valid_until: validUntil || null },
  );

  revalidateProposals(proposalId);
  return { ok: true };
}
