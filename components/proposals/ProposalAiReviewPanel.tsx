"use client";

// AI review — available at every stage of the proposal workflow.
//
// Two layers, and the split is the point (same shape as the Figures check):
//
//   AUTOMATED CHECKS are pure functions (lib/proposals/review-checks.ts) run
//   right here against the state on screen. No API key, no network, no budget
//   — they are always present, on the editor and on the read-only detail page,
//   at draft, in_review, sent, accepted, declined and archived alike.
//
//   THE AI REVIEWER is a button. It sends the state to
//   POST /api/proposals/[id]/review, which layers a model's judgment on top —
//   coherence, commercial risk, clarity — screened by the AI gateway and
//   metered like every other AI feature. When the model is unavailable the
//   response still carries the automated layer plus the reason.
//
// EVERYTHING HERE IS ADVISORY. The endpoint writes nothing, this panel applies
// nothing, and requiresHumanReview is true on every response. Approving,
// sending and editing stay behind their existing human gates (CLAUDE.md,
// Human Authority Rule).

import { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, Sparkles } from "lucide-react";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import { collectReadinessFindings, type ReadinessFinding, type ReviewSeverity } from "@/lib/proposals/review-checks";
import type { AiReviewResult } from "@/lib/proposals/review-schema";
import { proposalStatusLabels, type ProposalStatus } from "@/lib/proposals/types";

const severityRank: Record<ReviewSeverity, number> = { error: 0, warn: 1, info: 2 };

function SeverityIcon({ severity }: { severity: ReviewSeverity }) {
  if (severity === "error") return <AlertOctagon size={14} style={{ color: "#c0392b", flexShrink: 0 }} aria-label="Error" />;
  if (severity === "warn") return <AlertTriangle size={14} style={{ color: "#b7791f", flexShrink: 0 }} aria-label="Warning" />;
  return <Info size={14} style={{ color: "var(--portal-muted)", flexShrink: 0 }} aria-label="Note" />;
}

