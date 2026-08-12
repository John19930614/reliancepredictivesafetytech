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

import {
  startTransition as startNonUrgentRender,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Copy,
  Eye,
  FileClock,
  FileText,
  GitCompare,
  MapPin,
  RotateCcw,
  Save,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  deleteProposal,
  duplicateProposal,
  extendProposalValidity,
  loadProposalDocumentExtras,
  restoreProposalRevision,
  saveProposalDraft,
  saveProposalRevision,
  setProposalStatus,
  updateProposalMeta,
} from "@/app/employee/proposals/actions";
import { declineReasonLabel, declineReasonOptions } from "@/app/employee/proposals/share-link-policy";
import {
  buildPrefillState,
  deriveSummaryFromState,
  deriveTitleFromState,
  isGeneratorState,
  type GeneratorState,
  type ProposalPrefill,
} from "@/lib/proposals/generator-state";
import {
  clientFieldIds,
  formatClientContactLine,
  maxClientContacts,
  normalizeClientContact,
  parseClientContacts,
  serializeClientContacts,
  type ClientCompanyDetail,
  type ProposalClientContact,
} from "@/lib/proposals/client-contacts";
import {
  companyDocumentName,
  formatSellerContactBlock,
  missingCompanyProfileFields,
  type CompanyProfile,
} from "@/lib/company/profile";
import {
  canEditProposalContent,
  canEditProposalMeta,
  canTransitionProposal,
} from "@/lib/proposals/policy";
import { isNoPlatformPackageKey, lookupPackage } from "@/lib/proposals/catalog";
import {
  getTransactionTemplateLabel,
  isTransactionTemplateKey,
  listTransactionTemplates,
  proposalTypeFieldId,
  proposalTypeLabelFromState,
} from "@/lib/proposals/transaction-templates";
import { diffGeneratorState } from "@/lib/proposals/diff";
import { estimatePrintPages, formatPrintPagesLabel } from "@/lib/proposals/page-estimate";
import {
  maxTeamMembers,
  parseSignerId,
  parseTeamMemberIds,
  serializeTeamMemberIds,
  teamFieldIds,
  toggleTeamMember,
  type TeamRosterEntry,
} from "@/lib/proposals/team-selection";
import { ProposalAiReviewPanel } from "./ProposalAiReviewPanel";
import { ProposalConsistencyPanel } from "./ProposalConsistencyPanel";
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
  /** Reference allocated by the database at creation, e.g. "RPS-2026-0007". */
  proposal_number?: string | null;
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

/* -------------------------------------------------------------------------- */
/* Orientation — what this proposal IS, and where each printed section is set  */
/* -------------------------------------------------------------------------- */

/**
 * Anchor ids for the left column's jump list.
 *
 * Only the cards the PLATFORM renders can be anchored: cards 1-9 live inside
 * the generator iframe, and jumping into another document would mean a new
 * bridge message. The builder entry therefore lands on the iframe, which is
 * where those nine cards are.
 */
const editorAnchors = {
  parties: "proposal-card-parties",
  figures: "proposal-card-figures",
  review: "proposal-card-review",
  builder: "proposal-card-builder",
  team: "proposal-card-team",
  preview: "proposal-card-preview",
} as const;

interface ProposalTypeView {
  /** The stamped transaction type, or null on a blank/pre-stamp proposal. */
  key: string | null;
  label: string | null;
  description: string | null;
  /** How the document names the engagement, e.g. "Training Services". */
  documentLabel: string | null;
  /** Catalog name of the selected package, or null when the key is unknown. */
  packageName: string | null;
  /** packageSelect === "none": the deal sells no subscription. */
  servicesOnly: boolean;
}

/**
 * What the seller is building, read off the live generator state.
 *
 * The TYPE is the stamp `lib/proposals/transaction-templates.ts` writes at
 * creation; the PACKAGE is what the seller currently has selected in card 4.
 * Both are reported, and the "sells no subscription" line is derived from the
 * package rather than the type — a services type whose seller has since picked
 * a real package genuinely does sell one, and the document follows the package.
 */
