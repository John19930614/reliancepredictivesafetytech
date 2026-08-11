"use client";

// "Figures check" — the panel that catches numbers the prose still gets wrong.
//
// The document derives its structured numbers at render time, so the package
// pills and the fee table always agree with the fields. The executive summary,
// the assumptions block and the per-line scope paragraphs do not: they are
// stored text, and they keep whatever figures were typed the day they were
// written. Set Included Users to 50 and section 02 says 50 while section 03 and
// the fee table's description column still say 20.
//
// TWO SEPARATE MECHANISMS, deliberately:
//
//   Detection is a pure function (lib/proposals/consistency.ts) that runs on
//   every keystroke against the live preview state. It needs no API key, no
//   network, and no budget, so the warning is always right and always there.
//
//   Rewriting is the model's job, because "up to 20 users at one jobsite" has
//   to become "up to 50 users across five jobsites" with the grammar intact in
//   a sentence a client signs. It returns a DRAFT: every passage is shown
//   before/after and applied only when the seller ticks it. Nothing is written
//   to the proposal by the endpoint (CLAUDE.md, Human Authority Rule).

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Sparkles, X } from "lucide-react";
import {
  collectNarrativeRegions,
  scanProposalConsistency,
  type ConsistencyFinding,
} from "@/lib/proposals/consistency";
import type { GeneratorItem, GeneratorState } from "@/lib/proposals/generator-state";

/** One passage the endpoint proposes new wording for. */
interface NarrativeRevision {
  regionId: string;
  kind: "field" | "phase" | "service";
  target: string;
  label: string;
  before: string;
  after: string;
  note: string;
  changed: boolean;
}

/** The shape the workspace pushes into the generator bridge. */
export interface NarrativePatch {
  fields?: Record<string, string>;
  phases?: GeneratorItem[];
  services?: GeneratorItem[];
}

function groupByRegion(findings: readonly ConsistencyFinding[]): Array<{ label: string; items: ConsistencyFinding[] }> {
  const order: string[] = [];
  const byRegion = new Map<string, { label: string; items: ConsistencyFinding[] }>();
  for (const finding of findings) {
    let bucket = byRegion.get(finding.regionId);
    if (!bucket) {
      bucket = { label: finding.regionLabel, items: [] };
      byRegion.set(finding.regionId, bucket);
      order.push(finding.regionId);
    }
    bucket.items.push(finding);
  }
  return order.map((regionId) => byRegion.get(regionId)!);
}