function FindingList({ findings }: { findings: Array<{ key: string; severity: ReviewSeverity; area: string; message: string; suggestion?: string }> }) {
  return (
    <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
      {findings.map((finding) => (
        <li key={finding.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8, fontSize: "0.85rem" }}>
          <SeverityIcon severity={finding.severity} />
          <div>
            <span style={{ fontWeight: 600 }}>{finding.area}:</span> {finding.message}
            {finding.suggestion ? (
              <div style={{ color: "var(--portal-muted)", marginTop: 2 }}>Suggestion: {finding.suggestion}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

const verdictBadge: Record<AiReviewResult["verdict"], { className: string; label: string }> = {
  ready: { className: "badge badge-green", label: "Ready" },
  needs_attention: { className: "badge badge-yellow", label: "Needs attention" },
  not_ready: { className: "badge badge-red", label: "Not ready" },
};

export function ProposalAiReviewPanel({
  proposalId,
  status,
  state,
  validUntil,
  clientAssigned,
}: {
  proposalId: string;
  status: ProposalStatus;
  /** Live state in the editor; the saved state on the detail page. */
  state: GeneratorState | null;
  validUntil: string | null;
  clientAssigned: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ai, setAi] = useState<AiReviewResult | null>(null);
  const [aiSkippedReason, setAiSkippedReason] = useState("");
  const [model, setModel] = useState("");
  const [ranOnce, setRanOnce] = useState(false);
  const [serverChecks, setServerChecks] = useState<ReadinessFinding[] | null>(null);

  // Company time, matching the server's clock choice, so the validity check
  // does not flip a day early or late for a seller on Eastern or Pacific time.
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date()), []);

  const liveChecks = useMemo(
    () => collectReadinessFindings(state, { status, validUntil, clientAssigned, today }),
    [state, status, validUntil, clientAssigned, today],
  );

  // The server's copy wins after a run (it is what was audited); the live copy
  // keeps the panel current while the seller types.
  const checks = serverChecks ?? liveChecks;
  const sortedChecks = useMemo(
    () => [...checks].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
    [checks],
  );
  const errorCount = checks.filter((finding) => finding.severity === "error").length;
  const warnCount = checks.filter((finding) => finding.severity === "warn").length;

  const runReview = async () => {
    setBusy(true);
    setError("");
    setAi(null);
    setAiSkippedReason("");
    try {
      const response = await fetch(`/api/proposals/${proposalId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state ? { formData: state } : {}),
      });
      const payload = (await response.json()) as {
        deterministic?: ReadinessFinding[];
        ai?: AiReviewResult | null;
        aiSkippedReason?: string;
        model?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "The review failed.");
        return;
      }
      setRanOnce(true);
      if (Array.isArray(payload.deterministic)) setServerChecks(payload.deterministic);
      setAi(payload.ai ?? null);
      setAiSkippedReason(payload.aiSkippedReason ?? "");
      setModel(payload.model ?? "");
    } catch {
      setError("Could not reach the review service.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-panel" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>AI review</h3>
        {errorCount > 0 ? (
          <span className="badge badge-red">
            <AlertOctagon size={13} /> {errorCount} blocking issue{errorCount === 1 ? "" : "s"}
          </span>
        ) : warnCount > 0 ? (
          <span className="badge badge-yellow">
            <AlertTriangle size={13} /> {warnCount} to review
          </span>
        ) : (
          <span className="badge badge-green">
            <CheckCircle2 size={13} /> Checks clear
          </span>
        )}
        <span style={{ color: "var(--portal-muted)", fontSize: "0.8rem" }}>
          Stage: {proposalStatusLabels[status] ?? status}
        </span>
      </div>

      <p style={{ color: "var(--portal-muted)", marginTop: 8, fontSize: "0.85rem" }}>
        Advisory only, at every stage — while drafting, before an approval decision, and after the client has it.
        Findings inform your decision; nothing is ever applied to the proposal automatically.
      </p>

      {sortedChecks.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <strong style={{ fontSize: "0.85rem" }}>Automated checks</strong>
          <FindingList
            findings={sortedChecks.map((finding) => ({
              key: finding.id,
              severity: finding.severity,
              area: finding.area,
              message: finding.message,
            }))}
          />
        </div>
      ) : null}

      <button
        className="button button-primary"
        type="button"
        style={{ marginTop: 12 }}
        disabled={busy}
        onClick={() => void runReview()}
      >
        <Sparkles size={16} /> {busy ? "Reviewing…" : ranOnce ? "Run AI review again" : "Run AI review"}
      </button>

      {error ? (
        <p className="badge badge-red" style={{ marginTop: 10 }}>
          {error}
        </p>
      ) : null}
      {aiSkippedReason ? (
        <p style={{ marginTop: 10, fontSize: "0.85rem", color: "var(--portal-muted)" }}>{aiSkippedReason}</p>
      ) : null}

      {ai ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontSize: "0.9rem" }}>AI reviewer</strong>
            <span className={verdictBadge[ai.verdict].className}>{verdictBadge[ai.verdict].label}</span>
            <span className="badge badge-yellow">Review before acting</span>
          </div>
          <p style={{ marginTop: 8, fontSize: "0.85rem" }}>{ai.summary}</p>
          {ai.findings.length > 0 ? (
            <FindingList
              findings={ai.findings.map((finding, index) => ({
                key: `${finding.area}-${index}`,
                severity: finding.severity,
                area: finding.area,
                message: finding.message,
                suggestion: finding.suggestion,
              }))}
            />
          ) : (
            <p style={{ fontSize: "0.85rem", color: "var(--portal-muted)" }}>The reviewer raised no findings.</p>
          )}
          {model ? (
            <p style={{ marginTop: 8, fontSize: "0.75rem", color: "var(--portal-muted)" }}>model: {model}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
