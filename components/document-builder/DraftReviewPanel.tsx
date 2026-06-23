"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileDown, Loader2, MessageSquareWarning, Save, Send, XCircle } from "lucide-react";
import { ReviewStatusBadge, ConfidenceBadge, HumanReviewBadge } from "@/components/legal-register/badges";
import { docTypeLabels, type DocType, type DocumentSection } from "@/lib/documents/types";
import {
  approveDraft,
  rejectDraft,
  requestChanges,
  updateDraftContent,
  publishDraft,
} from "@/app/employee/document-builder/actions";

interface DraftReviewPanelProps {
  draft: {
    id: string;
    doc_type: DocType;
    title: string;
    sections: DocumentSection[];
    review_status: string;
    confidence_level: string | null;
    human_review_required: boolean;
    review_reason: string | null;
    company_document_id: string | null;
  };
  canReview: boolean;
  canPublish: boolean;
}

export function DraftReviewPanel({ draft, canReview, canPublish }: DraftReviewPanelProps) {
  const router = useRouter();
  const [title, setTitle] = useState(draft.title);
  const [sections, setSections] = useState<DocumentSection[]>(draft.sections);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const isPublished = Boolean(draft.company_document_id);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setMessage("");
    setError("");
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        setMessage(success);
        router.refresh();
      } else {
        setError(res.error ?? "Action failed.");
      }
    });
  }

  function updateSection(index: number, patch: Partial<DocumentSection>) {
    setSections((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <div className="form-panel">
      <div className="portal-topline" style={{ marginBottom: 12 }}>
        <div>
          <div className="eyebrow">{docTypeLabels[draft.doc_type]}</div>
          <h2 style={{ margin: "4px 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {title}
            <ReviewStatusBadge status={draft.review_status} />
            <ConfidenceBadge level={draft.confidence_level} />
            <HumanReviewBadge required={draft.human_review_required} />
          </h2>
        </div>
      </div>

      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      {isPublished ? (
        <div className="success-box" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <FileDown size={16} /> Published to the Master Document Library (PDF + editable Word).
        </div>
      ) : null}

      {draft.review_reason ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem" }}>Reviewer note: {draft.review_reason}</p>
      ) : null}

      <div className="field" style={{ marginTop: 12 }}>
        <label>Title</label>
        <input value={title} disabled={!canReview || isPublished} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {sections.map((section, index) => (
        <div key={index} className="doc-card" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Section heading</label>
            <input value={section.heading} disabled={!canReview || isPublished} onChange={(e) => updateSection(index, { heading: e.target.value })} />
          </div>
          <div className="field">
            <label>Body</label>
            <textarea value={section.body} rows={3} disabled={!canReview || isPublished} onChange={(e) => updateSection(index, { body: e.target.value })} />
          </div>
          <div className="field">
            <label>List items (one per line)</label>
            <textarea
              value={section.items.join("\n")}
              rows={Math.min(8, Math.max(2, section.items.length))}
              disabled={!canReview || isPublished}
              onChange={(e) => updateSection(index, { items: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
            />
          </div>
        </div>
      ))}

      {canReview && !isPublished ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <button
            className="button button-light"
            disabled={pending}
            onClick={() => run(() => updateDraftContent(draft.id, { title, sections }), "Saved. Re-approve before publishing.")}
          >
            {pending ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Save edits
          </button>
          <button className="button button-primary" disabled={pending} onClick={() => run(() => approveDraft(draft.id), "Approved.")}>
            <CheckCircle2 size={16} /> Approve
          </button>
          <button className="button button-light" disabled={pending} onClick={() => run(() => requestChanges(draft.id), "Marked changes requested.")}>
            <MessageSquareWarning size={16} /> Request changes
          </button>
          <button className="button button-light" disabled={pending} onClick={() => run(() => rejectDraft(draft.id), "Rejected.")}>
            <XCircle size={16} /> Reject
          </button>
        </div>
      ) : null}

      {canPublish && !isPublished ? (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--portal-border, #2a2a2a)" }}>
          <button
            className="button button-primary"
            disabled={pending || (draft.human_review_required && draft.review_status !== "approved")}
            onClick={() => run(() => publishDraft(draft.id), "Published to the Document Library.")}
            title={draft.human_review_required && draft.review_status !== "approved" ? "Approve the draft first" : undefined}
          >
            <Send size={16} /> Publish to Document Library
          </button>
          {draft.human_review_required && draft.review_status !== "approved" ? (
            <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 8 }}>
              This document must be approved by a reviewer before it can be published.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
