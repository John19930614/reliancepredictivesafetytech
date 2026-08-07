import { Radar } from "lucide-react";
import type { SourcingRunRow, SourcingRunStatus, SourcingRunType } from "@/lib/talent-engine/types";
import { TalentAiTag, TalentCard, TalentEmpty } from "./TalentCard";
import { formatNumber, formatRelativeTime } from "./format";

/**
 * The Sourcing Agent's recent sweeps — the receipt for the queue below.
 *
 * Server component. It answers the two questions a reviewer looking at an empty
 * queue actually has: did the agent run, and did it find nothing or fall over?
 * A failed run therefore shows its error rather than reading as "no leads".
 *
 * found → added is the honest pair. They differ constantly — a sweep dedupes
 * against leads already in the queue and caps itself at
 * `sourcingMaxLeadsPerRun` — and showing only one of the two numbers would make
 * a working sweep look broken.
 */

const runTypeLabels: Record<SourcingRunType, string> = {
  candidates: "Candidate sweep",
  job_orders: "Job-order sweep",
};

const runStatusLabels: Record<SourcingRunStatus, string> = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

function statusClass(status: SourcingRunStatus): string {
  if (status === "failed") return "talent-run-status talent-run-status-failed";
  if (status === "running") return "talent-run-status talent-run-status-running";
  return "talent-run-status talent-run-status-done";
}

export function SourcingRunsStrip({
  runs,
  now,
}: {
  runs: SourcingRunRow[];
  /** The page's single clock, in ms, so every "3 hrs ago" agrees. */
  now: number;
}) {
  return (
    <TalentCard
      count={runs.length > 0 ? `last ${runs.length}` : null}
      icon={<Radar size={15} />}
      tag={<TalentAiTag label="Sourcing Agent" />}
      title="Recent sweeps"
    >
      {runs.length === 0 ? (
        <TalentEmpty
          hint="Each sweep of the public web is logged here with what it found, what it added to the queue, and any error."
          title="The agent has not swept yet"
        />
      ) : (
        <ul className="talent-runs">
          {runs.map((run) => (
            <li className="talent-run" key={run.id}>
              <p className="talent-run-head">
                <span className="talent-run-type">{runTypeLabels[run.run_type] ?? run.run_type}</span>
                <span className={statusClass(run.status)}>{runStatusLabels[run.status] ?? run.status}</span>
              </p>

              <p className="talent-run-counts">
                <strong>{formatNumber(run.leads_found)}</strong> found
                <span aria-hidden="true"> → </span>
                <span className="talent-visually-hidden">, </span>
                <strong>{formatNumber(run.leads_inserted)}</strong> added to the queue
              </p>

              <p className="talent-run-meta">
                Started {formatRelativeTime(run.started_at, now)}
                {run.triggered_by === "cron" ? " · scheduled" : " · run by hand"}
              </p>

              {run.query_summary ? <p className="talent-run-query">{run.query_summary}</p> : null}

              {run.status === "failed" && run.error ? (
                <p className="talent-run-error">Failed: {run.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </TalentCard>
  );
}
