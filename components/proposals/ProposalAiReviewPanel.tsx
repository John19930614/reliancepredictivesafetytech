"use client";

// AI review — available at every stage of the proposal workflow, and since
// 2026-08-11 able to APPLY the changes it proposes, with a human in the loop.
//
// Three layers, and the split is the point (same shape as the Figures check):
//
//   AUTOMATED CHECKS are pure functions (lib/proposals/review-checks.ts) run
//   right here against the state on screen. No API key, no network, no budget
//   — always present, at every status.
//
//   THE AI REVIEWER is a button. It sends the state to
//   POST /api/proposals/[id]/review, which layers a model's judgment on top —
//   screened by the AI gateway and metered like every other AI feature.
//
//   PROPOSED CHANGES are the reviewer's concrete rewrites, rendered as
//   before/after diffs. NOTHING IS APPLIED until a human ticks a diff and
//   clicks Apply — that click is the Human Authority Rule in CLAUDE.md, and it
//   is why fully-automatic application is deliberately not offered. Applying
//   goes through the module's existing gates: in the editor the patch is
//   pushed into the generator bridge (the seller still saves); on the detail
//   page it saves through saveProposalDraft(), which re-checks canManage and
//   the content edit lock server-side. Locked statuses (sent and beyond) show
//   the drafts read-only.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, AlertTriangle, Check, CheckCircle2, Info, Sparkles, X } from "lucide-react";
import { saveProposalDraft } from "@/app/employee/proposals/actions";
import { lookupPhase, lookupService } from "@/lib/proposals/catalog";
import type { GeneratorItem, GeneratorState } from "@/lib/proposals/generator-state";
import { canEditProposalContent } from "@/lib/proposals/policy";
import { collectReadinessFindings, type ReadinessFinding, type ReviewSeverity } from "@/lib/proposals/review-checks";
import type { AiReviewResult } from "@/lib/proposals/review-schema";
import { proposalStatusLabels, type ProposalStatus } from "@/lib/proposals/types";
import type { NarrativePatch } from "./ProposalConsistencyPanel";

