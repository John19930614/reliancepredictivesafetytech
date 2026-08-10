import { describe, expect, it } from "vitest";
import { estimatePrintPages, formatPrintPagesLabel } from "./page-estimate";

describe("estimatePrintPages", () => {
  it("returns null for unusable measurements", () => {
    expect(estimatePrintPages(0, 700)).toBeNull();
    expect(estimatePrintPages(2000, 0)).toBeNull();
    expect(estimatePrintPages(Number.NaN, 700)).toBeNull();
    expect(estimatePrintPages(-10, 700)).toBeNull();
  });

  it("never reports fewer than one page for a measurable document", () => {
    expect(estimatePrintPages(120, 730)).toBe(1);
  });

  it("a four-page-scale document at print width lands on four pages", () => {
    // Working backwards from the constants: 4 print pages ≈ 3821px of print
    // content ≈ 4874px of screen content at the 0.784 scale, plus 80px padding.
    expect(estimatePrintPages(4954, 729.6)).toBe(4);
  });

  it("a narrower on-screen column does not inflate the count", () => {
    // Same document wrapped into a 560px column is ~30% taller on screen; the
    // width ratio compensates instead of reporting extra pages.
    const atFullWidth = estimatePrintPages(4954, 729.6);
    const narrowHeight = Math.round((4954 - 80) * (729.6 / 560)) + 80;
    expect(estimatePrintPages(narrowHeight, 560)).toBe(atFullWidth);
  });

  it("monotonic: taller documents never report fewer pages", () => {
    let last = 0;
    for (let h = 200; h <= 12000; h += 200) {
      const pages = estimatePrintPages(h, 729.6) ?? 0;
      expect(pages).toBeGreaterThanOrEqual(last);
      last = pages;
    }
  });
});

describe("formatPrintPagesLabel", () => {
  it("pluralizes", () => {
    expect(formatPrintPagesLabel(1)).toBe("≈ 1 page in print");
    expect(formatPrintPagesLabel(4)).toBe("≈ 4 pages in print");
  });
});
