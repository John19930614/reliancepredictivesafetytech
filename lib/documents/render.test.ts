import { describe, expect, it } from "vitest";
import { renderPdf, renderDocx, slugifyTitle } from "./render";
import type { GeneratedDocument } from "./types";

const sampleDoc: GeneratedDocument = {
  doc_type: "sop",
  title: "Forklift Operation SOP",
  summary: "Safe operation of powered industrial trucks.",
  sections: [
    { heading: "Purpose", body: "Define safe forklift operation.", items: [] },
    { heading: "Procedure", body: "Follow these steps:", items: ["Inspect the forklift", "Sound the horn at intersections"] },
  ],
  review_notes: ["Confirm site-specific load limits."],
  confidence_level: "high",
  disclaimer: "Draft for human review only.",
};

describe("renderPdf", () => {
  it("produces non-empty PDF bytes with a valid header", async () => {
    const bytes = await renderPdf(sampleDoc, { company: "Reliance", generatedBy: "tester@example.com" });
    expect(bytes.byteLength).toBeGreaterThan(500);
    // PDF files start with "%PDF"
    const header = String.fromCharCode(...bytes.slice(0, 4));
    expect(header).toBe("%PDF");
  });

  it("paginates long documents without throwing", async () => {
    const big: GeneratedDocument = {
      ...sampleDoc,
      sections: Array.from({ length: 40 }, (_, i) => ({
        heading: `Section ${i + 1}`,
        body: "Lorem ipsum dolor sit amet ".repeat(20),
        items: ["one", "two", "three"],
      })),
    };
    const bytes = await renderPdf(big);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});

describe("renderDocx", () => {
  it("produces a non-empty .docx (zip) buffer", async () => {
    const buffer = await renderDocx(sampleDoc, { company: "Reliance" });
    expect(buffer.byteLength).toBeGreaterThan(500);
    // DOCX is a zip archive; zip files start with "PK"
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
  });
});

describe("slugifyTitle", () => {
  it("produces a filesystem-safe slug", () => {
    expect(slugifyTitle("Forklift Operation SOP!")).toBe("forklift-operation-sop");
    expect(slugifyTitle("   ")).toBe("document");
  });
});