/** One rewrite the endpoint proposes, mapped to a before/after diff. */
interface ProposedEdit {
  regionId: string;
  kind: "field" | "phase" | "service";
  target: string;
  label: string;
  before: string;
  after: string;
  note: string;
  changed: boolean;
}

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
  onApply,
}: {
  proposalId: string;
  status: ProposalStatus;
  /** Live state in the editor; the saved state on the detail page. */
  state: GeneratorState | null;
  validUntil: string | null;
  clientAssigned: boolean;
  /**
   * Editor mount: receives the ticked edits as a generator-bridge patch, so
   * the change lands in the live editor and the seller saves it deliberately.
   * Absent (detail page): ticked edits are saved through saveProposalDraft(),
   * whose server-side gates decide whether this proposal may change at all.
   */
  onApply?: (patch: NarrativePatch) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ai, setAi] = useState<AiReviewResult | null>(null);
  const [edits, setEdits] = useState<ProposedEdit[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [aiSkippedReason, setAiSkippedReason] = useState("");
  const [model, setModel] = useState("");
  const [ranOnce, setRanOnce] = useState(false);
  const [serverChecks, setServerChecks] = useState<ReadinessFinding[] | null>(null);

  // The same policy the server enforces; shown here so the panel does not
  // offer an Apply the save endpoint would refuse.
  const editable = canEditProposalContent(status).ok;

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
    setNotice("");
    setAi(null);
    setEdits([]);
    setSelected({});
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
        edits?: ProposedEdit[];
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
      const drafted = (payload.edits ?? []).filter((edit) => edit.changed);
      setEdits(drafted);
      setSelected(Object.fromEntries(drafted.map((edit) => [edit.regionId, true])));
      setAiSkippedReason(payload.aiSkippedReason ?? "");
      setModel(payload.model ?? "");
    } catch {
      setError("Could not reach the review service.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Turns the ticked edits into ONE patch. Line-item edits carry the whole
   * array: the bridge (and the saved state) rebuild the lists wholesale, so
   * sending only the changed rows would delete the rest. Only `desc` is
   * touched — qty, price, key and name pass straight through. Mirrors
   * ProposalConsistencyPanel.applySelected, which learned this the hard way.
   */
  const buildPatch = (): { patch: NarrativePatch; count: number; skipped: string[] } | null => {
    if (!state) return null;
    const picked = edits.filter((edit) => selected[edit.regionId]);
    if (picked.length === 0) return null;

    const patch: NarrativePatch = {};
    /** Edits whose target moved under them; reported rather than misapplied. */
    const skipped: string[] = [];

    const fieldEdits = picked.filter((edit) => edit.kind === "field");
    if (fieldEdits.length > 0) {
      const applicable = fieldEdits.filter((edit) => {
        // Same staleness check as the line items, on the field's own value.
        const current = String(state.fields[edit.target] ?? "").trim();
        if (current === edit.before.trim()) return true;
        skipped.push(edit.label);
        return false;
      });
      if (applicable.length > 0) {
        patch.fields = Object.fromEntries(applicable.map((edit) => [edit.target, edit.after]));
      }
    }

    const applyToItems = (items: GeneratorItem[] | undefined, kind: "phase" | "service") => {
      const kindEdits = picked.filter((edit) => edit.kind === kind);
      if (kindEdits.length === 0 || !Array.isArray(items)) return undefined;
      const next = items.map((item) => ({ ...item }));
      let touched = false;
      for (const edit of kindEdits) {
        const index = Number(edit.target);
        if (!Number.isInteger(index) || index < 0 || index >= next.length) continue;
        // The index was resolved server-side against the state POSTed when the
        // review ran; `state` here is the LIVE editor state. Delete a service
        // line between running the review and clicking Apply and every later
        // index shifts, so a bounds check alone would write line 3's rewrite
        // onto whatever now sits at that position — while the diff on screen
        // still showed the old row. Confirm the text we are replacing is the
        // text the human actually read.
        //
        // Resolved through the catalog exactly as collectNarrativeRegions does:
        // a row that stored only a key has an EMPTY desc but still prints (and
        // was reviewed as) the catalog sentence. Comparing the raw field would
        // skip every edit to a boilerplate line — which is most of them.
        const row = next[index];
        const rowKey = typeof row.key === "string" ? row.key.trim() : "";
        const option = kind === "phase" ? lookupPhase(rowKey) : lookupService(rowKey);
        const current = (row.desc ?? "").trim() || option?.desc || "";
        if (current.trim() !== edit.before.trim()) {
          skipped.push(edit.label);
          continue;
        }
        next[index] = { ...next[index], desc: edit.after };
        touched = true;
      }
      return touched ? next : undefined;
    };

    const phases = applyToItems(state.phases, "phase");
    if (phases) patch.phases = phases;
    const services = applyToItems(state.services, "service");
    if (services) patch.services = services;

    return { patch, count: picked.length - skipped.length, skipped };
  };

  /** Appended to the success notice when a target moved under an edit. */
  const staleNote = (skipped: string[]) =>
    skipped.length === 0
      ? ""
      : ` ${skipped.length} skipped because the text changed after the review ran (${skipped.join(", ")}) — rerun the review to redo those.`;

  const applySelected = async () => {
    const built = buildPatch();
    if (!built || !state) return;
    const { patch, count, skipped } = built;

    setError("");

    // Every ticked edit was stale — nothing to apply, and saying "applied 0"
    // would read as success.
    if (count === 0) {
      setEdits([]);
      setSelected({});
      setError(
        `Those passages changed after the review ran, so nothing was applied (${skipped.join(", ")}). Run the review again to work from the current wording.`,
      );
      return;
    }

    // Editor mount: hand the patch to the generator bridge. The seller still
    // reads the preview and saves — the same contract as the Figures check.
    if (onApply) {
      onApply(patch);
      setEdits([]);
      setSelected({});
      setNotice(
        `Applied ${count} change${count === 1 ? "" : "s"} to the editor. Save when the wording reads right.` +
          staleNote(skipped),
      );
      return;
    }

    // Detail page: save through the module's own draft save, whose server-side
    // gates (canManage, content edit lock) are the authority on whether this
    // proposal may change.
    setApplying(true);
    try {
      const patched: GeneratorState = {
        ...state,
        fields: { ...state.fields, ...(patch.fields ?? {}) },
        phases: patch.phases ?? state.phases,
        services: patch.services ?? state.services,
      };
      const result = await saveProposalDraft(proposalId, patched);
      if (!result.ok) {
        setError(result.error ?? "The changes could not be saved.");
        return;
      }
      setEdits([]);
      setSelected({});
      setNotice(`Applied and saved ${count} change${count === 1 ? "" : "s"}.` + staleNote(skipped));
      router.refresh();
    } finally {
      setApplying(false);
    }
  };

  const selectedCount = edits.filter((edit) => selected[edit.regionId]).length;

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
        Available at every stage — while drafting, before an approval decision, and after the client has it. The
        reviewer drafts wording fixes it can make itself; nothing lands on the proposal until you read the
        before/after and apply it. Figures, pricing and terms stay yours to change in the editor.
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
      {notice ? <p style={{ marginTop: 10, fontSize: "0.85rem", color: "var(--portal-muted)" }}>{notice}</p> : null}

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

      {edits.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontSize: "0.9rem" }}>Proposed changes</strong>
            <span className="badge badge-yellow">Nothing applied yet</span>
          </div>
          <p style={{ color: "var(--portal-muted)", marginTop: 6, fontSize: "0.8rem" }}>
            {editable
              ? "Tick the rewrites you want and apply them — then read the document before it goes anywhere."
              : "This proposal is locked, so these drafts cannot be applied. Reopen it as a draft to use them."}
          </p>

          {edits.map((edit) => (
            <div
              key={edit.regionId}
              style={{ border: "1px solid var(--portal-line, #dbe2e9)", borderRadius: 8, padding: 12, marginTop: 10 }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: "0.85rem" }}>
                {editable ? (
                  <input
                    type="checkbox"
                    checked={Boolean(selected[edit.regionId])}
                    onChange={(event) => setSelected((current) => ({ ...current, [edit.regionId]: event.target.checked }))}
                  />
                ) : null}
                {edit.label}
                {edit.note ? <span style={{ fontWeight: 400, color: "var(--portal-muted)" }}>· {edit.note}</span> : null}
              </label>

              <div style={{ marginTop: 8, fontSize: "0.82rem" }}>
                <div style={{ color: "var(--portal-muted)", textDecoration: "line-through" }}>{edit.before}</div>
                <div style={{ marginTop: 6 }}>{edit.after}</div>
              </div>
            </div>
          ))}

          {editable ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <button
                className="button button-primary"
                type="button"
                disabled={selectedCount === 0 || applying}
                onClick={() => void applySelected()}
              >
                <Check size={16} />{" "}
                {applying
                  ? "Applying…"
                  : `Apply ${selectedCount} change${selectedCount === 1 ? "" : "s"}${onApply ? "" : " and save"}`}
              </button>
              <button
                className="button button-light"
                type="button"
                onClick={() => {
                  setEdits([]);
                  setSelected({});
                }}
              >
                <X size={16} /> Discard
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
