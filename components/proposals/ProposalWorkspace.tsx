"use client";

// Client-side pieces of the Proposal Builder.
//
//   ProposalWorkspace       — the generator editor, mounted ONLY on
//                             /employee/proposals/[id]/edit
//   ProposalControlPanel    — workflow + assignment + duplicate/delete sidebar
//                             on the read-only document view
//   ProposalRevisionHistory — revision table, "compare with current", restore
//
// The editor and the document view are deliberately separate routes: the edit
// gate has to be decided BEFORE twenty minutes of work goes into an iframe that
// will refuse to save.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Eye, FileClock, GitCompare, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  deleteProposal,
  duplicateProposal,
  loadProposalDocumentExtras,
  restoreProposalRevision,
  saveProposalDraft,
  saveProposalRevision,
  setProposalStatus,
  updateProposalMeta,
} from "@/app/employee/proposals/actions";
import {
  buildPrefillState,
  deriveSummaryFromState,
  deriveTitleFromState,
  isGeneratorState,
  type GeneratorState,
} from "@/lib/proposals/generator-state";
import {
  canEditProposalContent,
  canEditProposalMeta,
  canTransitionProposal,
} from "@/lib/proposals/policy";
import { diffGeneratorState } from "@/lib/proposals/diff";
import {
  maxTeamMembers,
  parseSignerId,
  parseTeamMemberIds,
  serializeTeamMemberIds,
  teamFieldIds,
  toggleTeamMember,
  type TeamRosterEntry,
} from "@/lib/proposals/team-selection";
import { ProposalDocument } from "./ProposalDocument";
import { documentLimits, type DocumentSignature, type DocumentTeamMember } from "./proposal-document-model";
import {
  proposalStatusLabels,
  proposalStatuses,
  type ProposalRevisionRow,
  type ProposalStatus,
} from "@/lib/proposals/types";
import { ProposalRevisionDiff } from "./ProposalRevisionDiff";
import { ProposalStatusBadge } from "./ProposalStatusBadge";

interface ClientOption {
  id: string;
  name: string;
}

export interface WorkspaceProposal {
  id: string;
  client_id: string | null;
  title: string;
  status: ProposalStatus;
  owner: string | null;
  proposal_value: number | null;
  valid_until: string | null;
  summary: string | null;
  body_markdown: string | null;
  current_revision: number;
  form_data: unknown;
}

export interface WorkspaceClientDetail {
  name: string | null;
  contact_name: string | null;
  email: string | null;
}

interface SimpleResult {
  ok: boolean;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Status transitions — SET derived from policy, only the copy lives here      */
/* -------------------------------------------------------------------------- */

/**
 * Which transitions exist is asked of lib/proposals/policy.ts on every render,
 * so the buttons can never drift from what the server will actually accept.
 * Only the wording and the display order are decided here.
 */
function availableTransitions(from: ProposalStatus): ProposalStatus[] {
  return proposalStatuses
    .filter((to) => canTransitionProposal(from, to).ok)
    .sort((a, b) => transitionRank(a) - transitionRank(b));
}

/** Forward-moving actions first; "reopen" and "archive" last. */
const transitionRankByStatus: Record<ProposalStatus, number> = {
  in_review: 0,
  sent: 1,
  accepted: 2,
  declined: 3,
  draft: 4,
  archived: 5,
};

function transitionRank(status: ProposalStatus): number {
  return transitionRankByStatus[status] ?? 99;
}

const transitionCopy: Record<string, string> = {
  "draft->in_review": "Send for review",
  "draft->sent": "Mark as sent",
  "in_review->draft": "Back to draft",
  "in_review->sent": "Mark as sent",
  "sent->accepted": "Mark accepted",
  "sent->declined": "Mark declined",
  "sent->draft": "Reopen for revision",
  "declined->draft": "Reopen for revision",
  "archived->draft": "Restore to draft",
};

const fallbackCopyByTarget: Partial<Record<ProposalStatus, string>> = {
  archived: "Archive",
  draft: "Reopen as draft",
};

function transitionLabel(from: ProposalStatus, to: ProposalStatus): string {
  return transitionCopy[`${from}->${to}`] ?? fallbackCopyByTarget[to] ?? `Move to ${proposalStatusLabels[to]}`;
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                 */
/* -------------------------------------------------------------------------- */

function ActionAlerts({ error, notice }: { error: string; notice: string }) {
  return (
    <>
      {error ? <div className="success-box portal-alert portal-alert-error">{error}</div> : null}
      {notice ? <div className="success-box portal-alert">{notice}</div> : null}
    </>
  );
}

function useProposalAction() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const run = useCallback(
    (action: () => Promise<SimpleResult>, successMessage: string) => {
      setError("");
      setNotice("");
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          setError(result.error ?? "Something went wrong.");
          return;
        }
        setNotice(successMessage);
        router.refresh();
      });
    },
    [router],
  );

  return { router, isPending, error, notice, setError, setNotice, run };
}

