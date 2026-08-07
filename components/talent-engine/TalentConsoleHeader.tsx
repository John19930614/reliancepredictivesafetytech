import { ShieldCheck } from "lucide-react";

/**
 * The console's identity strip: what this module is, that the agents are
 * running, and — critically — that they are running in human-approval mode.
 *
 * The design mock hardcodes "Oversight Manager"; the label here is passed in,
 * resolved from the viewer's actual permission flags, so a Recruiter or an
 * Account Manager is never told they are the approver.
 */
export function TalentConsoleHeader({
  viewerName,
  roleLabel,
  today,
}: {
  viewerName: string;
  roleLabel: string;
  /** Pre-formatted date string — formatted on the server so it cannot drift. */
  today: string;
}) {
  return (
    <header className="talent-header">
      <div className="talent-header-id">
        <span className="talent-header-mark" aria-hidden="true">
          <ShieldCheck size={26} />
        </span>
        <div>
          <h1>EHS Talent Engine</h1>
          <p className="talent-header-sub">AI Staffing &amp; Margin Console · Reliance Safety Technologies</p>
        </div>
      </div>

      <div className="talent-header-meta">
        <p className="talent-status-pill">
          <span className="talent-status-dot" aria-hidden="true" />
          AI Agents Active · Human-Approval Mode
        </p>
        <p className="talent-viewer">
          <strong>{viewerName}</strong>
          {roleLabel} · {today}
        </p>
      </div>
    </header>
  );
}
