import { describe, expect, it } from "vitest";
import {
  buildDocumentPrompt,
  documentToMarkdown,
  extractJsonObject,
  normalizeDocument,
  parseDocumentOutput,
} from "./schema";
import { DEFAULT_DOCUMENT_DISCLAIMER } from "./types";

function docShape(overrides: Record<string, unknown> = {}) {
  return {
    title: "Forklift Operation SOP",
    summary: "How to operate a forklift safely.",
    sections: [
      { heading: "Purpose", body: "Define safe forklift operation.", items: [] },
      { heading: "Procedure", body: "", items: ["Inspect the forklift", "Sound the horn at intersections"] },
    ],
    review_notes: ["Confirm site-specific load limits."],
    confidence_level: "high",
    disclaimer: "ignored — always overwritten",
    ...overrides,
  };
}

describe("normalizeDocument", () => {
  it("returns null when there is no title or no usable sections", () => {
    expect(normalizeDocument(null, "sop")).toBeNull();
    expect(normalizeDocument({ title: "", sections: [] }, "sop")).toBeNull();
    expect(normalizeDocument({ title: "X", sections: [{ heading: "", body: "", items: [] }] }, "sop")).toBeNull();
  });

  it("normalizes a valid document and pins the fixed disclaimer", () => {
    const result = normalizeDocument(docShape(), "sop");
    expect(result).not.toBeNull();
    expect(result!.doc_type).toBe("sop");
    expect(result!.title).toBe("Forklift Operation SOP");
    expect(result!.sections).toHaveLength(2);
    expect(result!.disclaimer).toBe(DEFAULT_DOCUMENT_DISCLAIMER);
  });

  it("drops empty list items and sections that are entirely empty", () => {
    const result = normalizeDocument(
      docShape({
        sections: [
          { heading: "Procedure", body: "", items: ["Real step", "", "  "] },
          { heading: "Empty", body: "", items: [] },
        ],
      }),
      "policy",
    );
    expect(result!.sections).toHaveLength(1);
    expect(result!.sections[0].items).toEqual(["Real step"]);
  });

  it("coerces an unknown confidence level to needs_review", () => {
    const result = normalizeDocument(docShape({ confidence_level: "totally-made-up" }), "sop");
    expect(result!.confidence_level).toBe("needs_review");
  });
});

describe("extractJsonObject", () => {
  it("extracts JSON wrapped in markdown fences", () => {
    const text = 'Here you go:\n```json\n{"title":"X","sections":[]}\n```\nThanks!';
    expect(extractJsonObject(text)).toBe('{"title":"X","sections":[]}');
  });

  it("returns null when there is no object", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });
});

describe("parseDocumentOutput", () => {
  it("parses clean JSON", () => {
    const result = parseDocumentOutput(JSON.stringify(docShape()), "sop");
    expect(result?.title).toBe("Forklift Operation SOP");
  });

  it("falls back to defensive extraction for fenced JSON", () => {
    const result = parseDocumentOutput("```json\n" + JSON.stringify(docShape()) + "\n```", "policy");
    expect(result?.doc_type).toBe("policy");
  });

  it("returns null for unparseable output", () => {
    expect(parseDocumentOutput("the model said no", "sop")).toBeNull();
  });
});

describe("buildDocumentPrompt", () => {
  it("includes the title and only the fields that were provided", () => {
    const prompt = buildDocumentPrompt({ doc_type: "sop", title: "Crane Lift SOP", hazards: "Suspended loads" });
    expect(prompt).toContain("Crane Lift SOP");
    expect(prompt).toContain("Suspended loads");
    expect(prompt).not.toContain("Jurisdiction:");
  });
});

describe("documentToMarkdown", () => {
  it("renders headings, body, items and review notes", () => {
    const doc = normalizeDocument(docShape(), "sop")!;
    const md = documentToMarkdown(doc);
    expect(md).toContain("# Forklift Operation SOP");
    expect(md).toContain("## Procedure");
    expect(md).toContain("- Inspect the forklift");
    expect(md).toContain("## Review Notes");
  });
});