export function ProposalConsistencyPanel({
  proposalId,
  state,
  disabled,
  onApply,
}: {
  proposalId: string;
  /** The generator's live state — the same object the preview renders. */
  state: GeneratorState | null;
  /** True when the proposal is locked; drafting is pointless if it cannot land. */
  disabled: boolean;
  onApply: (patch: NarrativePatch) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revisions, setRevisions] = useState<NarrativeRevision[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const findings = useMemo(() => (state ? scanProposalConsistency(state) : []), [state]);
  const grouped = useMemo(() => groupByRegion(findings), [findings]);

  const draftFixes = useCallback(async () => {
    if (!state) return;
    setBusy(true);
    setError("");
    setNotice("");
    setRevisions([]);
    try {
      const response = await fetch(`/api/proposals/${proposalId}/narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData: state }),
      });
      const payload = (await response.json()) as {
        revisions?: NarrativeRevision[];
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "The rewrite failed.");
        return;
      }
      const drafted = (payload.revisions ?? []).filter((revision) => revision.changed);
      if (drafted.length === 0) {
        setNotice(payload.message ?? "The model returned no changes to make.");
        return;
      }
      setRevisions(drafted);
      setSelected(Object.fromEntries(drafted.map((revision) => [revision.regionId, true])));
    } catch {
      setError("Could not reach the rewrite service.");
    } finally {
      setBusy(false);
    }
  }, [proposalId, state]);

  /**
   * Turns the ticked revisions into ONE bridge patch.
   *
   * Line-item edits have to carry the whole array: the bridge rebuilds the
   * phase/service lists wholesale when it receives them, so sending only the
   * changed rows would delete the rest. The arrays are cloned from the live
   * state the bridge itself just produced, and only `desc` is touched — qty,
   * price, key and name are passed straight back.
   */
  const applySelected = useCallback(() => {
    if (!state) return;
    const picked = revisions.filter((revision) => selected[revision.regionId]);
    if (picked.length === 0) return;

    const patch: NarrativePatch = {};

    const fieldEdits = picked.filter((revision) => revision.kind === "field");
    if (fieldEdits.length > 0) {
      patch.fields = Object.fromEntries(fieldEdits.map((revision) => [revision.target, revision.after]));
    }

    const applyToItems = (items: GeneratorItem[] | undefined, kind: "phase" | "service") => {
      const edits = picked.filter((revision) => revision.kind === kind);
      if (edits.length === 0 || !Array.isArray(items)) return undefined;
      const next = items.map((item) => ({ ...item }));
      let touched = false;
      for (const edit of edits) {
        const index = Number(edit.target);
        if (!Number.isInteger(index) || index < 0 || index >= next.length) continue;
        next[index] = { ...next[index], desc: edit.after };
        touched = true;
      }
      return touched ? next : undefined;
    };

    const phases = applyToItems(state.phases, "phase");
    if (phases) patch.phases = phases;
    const services = applyToItems(state.services, "service");
    if (services) patch.services = services;

    onApply(patch);
    setRevisions([]);
    setSelected({});
    setNotice(`Applied ${picked.length} passage${picked.length === 1 ? "" : "s"}. Save when the wording reads right.`);
  }, [onApply, revisions, selected, state]);

  if (!state) return null;

  const selectedCount = revisions.filter((revision) => selected[revision.regionId]).length;

  return (
    <div className="form-panel" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Figures check</h3>
        {findings.length === 0 ? (
          <span className="badge badge-green">
            <CheckCircle2 size={13} /> Narrative matches the fields
          </span>
        ) : (
          <span className="badge badge-yellow">
            <AlertTriangle size={13} /> {findings.length} mismatch{findings.length === 1 ? "" : "es"}
          </span>
        )}
      </div>

      <p style={{ color: "var(--portal-muted)", marginTop: 8, fontSize: "0.85rem" }}>
        The pills, the package paragraph and the fee table always follow the fields. The executive summary, the
        assumptions block and the scope descriptions are written text — they keep whatever numbers were typed, which is
        how a proposal ends up saying 50 users in one section and 20 in another.
      </p>

      {findings.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          {grouped.map((group) => (
            <div key={group.label} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{group.label}</div>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: "0.85rem", color: "var(--portal-muted)" }}>
                {group.items.map((finding, index) => (
                  <li key={`${finding.regionId}-${finding.topic}-${index}`}>{finding.message}</li>
                ))}
              </ul>
            </div>
          ))}

          <button
            className="button button-primary"
            type="button"
            style={{ marginTop: 6 }}
            disabled={busy || disabled}
            onClick={() => void draftFixes()}
          >
            <Sparkles size={16} /> {busy ? "Drafting…" : "Fix figures with AI"}
          </button>
          {disabled ? (
            <p style={{ color: "var(--portal-muted)", marginTop: 8, fontSize: "0.8rem" }}>
              This proposal is locked, so corrected wording could not be applied. Reopen it as a draft first.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="badge badge-red" style={{ marginTop: 10 }}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p style={{ marginTop: 10, fontSize: "0.85rem", color: "var(--portal-muted)" }}>{notice}</p>
      ) : null}

      {revisions.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ fontSize: "0.9rem" }}>Proposed wording</strong>
            <span className="badge badge-yellow">Review before applying</span>
          </div>
          <p style={{ color: "var(--portal-muted)", marginTop: 6, fontSize: "0.8rem" }}>
            Nothing has been changed. Tick the passages you want and apply them — then read the preview before saving.
          </p>

          {revisions.map((revision) => (
            <div
              key={revision.regionId}
              style={{
                border: "1px solid var(--portal-line, #dbe2e9)",
                borderRadius: 8,
                padding: 12,
                marginTop: 10,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: "0.85rem" }}>
                <input
                  type="checkbox"
                  checked={Boolean(selected[revision.regionId])}
                  onChange={(event) =>
                    setSelected((current) => ({ ...current, [revision.regionId]: event.target.checked }))
                  }
                />
                {revision.label}
                {revision.note ? (
                  <span style={{ fontWeight: 400, color: "var(--portal-muted)" }}>· {revision.note}</span>
                ) : null}
              </label>

              <div style={{ marginTop: 8, fontSize: "0.82rem" }}>
                <div style={{ color: "var(--portal-muted)", textDecoration: "line-through" }}>{revision.before}</div>
                <div style={{ marginTop: 6 }}>{revision.after}</div>
              </div>
            </div>
          ))}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button
              className="button button-primary"
              type="button"
              disabled={selectedCount === 0 || disabled}
              onClick={applySelected}
            >
              <Check size={16} /> Apply {selectedCount} passage{selectedCount === 1 ? "" : "s"}
            </button>
            <button
              className="button button-light"
              type="button"
              onClick={() => {
                setRevisions([]);
                setSelected({});
              }}
            >
              <X size={16} /> Discard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
