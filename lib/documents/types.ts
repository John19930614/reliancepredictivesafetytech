// Shared types for the AI Safety Document Builder module.

export const docTypes = ["sop", "policy"] as const;
export type DocType = (typeof docTypes)[number];

export const docTypeLabels: Record<DocType, string> = {
  sop: "Standard Operating Procedure",
  policy: "Policy",
};

// Aligned with lib/legal/types confidenceLevels so the shared ConfidenceBadge renders correctly.
export const docConfidenceLevels = ["high", "medium", "low", "needs_review"] as const;
export type DocConfidenceLevel = (typeof docConfidenceLevels)[number];

export const docReviewStatuses = [
  "draft",
  "needs_review",
  "approved",
  "rejected",
  "changes_requested",
] as const;
export type DocReviewStatus = (typeof docReviewStatuses)[number];

export const DEFAULT_DOCUMENT_DISCLAIMER =
  "AI-generated safety documents are drafts for development and decision-support only. A qualified responsible person must review, edit, and approve the content before it is published, distributed, or relied upon for compliance.";

/** A single titled section of a generated document. */
export interface DocumentSection {
  heading: string;
  body: string;
  items: string[];
}

/** Validated, normalized output of a generation run. */
export interface GeneratedDocument {
  doc_type: DocType;
  title: string;
  summary: string;
  sections: DocumentSection[];
  review_notes: string[];
  confidence_level: DocConfidenceLevel;
  disclaimer: string;
}

/** The form payload that drives a generation run. */
export interface DocumentBuilderInput {
  doc_type: DocType;
  title: string;
  scope?: string;
  hazards?: string;
  company_standards?: string;
  industry?: string;
  jurisdiction?: string;
  responsible_role?: string;
  notes?: string;
}

/** Metadata stamped onto rendered PDF/DOCX output. */
export interface DocumentRenderMeta {
  company?: string;
  generatedBy?: string;
  revision?: string;
}
