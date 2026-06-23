// Pure (no server-only / OpenAI) helpers for the document generation pipeline so
// they can be unit-tested directly. The OpenAI orchestration that uses these lives
// in builder.ts (generateSafetyDocument).

import {
  DEFAULT_DOCUMENT_DISCLAIMER,
  docConfidenceLevels,
  type DocConfidenceLevel,
  type DocType,
  type DocumentBuilderInput,
  type DocumentSection,
  type GeneratedDocument,
} from "./types";

const SOP_SECTIONS = [
  "Purpose",
  "Scope",
  "Definitions",
  "Responsibilities",
  "Required PPE",
  "Hazards & Controls",
  "Procedure (numbered steps)",
  "Emergency & Reporting",
  "References",
  "Revision History",
];

const POLICY_SECTIONS = [
  "Purpose",
  "Scope",
  "Policy Statement",
  "Roles & Responsibilities",
  "Compliance Requirements",
  "Enforcement & Consequences",
  "Review Cycle",
  "References",
];

export function documentSystemPrompt(docType: DocType): string {
  const sectionList = (docType === "sop" ? SOP_SECTIONS : POLICY_SECTIONS).map((s) => `  - ${s}`).join("\n");
  const kind = docType === "sop" ? "Standard Operating Procedure (SOP)" : "workplace safety Policy";
  return `You are a senior safety professional drafting a clear, practical, audit-ready ${kind} for a workplace safety program.

Write in plain, direct language a frontline worker and a safety manager can both follow. Be specific and actionable — avoid filler and legal boilerplate. Do NOT invent regulatory citations; only reference a standard (e.g. an OSHA section) when you are confident it applies, and otherwise describe the requirement in plain terms.

Produce the document as an ordered list of sections. Include, at minimum, these sections (add others only if genuinely useful):
${sectionList}

For each section, write the prose in "body" and put discrete steps, duties, or list items in "items" (use an empty array when a section is purely prose).

Set confidence_level to:
  - high: routine, well-established safety practice you are confident about
  - medium: generally correct but the site should verify specifics
  - low: depends heavily on site conditions or equipment not fully described
  - needs_review: involves legal interpretation, engineering judgment, or unclear applicability

Put anything a qualified human MUST verify before approval into review_notes. This document is a draft for human review — never claim it is final or legally approved.`;
}

function field(description: string, enumValues?: readonly string[]) {
  return enumValues ? { type: "string", description, enum: [...enumValues] } : { type: "string", description };
}

const sectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    heading: field("Section heading, e.g. 'Purpose'"),
    body: field("Section prose. Empty string if the section is purely a list."),
    items: { type: "array", description: "Discrete steps/duties/list items, or empty array", items: { type: "string" } },
  },
  required: ["heading", "body", "items"],
} as const;

export const documentResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: field("Official document title"),
    summary: field("1-2 sentence summary of what this document covers"),
    sections: { type: "array", items: sectionSchema },
    review_notes: { type: "array", items: { type: "string" } },
    confidence_level: field("Overall confidence", docConfidenceLevels),
    disclaimer: field("The fixed safety document disclaimer"),
  },
  required: ["title", "summary", "sections", "review_notes", "confidence_level", "disclaimer"],
} as const;

export function buildDocumentPrompt(input: DocumentBuilderInput): string {
  const lines: string[] = [];
  const add = (label: string, value?: string) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    lines.push(`- ${label}: ${value}`);
  };
  add("Document title", input.title);
  add("Industry / operation", input.industry);
  add("Jurisdiction", input.jurisdiction);
  add("Scope / activity covered", input.scope);
  add("Known hazards", input.hazards);
  add("Responsible role / owner", input.responsible_role);
  add("Company standards to incorporate", input.company_standards);
  add("Additional notes", input.notes);

  return `${documentSystemPrompt(input.doc_type)}

DOCUMENT REQUEST:
${lines.join("\n")}

Draft the complete ${input.doc_type === "sop" ? "SOP" : "Policy"} now as structured sections.`;
}

// ---- parsing + normalization -------------------------------------------------

/**
 * Defensive fallback: extract the first complete, balanced JSON object from
 * arbitrary text (handles markdown fences and surrounding prose).
 */
export function extractJsonObject(text: string): string | null {
  if (!text) return null;
  let t = text.trim();

  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  const start = t.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  return null;
}

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

function coerceConfidence(value: unknown): DocConfidenceLevel {
  const v = str(value).trim().toLowerCase().replace(/\s+/g, "_");
  return (docConfidenceLevels as readonly string[]).includes(v) ? (v as DocConfidenceLevel) : "needs_review";
}

function normalizeSection(s: Record<string, unknown>): DocumentSection {
  return {
    heading: str(s.heading),
    body: str(s.body),
    items: Array.isArray(s.items) ? s.items.map(str).filter((x) => x.trim() !== "") : [],
  };
}

/**
 * Normalizes parsed model output into a validated GeneratedDocument.
 * Returns null only when there is no usable content (no title or no sections).
 */
export function normalizeDocument(
  parsed: Record<string, unknown> | null | undefined,
  docType: DocType,
): GeneratedDocument | null {
  if (!parsed || typeof parsed !== "object") return null;

  const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map(normalizeSection)
    .filter((s) => s.heading.trim() !== "" && (s.body.trim() !== "" || s.items.length > 0));

  const title = str(parsed.title);
  if (!title || sections.length === 0) return null;

  return {
    doc_type: docType,
    title,
    summary: str(parsed.summary),
    sections,
    review_notes: Array.isArray(parsed.review_notes) ? parsed.review_notes.map(str).filter(Boolean) : [],
    confidence_level: coerceConfidence(parsed.confidence_level),
    // Always pin the fixed disclaimer regardless of what the model returned.
    disclaimer: DEFAULT_DOCUMENT_DISCLAIMER,
  };
}

/** Serialize a document to Markdown — used for storage, preview, and gateway text. */
export function documentToMarkdown(doc: GeneratedDocument): string {
  const parts: string[] = [`# ${doc.title}`];
  if (doc.summary) parts.push(doc.summary);
  for (const section of doc.sections) {
    parts.push(`## ${section.heading}`);
    if (section.body) parts.push(section.body);
    for (const item of section.items) parts.push(`- ${item}`);
  }
  if (doc.review_notes.length) {
    parts.push("## Review Notes");
    for (const note of doc.review_notes) parts.push(`- ${note}`);
  }
  return parts.join("\n\n");
}

/** Parse raw model text into a GeneratedDocument, with a defensive JSON-extraction fallback. */
export function parseDocumentOutput(text: string, docType: DocType): GeneratedDocument | null {
  try {
    return normalizeDocument(JSON.parse(text.trim()), docType);
  } catch {
    // fall through to defensive extraction
  }
  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;
  try {
    return normalizeDocument(JSON.parse(jsonText), docType);
  } catch {
    return null;
  }
}