function readProposalTypeView(state: GeneratorState | null): ProposalTypeView {
  const fields = state?.fields ?? null;
  const rawType = typeof fields?.[proposalTypeFieldId] === "string" ? String(fields[proposalTypeFieldId]).trim() : "";
  const key = isTransactionTemplateKey(rawType) ? rawType : null;
  const packageKey = typeof fields?.packageSelect === "string" ? String(fields.packageSelect).trim() : "";
  return {
    key,
    label: key ? getTransactionTemplateLabel(key) : null,
    description: key ? listTransactionTemplates().find((entry) => entry.key === key)?.description ?? null : null,
    documentLabel: proposalTypeLabelFromState(fields),
    packageName: lookupPackage(packageKey)?.name ?? null,
    servicesOnly: isNoPlatformPackageKey(packageKey),
  };
}

/** One jump link. Plain anchors, so the browser's own scroll and history work. */
function JumpLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      href={`#${to}`}
      className="badge"
      style={{ textDecoration: "none", cursor: "pointer" }}
    >
      {children}
    </a>
  );
}

/**
 * The card that answers "what am I building, and where do I change section N?".
 *
 * Two reports the editor never made. The proposal TYPE was stamped invisibly at
 * creation and never shown again, so a seller filling in a training proposal had
 * no way to know why the document called itself Training Services — or that four
 * of the seven types sell no subscription at all. And the left column is a long
 * stack of numbered cards whose numbers are not the document's section numbers,
 * which is how "Bio is also hard to find" happened: the team picker is the last
 * card down there and prints as section 09.
 *
 * Read-only on purpose. Changing type mid-proposal would have to rewrite the
 * seeded scope, exclusions, billing term and package — and would silently keep
 * whatever the seller had already edited by hand. Starting the right type from
 * the New proposal form is the honest move, and the card says so.
 */
function ProposalOrientationPanel({ typeView }: { typeView: ProposalTypeView }) {
  return (
    <div className="form-panel" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>
        <FileText size={16} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        This proposal
      </h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="badge">{typeView.label ? `Type: ${typeView.label}` : "Type: not recorded"}</span>
        {typeView.servicesOnly ? (
          <span className="badge badge-yellow">Services only — no subscription</span>
        ) : typeView.packageName ? (
          <span className="badge badge-green">Subscription: {typeView.packageName}</span>
        ) : null}
      </div>

      {typeView.description ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem", marginTop: 10 }}>{typeView.description}</p>
      ) : (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem", marginTop: 10 }}>
          No proposal type is recorded — this one was started blank, or before types existed. The document describes the
          engagement from whatever package is selected in the builder below.
        </p>
      )}

      <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem" }}>
        {typeView.servicesOnly
          ? "This deal sells no platform subscription, so the builder does not ask for a subscription price, included users or included jobsites — and the document prints an engagement summary instead of a platform package."
          : typeView.packageName
            ? `Section 02 prints the ${typeView.packageName} package with its price, included users and included jobsites. Switch it in card 4 of the builder — including to “No platform subscription” for services-only work.`
            : "The platform package is chosen in card 4 of the builder, and decides whether the document prints a subscription at all."}
      </p>

      {typeView.documentLabel ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem" }}>
          The document names the engagement <strong>{typeView.documentLabel}</strong>. The type is stamped when the
          proposal is created and is not editable here: changing it would reseed the scope, exclusions and terms and
          leave anything already written by hand behind it. For a different type, start a new proposal.
        </p>
      ) : null}

      {/* --- Jump list ---------------------------------------------------- */}
      <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
        <label>Jump to</label>
        <nav
          aria-label="Jump to a control card"
          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
        >
          <JumpLink to={editorAnchors.parties}>Parties</JumpLink>
          <JumpLink to={editorAnchors.figures}>Figures check</JumpLink>
          <JumpLink to={editorAnchors.review}>AI review</JumpLink>
          <JumpLink to={editorAnchors.builder}>Builder (cards 1–9)</JumpLink>
          <JumpLink to={editorAnchors.team}>Team &amp; bios</JumpLink>
          <JumpLink to={editorAnchors.preview}>Document preview</JumpLink>
        </nav>
      </div>

      {/* --- Section map --------------------------------------------------- */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--portal-muted)" }}>
          Which card drives which printed section?
        </summary>
        <ul
          style={{
            margin: "8px 0 0",
            paddingLeft: 18,
            display: "grid",
            gap: 4,
            color: "var(--portal-muted)",
            fontSize: "0.85rem",
          }}
        >
          <li>
            <strong>Header — Prepared For / Prepared By</strong> — the Parties card above, plus builder cards 1 and 2.
          </li>
          <li>
            <strong>01 Executive Summary</strong> — builder card 3.
          </li>
          <li>
            <strong>02 Engagement &amp; package</strong> — builder card 4 (term, package, billing term).
          </li>
          <li>
            <strong>03 Scope of work</strong> and <strong>05 Pricing schedule</strong> — builder cards 5 and 6; the
            discount, tax and payment terms in card 7.
          </li>
          <li>
            <strong>04 Deliverables</strong>, <strong>06 Schedule</strong>, <strong>07 Client responsibilities</strong>{" "}
            — written from the lines you have added; no card of their own.
          </li>
          <li>
            <strong>08 Assumptions and exclusions</strong> — builder card 8.
          </li>
          <li>
            <strong>09 Your Team</strong> — the Proposal team &amp; signature card, below the builder. Bios come from
            each person&apos;s <Link href="/employee/proposals/bio">Proposal bio page</Link>.
          </li>
          <li>
            <strong>Commercial and legal terms</strong>, then <strong>Acceptance</strong> — builder card 9. They print
            after Your Team, and renumber when nobody is selected.
          </li>
        </ul>
      </details>
    </div>
  );
}

