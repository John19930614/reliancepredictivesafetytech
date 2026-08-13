// Shaping for the client record's cross-module panels.
//
// The client detail page rendered seven of its own tables and none of the four
// entity families that already carry a client_id — proposals, File Center
// files, sales meetings and training events — so answering "what have we
// quoted, filed, met about and scheduled for this company" meant opening four
// modules. The queries are trivial; the only real logic is here, and it is pure
// so it can be tested without a database.

export interface ClientProposalRow {
  id: string;
  title: string | null;
  proposal_number: string | null;
  status: string | null;
  proposal_value: number | string | null;
  accepted_at: string | null;
  updated_at: string | null;
}

export interface ClientMeetingRow {
  id: string;
  title: string | null;
  status: string | null;
  scheduled_at: string | null;
}

export interface ProposalPipelineSummary {
  /** Quoted but not yet decided: draft, in_review, sent. */
  openCount: number;
  openValue: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
}

/** Statuses that represent money still in play for this client. */
const OPEN_STATUSES = new Set(["draft", "in_review", "sent"]);

function toAmount(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  // A malformed or negative stored value must not silently deflate a total the
  // owners read as "what this client is worth".
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function summarizeClientProposals(
  proposals: readonly ClientProposalRow[] | null | undefined,
): ProposalPipelineSummary {
  const summary: ProposalPipelineSummary = {
    openCount: 0,
    openValue: 0,
    wonCount: 0,
    wonValue: 0,
    lostCount: 0,
  };

  for (const proposal of proposals ?? []) {
    const status = proposal.status ?? "";
    const amount = toAmount(proposal.proposal_value);

    if (OPEN_STATUSES.has(status)) {
      summary.openCount += 1;
      summary.openValue += amount;
    } else if (status === "accepted") {
      summary.wonCount += 1;
      summary.wonValue += amount;
    } else if (status === "declined") {
      summary.lostCount += 1;
    }
    // `archived` counts toward nothing on purpose: it is a proposal withdrawn
    // from the record, not a deal won, lost, or still live.
  }

  return summary;
}

export interface SplitMeetings<Row extends ClientMeetingRow = ClientMeetingRow> {
  /** Soonest first — the next thing on the calendar leads. */
  upcoming: Row[];
  /** Most recent first. */
  past: Row[];
}

/**
 * Splits meetings around `now`.
 *
 * Cancelled meetings are past regardless of their date: a cancelled meeting
 * next Tuesday is history, and showing it as upcoming would have someone
 * preparing for a call that is not happening. A meeting with no scheduled_at
 * cannot be upcoming either — there is nothing to be early for.
 *
 * Generic over the row so a caller carrying extra columns — the meetings index
 * joins the company name — keeps them through the split instead of widening to
 * the base shape.
 */
export function splitMeetingsByTime<Row extends ClientMeetingRow>(
  meetings: readonly Row[] | null | undefined,
  now: Date,
): SplitMeetings<Row> {
  const nowMs = now.getTime();
  const upcoming: Row[] = [];
  const past: Row[] = [];

  for (const meeting of meetings ?? []) {
    const at = meeting.scheduled_at ? Date.parse(meeting.scheduled_at) : Number.NaN;
    const isCancelled = meeting.status === "cancelled";
    if (!isCancelled && Number.isFinite(at) && at >= nowMs) upcoming.push(meeting);
    else past.push(meeting);
  }

  const byTime = (a: Row, b: Row, direction: 1 | -1) => {
    const left = a.scheduled_at ? Date.parse(a.scheduled_at) : 0;
    const right = b.scheduled_at ? Date.parse(b.scheduled_at) : 0;
    return (left - right) * direction;
  };

  upcoming.sort((a, b) => byTime(a, b, 1));
  past.sort((a, b) => byTime(a, b, -1));

  return { upcoming, past };
}