/* -------------------------------------------------------------------------- */
/* Editor                                                                      */
/* -------------------------------------------------------------------------- */

/** How often the parent asks the iframe for its current state. */
const POLL_INTERVAL_MS = 10_000;
/** Minimum gap between autosaves of the working copy. */
const AUTOSAVE_INTERVAL_MS = 30_000;
/**
 * Delay after hydration before the first "prime" collect. The generator's own
 * collector reports every input on the page, which is a strictly larger object
 * than a partially-prefilled saved state, so the baseline for dirty-checking has
 * to be whatever the generator holds immediately AFTER the saved state landed —
 * not the saved state itself, or every proposal would open dirty.
 */
const PRIME_DELAY_MS = 900;

type CollectPurpose = "prime" | "poll" | "draft" | "revision";

const noDocumentExtras: { team: DocumentTeamMember[]; signature: DocumentSignature | null } = Object.freeze({
  team: [],
  signature: null,
});

/**
 * Bios + signature image for whoever is currently ticked in the team picker.
 *
 * Everything else the preview renders comes out of the generator state the
 * iframe posts up, but bios and signatures are database-backed profile data
 * that state deliberately does not carry (it stores ids only, so a bio edited
 * later shows through on every proposal). They are therefore fetched, and the
 * fetch is keyed on the SELECTION rather than on `previewState` — that state
 * object is replaced on every keystroke, and keying on it would re-query the
 * bios table roughly four times a second while someone types a summary.
 */
function useDocumentExtras(state: GeneratorState | null) {
  const memberIds = useMemo(() => parseTeamMemberIds(state?.fields), [state]);
  const signerId = useMemo(() => parseSignerId(state?.fields), [state]);
  // A primitive key: the arrays above are fresh objects each render.
  const selectionKey = `${serializeTeamMemberIds(memberIds)}|${signerId ?? ""}`;

  const [extras, setExtras] = useState(noDocumentExtras);

  useEffect(() => {
    const [members, signer] = selectionKey.split("|");
    const ids = members === "" ? [] : members.split(",");
    if (ids.length === 0 && signer === "") {
      setExtras(noDocumentExtras);
      return;
    }
    // Guards against an out-of-order reply: untick-then-retick fires two
    // requests, and the slower one must not repaint the document.
    let current = true;
    void loadProposalDocumentExtras(ids, signer === "" ? null : signer)
      .then((result) => {
        if (current) setExtras(result);
      })
      .catch(() => {
        // The preview simply omits the team section; the editor is unaffected
        // and the document view resolves these server-side regardless.
        if (current) setExtras(noDocumentExtras);
      });
    return () => {
      current = false;
    };
  }, [selectionKey]);

  return extras;
}