export function ProposalWorkspace({
  proposal,
  clientCompany = null,
  companyProfile = null,
  prefill = null,
  roster = [],
}: {
  proposal: WorkspaceProposal;
  /** The assigned company's address and people, for the client panel. */
  clientCompany?: ClientCompanyDetail | null;
  /** Our own company record, for the seller block's refresh action. */
  companyProfile?: CompanyProfile | null;
  /** What a proposal with no saved state yet should open filled in with. */
  prefill?: ProposalPrefill | null;
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
  /**
   * The generator document's own height, reported by the bridge. The iframe is
   * sized to it so the form has NO internal scrollbar — the page scrolls, the
   * preview scrolls, and that is the entire set of scroll controls (the
   * 2026-08-07 review counted four).
   */
  const [generatorHeight, setGeneratorHeight] = useState(780);
  /** ≈ print pages of the previewed document; null until measured. */
  const [pagesEstimate, setPagesEstimate] = useState<number | null>(null);

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

  /**
   * What this proposal is — the transaction type stamped at creation, and what
   * the currently selected package actually sells. Surfaced because neither was
   * visible anywhere in the editor: the type was written into a hidden input at
   * creation and never shown again.
   */
  const typeView = useMemo(() => readProposalTypeView(previewState), [previewState]);

  /**
   * The document subtree, rebuilt ONLY when its own inputs change. Without
   * this, every unrelated state tick in the workspace (dirty flag from the 10s
   * poll, a save notice, the change-note field) re-rendered the entire
   * multi-section document — the single heaviest subtree on the page and the
   * bulk of the "form is slow to fill out" report.
   */
  const documentNode = useMemo(
    () =>
      previewState ? (
        <ProposalDocument
          state={previewState}
          // Resolved from the picker's selection, so section 09 and the
          // seller signature block appear here exactly as they do on the
          // document view — the claim the preview badge makes.
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
      ) : null,
    [
      previewState,
      documentExtras,
      proposal.id,
      proposal.title,
      proposal.status,
      proposal.valid_until,
      baseRevision,
    ],
  );

  /**
   * Measures the rendered document for the ≈-pages badge. Observes the
   * wrapper, reads .rp-doc's box — the observer refires as typing grows the
   * document, so the count tracks the edit live.
   */
  const previewObserverRef = useRef<ResizeObserver | null>(null);
  const measurePreview = useCallback((node: HTMLDivElement | null) => {
    previewObserverRef.current?.disconnect();
    previewObserverRef.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const doc = node.querySelector<HTMLElement>(".rp-doc");
      if (!doc) {
        setPagesEstimate(null);
        return;
      }
      const rect = doc.getBoundingClientRect();
      setPagesEstimate(estimatePrintPages(rect.height, rect.width));
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    previewObserverRef.current = observer;
    update();
  }, []);

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

  // Computed exactly once: `prefill` is a fresh object on every server render,
  // and re-deriving it per render used to re-arm the bridge listener.
  const initialStateRef = useRef<unknown>(undefined);
  if (initialStateRef.current === undefined) {
    initialStateRef.current = isGeneratorState(proposal.form_data)
      ? proposal.form_data
      : buildPrefillState(prefill);
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
      // timer, or the collect queue — this fires on every keystroke. Applied as
      // a transition: re-rendering the full document is the expensive part of
      // every keystroke, and marking it interruptible keeps typing in the
      // iframe responsive while React catches the preview up behind it.
      if (msg.type === "proposal:preview") {
        if (isGeneratorState(msg.state)) {
          const state = msg.state;
          // React's module-level startTransition, NOT this component's
          // useTransition() — that one drives `busy`, and routing every
          // keystroke through it would flicker the save buttons disabled.
          startNonUrgentRender(() => setPreviewState(state));
        }
        return;
      }

      // The generator document's height, so the iframe can hold the whole form
      // without a nested scrollbar. Clamped: a bridge bug must not collapse the
      // form to nothing or grow the page without bound.
      if (msg.type === "proposal:height") {
        const height = Number((msg as { height?: unknown }).height);
        if (Number.isFinite(height)) {
          setGeneratorHeight(Math.min(8000, Math.max(720, Math.ceil(height) + 2)));
        }
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
          {/* The proposal type, in the one place a seller always sees. It is
              stamped at creation and was invisible from then on. */}
          <span className="badge" title="The proposal type this document was started from. Set at creation.">
            {typeView.label ? `Type: ${typeView.label}` : "Type: not recorded"}
          </span>
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
          {/* First card in the column: what this proposal IS (the type stamped
              at creation, and whether it sells a subscription at all), and a
              jump list for the cards below — the column is long and its card
              numbers are not the document's section numbers. */}
          <ProposalOrientationPanel typeView={typeView} />

          {/* Above the generator because the parties are the FIRST thing the
              document prints. It cannot live inside the iframe: the company
              address and its contact list are database-backed and the asset is
              a static file with no Supabase access. */}
          <div id={editorAnchors.parties} style={{ scrollMarginTop: 16 }}>
            <ProposalClientPanel
              company={clientCompany}
              companyProfile={companyProfile}
              state={previewState}
              disabled={!editGate.ok}
              onChange={(fields) => postToGenerator({ type: "proposal:load", state: { v: 1, fields } })}
            />
          </div>

          {/* Between the parties and the controls, because a figure mismatch is
              about the numbers the seller is typing just below it. Detection is
              pure and local; only the "Fix figures with AI" button leaves the
              browser, and what it returns is a draft the seller ticks in. */}
          <div id={editorAnchors.figures} style={{ scrollMarginTop: 16 }}>
            <ProposalConsistencyPanel
              proposalId={proposal.id}
              state={previewState}
              disabled={!editGate.ok}
              onApply={(patch) => postToGenerator({ type: "proposal:load", state: { v: 1, ...patch } })}
            />
          </div>

          {/* AI review of the live state. The same panel sits on the read-only
              detail page, so review is available at every workflow stage. Its
              drafted edits apply here through the SAME bridge patch the
              Figures check uses — into the editor, never past the seller. */}
          <div id={editorAnchors.review} style={{ scrollMarginTop: 16 }}>
            <ProposalAiReviewPanel
              proposalId={proposal.id}
              status={proposal.status}
              state={previewState}
              validUntil={proposal.valid_until}
              clientAssigned={Boolean(proposal.client_id)}
              onApply={(patch) => postToGenerator({ type: "proposal:load", state: { v: 1, ...patch } })}
            />
          </div>

          <iframe
            id={editorAnchors.builder}
            ref={iframeRef}
            src="/employee/proposals/generator"
            title="Proposal controls"
            // Belt-and-braces against a dropped `proposal:ready`: whichever of
            // the two arrives first delivers the state, the other is a no-op.
            onLoad={deliverInitialState}
            // Sized to the generator document (bridge `proposal:height`), so
            // the form has no internal scrollbar — it flows and scrolls with
            // the page like any other panel.
            style={{
              width: "100%",
              height: generatorHeight,
              border: "1px solid var(--portal-line, #dbe2e9)",
              borderRadius: 8,
              background: "#fff",
              scrollMarginTop: 16,
            }}
            // No scrolling="no": if the height report ever fails, a scrollbar
            // is a degraded experience — clipped content is a broken one.
          />

          {/* Last on the left because the picker cannot be rendered inside the
              static iframe — but it prints as section 09, and it is what the
              "Bio is also hard to find" report was about. The jump list at the
              top of this column links straight here. */}
          <div id={editorAnchors.team} style={{ scrollMarginTop: 16 }}>
            <ProposalTeamPicker
              roster={roster}
              state={previewState}
              disabled={!editGate.ok}
              onChange={(fields) => postToGenerator({ type: "proposal:load", state: { v: 1, fields } })}
            />
          </div>
        </div>

        <div className="proposal-editor-preview" id={editorAnchors.preview} style={{ scrollMarginTop: 16 }}>
          <div className="rp-doc-noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span className="badge">Live preview — exactly what the client sees</span>
            {pagesEstimate !== null ? (
              <span className="badge" title="Estimated from the preview's length. The exported PDF is authoritative.">
                {formatPrintPagesLabel(pagesEstimate)}
              </span>
            ) : null}
          </div>
          {previewState ? (
            <div ref={measurePreview}>{documentNode}</div>
          ) : (
            <div className="empty-state">Waiting for the generator to load…</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Client company, address & addressees                                        */
/* -------------------------------------------------------------------------- */

/** Two contacts are the same person when name and email both match. */
function sameContact(a: ProposalClientContact, b: ProposalClientContact): boolean {
  return a.name.toLowerCase() === b.name.toLowerCase() && a.email.toLowerCase() === b.email.toLowerCase();
}

/**
 * Where the proposal's Prepared For block comes from.
 *
 * Lives outside the generator iframe for the same reason the team picker does:
 * the company address and its contact list are database-backed, and the asset
 * is a static file with no Supabase access. Writes land in `state.fields`
 * through the SAME `proposal:load` bridge message the initial hydration uses,
 * so they are saved, versioned and diffed exactly like any other generator
 * field — there is no second storage path.
 *
 * WHAT THIS PANEL OWNS vs WHAT IT OFFERS
 * The addressee list (`clientContacts`) is owned outright — it has no input in
 * the asset, and every change here writes it. The address and the seller block
 * are only OFFERED: they are ordinary textareas in the generator that a seller
 * may legitimately override for one proposal (a project office rather than the
 * head office), so pulling the record's value is a button they press, never a
 * write that quietly reverts what they typed.
 */
function ProposalClientPanel({
  company,
  companyProfile,
  state,
  disabled,
  onChange,
}: {
  company: ClientCompanyDetail | null;
  companyProfile: CompanyProfile | null;
  state: GeneratorState | null;
  disabled: boolean;
  onChange: (fields: Record<string, string>) => void;
}) {
  // The selection round-trips through the iframe (parent -> proposal:load ->
  // generator -> debounced proposal:preview -> parent), which takes ~250ms. A
  // checkbox that takes a quarter second to tick feels broken, so the panel
  // renders its own optimistic copy and re-syncs whenever the generator reports
  // a value that differs from what we last sent.
  const incoming = useMemo(() => serializeClientContacts(parseClientContacts(state?.fields)), [state]);
  const [contactsValue, setContactsValue] = useState(incoming);
  const lastSentRef = useRef(incoming);

  useEffect(() => {
    if (incoming !== lastSentRef.current) {
      lastSentRef.current = incoming;
      setContactsValue(incoming);
    }
  }, [incoming]);

  const [draft, setDraft] = useState({ name: "", title: "", email: "" });
  const [notice, setNotice] = useState("");

  const selected = useMemo(
    () => parseClientContacts({ [clientFieldIds.contacts]: contactsValue }),
    [contactsValue],
  );

  function pushContacts(next: readonly ProposalClientContact[]) {
    const value = serializeClientContacts(next);
    setContactsValue(value);
    lastSentRef.current = value;
    onChange({ [clientFieldIds.contacts]: value });
  }

  function toggleContact(option: ProposalClientContact, checked: boolean) {
    setNotice("");
    pushContacts(checked ? [...selected, option] : selected.filter((contact) => !sameContact(contact, option)));
  }

  function addDraftContact() {
    const contact = normalizeClientContact(draft);
    if (!contact.name) {
      setNotice("A contact needs at least a name.");
      return;
    }
    if (selected.some((existing) => sameContact(existing, contact))) {
      setNotice(`${contact.name} is already on this proposal.`);
      return;
    }
    setNotice("");
    setDraft({ name: "", title: "", email: "" });
    pushContacts([...selected, contact]);
  }

  const atLimit = selected.length >= maxClientContacts;
  const addressText = company?.addressText ?? "";
  const savedAddress = typeof state?.fields?.[clientFieldIds.address] === "string"
    ? String(state.fields[clientFieldIds.address]).trim()
    : "";
  const addressMatches = savedAddress !== "" && savedAddress === addressText;

  const profileName = companyProfile ? companyDocumentName(companyProfile) : "";
  const profileBlock = companyProfile ? formatSellerContactBlock(companyProfile) : "";
  const profileGaps = companyProfile ? missingCompanyProfileFields(companyProfile) : [];

  return (
    <div className="form-panel" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>
        <Building2 size={16} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Client company &amp; addressees
      </h2>
      <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem" }}>
        Prints in the <strong>Prepared For</strong> block at the top of the document — the people first, the company
        address underneath. Pulled from the company record so nothing has to be retyped.
      </p>

      {company ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <strong>{company.name || "Unnamed company"}</strong>
            <Link href={`/employee/clients/${company.id}`} style={{ fontSize: "0.85rem" }}>
              Open the company record
            </Link>
          </div>

          {/* --- Address ---------------------------------------------------- */}
          <div className="field">
            <label>
              <MapPin size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />
              Address on the company record
            </label>
            {addressText ? (
              <>
                <div className="rp-doc-prewrap" style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
                  {addressText}
                </div>
                <button
                  className="button button-light"
                  type="button"
                  style={{ marginTop: 8 }}
                  disabled={disabled || addressMatches}
                  onClick={() => onChange({ [clientFieldIds.address]: addressText })}
                >
                  {addressMatches ? "Already on this proposal" : "Use this address"}
                </button>
              </>
            ) : (
              <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", margin: 0 }}>
                No address on file. <Link href={`/employee/clients/${company.id}`}>Add one to the company record</Link>{" "}
                and it will be available to every future proposal — or type it straight into the Client Address box in
                the builder below for this proposal only.
              </p>
            )}
          </div>
        </>
      ) : (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem" }}>
          This proposal is not assigned to a company, so there is no record to pull an address or contacts from. Assign
          one from the document view, or add the people below by hand.
        </p>
      )}

      {/* --- Addressees --------------------------------------------------- */}
      <div className="field" style={{ marginTop: 14 }}>
        <label>Addressed to (up to {maxClientContacts})</label>

        {company && company.contacts.length > 0 ? (
          <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            {company.contacts.map((option) => {
              const checked = selected.some((contact) => sameContact(contact, option));
              return (
                <label
                  key={option.id}
                  style={{ display: "flex", alignItems: "flex-start", gap: 8, opacity: !checked && atLimit ? 0.5 : 1 }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || (!checked && atLimit)}
                    style={{ width: "auto", marginTop: 3 }}
                    onChange={(event) => toggleContact(option, event.target.checked)}
                  />
                  <span>
                    <strong>{option.name}</strong>
                    {option.title ? <span style={{ color: "var(--portal-muted)" }}> — {option.title}</span> : null}
                    {option.isPrimary ? <span className="badge badge-green" style={{ marginLeft: 6 }}>Primary</span> : null}
                    {option.email ? (
                      <span style={{ color: "var(--portal-muted)", fontSize: "0.8rem" }}> · {option.email}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        ) : company ? (
          <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem" }}>
            Nobody is on this company record yet.{" "}
            <Link href={`/employee/clients/${company.id}`}>Add contacts to the record</Link> so every future proposal
            can use them, or add someone to this proposal only below.
          </p>
        ) : null}

        {/* Ad-hoc addressee. A proposal is often addressed to someone who is
            not in the CRM yet — the GC's safety consultant, an interim PM —
            and blocking on "add them to the company record first" is how a
            seller ends up typing a name into the summary instead. */}
        <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr 1fr auto", alignItems: "end" }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="proposal-contact-name" style={{ fontSize: "0.8rem" }}>
              Name
            </label>
            <input
              id="proposal-contact-name"
              value={draft.name}
              disabled={disabled || atLimit}
              placeholder="Kevin Sanducker"
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="proposal-contact-title" style={{ fontSize: "0.8rem" }}>
              Title
            </label>
            <input
              id="proposal-contact-title"
              value={draft.title}
              disabled={disabled || atLimit}
              placeholder="Safety Director"
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="proposal-contact-email" style={{ fontSize: "0.8rem" }}>
              Email
            </label>
            <input
              id="proposal-contact-email"
              value={draft.email}
              disabled={disabled || atLimit}
              placeholder="kevin@example.com"
              onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
            />
          </div>
          <button
            className="button button-light"
            type="button"
            disabled={disabled || atLimit}
            onClick={addDraftContact}
          >
            <UserPlus size={14} /> Add
          </button>
        </div>
        {notice ? (
          <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 6 }}>{notice}</p>
        ) : null}
        {atLimit ? (
          <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 6 }}>
            {maxClientContacts} is the maximum. Remove someone to add another.
          </p>
        ) : null}
      </div>

      {/* --- What will actually print -------------------------------------- */}
      <div className="field" style={{ marginTop: 6 }}>
        <label>On this proposal</label>
        {selected.length === 0 ? (
          <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", margin: 0 }}>
            Nobody yet — the document will print the company name with no addressee.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
            {selected.map((contact) => (
              <li
                key={`${contact.name}|${contact.email}`}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
              >
                <span style={{ fontSize: "0.9rem" }}>{formatClientContactLine(contact)}</span>
                <button
                  className="button button-light"
                  type="button"
                  disabled={disabled}
                  title={`Remove ${contact.name} from this proposal`}
                  onClick={() => toggleContact(contact, false)}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- Seller block --------------------------------------------------- */}
      {companyProfile ? (
        <div className="field" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--portal-line, #dbe2e9)" }}>
          <label>Our details, from the company profile</label>
          {profileName || profileBlock ? (
            <div style={{ fontSize: "0.85rem", whiteSpace: "pre-wrap", color: "var(--portal-muted)" }}>
              {[profileName, profileBlock].filter((part) => part !== "").join("\n")}
            </div>
          ) : (
            <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", margin: 0 }}>
              The company profile is empty, so there is nothing to pull.
            </p>
          )}
          <button
            className="button button-light"
            type="button"
            style={{ marginTop: 8 }}
            disabled={disabled || (!profileName && !profileBlock)}
            onClick={() =>
              onChange({
                sellerName: profileName,
                sellerContact: profileBlock,
              })
            }
          >
            Use these on this proposal
          </button>
          {profileGaps.length > 0 ? (
            <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 8 }}>
              The company profile is still missing its {profileGaps.join(", ")}. Until an admin fills those in, every
              proposal prints an incomplete seller block.
            </p>
          ) : null}
        </div>
      ) : null}
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
      {/* Where the words come from. Ticking a name here prints THAT PERSON'S
          own bio, written on their Bio page — nothing about the text is edited
          on the proposal, which is the first thing a seller asks when the
          section prints differently than they expected. */}
      <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem" }}>
        The wording is each person&apos;s own: it comes from their{" "}
        <Link href="/employee/proposals/bio" style={{ color: "var(--portal-gold)" }}>
          Proposal bio page
        </Link>
        , not from this proposal. Editing a bio there changes it on every future proposal that includes them.
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
                {/* A published profile with no bio text prints a name and a
                    title under a heading and nothing else. Flagged at the point
                    of choosing rather than discovered in the preview. */}
                {!person.hasBio ? (
                  <span style={{ color: "#b7791f", fontSize: "0.8rem" }}> · no bio written yet</span>
                ) : null}
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
  canApprove = false,
}: {
  proposal: WorkspaceProposal;
  clients: ClientOption[];
  isAdmin: boolean;
  /** Whether this viewer may approve and send. Only used to explain the gap. */
  canApprove?: boolean;
}) {
  const { router, isPending, error, notice, setError, setNotice, run } = useProposalAction();
  const [working, setWorking] = useState(false);
  const busy = isPending || working;

  const metaGate = canEditProposalMeta(proposal.status);
  // Submit-for-review and send are the maker–checker moves, and they belong to
  // ProposalReviewPanel: they need the approval state to decide whether they are
  // even legal, and firing them from a bare status dropdown is what let a
  // proposal reach a client unread. Everything else — archive, reopen, mark
  // accepted/declined — stays here as ordinary workflow.
  const transitions = useMemo(
    () => availableTransitions(proposal.status).filter((to) => to !== "in_review" && to !== "sent"),
    [proposal.status],
  );

  // Reason capture for "Mark declined" — see the transition list below.
  const [decliningOpen, setDecliningOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declineDetail, setDeclineDetail] = useState("");

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
              {proposal.status === "in_review" && !canApprove
                ? "This proposal is with the reviewer. Approving and sending are theirs."
                : `No status changes are available from ${proposalStatusLabels[proposal.status]}.`}
            </p>
          ) : (
            transitions.map((to) =>
              // Declining asks WHY before it moves. The reason is the only
              // durable record of a lost deal, and a status button that just
              // flips the row is how decline_reason stayed empty for every
              // proposal ever lost.
              to === "declined" ? (
                <div key={to}>
                  {!decliningOpen ? (
                    <button
                      className="button button-light"
                      type="button"
                      disabled={busy}
                      style={{ width: "100%" }}
                      onClick={() => setDecliningOpen(true)}
                    >
                      {transitionLabel(proposal.status, to)}
                    </button>
                  ) : (
                    <div
                      style={{
                        border: "1px solid var(--portal-line, #dbe2e9)",
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <div className="field">
                        <label htmlFor="decline-reason-internal">Why was it declined?</label>
                        <select
                          id="decline-reason-internal"
                          value={declineReason}
                          disabled={busy}
                          onChange={(event) => setDeclineReason(event.target.value)}
                        >
                          <option value="">Select a reason…</option>
                          {declineReasonOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field" style={{ marginTop: 8 }}>
                        <label htmlFor="decline-detail-internal">Detail (optional)</label>
                        <textarea
                          id="decline-detail-internal"
                          rows={2}
                          value={declineDetail}
                          disabled={busy}
                          onChange={(event) => setDeclineDetail(event.target.value)}
                          placeholder="What did they actually say?"
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        <button
                          className="button button-light"
                          type="button"
                          disabled={busy || declineReason === ""}
                          onClick={() => {
                            const label = declineReasonLabel(declineReason) ?? declineReason;
                            const detail = declineDetail.trim();
                            run(
                              () =>
                                setProposalStatus(proposal.id, "declined", {
                                  declineReason: detail ? `${label} — ${detail}` : label,
                                }),
                              "Marked declined, with the reason recorded.",
                            );
                            setDecliningOpen(false);
                            setDeclineReason("");
                            setDeclineDetail("");
                          }}
                        >
                          Record decline
                        </button>
                        <button
                          className="button button-light"
                          type="button"
                          disabled={busy}
                          onClick={() => setDecliningOpen(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
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
              ),
            )
          )}
        </div>
      </div>

      {/* --- Acceptance window ---------------------------------------------
          Its own control because canEditProposalMeta freezes valid_until
          outside draft, and the alternative — reopening a sent proposal to
          change one date — voids the standing approval and forces John to
          approve the same document twice. Shown only once the date actually
          governs something (the proposal is out, or about to be). */}
      {!metaGate.ok && (proposal.status === "sent" || proposal.status === "in_review") ? (
        <div className="form-panel" style={{ marginTop: 20 }}>
          <h2>Acceptance window</h2>
          <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 8 }}>
            {proposal.valid_until
              ? `The client can accept online through ${proposal.valid_until}. After that the share page refuses acceptance.`
              : "No expiry is set, so this proposal stays open for acceptance indefinitely."}
          </p>
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor="proposal-extend-validity">Extend to</label>
            {/* onBlur, not onChange. A date input fires `change` on every
                COMPLETE date, so retyping a year 2026 -> 2027 fires four times
                (0002, 0020, 0202, 2027) — four unordered server actions whose
                last writer wins, and three of those dates are in the past. */}
            <input
              id="proposal-extend-validity"
              type="date"
              defaultValue={proposal.valid_until ?? ""}
              disabled={busy}
              onBlur={(event) => {
                const next = event.target.value || null;
                if ((proposal.valid_until ?? null) === next) return;
                run(() => extendProposalValidity(proposal.id, next), "Acceptance window updated.");
              }}
            />
          </div>
          <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 6 }}>
            Changes the date only — the document and its approval are untouched, so nothing needs re-approving.
          </p>
        </div>
      ) : null}

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
