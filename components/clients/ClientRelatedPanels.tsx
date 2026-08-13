import Link from "next/link";
import { fileCenterPath } from "@/lib/files/types";
import { proposalStatusLabels, type ProposalStatus } from "@/lib/proposals/types";
import {
  splitMeetingsByTime,
  summarizeClientProposals,
  type ClientMeetingRow,
  type ClientProposalRow,
} from "@/lib/clients/related";

// Everything the platform already knows about this company that used to live in
// four other modules. Read-only by design: each row is a doorway into the module
// that owns it, so there is exactly one place to edit any of this.

export interface ClientFileRow {
  id: string;
  name: string;
  created_at: string | null;
}

export interface ClientTrainingEventRow {
  id: string;
  title: string | null;
  status: string | null;
  scheduled_start_at: string | null;
  delivery_mode: string | null;
}

interface ClientRelatedPanelsProps {
  /** Lets the outbound links carry this company instead of dropping the context. */
  clientId: string;
  proposals: ClientProposalRow[];
  files: ClientFileRow[];
  fileCount: number;
  meetings: ClientMeetingRow[];
  trainingEvents: ClientTrainingEventRow[];
  /** Passed in so the server render and any re-render agree on "now". */
  now: Date;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatDate(value: string | null | undefined): string {
  if (!value) return "No date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function proposalLabel(status: string | null): string {
  return status && status in proposalStatusLabels
    ? proposalStatusLabels[status as ProposalStatus]
    : (status ?? "Unknown");
}

export function ClientRelatedPanels({
  clientId,
  proposals,
  files,
  fileCount,
  meetings,
  trainingEvents,
  now,
}: ClientRelatedPanelsProps) {
  const pipeline = summarizeClientProposals(proposals);
  const { upcoming, past } = splitMeetingsByTime(meetings, now);
  const recentMeetings = [...upcoming, ...past.slice(0, 3)];

  return (
    <section className="table-card" style={{ marginTop: 20 }}>
      <div className="checklist-section">
        <div className="stage-workspace-head">
          <div>
            <div className="eyebrow">Everything else on this company</div>
            <h2>Client record at a glance</h2>
          </div>
          <span className="badge">
            {pipeline.openCount} open{pipeline.openValue > 0 ? ` · ${money.format(pipeline.openValue)}` : ""}
          </span>
        </div>

        <div className="stage-workspace-grid">
          <section>
            <h3>Proposals</h3>
            {proposals.length === 0 ? (
              <div className="empty-state">
                No proposals yet. <Link href="/employee/proposals">Open the proposals module</Link> to write one.
              </div>
            ) : (
              <>
                <p style={{ color: "var(--portal-muted)", margin: "0 0 10px" }}>
                  {pipeline.wonCount > 0
                    ? `${pipeline.wonCount} won (${money.format(pipeline.wonValue)})`
                    : "None won yet"}
                  {pipeline.lostCount > 0 ? ` · ${pipeline.lostCount} declined` : ""}
                </p>
                <div className="checklist-list">
                  {proposals.map((proposal) => (
                    <article className="checklist-row" key={proposal.id}>
                      <div>
                        <h3>
                          <Link href={`/employee/proposals/${proposal.id}`}>
                            {[proposal.proposal_number, proposal.title].filter(Boolean).join(" — ") || "Untitled"}
                          </Link>
                        </h3>
                        <p>
                          {proposalLabel(proposal.status)}
                          {Number(proposal.proposal_value ?? 0) > 0
                            ? ` · ${money.format(Number(proposal.proposal_value))}`
                            : ""}
                          {proposal.accepted_at ? ` · accepted ${formatDate(proposal.accepted_at)}` : ""}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section>
            <h3>Files</h3>
            {files.length === 0 ? (
              <div className="empty-state">
                Nothing filed for this client yet. Accepted proposals land here automatically.
              </div>
            ) : (
              <>
                <p style={{ color: "var(--portal-muted)", margin: "0 0 10px" }}>
                  {fileCount} file{fileCount === 1 ? "" : "s"} in the File Center ·{" "}
                  <Link href={fileCenterPath}>Open File Center</Link>
                </p>
                <div className="checklist-list">
                  {files.map((file) => (
                    <article className="checklist-row" key={file.id}>
                      <div>
                        <h3>{file.name}</h3>
                        <p>Added {formatDate(file.created_at)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section>
            <h3>Meetings</h3>
            {recentMeetings.length === 0 ? (
              <div className="empty-state">No sales meetings scheduled with this client.</div>
            ) : (
              <div className="checklist-list">
                {recentMeetings.map((meeting) => {
                  const isUpcoming = upcoming.includes(meeting);
                  return (
                    <article className="checklist-row" key={meeting.id}>
                      <div>
                        <h3>{meeting.title ?? "Meeting"}</h3>
                        <p>
                          {isUpcoming ? "Upcoming · " : ""}
                          {formatDate(meeting.scheduled_at)}
                          {meeting.status ? ` · ${meeting.status}` : ""}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            <p style={{ marginTop: 10 }}>
              <Link href={`/employee/sales-meetings?client=${clientId}`}>
                All meetings for this company
              </Link>
            </p>
          </section>

          <section>
            <h3>Training</h3>
            {trainingEvents.length === 0 ? (
              <div className="empty-state">No training events booked for this client.</div>
            ) : (
              <div className="checklist-list">
                {trainingEvents.map((event) => (
                  <article className="checklist-row" key={event.id}>
                    <div>
                      <h3>{event.title ?? "Training event"}</h3>
                      <p>
                        {formatDate(event.scheduled_start_at)}
                        {event.delivery_mode ? ` · ${event.delivery_mode}` : ""}
                        {event.status ? ` · ${event.status}` : ""}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <p style={{ marginTop: 10 }}>
              <Link href="/employee/training">Training module</Link>
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}