export function ProposalWorkspace({
  proposal,
  assignedClient,
  roster = [],
}: {
  proposal: WorkspaceProposal;
  assignedClient: WorkspaceClientDetail | null;
  /** Colleagues who have published a bio, for the team checkboxes. */
  roster?: TeamRosterEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [baseRevision, setBaseRevision] = useState(proposal.current_revision);

  const editGate = canEditProposalContent(proposal.status);

  /**
   * The generator's live state, pushed by the bridge on every edit.
   *
   * This is what the preview renders. It is NOT the dirty-check baseline and
   * never triggers a save — it arrives on its own `proposal:preview` channel so
   * it cannot consume a pending collect reply.
   */
  const [previewState, setPreviewState] = useState<GeneratorState | null>(() =>
    isGeneratorState(proposal.form_data) ? proposal.form_data : null,
  );

  const documentExtras = useDocumentExtras(previewState);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** True once the saved state has been pushed into the current iframe document. */
  const hydratedRef = useRef(false);
  /** True while any save is in flight — the guard against double-submits. */
  const busyRef = useRef(false);
  /**
   * FIFO of outstanding `proposal:collect` requests. The bridge's reply carries
   * no correlation id, but postMessage preserves order, so the oldest pending
   * purpose owns the next `proposal:state`. A single slot would let the 10s poll
   * steal the reply meant for an explicit save.
   */
  const pendingCollectsRef = useRef<CollectPurpose[]>([]);
  const savedHashRef = useRef<string | null>(null);
  const savedAtRef = useRef<number>(Date.now());
  const changeNoteRef = useRef(changeNote);
  const baseRevisionRef = useRef(proposal.current_revision);
  const proposalIdRef = useRef(proposal.id);
  const proposalTitleRef = useRef(proposal.title);
  const editableRef = useRef(editGate.ok);
  const lockReasonRef = useRef(editGate.reason ?? "");

  changeNoteRef.current = changeNote;
  proposalIdRef.current = proposal.id;
  proposalTitleRef.current = proposal.title;
  editableRef.current = editGate.ok;
  lockReasonRef.current = editGate.reason ?? "";

  // Computed exactly once: `assignedClient` is a fresh object on every server
  // render, and re-deriving it per render used to re-arm the bridge listener.
  const initialStateRef = useRef<unknown>(undefined);
  if (initialStateRef.current === undefined) {
    initialStateRef.current = isGeneratorState(proposal.form_data)
      ? proposal.form_data
      : buildPrefillState(assignedClient);
  }

  const postToGenerator = useCallback((message: object) => {
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  const requestState = useCallback(
    (purpose: CollectPurpose) => {
      const queue = pendingCollectsRef.current;
      // The iframe is not answering (never loaded, or navigated away): drop the
      // stale backlog rather than letting it grow one entry per poll.
      if (queue.length >= 6) queue.length = 0;
      queue.push(purpose);
      postToGenerator({ type: "proposal:collect" });
    },
    [postToGenerator],
  );

  const markSaved = useCallback((hash: string) => {
    const now = Date.now();
    savedHashRef.current = hash;
    savedAtRef.current = now;
    setLastSavedAt(now);
    setDirty(false);
  }, []);

  /** Working-copy save: writes form_data only, never mints a revision. */
  const saveDraft = useCallback(
    async (state: GeneratorState, hash: string, explicit: boolean) => {
      if (busyRef.current) {
        if (explicit) setNotice("Still saving — try again in a moment.");
        return;
      }
      busyRef.current = true;
      setSaving(true);
      try {
        const result = await saveProposalDraft(proposalIdRef.current, state);
        if (!result.ok) {
          setError(result.error ?? (explicit ? "Failed to save the draft." : "Autosave failed."));
          return;
        }
        setError("");
        markSaved(hash);
        if (explicit) setNotice("Draft saved. Use “Save revision” to add a checkpoint to the history.");
      } finally {
        busyRef.current = false;
        setSaving(false);
      }
    },
    [markSaved],
  );

  /** Explicit checkpoint: mints an immutable revision, guarded by the optimistic lock. */
  const saveRevision = useCallback(
    (state: GeneratorState, hash: string) => {
      if (busyRef.current) {
        setNotice("Still saving — try again in a moment.");
        return;
      }
      busyRef.current = true;
      setError("");
      setNotice("");
      setSaving(true);
      startTransition(async () => {
        try {
          const result = await saveProposalRevision(proposalIdRef.current, {
            title: deriveTitleFromState(state, proposalTitleRef.current),
            summary: deriveSummaryFromState(state),
            changeNote: changeNoteRef.current,
            formData: state,
            // Rejects the save when someone else already advanced the proposal,
            // instead of silently overwriting their revision.
            baseRevision: baseRevisionRef.current,
          });
          if (!result.ok) {
            setError(result.error ?? "Failed to save the revision.");
            return;
          }
          const revisionNumber = result.revisionNumber ?? baseRevisionRef.current + 1;
          baseRevisionRef.current = revisionNumber;
          setBaseRevision(revisionNumber);
          // Only cleared on success — a failed save used to wipe the note too.
          setChangeNote("");
          markSaved(hash);
          setNotice(`Saved as revision v${revisionNumber}.`);
          router.refresh();
        } finally {
          busyRef.current = false;
          setSaving(false);
        }
      });
    },
    [markSaved, router],
  );

  /**
   * Pushes the saved state into the iframe. Idempotent for a given iframe
   * document, so answering a late `proposal:ready` after the onLoad push cannot
   * clobber edits — and a dropped `proposal:ready` no longer leaves the user
   * staring at the default pilot template over a real proposal.
   */
  const deliverInitialState = useCallback(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const initial = initialStateRef.current;
    if (initial) postToGenerator({ type: "proposal:load", state: initial });
    window.setTimeout(() => requestState("prime"), PRIME_DELAY_MS);
  }, [postToGenerator, requestState]);

  const onMessage = useCallback(
    (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = event.data as { type?: unknown; state?: unknown } | null;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "proposal:ready") {
        deliverInitialState();
        return;
      }

      // Preview only. Deliberately does not touch the dirty flag, the autosave
      // timer, or the collect queue — this fires on every keystroke.
      if (msg.type === "proposal:preview") {
        if (isGeneratorState(msg.state)) setPreviewState(msg.state);
        return;
      }

      if (msg.type === "proposal:state") {
        const purpose: CollectPurpose = pendingCollectsRef.current.shift() ?? "poll";
        const state = isGeneratorState(msg.state) ? msg.state : null;
        if (!state) {
          if (purpose === "revision" || purpose === "draft") {
            setError("The generator sent malformed data — nothing was saved.");
          }
          return;
        }
        const hash = JSON.stringify(state);

        if (purpose === "revision") {
          saveRevision(state, hash);
          return;
        }
        if (purpose === "draft") {
          void saveDraft(state, hash, true);
          return;
        }
        if (purpose === "prime" || savedHashRef.current === null) {
          savedHashRef.current = hash;
          setDirty(false);
          return;
        }

        const changed = hash !== savedHashRef.current;
        setDirty(changed);
        if (
          changed &&
          editableRef.current &&
          !busyRef.current &&
          Date.now() - savedAtRef.current >= AUTOSAVE_INTERVAL_MS
        ) {
          void saveDraft(state, hash, false);
        }
        return;
      }

      // The generator's own "Save Draft" button. It saves the working copy —
      // minting a revision is an explicit action in the panel above the iframe.
      if (msg.type === "proposal:save") {
        if (!editableRef.current) {
          setError(lockReasonRef.current || "This proposal is locked.");
          return;
        }
        if (busyRef.current) {
          setNotice("Still saving — give it a moment.");
          return;
        }
        const state = isGeneratorState(msg.state) ? msg.state : null;
        if (!state) {
          setError("The generator sent malformed data — nothing was saved.");
          return;
        }
        void saveDraft(state, JSON.stringify(state), true);
      }
    },
    [deliverInitialState, saveDraft, saveRevision],
  );

  // The listener is registered ONCE for the component's lifetime and reads the
  // latest handler through a ref. Re-subscribing on prop identity changes is
  // what let a router.refresh() land between the iframe's one-shot ready ping
  // and the parent's listener.
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  useEffect(() => {
    const listener = (event: MessageEvent) => onMessageRef.current(event);
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  const requestStateRef = useRef(requestState);
  requestStateRef.current = requestState;
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (busyRef.current) return;
      requestStateRef.current("poll");
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const busy = isPending || saving;

  let saveStateLabel: string;
  if (saving) saveStateLabel = "Saving…";
  else if (dirty) saveStateLabel = "Unsaved changes";
  else if (lastSavedAt) saveStateLabel = `All changes saved · ${new Date(lastSavedAt).toLocaleTimeString()}`;
  else saveStateLabel = "No changes yet";

  return (
    <div>
      <ActionAlerts error={error} notice={notice} />

      <div className="form-panel">
        <div className="form-title-row" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Editing — working copy of v{baseRevision}</h2>
          <ProposalStatusBadge status={proposal.status} />
          <span className={`badge ${dirty ? "badge-yellow" : "badge-green"}`}>{saveStateLabel}</span>
        </div>
        <p style={{ color: "var(--portal-muted)", marginTop: 8, fontSize: "0.9rem" }}>
          {editGate.ok
            ? "Edits are kept on the working copy and autosaved every 30 seconds. Add a note and save a revision when you want a checkpoint in the history."
            : editGate.reason}
        </p>

        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="proposal-change-note">What changed? (saved with the next revision)</label>
          <input
            id="proposal-change-note"
            value={changeNote}
            onChange={(event) => setChangeNote(event.target.value)}
            placeholder="e.g. Updated pricing after site walk"
            // Deliberately NOT disabled during a background autosave — that
            // would blank the field's focus while the seller is mid-sentence.
            disabled={isPending}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button
            className="button button-primary"
            type="button"
            disabled={busy || !editGate.ok}
            onClick={() => {
              if (busyRef.current) return;
              setError("");
              setNotice("");
              requestState("revision");
            }}
          >
            <Save size={16} /> {saving ? "Saving…" : "Save revision"}
          </button>
          {/* The embedded generator hides its own Save Draft button, so the
              working-copy save lives here. It writes form_data only. */}
          <button
            className="button button-light"
            type="button"
            disabled={busy || !editGate.ok}
            onClick={() => {
              if (busyRef.current) return;
              setError("");
              setNotice("");
              requestState("draft");
            }}
          >
            <FileClock size={16} /> Save draft now
          </button>
          {/* beforeunload does not fire on an App Router client navigation, so
              the in-app exit gets its own guard. */}
          <Link
            className="button button-light"
            href={`/employee/proposals/${proposal.id}`}
            onClick={(event) => {
              if (dirty && !window.confirm("You have unsaved changes that have not autosaved yet. Leave the editor?")) {
                event.preventDefault();
              }
            }}
          >
            <Eye size={16} /> View document
          </Link>
        </div>
      </div>

      {/*
        Controls left, the REAL document right.

        The generator asset carries its own preview renderer, and for as long as
        both were live they disagreed — the asset numbered phases one way and
        the platform another, priced a package from a frozen sentence, and put
        the executive summary in a different place. The embedded asset now hides
        its preview (body.embedded .proposal) and the platform renders
        <ProposalDocument> from the same view-model used for print, share links
        and the PDF. One renderer, so left and right cannot drift again.
      */}
      <div className="proposal-editor-grid">
        <div>
          <iframe
            ref={iframeRef}
            src="/employee/proposals/generator"
            title="Proposal controls"
            // Belt-and-braces against a dropped `proposal:ready`: whichever of
            // the two arrives first delivers the state, the other is a no-op.
            onLoad={deliverInitialState}
            style={{
              width: "100%",
              height: "78vh",
              minHeight: 720,
              border: "1px solid var(--portal-line, #dbe2e9)",
              borderRadius: 8,
              background: "#fff",
            }}
          />

          <ProposalTeamPicker
            roster={roster}
            state={previewState}
            disabled={!editGate.ok}
            onChange={(fields) => postToGenerator({ type: "proposal:load", state: { v: 1, fields } })}
          />
        </div>

        <div className="proposal-editor-preview">
          <div className="rp-doc-noprint" style={{ marginBottom: 8 }}>
            <span className="badge">Live preview — exactly what the client sees</span>
          </div>
          {previewState ? (
            <ProposalDocument
              state={previewState}
              // Resolved from the picker's selection, so section 09 and the
              // seller signature block appear here exactly as they do on the
              // document view — the claim the badge above makes.
              team={documentExtras.team}
              signature={documentExtras.signature}
              proposal={{
                id: proposal.id,
                title: proposal.title,
                status: proposal.status,
                currentRevision: baseRevision,
                validUntil: proposal.valid_until,
              }}
            />
          ) : (
            <div className="empty-state">Waiting for the generator to load…</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Team & signature picker                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Chooses whose bios print on this proposal and whose signature signs it.
 *
 * Lives in the parent rather than in the generator iframe because the roster is
 * database-backed and the iframe is a static asset with no Supabase access. The
 * selection is written back through the SAME `proposal:load` bridge message the
 * initial hydration uses, so it lands in `state.fields` and is saved, versioned
 * and diffed exactly like any other generator field — no second storage path.
 */
function ProposalTeamPicker({
  roster,
  state,
  disabled,
  onChange,
}: {
  roster: TeamRosterEntry[];
  state: GeneratorState | null;
  disabled: boolean;
  onChange: (fields: Record<string, string>) => void;
}) {
  // The selection round-trips through the iframe (parent -> proposal:load ->
  // generator -> debounced proposal:preview -> parent), which takes ~250ms. A
  // checkbox that takes a quarter second to tick feels broken, so the picker
  // renders its own optimistic copy and re-syncs whenever the generator reports
  // a value that differs from what we last sent.
  const incomingMembers = useMemo(() => serializeTeamMemberIds(parseTeamMemberIds(state?.fields)), [state]);
  const incomingSigner = useMemo(() => parseSignerId(state?.fields) ?? "", [state]);

  const [members, setMembers] = useState(incomingMembers);
  const [signer, setSigner] = useState(incomingSigner);
  const lastSentRef = useRef({ members: incomingMembers, signer: incomingSigner });

  useEffect(() => {
    if (incomingMembers !== lastSentRef.current.members) {
      lastSentRef.current.members = incomingMembers;
      setMembers(incomingMembers);
    }
    if (incomingSigner !== lastSentRef.current.signer) {
      lastSentRef.current.signer = incomingSigner;
      setSigner(incomingSigner);
    }
  }, [incomingMembers, incomingSigner]);

  const selected = useMemo(() => parseTeamMemberIds({ [teamFieldIds.members]: members }), [members]);

  function push(next: { members?: string; signer?: string }) {
    if (next.members !== undefined) {
      setMembers(next.members);
      lastSentRef.current.members = next.members;
    }
    if (next.signer !== undefined) {
      setSigner(next.signer);
      lastSentRef.current.signer = next.signer;
    }
    onChange({
      [teamFieldIds.members]: next.members ?? members,
      [teamFieldIds.signer]: next.signer ?? signer,
    });
  }

  if (roster.length === 0) {
    return (
      <div className="form-panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Proposal team</h2>
        <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem", margin: 0 }}>
          No one has published a bio yet. Add yours on{" "}
          <Link href="/employee/proposals/bio">My bio &amp; signature</Link> and it will appear here as a checkbox.
        </p>
      </div>
    );
  }

  const atLimit = selected.length >= maxTeamMembers;

  return (
    <div className="form-panel" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>10. Proposal team &amp; signature</h2>
      {/* The one card whose position in this panel does NOT match its position
          in the document: it is last on the left because the picker cannot be
          rendered inside the static iframe, but it prints as section 09, above
          the commercial terms. Say so rather than let the numbers disagree. */}
      <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem" }}>
        Prints as <strong>section 09, Your Team</strong> — above the commercial terms, not after them. Check the people
        who should appear there, usually just the main point of contact. Up to {maxTeamMembers}. Selecting nobody omits
        the section entirely and the later sections renumber.
      </p>
      {/* The document is held to eight pages, and six full-length bios alone
          used to take it to nine. The budget is shared, so say so here — the
          preview on the right shows the trimmed text, and a seller who does not
          know why would read it as data loss. */}
      <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: -6 }}>
        Bios share a fixed space so the proposal stays inside eight pages: one person prints in full, {maxTeamMembers}{" "}
        are trimmed to roughly {Math.floor(documentLimits.teamBioChars / maxTeamMembers)} characters each. The preview
        shows exactly what will print.
      </p>

      <div style={{ display: "grid", gap: 6 }}>
        {roster.map((person) => {
          const checked = selected.includes(person.userId);
          return (
            <label
              key={person.userId}
              style={{ display: "flex", alignItems: "flex-start", gap: 8, opacity: !checked && atLimit ? 0.5 : 1 }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled || (!checked && atLimit)}
                style={{ width: "auto", marginTop: 3 }}
                onChange={(event) =>
                  push({ members: toggleTeamMember(selected, person.userId, event.target.checked) })
                }
              />
              <span>
                <strong>{person.name}</strong>
                {person.title ? <span style={{ color: "var(--portal-muted)" }}> — {person.title}</span> : null}
                {!person.hasSignature ? (
                  <span style={{ color: "var(--portal-muted)", fontSize: "0.8rem" }}> · no signature saved</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="proposal-signer">Signed by</label>
        <select
          id="proposal-signer"
          value={signer}
          disabled={disabled}
          onChange={(event) => push({ signer: event.target.value })}
        >
          <option value="">No signature — print a blank line</option>
          {roster
            .filter((person) => person.hasSignature)
            .map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.name}
              </option>
            ))}
        </select>
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>
          The saved signature image is placed in the seller acceptance block. Only people who have uploaded one are
          listed.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Document-view sidebar                                                       */
/* -------------------------------------------------------------------------- */

export function ProposalControlPanel({
  proposal,
  clients,
  isAdmin,
}: {
  proposal: WorkspaceProposal;
  clients: ClientOption[];
  isAdmin: boolean;
}) {
  const { router, isPending, error, notice, setError, setNotice, run } = useProposalAction();
  const [working, setWorking] = useState(false);
  const busy = isPending || working;

  const metaGate = canEditProposalMeta(proposal.status);
  const transitions = useMemo(() => availableTransitions(proposal.status), [proposal.status]);

  async function handleDuplicate() {
    setError("");
    setNotice("");
    setWorking(true);
    const result = await duplicateProposal(proposal.id);
    if (!result.ok || !result.proposalId) {
      setError(result.error ?? "Failed to duplicate this proposal.");
      setWorking(false);
      return;
    }
    router.push(`/employee/proposals/${result.proposalId}`);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm("Delete this proposal and its entire revision history? This cannot be undone.")) return;
    setError("");
    setNotice("");
    setWorking(true);
    const result = await deleteProposal(proposal.id);
    if (!result.ok) {
      setError(result.error ?? "Failed to delete.");
      setWorking(false);
      return;
    }
    router.push("/employee/proposals");
    router.refresh();
  }

  return (
    <aside>
      <ActionAlerts error={error} notice={notice} />

      <div className="form-panel">
        <h2>Workflow</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {transitions.length === 0 ? (
            <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem", margin: 0 }}>
              No status changes are available from {proposalStatusLabels[proposal.status]}.
            </p>
          ) : (
            transitions.map((to) => (
              <button
                key={to}
                className="button button-light"
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => setProposalStatus(proposal.id, to), `Moved to ${proposalStatusLabels[to]}.`)
                }
              >
                {transitionLabel(proposal.status, to)}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="form-panel" style={{ marginTop: 20 }}>
        <h2>Assignment</h2>
        {!metaGate.ok ? (
          <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 8 }}>{metaGate.reason}</p>
        ) : null}
        <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 12 }}>
          <div className="field">
            <label htmlFor="proposal-client">Company</label>
            <select
              id="proposal-client"
              value={proposal.client_id ?? ""}
              disabled={busy || !metaGate.ok}
              onChange={(event) =>
                run(
                  () => updateProposalMeta(proposal.id, { clientId: event.target.value || null }),
                  "Company assignment updated.",
                )
              }
            >
              <option value="">Unassigned</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            {/* Owner is internal routing, not part of the offer — editable on any status. */}
            <label htmlFor="proposal-owner">Owner</label>
            <input
              id="proposal-owner"
              defaultValue={proposal.owner ?? ""}
              disabled={busy}
              onBlur={(event) => {
                if ((event.target.value.trim() || null) !== (proposal.owner ?? null)) {
                  run(() => updateProposalMeta(proposal.id, { owner: event.target.value }), "Owner updated.");
                }
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="proposal-value">Value (USD)</label>
            <input
              id="proposal-value"
              inputMode="decimal"
              defaultValue={proposal.proposal_value != null ? String(proposal.proposal_value) : ""}
              disabled={busy || !metaGate.ok}
              onBlur={(event) => {
                const raw = event.target.value.trim();
                const parsed = raw ? Number(raw) : null;
                if (raw && Number.isNaN(parsed)) {
                  setError("Proposal value must be a number.");
                  return;
                }
                if (parsed !== (proposal.proposal_value ?? null)) {
                  run(() => updateProposalMeta(proposal.id, { proposalValue: parsed }), "Value updated.");
                }
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="proposal-valid-until">Valid until</label>
            <input
              id="proposal-valid-until"
              type="date"
              defaultValue={proposal.valid_until ?? ""}
              disabled={busy || !metaGate.ok}
              onChange={(event) =>
                run(
                  () => updateProposalMeta(proposal.id, { validUntil: event.target.value || null }),
                  "Expiry updated.",
                )
              }
            />
          </div>
        </div>
      </div>

      <div className="form-panel" style={{ marginTop: 20 }}>
        <h2>Reuse</h2>
        <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 8 }}>
          Copies the current content into a brand-new draft. Use this instead of reopening a closed proposal.
        </p>
        <button className="button button-light" type="button" disabled={busy} onClick={handleDuplicate}>
          <Copy size={16} /> Duplicate as new proposal
        </button>
      </div>

      {isAdmin ? (
        <div className="form-panel" style={{ marginTop: 20 }}>
          <h2>Danger zone</h2>
          <button
            className="button button-light"
            type="button"
            style={{ marginTop: 12, color: "#ef4444" }}
            disabled={busy}
            onClick={handleDelete}
          >
            <Trash2 size={16} /> Delete proposal
          </button>
        </div>
      ) : null}
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* Revision history                                                            */
/* -------------------------------------------------------------------------- */

export function ProposalRevisionHistory({
  proposalId,
  status,
  currentRevision,
  currentState,
  revisions,
}: {
  proposalId: string;
  status: ProposalStatus;
  currentRevision: number;
  /** The proposal's live generator state, for "compare with current". */
  currentState: GeneratorState | null;
  revisions: ProposalRevisionRow[];
}) {
  const { isPending, error, notice, run } = useProposalAction();
  const [compareId, setCompareId] = useState<string | null>(null);

  const editGate = canEditProposalContent(status);

  // Derived from props rather than held as a row snapshot, so a router.refresh()
  // can never leave a deleted or superseded revision on screen.
  const compareRow = revisions.find((revision) => revision.id === compareId) ?? null;
  const compareState = compareRow && isGeneratorState(compareRow.form_data) ? compareRow.form_data : null;
  const diff = useMemo(
    () => (compareState && currentState ? diffGeneratorState(compareState, currentState) : null),
    [compareState, currentState],
  );

  return (
    <div className="form-panel">
      <h2>Revision history</h2>
      <ActionAlerts error={error} notice={notice} />

      {revisions.length === 0 ? (
        <div className="empty-state">No revisions recorded yet.</div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Rev</th>
                <th>Title</th>
                <th>Change note</th>
                <th>Saved</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((revision) => {
                const isCurrent = revision.revision_number === currentRevision;
                const comparable = isGeneratorState(revision.form_data) && currentState !== null && !isCurrent;
                return (
                  <tr key={revision.id}>
                    <td>v{revision.revision_number}</td>
                    <td>{revision.title}</td>
                    <td>{revision.change_note ?? "—"}</td>
                    <td>{new Date(revision.created_at).toLocaleString()}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link
                        className="button button-light"
                        href={`/employee/proposals/${proposalId}/revisions/${revision.id}`}
                      >
                        <Eye size={14} /> View
                      </Link>{" "}
                      {comparable ? (
                        <button
                          className="button button-light"
                          type="button"
                          onClick={() => setCompareId(compareId === revision.id ? null : revision.id)}
                        >
                          <GitCompare size={14} /> {compareId === revision.id ? "Hide diff" : "Compare with current"}
                        </button>
                      ) : null}{" "}
                      {!isCurrent ? (
                        <button
                          className="button button-light"
                          type="button"
                          disabled={!editGate.ok || isPending}
                          title={editGate.ok ? "Copy this revision forward as the newest revision" : editGate.reason}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Restore v${revision.revision_number}?\n\nIts content is copied forward as a NEW revision (v${currentRevision + 1}). Nothing in the history is deleted, but the current working copy is replaced.`,
                              )
                            ) {
                              return;
                            }
                            run(
                              () => restoreProposalRevision(proposalId, revision.id),
                              `Restored v${revision.revision_number} as a new revision.`,
                            );
                          }}
                        >
                          <RotateCcw size={14} /> Restore
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {compareRow ? (
        <div className="form-panel" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>
            v{compareRow.revision_number} compared with the current document
          </h3>
          {diff ? (
            <ProposalRevisionDiff
              diff={diff}
              beforeLabel={`v${compareRow.revision_number}`}
              afterLabel={`v${currentRevision} (current)`}
            />
          ) : (
            <div className="empty-state">
              {compareState
                ? "This proposal has no saved generator content yet, so there is nothing to compare against."
                : `Revision v${compareRow.revision_number} stored no generator data, so it cannot be compared.`}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
