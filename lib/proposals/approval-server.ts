import "server-only";

// Server-side reads for the maker–checker decision history.
//
// Kept out of app/employee/proposals/actions.ts because that file is a
// "use server" module: everything it exports becomes a callable POST endpoint,
// so a plain helper does not belong there. The rules themselves are pure and
// live in lib/proposals/approval.ts; this module only fetches.

import { resolveApprovalState, type ApprovalState, type ProposalApprovalRecord } from "./approval";

/** Same loose-client convention as lib/proposals/acceptance-filing.ts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

interface ApprovalRow {
  id?: unknown;
  revision_id?: unknown;
  revision_number?: unknown;
  decision?: unknown;
  note?: unknown;
  decided_by?: unknown;
  decided_at?: unknown;
}

function toRecord(row: ApprovalRow): ProposalApprovalRecord | null {
  const decision = row.decision === "approved" || row.decision === "changes_requested" ? row.decision : null;
  const revisionNumber = Number(row.revision_number);
  if (!decision || !Number.isFinite(revisionNumber)) return null;
  return {
    id: typeof row.id === "string" ? row.id : "",
    revisionId: typeof row.revision_id === "string" ? row.revision_id : null,
    revisionNumber,
    decision,
    note: typeof row.note === "string" && row.note.trim() !== "" ? row.note : null,
    decidedBy: typeof row.decided_by === "string" ? row.decided_by : null,
    decidedByName: "",
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : "",
  };
}

/**
 * Every decision recorded for a proposal, newest first.
 *
 * Degrades to [] on any read error rather than throwing. A caller that cannot
 * read the history must behave as though nothing has been approved, which is
 * the safe direction: `currentRevisionApproved` stays false and the send gates
 * stay shut.
 */
export async function loadApprovalRecords(
  supabase: LooseClient,
  proposalId: string,
): Promise<ProposalApprovalRecord[]> {
  const { data, error } = await supabase
    .from("client_proposal_approvals")
    .select("id, revision_id, revision_number, decision, note, decided_by, decided_at")
    .eq("proposal_id", proposalId)
    .order("decided_at", { ascending: false });

  if (error || !Array.isArray(data)) return [];
  return (data as ApprovalRow[]).map(toRecord).filter((record): record is ProposalApprovalRecord => record !== null);
}

/** The folded state the gates and the banner read. */
export async function loadApprovalState(
  supabase: LooseClient,
  proposalId: string,
  currentRevision: number,
): Promise<ApprovalState> {
  return resolveApprovalState(await loadApprovalRecords(supabase, proposalId), currentRevision);
}
